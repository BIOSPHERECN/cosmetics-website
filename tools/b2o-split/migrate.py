#!/usr/bin/env python3
"""beauty2oem 拆站 · 数据迁移:公司库 bohui-cms-v2(ea5b0da4)→ 新库 beauty2oem-db(同一个公司账号)。
施工图:F:/0cosmetic/助手交付/beauty2oem-拆站-施工图.md §5。只导 beauty2oem 独有的行,外加几张只读副本。

  python tools/b2o-split/migrate.py plan                 只读量行数:每张表的过滤条件、执行计划、上界、实数、预计总读量
  python tools/b2o-split/migrate.py schema               读公司库 sqlite_master → db/b2o-migrations/0001_init.sql(表)+ 0002_post.sql(索引/触发器/视图/id 抬到 1000 万)
  python tools/b2o-split/migrate.py export               游标分页导出独有行 → data/dump/b2o-split/data-*.sql(含个人信息,用完 cleanup)
  python tools/b2o-split/migrate.py import --apply       新库:0001 → data → 0002
  python tools/b2o-split/migrate.py feed [--apply]       只读副本:playbooks(rules-for-ai)/ regulation_updates / providers(白名单);公司库改了就重跑
  python tools/b2o-split/migrate.py verify               逐表对账 + id 段检查,通过写 verified.json(mkconfig.py --live 认它)
  python tools/b2o-split/migrate.py rollback --since "YYYY-MM-DD HH:MM:SS" [--apply]   切换后新库的新增 / 改动行回写公司库
  python tools/b2o-split/migrate.py cleanup              删 data/dump/b2o-split 下的 .sql(含个人信息)
  python tools/b2o-split/migrate.py retire [--apply]     切换满 7 天后:公司库 b2o_* 改名 _old_b2o_*(不删;没切过去的写入方会当场报错,而不是悄悄写进旧表)
  python tools/b2o-split/migrate.py selftest             离线自检:两份内存 SQLite 走一遍 schema → export → import → verify → rollback

铁令落在代码里:① 公司库、新库都显式 `-c` + 库名,执行前按 database_id 核对(同名库地雷);② 单次作业读 ≤ 500 万行、写 ≤ 100 万行,
超了停下并把原因写进 data/dump/b2o-split/STOP.txt;③ 碰公司库先拿 _LOCK_D1_COMPANY(与 tools/intel/predict.py 同一把);
④ 写操作一律要 --apply;⑤ wrangler 用 node 直接调(不经 cmd.exe,SQL 里的 % & 不会被 shell 吃掉)。凭据取自仓库根 .env(公司账号)。"""
import io, json, os, re, sqlite3, subprocess, sys, time, tomllib, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, 'apps', 'web')
OUT = os.path.join(ROOT, 'data', 'dump', 'b2o-split')          # data/ 整目录在 .gitignore 里
MIG = os.path.join(ROOT, 'db', 'b2o-migrations')
LOCK = 'F:/0cosmetic/skin2oem/tools/platform/_LOCK_D1_COMPANY'
WRANGLER = os.path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
COMPANY_ID = 'ea5b0da4-7f96-48bf-8fca-dc7193a9596d'
PLATFORM_ID = 'f5010e65-8c6d-419f-8bf0-3e41762463f6'
MAX_READ, MAX_WRITE = 5_000_000, 1_000_000
SEQ_FLOOR = 10_000_000          # 新库自增 id 从 1000 万起:回滚回写时和公司库的 id 段不重叠
PAGE, STMT_ROWS, STMT_BYTES, FILE_STMTS = 500, 50, 90_000, 200   # D1 单条语句上限 100KB

SITE = 'beauty2oem'
P = f"(SELECT id FROM pages WHERE site_id='{SITE}')"
PR = f"(SELECT id FROM products WHERE site_id='{SITE}')"
# beauty2oem 独有的行(顺序 = 导入顺序 = 外键依赖顺序)。b2o_* 表运行时从 sqlite_master 按前缀发现、整表带走,排在这批后面。
OWNED = [
    ('sites', f"id='{SITE}'"),
    ('site_i18n', f"site_id='{SITE}'"),
    ('pages', f"site_id='{SITE}'"),
    ('page_i18n', f"page_id IN {P}"),
    ('blocks', f"page_id IN {P}"),
    ('block_i18n', f"block_id IN (SELECT id FROM blocks WHERE page_id IN {P})"),
    ('page_versions', f"page_id IN {P}"),
    ('products', f"site_id='{SITE}'"),
    ('product_i18n', f"product_id IN {PR}"),
    ('product_media', f"product_id IN {PR}"),
    ('inquiries', f"site_id='{SITE}'"),
]
# 公司库的只读副本:新库里只读,公司库改了就重跑 feed。providers 只带白名单免费模型(舰队白名单铁令),含 key,导出文件用完即删。
FEED = [
    ('playbooks', "slug='rules-for-ai'"),
    ('regulation_updates', '1=1'),
    ('providers', "enabled=1 AND is_free=1 AND (id LIKE 'agnes%' OR id LIKE 'sensenova%')"),
]
EMPTY = ['jobs', 'ai_runs', 'revisions', 'mb_members', 'mb_views']   # 运行时表:只建表不带数据(会员不按站分,带不走,见施工图 §2)
# b2o_predictions 冻结后只有这些列还能改(0112 / 0118 触发器);回滚时公司库里已冻结的行只回写这些列
PRED_MUTABLE = ('outcome', 'r7', 'r30', 'r60', 'r90', 'biz_inquiries', 'biz_samples', 'biz_quotes', 'biz_orders', 'biz_shown',
                'biz_interest', 'biz_paid', 'biz_revisions', 'due30', 'due60', 'due90', 'is_public', 'updated_at')
CMS_REPLACE = ('pages', 'blocks', 'page_versions')    # 回滚时这几张按「新库里没有了」补删(版块删了、页面删了)


class Budget(Exception):
    pass


# ───────── 两种库:远端 D1(wrangler)与本地 SQLite(selftest)同一个接口 ─────────
class D1:
    read = written = 0

    def __init__(self, name, cfg, expect=None):
        self.name, self.cfg = name, cfg
        path = os.path.join(WEB, cfg)
        conf = tomllib.load(open(path, 'rb')) if cfg.endswith('.toml') else _jsonc(path)
        ids = [d.get('database_id') for d in conf.get('d1_databases', []) if d.get('database_name') == name]
        if len(ids) != 1:
            raise SystemExit(f'{cfg} 里找不到库 {name}')
        if expect and ids[0] != expect:
            raise SystemExit(f'{cfg} 的 {name} 指向 {ids[0]},不是期望的 {expect}(同名库地雷,认 id 不认名)')
        if not expect and (ids[0] in (COMPANY_ID, PLATFORM_ID) or '<' in str(ids[0])):
            raise SystemExit(f'{cfg} 的 {name} 是 {ids[0]}:要么是公司库 / 平台库,要么还没建库填 id')
        self.id = ids[0]

    def _run(self, *args):
        cmd = ['node', WRANGLER, 'd1', 'execute', self.name, '--remote', '-c', './' + self.cfg, '--yes', '--json', *args]
        for i in range(4):
            try:
                p = subprocess.run(cmd, cwd=WEB, env=_env(), capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
                out = (p.stdout or '') + (p.stderr or '')
            except subprocess.TimeoutExpired:
                out = 'timed out'
            res = _parse(out)
            if res is not None and all(x.get('success') for x in res):
                for x in res:
                    D1.read += int((x.get('meta') or {}).get('rows_read') or 0)
                    D1.written += int((x.get('meta') or {}).get('rows_written') or 0)
                _check_budget()
                return res
            if i < 3 and re.search(r'fetch failed|timed out|ECONNRESET|7500|overloaded', out):
                time.sleep(5 * (i + 1)); continue
            raise SystemExit(f'D1 {self.name} 执行失败:{out[-600:]}')

    def q(self, sql):
        return [r for x in self._run('--command', ' '.join(sql.split())) for r in (x.get('results') or [])]

    def run_file(self, path):
        self._run('--file', path)


class Local:
    """selftest 用:行为尽量贴 D1(外键开着)"""
    read = written = 0

    def __init__(self):
        self.c = sqlite3.connect(':memory:', isolation_level=None)
        self.c.row_factory = sqlite3.Row
        self.c.execute('PRAGMA foreign_keys=ON')

    def q(self, sql):
        return [dict(r) for r in self.c.execute(sql).fetchall()]

    def run_file(self, path):
        self.c.executescript('BEGIN;' + io.open(path, encoding='utf-8').read() + '\nCOMMIT;')


def _jsonc(path):
    return json.loads('\n'.join(l for l in io.open(path, encoding='utf-8') if not l.lstrip().startswith('//')))


def _parse(out):
    """只认「元素都带 success 键」的那个数组(wrangler 横幅 / 警告里也有 '[')"""
    for m in re.finditer(r'\[\s*\{', out):
        try:
            res, _ = json.JSONDecoder().raw_decode(out[m.start():])
        except ValueError:
            continue
        if isinstance(res, list) and res and all(isinstance(x, dict) and 'success' in x for x in res):
            return res
    return None


_ENV = None


def _env():
    """公司账号凭据(仓库根 .env)+ 代理探活:直连 api.cloudflare.com 不通就走 7890(本机网络现状)"""
    global _ENV
    if _ENV is None:
        e = dict(os.environ)
        for l in io.open(os.path.join(ROOT, '.env'), encoding='utf-8'):
            k, _, v = l.strip().partition('=')
            if k and not k.startswith('#') and v:
                e[k.strip()] = v.strip().strip('"\'')
        try:
            urllib.request.build_opener(urllib.request.ProxyHandler({})).open('https://api.cloudflare.com/client/v4/', timeout=6)
            direct = True
        except urllib.error.HTTPError:                  # 回了 4xx 也说明直连是通的
            direct = True
        except Exception:
            direct = False
        if direct:
            for k in ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'): e.pop(k, None)
        else:
            e['HTTPS_PROXY'] = e['HTTP_PROXY'] = 'http://127.0.0.1:7890'
        _ENV = e
    return _ENV


def _check_budget():
    if D1.read > MAX_READ or D1.written > MAX_WRITE:
        msg = f'{time.strftime("%F %T")} 停:本次作业已读 {D1.read:,} 行 / 写 {D1.written:,} 行,超过上限(读 {MAX_READ:,} / 写 {MAX_WRITE:,})。先查哪张表的过滤没走索引。'
        os.makedirs(OUT, exist_ok=True)
        io.open(os.path.join(OUT, 'STOP.txt'), 'a', encoding='utf-8').write(msg + '\n')
        raise Budget(msg)


def company_lock(fn):
    for _ in range(30):
        try:
            os.mkdir(LOCK); break
        except FileExistsError:
            time.sleep(60)
    else:
        raise SystemExit('公司库锁 30 分钟没拿到(别的导入在跑),本次不动')
    try:
        io.open(os.path.join(LOCK, 'owner.txt'), 'w', encoding='utf-8').write(f'b2o-split migrate.py {time.strftime("%F %T")}\n')
        return fn()
    finally:
        for f in os.listdir(LOCK): os.remove(os.path.join(LOCK, f))
        os.rmdir(LOCK)


# ───────── 纯函数:SQL 字面量、DDL 改写、分批 ─────────
def lit(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return str(int(v))
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, (bytes, bytearray)): return "X'" + bytes(v).hex() + "'"
    if isinstance(v, list): return "X'" + bytes(v).hex() + "'"          # D1 的 JSON 里 BLOB 是字节数组
    return "'" + str(v).replace("'", "''") + "'"


FK_TAIL = r'(?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:SET\s+NULL|SET\s+DEFAULT|CASCADE|RESTRICT|NO\s+ACTION)|\s+(?:NOT\s+)?DEFERRABLE(?:\s+INITIALLY\s+(?:DEFERRED|IMMEDIATE))?|\s+MATCH\s+\w+)*'


def fix_ddl(sql, keep):
    """① CREATE … → CREATE … IF NOT EXISTS(可重跑);② 指向新库里没有的表(users、media、companies…)的外键删掉 ——
       D1 外键常开,留着就是插不进去或「no such table」。列本身保留,值原样带走。"""
    sql = re.sub(r'^\s*CREATE\s+(UNIQUE\s+)?(TABLE|INDEX|TRIGGER|VIEW)\s+(?!IF\s+NOT\s+EXISTS)',
                 lambda m: f"CREATE {m.group(1) or ''}{m.group(2)} IF NOT EXISTS ", sql, flags=re.I)
    gone = lambda t: t.strip('"`[]').lower() not in keep
    sql = re.sub(r',\s*(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+("?[\w]+"?)\s*(?:\([^)]*\))?' + FK_TAIL,
                 lambda m: '' if gone(m.group(1)) else m.group(0), sql, flags=re.I)
    sql = re.sub(r'\s+REFERENCES\s+("?[\w]+"?)\s*(?:\([^)]*\))?' + FK_TAIL,
                 lambda m: '' if gone(m.group(1)) else m.group(0), sql, flags=re.I)
    return sql


def topo(rows, key='id', parent='parent_id'):
    """父页在前:pages.parent_id 自引用,子页 id 比父页小时按 id 插会撞外键"""
    ids, done, out, pend = {r[key] for r in rows}, set(), [], list(rows)
    for r in pend:
        if r.get(parent) is not None and r[parent] not in ids:
            print(f'  [注意] pages#{r[key]} 的父页 #{r[parent]} 不属于 beauty2oem,parent_id 置空'); r[parent] = None
    while pend:
        nxt = [r for r in pend if not (r.get(parent) is None or r[parent] in done)]
        for r in pend:
            if r not in nxt: out.append(r); done.add(r[key])
        if len(nxt) == len(pend): return out + nxt      # 有环:交给 PRAGMA defer_foreign_keys
        pend = nxt
    return out


def inserts(table, cols, rows, verb='INSERT INTO', tail=''):
    """多行 VALUES,每条 ≤ 50 行且 ≤ 90KB;单行超过 100KB 直接停(D1 放不下)"""
    head, stmts, buf, size = f'{verb} {table} ({", ".join(cols)}) VALUES ', [], [], 0
    for r in rows:
        v = '(' + ','.join(lit(r[c]) for c in cols) + ')'
        if len(v.encode()) > STMT_BYTES:
            raise SystemExit(f'{table} 有一行超过 {STMT_BYTES} 字节(D1 单条语句上限 100KB),手工处理:{v[:80]}…')
        if buf and (len(buf) >= STMT_ROWS or size + len(v.encode()) > STMT_BYTES):
            stmts.append(head + ','.join(buf) + tail + ';'); buf, size = [], 0
        buf.append(v); size += len(v.encode())
    if buf: stmts.append(head + ','.join(buf) + tail + ';')
    return stmts


def rel(p):
    try:
        return os.path.relpath(p, ROOT)
    except ValueError:                                  # selftest 的临时目录在 C 盘
        return p


def write_files(prefix, stmts):
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith(prefix + '-') and f.endswith('.sql'): os.remove(os.path.join(OUT, f))
    paths = []
    for i in range(0, max(len(stmts), 1), FILE_STMTS):
        p = os.path.join(OUT, f'{prefix}-{i // FILE_STMTS + 1:04d}.sql')
        io.open(p, 'w', encoding='utf-8', newline='\n').write('PRAGMA defer_foreign_keys = on;\n' + '\n'.join(stmts[i:i + FILE_STMTS]) + '\n')
        paths.append(p)
    return paths


# ───────── 库结构 ─────────
def schema_rows(db):
    return db.q("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'")


def table_set(sch):
    b2o = sorted(r['name'] for r in sch if r['type'] == 'table' and r['name'].startswith('b2o_'))
    have = {r['name'] for r in sch if r['type'] == 'table'}
    owned = [(t, w) for t, w in OWNED if t in have] + [(t, '1=1') for t in b2o]
    feed = [(t, w) for t, w in FEED if t in have]
    miss = [t for t, _ in OWNED + FEED if t not in have] + [t for t in EMPTY if t not in have]
    if miss: print('  [注意] 公司库里没有这些表,跳过:', ', '.join(miss))
    return owned, feed, [t for t in EMPTY if t in have]


def cols_of(db, t):
    return [r['name'] for r in db.q(f'PRAGMA table_info({t})')]


def autoinc(sch):
    return sorted(r['name'] for r in sch if r['type'] == 'table' and re.search(r'\bAUTOINCREMENT\b', r['sql'], re.I))


def cmd_schema(company):
    sch = schema_rows(company)
    owned, feed, empty = table_set(sch)
    keep = {t for t, _ in owned + feed} | set(empty)
    tables = [r for r in sch if r['type'] == 'table' and r['name'] in keep]
    order = [t for t, _ in owned + feed] + empty
    tables.sort(key=lambda r: order.index(r['name']))
    post = [r for r in sch if r['type'] in ('index', 'trigger') and r['tbl_name'] in keep]
    views = [r for r in sch if r['type'] == 'view' and r['name'].startswith('b2o_')]
    for r in post + views:                              # 触发器 / 视图里点名了新库没有的表:建得上,触发时才炸 —— 先报出来
        for t in re.findall(r'\b(?:FROM|JOIN|INTO|UPDATE)\s+"?(\w+)', r['sql'], re.I):
            if t.lower() not in keep and t.lower() not in ('new', 'old', 'of', 'on', 'set'):
                print(f'  [注意] {r["type"]} {r["name"]} 用到新库没有的表 {t}')
    seq = [f"UPDATE sqlite_sequence SET seq = {SEQ_FLOOR} WHERE name = '{t}' AND seq < {SEQ_FLOOR};\n"
           f"INSERT INTO sqlite_sequence (name, seq) SELECT '{t}', {SEQ_FLOOR} WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '{t}');"
           for t in autoinc(tables)]
    hdr = f'-- 由 tools/b2o-split/migrate.py schema 于 {time.strftime("%F %T")} 从公司库 sqlite_master 生成;先审再灌,别手改(重跑会覆盖)。\n'
    os.makedirs(MIG, exist_ok=True)
    io.open(os.path.join(MIG, '0001_init.sql'), 'w', encoding='utf-8', newline='\n').write(
        hdr + '-- 新库 beauty2oem-db 的表(不含数据;外键只保留指向新库里也有的表)\n' + '\n'.join(fix_ddl(r['sql'], keep) + ';' for r in tables) + '\n')
    io.open(os.path.join(MIG, '0002_post.sql'), 'w', encoding='utf-8', newline='\n').write(
        hdr + '-- 灌完数据再建:索引、触发器、视图;最后把自增 id 抬到 1000 万(回滚回写不撞公司库 id)\n'
        + '\n'.join(fix_ddl(r['sql'], keep) + ';' for r in post + views) + '\n' + '\n'.join(seq) + '\n')
    print(f'schema:{len(tables)} 张表、{len(post)} 个索引/触发器、{len(views)} 个视图、{len(seq)} 张自增表 → db/b2o-migrations/0001_init.sql, 0002_post.sql')
    return tables


def cmd_plan(company):
    sch = schema_rows(company)
    owned, feed, _ = table_set(sch)
    norowid = {r['name'] for r in sch if r['type'] == 'table' and re.search(r'WITHOUT\s+ROWID', r['sql'], re.I)}
    est = 0
    print(f'{"表":24s} {"计划":10s} {"上界":>10s} {"实数":>8s}  过滤')
    for t, w in owned + feed:
        plan = ' | '.join(r.get('detail', '') for r in company.q(f'EXPLAIN QUERY PLAN SELECT * FROM {t} WHERE {w}'))
        full = bool(re.search(rf'\bSCAN {t}\b(?! USING (?:COVERING )?INDEX)', plan)) and w != '1=1'
        mx = 0 if t in norowid else (company.q(f'SELECT MAX(rowid) m FROM {t}')[0]['m'] or 0)
        if full and mx > 200_000:
            n, cost = '跳过', mx
        else:
            n = company.q(f'SELECT COUNT(*) n FROM {t} WHERE {w}')[0]['n']; cost = mx if full else n
        est += cost
        print(f'{t:24s} {"全表扫" if full else "走索引/全表带走":10s} {mx:>10,} {n!s:>8s}  {w[:70]}')
    print(f'导出预计读 ≈ {est:,} 行(另加每页游标查询的子查询开销);上限 {MAX_READ:,}。本次 plan 实读 {D1.read:,} 行。')
    if est > MAX_READ:
        raise Budget(f'预计读 {est:,} 行超过 {MAX_READ:,},停。')


def dump(db, tables, norowid=()):
    """[(表, 过滤)] → INSERT 语句(游标按 rowid 翻页;pages 父页在前)"""
    stmts = []
    for t, w in tables:
        cols, rows, last = cols_of(db, t), [], -1
        sel = ', '.join(f'"{c}"' for c in cols)
        if t in norowid:
            rows = db.q(f'SELECT {sel} FROM {t} WHERE {w} LIMIT 100000')
        else:
            while True:
                page = db.q(f'SELECT rowid AS __rid, {sel} FROM {t} WHERE ({w}) AND rowid > {last} ORDER BY rowid LIMIT {PAGE}')
                rows += page
                if len(page) < PAGE: break
                last = page[-1]['__rid']
        if t == 'pages': rows = topo(rows)
        stmts += inserts(t, [f'"{c}"' for c in cols], [{f'"{c}"': r[c] for c in cols} for r in rows])
        print(f'  {t:24s} {len(rows):>7,} 行')
    return stmts


def cmd_export(company):
    sch = schema_rows(company)
    owned, _, _ = table_set(sch)
    norowid = {r['name'] for r in sch if r['type'] == 'table' and re.search(r'WITHOUT\s+ROWID', r['sql'], re.I)}
    paths = write_files('data', dump(company, owned, norowid))
    print(f'export:{len(paths)} 个文件在 {rel(OUT)}(含个人信息,灌完跑 cleanup);读 {D1.read:,} 行')
    return paths


def cmd_feed(company, b2o, apply):
    sch = schema_rows(company)
    _, feed, _ = table_set(sch)
    stmts = [f'DELETE FROM {t};' for t, _ in reversed(feed)] + dump(company, feed)   # 副本整份替换
    paths = write_files('feed', stmts)
    if apply:
        for p in paths: b2o.run_file(p)
        for p in paths: os.remove(p)                    # providers 行里有 key,灌完就删
    print(f'feed:{"已灌" if apply else "只生成(加 --apply 才灌)"} {len(paths)} 个文件;读 {D1.read:,} / 写 {D1.written:,}')


def cmd_import(b2o, apply):
    files = [os.path.join(MIG, '0001_init.sql')] + sorted(os.path.join(OUT, f) for f in os.listdir(OUT) if re.fullmatch(r'data-\d+\.sql', f)) \
        + [os.path.join(MIG, '0002_post.sql')]
    miss = [f for f in files if not os.path.exists(f)]
    if miss or len(files) < 3: raise SystemExit(f'缺文件,先跑 schema / export:{miss}')
    for f in files:
        print(('灌 ' if apply else '将灌 ') + rel(f))
        if apply: b2o.run_file(f); time.sleep(0 if isinstance(b2o, Local) else 4)   # 同库一次一个导入,批间停 4 秒(09-22 并发写压出 7500)
    print(f'import:写 {D1.written:,} 行' if apply else 'import:没加 --apply,只列文件')


def counts(company, b2o):
    sch = schema_rows(company)
    owned, feed, _ = table_set(sch)
    rows = []
    for t, w in owned + feed:
        a = company.q(f'SELECT COUNT(*) n FROM {t} WHERE {w}')[0]['n']
        b = b2o.q(f'SELECT COUNT(*) n FROM {t}')[0]['n']
        rows.append((t, a, b))
    seq = {r['name']: r['seq'] for r in b2o.q('SELECT name, seq FROM sqlite_sequence')}
    low = [t for t in autoinc([r for r in sch if r['name'] in {x for x, _ in owned + feed} | set(EMPTY)]) if seq.get(t, 0) < SEQ_FLOOR]
    return rows, low


def cmd_verify(company, b2o):
    rows, low = counts(company, b2o)
    bad = [(t, a, b) for t, a, b in rows if a != b]
    for t, a, b in rows: print(f'  {t:24s} 公司 {a:>7,}  新库 {b:>7,}  {"✓" if a == b else "✗"}')
    if low: print('  自增 id 没抬到 1000 万:', ', '.join(low))
    if bad or low:
        raise SystemExit('verify 不通过,不写 verified.json(mkconfig --live 会拒绝)')
    os.makedirs(OUT, exist_ok=True)
    json.dump({'ts': time.time(), 'at': time.strftime('%F %T'), 'db': getattr(b2o, 'id', 'local'), 'tables': {t: a for t, a, _ in rows}},
              io.open(os.path.join(OUT, 'verified.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'verify 通过:{len(rows)} 张表行数一致,自增 id 全在 1000 万以上 → verified.json')


def cmd_rollback(company, b2o, since, apply):
    """切换后新库里的变化回写公司库:新行(id ≥ 1000 万)、改过的行(updated_at ≥ since)、CMS 整份对齐。
       公司库里已冻结的预判只回写可改列;账本只追加;会员按 email 去重(撞了的记下来人工处理)。"""
    sch = schema_rows(b2o)
    owned, _, _ = table_set(sch)
    stmts, report = [], []
    frozen = {r['id'] for r in company.q('SELECT id FROM b2o_predictions WHERE frozen_at IS NOT NULL')} if any(t == 'b2o_predictions' for t, _ in owned) else set()
    for t, w in owned:
        cols = cols_of(b2o, t)
        pk = [r['name'] for r in sorted(b2o.q(f'PRAGMA table_info({t})'), key=lambda r: r['pk']) if r['pk']]
        cms = t in dict(OWNED)
        if cms or not pk:
            cond = '1=1'                                # CMS 小表:整份对齐
        else:
            cond = f'"{pk[0]}" >= {SEQ_FLOOR}' + (f" OR updated_at >= '{since}'" if 'updated_at' in cols else '') + (f" OR at >= '{since}'" if 'at' in cols else '')
        rows = b2o.q(f'SELECT * FROM {t} WHERE {cond}')
        q = [f'"{c}"' for c in cols]
        R = [{f'"{c}"': r[c] for c in cols} for r in rows]
        if t == 'b2o_ledger':
            stmts += inserts(t, q, [r for r in R if r['"id"'] >= SEQ_FLOOR], verb='INSERT OR IGNORE INTO')
        elif t == 'b2o_predictions':
            for grp, upd in (([r for r in R if r['"id"'] in frozen], [c for c in cols if c in PRED_MUTABLE]), ([r for r in R if r['"id"'] not in frozen], [c for c in cols if c != 'id'])):
                stmts += inserts(t, q, grp, tail=' ON CONFLICT(id) DO UPDATE SET ' + ', '.join(f'"{c}"=excluded."{c}"' for c in upd))
        elif pk:
            upd = [c for c in cols if c not in pk]
            stmts += inserts(t, q, R, tail=f' ON CONFLICT({", ".join(pk)}) DO UPDATE SET ' + ', '.join(f'"{c}"=excluded."{c}"' for c in upd) if upd else f' ON CONFLICT({", ".join(pk)}) DO NOTHING')
        else:
            stmts += inserts(t, q, R, verb='INSERT OR IGNORE INTO')
        if t in CMS_REPLACE:                            # 新库里删掉的页面 / 版块 / 快照,公司库也删(只动 beauty2oem 的行)
            now = {r['id'] for r in rows}
            gone = [r['id'] for r in company.q(f'SELECT id FROM {t} WHERE {w}') if r['id'] not in now]
            if gone: stmts.append(f'DELETE FROM {t} WHERE id IN ({",".join(map(str, gone))});')
        report.append(f'{t}:{len(rows)} 行')
    mem = b2o.q(f'SELECT email, plan_id, status, country, created_at, last_login_at FROM mb_members WHERE id >= {SEQ_FLOOR}')
    if mem:
        have = {r['email'] for r in company.q('SELECT email FROM mb_members WHERE email IN (' + ','.join(lit(m['email']) for m in mem) + ')')}
        stmts += inserts('mb_members', ['email', 'plan_id', 'status', 'country', 'created_at', 'last_login_at'], mem, tail=' ON CONFLICT(email) DO NOTHING')
        report.append(f'mb_members:{len(mem)} 个新会员,其中 {len(have)} 个邮箱公司库已有(保留公司库那行):{", ".join(sorted(have))[:300]}')
    paths = write_files('rollback', stmts)
    print('rollback 回写清单:\n  ' + '\n  '.join(report))
    if apply:
        company_lock(lambda: [company.run_file(p) for p in paths])
        print(f'rollback:已回写公司库,写 {D1.written:,} 行。接着:域名绑回 bohui-web、删 bohui-web 的 B2O_MAINT / B2O_AUTO 两个 secret')
    else:
        print(f'rollback:只生成 {len(paths)} 个文件(加 --apply 才回写公司库)')


def cmd_retire(company, apply, now=None):
    try:
        v = json.load(io.open(os.path.join(OUT, 'verified.json'), encoding='utf-8'))
    except (OSError, ValueError):
        raise SystemExit('没有 verified.json:没切换过,不许动公司库的 b2o 表')
    if (now or time.time()) - v['ts'] < 7 * 86400:
        raise SystemExit(f'切换({v["at"]})还没满 7 天,回滚窗口内公司库的 b2o 表要原样留着')
    names = [r['name'] for r in company.q("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'b2o%'") if r['name'].startswith('b2o_')]
    stmts = [f'ALTER TABLE "{t}" RENAME TO "_old_{t}";' for t in names]   # 触发器、视图里的表名 SQLite 会跟着改
    print('retire:' + ('已改名 ' if apply else '将改名(加 --apply 才执行)') + ', '.join(names))
    if apply and stmts:
        paths = write_files('retire', stmts)
        company_lock(lambda: [company.run_file(p) for p in paths])


def cmd_cleanup():
    n = 0
    for f in os.listdir(OUT) if os.path.isdir(OUT) else []:
        if f.endswith('.sql'): os.remove(os.path.join(OUT, f)); n += 1
    print(f'cleanup:删了 {n} 个含个人信息的 .sql')


# ───────── 离线自检 ─────────
def selftest():
    global OUT, MIG
    import tempfile
    tmp = tempfile.mkdtemp(prefix='b2o-split-')
    OUT, MIG = os.path.join(tmp, 'out'), os.path.join(tmp, 'mig')
    co = Local()
    co.c.executescript("""
    CREATE TABLE sites (id TEXT PRIMARY KEY, domain TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE);
    CREATE TABLE companies (id INTEGER PRIMARY KEY);
    CREATE TABLE site_i18n (site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, lang TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (site_id, lang));
    CREATE TABLE pages (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, slug TEXT NOT NULL,
      parent_id INTEGER REFERENCES pages(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (site_id, slug));
    CREATE TABLE page_i18n (page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE, lang TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY (page_id, lang));
    CREATE TABLE blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE, type TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE block_i18n (block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, lang TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (block_id, lang));
    CREATE TABLE page_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE, kind TEXT NOT NULL, snap_json TEXT NOT NULL, user_id INTEGER);
    CREATE TABLE media (id INTEGER PRIMARY KEY AUTOINCREMENT, r2_key TEXT NOT NULL UNIQUE, uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, slug TEXT NOT NULL,
      cover_media INTEGER REFERENCES media(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'draft', UNIQUE (site_id, slug));
    CREATE TABLE product_i18n (product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, lang TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (product_id, lang));
    CREATE TABLE product_media (product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE, PRIMARY KEY (product_id, media_id));
    CREATE TABLE inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, name TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new');
    CREATE INDEX idx_inq_site ON inquiries(site_id);
    CREATE TABLE b2o_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id INTEGER, contact TEXT, status TEXT NOT NULL DEFAULT 'new', company_id INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (company_id) REFERENCES companies(id));
    CREATE TABLE b2o_predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, r30 TEXT, frozen_at TEXT, is_public INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TRIGGER b2o_pred_frozen_upd BEFORE UPDATE OF title, frozen_at ON b2o_predictions WHEN OLD.frozen_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'prediction frozen'); END;
    CREATE TABLE b2o_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, supersedes INTEGER);
    CREATE TRIGGER b2o_ledger_no_update BEFORE UPDATE ON b2o_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
    CREATE TRIGGER b2o_ledger_supersedes_ref BEFORE INSERT ON b2o_ledger WHEN NEW.supersedes IS NOT NULL AND NOT EXISTS (SELECT 1 FROM b2o_ledger WHERE id = NEW.supersedes)
      BEGIN SELECT RAISE(ABORT, 'supersedes points to missing row'); END;
    CREATE VIEW b2o_ledger_current AS SELECT l.* FROM b2o_ledger l WHERE NOT EXISTS (SELECT 1 FROM b2o_ledger n WHERE n.supersedes = l.id);
    CREATE TABLE playbooks (slug TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE regulations (id TEXT PRIMARY KEY);
    CREATE TABLE regulation_updates (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, market_id TEXT REFERENCES regulations(id), title_zh TEXT);
    CREATE TABLE providers (id TEXT PRIMARY KEY, api_keys TEXT NOT NULL DEFAULT '', is_free INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE ai_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, prompt_key TEXT);
    CREATE TABLE revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE mb_members (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL DEFAULT 'free', status TEXT NOT NULL DEFAULT 'active', country TEXT, created_at TEXT, last_login_at TEXT);
    CREATE TABLE mb_views (member_id INTEGER NOT NULL, day TEXT NOT NULL, item_key TEXT NOT NULL, PRIMARY KEY (member_id, day, item_key)) WITHOUT ROWID;
    INSERT INTO users (email) VALUES ('admin@x');
    INSERT INTO companies VALUES (77);
    INSERT INTO sites VALUES ('beauty2oem','beauty2oem.com','2026-09-01'), ('biosphere-ai','biosphere-ai.com','2026-09-01');
    INSERT INTO site_i18n VALUES ('beauty2oem','zh-cn','帛卉'), ('biosphere-ai','en','BIOSPHERE');
    INSERT INTO pages (id, site_id, slug, parent_id, status) VALUES (5,'biosphere-ai','',NULL,'published'), (262,'beauty2oem','opportunities',NULL,'published');
    INSERT INTO pages (id, site_id, slug, parent_id, status) VALUES (263,'beauty2oem','sub',NULL,'published');
    INSERT INTO pages (id, site_id, slug, parent_id, status) VALUES (1,'beauty2oem','',NULL,'published');
    UPDATE pages SET parent_id = 263 WHERE id = 262;
    INSERT INTO page_i18n VALUES (1,'zh-cn','首页 ''引号'' & 100%'), (262,'zh-cn','机会'), (5,'en','Home');
    INSERT INTO blocks (id, page_id, type) VALUES (10,1,'fx_hero'), (11,262,'fx_cards'), (12,5,'hero');
    INSERT INTO block_i18n VALUES (10,'zh-cn','{"t":"a"}'), (11,'zh-cn','{}'), (12,'en','{}');
    INSERT INTO page_versions (page_id, kind, snap_json, user_id) VALUES (1,'draft','{}',1);
    INSERT INTO media (r2_key, uploaded_by) VALUES ('k1', 1);
    INSERT INTO products (site_id, slug, cover_media) VALUES ('beauty2oem','p1',1), ('biosphere-ai','p2',1);
    INSERT INTO product_i18n VALUES (1,'zh-cn','产品'), (2,'en','P2');
    INSERT INTO product_media VALUES (1,1);
    INSERT INTO inquiries (site_id, name, message) VALUES ('biosphere-ai','A','m'), ('beauty2oem','张','简报'), ('beauty2oem','李',char(10) || 'x');
    INSERT INTO b2o_profiles (inquiry_id, contact, company_id) VALUES (2,'张',77);
    INSERT INTO b2o_predictions (title, frozen_at, is_public) VALUES ('冻结的判断','2026-09-24',1), ('草稿',NULL,0);
    INSERT INTO b2o_ledger (kind, supersedes) VALUES ('judgment',NULL), ('correction',1);
    INSERT INTO playbooks VALUES ('rules-for-ai','工厂口径'), ('other','x');
    INSERT INTO regulations VALUES ('id');
    INSERT INTO regulation_updates (date, market_id, title_zh) VALUES ('2026-09-01','id','印尼');
    INSERT INTO providers VALUES ('agnes-30flash-cn','k1,k2',1,1), ('openai','sk',0,1), ('sensenova','k3',1,0);
    INSERT INTO jobs (name) VALUES ('b2o-auto');
    INSERT INTO mb_members (email) VALUES ('old@x');
    """)
    b2 = Local()
    cmd_schema(co)
    init = io.open(os.path.join(MIG, '0001_init.sql'), encoding='utf-8').read()
    assert 'REFERENCES users' not in init and 'REFERENCES media' not in init and 'REFERENCES companies' not in init and 'REFERENCES regulations' not in init
    assert 'REFERENCES sites' in init and 'REFERENCES pages' in init and 'CREATE TABLE IF NOT EXISTS' in init
    assert 'users' not in re.findall(r'CREATE TABLE IF NOT EXISTS "?(\w+)', init) and 'b2o_ledger' in init
    cmd_export(co)
    cmd_import(b2, apply=True)
    cmd_feed(co, b2, apply=True)
    cmd_verify(co, b2)
    q1 = lambda db, s: db.q(s)[0]
    assert q1(b2, 'SELECT COUNT(*) n FROM inquiries')['n'] == 2 and q1(b2, "SELECT COUNT(*) n FROM inquiries WHERE site_id<>'beauty2oem'")['n'] == 0
    assert q1(b2, 'SELECT COUNT(*) n FROM pages')['n'] == 3 and q1(b2, 'SELECT parent_id p FROM pages WHERE id=262')['p'] == 263
    assert q1(b2, 'SELECT title FROM page_i18n WHERE page_id=1')['title'] == "首页 '引号' & 100%"
    assert q1(b2, 'SELECT message FROM inquiries WHERE name=\'李\'')['message'] == '\nx'
    assert [r['id'] for r in b2.q('SELECT id FROM providers')] == ['agnes-30flash-cn'], '白名单外的模型不许带'
    assert q1(b2, 'SELECT COUNT(*) n FROM playbooks')['n'] == 1 and q1(b2, 'SELECT COUNT(*) n FROM jobs')['n'] == 0
    assert q1(b2, 'SELECT COUNT(*) n FROM b2o_ledger_current')['n'] == 1
    assert json.load(io.open(os.path.join(OUT, 'verified.json'), encoding='utf-8'))['tables']['inquiries'] == 2
    # 切换后新库里发生的事:新简报、改档案、改文案、新版块、删版块、冻结判断回填 30 天、新账本、新会员(一个撞邮箱)
    since = q1(b2, "SELECT datetime('now','-1 minute') t")['t']
    b2.c.executescript(f"""
    INSERT INTO inquiries (site_id, name, message) VALUES ('beauty2oem','王','新简报');
    UPDATE b2o_profiles SET status='replied', updated_at=datetime('now') WHERE id=1;
    INSERT INTO b2o_profiles (inquiry_id, contact) VALUES ((SELECT MAX(id) FROM inquiries), '王');
    UPDATE block_i18n SET data_json='{{"t":"b"}}' WHERE block_id=10;
    INSERT INTO blocks (page_id, type) VALUES (1,'fx_steps');
    DELETE FROM blocks WHERE id=11;
    UPDATE b2o_predictions SET r30='对了', updated_at=datetime('now') WHERE id=1;
    INSERT INTO b2o_ledger (kind, supersedes) VALUES ('note', 2);
    INSERT INTO mb_members (email) VALUES ('new@x'), ('old@x');
    """)
    assert q1(b2, "SELECT MIN(id) m FROM inquiries WHERE name='王'")['m'] >= SEQ_FLOOR
    cmd_rollback(co, b2, since, apply=True)
    assert q1(co, "SELECT COUNT(*) n FROM inquiries WHERE name='王'")['n'] == 1
    assert q1(co, 'SELECT status FROM b2o_profiles WHERE id=1')['status'] == 'replied'
    assert q1(co, 'SELECT data_json d FROM block_i18n WHERE block_id=10')['d'] == '{"t":"b"}'
    assert q1(co, 'SELECT COUNT(*) n FROM blocks WHERE id=11')['n'] == 0 and q1(co, 'SELECT COUNT(*) n FROM blocks WHERE id=12')['n'] == 1, '只删 beauty2oem 的版块'
    assert q1(co, 'SELECT r30 FROM b2o_predictions WHERE id=1')['r30'] == '对了' and q1(co, 'SELECT title FROM b2o_predictions WHERE id=1')['title'] == '冻结的判断'
    assert q1(co, 'SELECT COUNT(*) n FROM b2o_ledger')['n'] == 3 and q1(co, "SELECT COUNT(*) n FROM mb_members")['n'] == 2
    assert q1(co, "SELECT COUNT(*) n FROM inquiries WHERE site_id='biosphere-ai'")['n'] == 1 and q1(co, 'SELECT COUNT(*) n FROM pages WHERE id=5')['n'] == 1
    assert fix_ddl('CREATE TABLE t (a INTEGER REFERENCES users(id) ON DELETE SET NULL, b TEXT)', {'t'}) == 'CREATE TABLE IF NOT EXISTS t (a INTEGER, b TEXT)'
    try:
        cmd_retire(co, apply=True); raise AssertionError('不满 7 天也改名了')
    except SystemExit:
        pass
    cmd_retire(co, apply=True, now=time.time() + 8 * 86400)
    assert q1(co, "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE '_old_b2o_%'")['n'] == 3
    assert q1(co, 'SELECT COUNT(*) n FROM b2o_ledger_current')['n'] == 1, '视图跟着改名后还能查(3 行里 2 行被后来的行 supersedes)'
    try:
        D1.read = MAX_READ + 1; _check_budget(); raise AssertionError('超读没停')
    except Budget:
        D1.read = 0
    print('migrate selftest ok')


def main():
    a = sys.argv[1:]
    cmd, apply = (a[0] if a else 'plan'), '--apply' in a
    if cmd == 'selftest': return selftest()
    if cmd == 'cleanup': return cmd_cleanup()
    company = D1('bohui-cms-v2', 'wrangler.toml', expect=COMPANY_ID)
    b2o = D1('beauty2oem-db', 'wrangler.b2o.jsonc') if cmd in ('import', 'feed', 'verify', 'rollback') else None
    try:
        if cmd == 'plan': company_lock(lambda: cmd_plan(company))
        elif cmd == 'schema': company_lock(lambda: cmd_schema(company))
        elif cmd == 'export': company_lock(lambda: cmd_export(company))
        elif cmd == 'import': cmd_import(b2o, apply)
        elif cmd == 'feed': company_lock(lambda: cmd_feed(company, b2o, apply))
        elif cmd == 'verify': company_lock(lambda: cmd_verify(company, b2o))
        elif cmd == 'retire': cmd_retire(company, apply)
        elif cmd == 'rollback':
            since = next((x.split('=', 1)[1] if '=' in x else a[a.index(x) + 1] for x in a if x.startswith('--since')), None)
            if not since or not re.fullmatch(r'\d{4}-\d\d-\d\d \d\d:\d\d:\d\d', since): raise SystemExit('rollback 要带 --since "YYYY-MM-DD HH:MM:SS"(UTC,切换开始时刻)')
            cmd_rollback(company, b2o, since, apply)
        else: raise SystemExit(__doc__)
    except Budget as e:
        raise SystemExit(str(e))
    print(f'本次合计:读 {D1.read:,} 行 / 写 {D1.written:,} 行')


if __name__ == '__main__':
    main()

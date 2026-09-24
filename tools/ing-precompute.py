#!/usr/bin/env python3
"""成分页两段固定表 ing_prods / ing_cooc 的本机刷新(09-24 零读取第一批;施工图 v2 §1.2 B、1-5;迁移 0123)。

页面 apps/web/src/pages/[lang]/ingredients/_CatalogIngredient.astro 原来每次渲染现算两条:
「含该成分的热销产品」和「常与它同配的成分」,是公司库部署后残留读量的第 1、2 名(合计每天约 1.5 亿行)。
这里把原 SQL 一字不改搬到本机副本上,每个键跑一遍,结果写回两张表;页面只按主键读 1–2 行。

流程:按 rowid / id 游标分批导出三张表的所需列(不用 OFFSET)→ 本机 SQLite 副本 → 每个键跑原 SQL →
     读线上指纹 h 对比 → 只写变了的行、删掉消失的键 → 回读指纹核对。跑完打印读写行数。
闸(铁令):单次读 D1 超过 500 万行、写超过 100 万行就停下说原因。
一律 -c apps/web/wrangler.toml + 库名,执行前核对 database_id 是公司库;直接调 node 跑 wrangler,不经 cmd.exe。

用法(任意目录):
  python tools/ing-precompute.py             导出 → 算 → 增量写
  python tools/ing-precompute.py --dry-run   算完只报要写多少行,不写
  python tools/ing-precompute.py --reuse     不重新导出,用上次本机副本重算(改口径后用)
  python tools/ing-precompute.py --resume    导出中途断了,从本机副本已有的最大游标接着导
  python tools/ing-precompute.py --selftest  抽 5 个成分:页面新读法读固定表 == 原查询(全在本机,不打线上)
  --work DIR  本机副本目录(默认 %TEMP%/ing-precompute,约 1GB;不要放进仓库)
什么时候跑:灌完产品、重切成分(tools/market/inci_index.py、inci_ctrl_fix.py)之后跑一次。
"""
import hashlib, io, json, os, random, re, sqlite3, subprocess, sys, tempfile, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from _bohui import _wenv  # noqa: E402  公司 .env(CLOUDFLARE_API_TOKEN / ACCOUNT_ID)合进环境,写库前必须有

DB, DB_ID = "bohui-cms-v2", "ea5b0da4-7f96-48bf-8fca-dc7193a9596d"   # 公司生产库。平台库也叫 bohui-cms-v2,别混
CFG = os.path.join(ROOT, "apps", "web", "wrangler.toml")
WRANGLER = os.path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js")
MIGRATION = os.path.join(ROOT, "db", "migrations", "0123_ing_precompute.sql")
READ_CAP, WRITE_CAP, BATCH = 5_000_000, 1_000_000, 100_000   # BATCH:每次游标取的行数(产品表标题长,用 BATCH // 5)

# ── 口径:原 _CatalogIngredient.astro 09-24 版第 73–88 行逐字搬来。改口径只改这里,页面不用动 ──
BASE = ['WATER', 'AQUA', 'WATER/AQUA/EAU', 'GLYCERIN', 'PHENOXYETHANOL', 'BUTYLENE GLYCOL', '1,2-HEXANEDIOL', 'ETHYLHEXYLGLYCERIN', 'SODIUM HYALURONATE',
        'CAPRYLIC/CAPRIC TRIGLYCERIDE', 'XANTHAN GUM', 'DISODIUM EDTA', 'CARBOMER', 'TOCOPHEROL', 'PROPANEDIOL', 'DIMETHICONE']
PROD_SQL = ("SELECT p.id, p.brand, p.title, p.title_zh, p.country, p.cat, p.cat_zh, COUNT(*) OVER () AS total FROM market_product_inci m JOIN market_products p ON p.id = m.product_id "
            "WHERE m.inci_key IN (?, ?) GROUP BY p.id ORDER BY p.last_seen DESC, p.id DESC LIMIT 12")
# ponytail: 共现沿用页面的抽样口径(含它的前 100 个产品),显示不变;要全量口径删掉 LIMIT 100 即可,属显示口径改动,先报创始人
COOC_SQL = ("WITH a AS (SELECT DISTINCT product_id FROM market_product_inci WHERE inci_key IN (?, ?) LIMIT 100), "
            "t AS (SELECT b.inci_key, COUNT(*) AS n FROM a JOIN market_product_inci b ON b.product_id = a.product_id "
            f"WHERE b.inci_key NOT IN (?, ?, {','.join('?' * len(BASE))}) GROUP BY b.inci_key ORDER BY n DESC LIMIT 8) "
            "SELECT t.inci_key, f.name_zh, f.functions_zh, f.functions, f.rating FROM t LEFT JOIN ingredient_facts f ON f.inci_key = t.inci_key ORDER BY t.n DESC")
# 页面新读法(与 _CatalogIngredient.astro 一字不差;{} = 去重后的 fk、ck 占位,同页面 inK;自测用它读固定表)
PAGE_SQL = "SELECT p.inci_key, p.total, p.json AS pj, c.json AS cj FROM ing_prods p LEFT JOIN ing_cooc c ON c.inci_key = p.inci_key WHERE p.inci_key IN ({})"
P_COLS = ("id", "brand", "title", "title_zh", "country", "cat", "cat_zh")   # 页面产品卡用到的列
C_COLS = ("inci_key", "name_zh", "rating")                                    # 页面成分胶囊用到的列

LOCAL_SCHEMA = """
CREATE TABLE IF NOT EXISTS market_product_inci (product_id INTEGER NOT NULL, seq INTEGER NOT NULL, inci_key TEXT NOT NULL, PRIMARY KEY (product_id, seq));
CREATE TABLE IF NOT EXISTS market_products (id INTEGER PRIMARY KEY, brand TEXT, title TEXT, title_zh TEXT, country TEXT, cat TEXT, cat_zh TEXT, last_seen TEXT);
CREATE TABLE IF NOT EXISTS ingredient_facts (inci_key TEXT PRIMARY KEY, name_zh TEXT, functions TEXT, functions_zh TEXT, rating TEXT);
CREATE TABLE IF NOT EXISTS _meta (k TEXT PRIMARY KEY, v TEXT);
"""
# 本机副本的索引与线上 0088 一致 —— 共现的「前 100 个产品」取哪 100 个取决于查询计划,两边都没有 sqlite_stat1,索引一样计划就一样
LOCAL_INDEX = "CREATE INDEX IF NOT EXISTS idx_mpi_key ON market_product_inci (inci_key); CREATE INDEX IF NOT EXISTS idx_mpi_key_pid ON market_product_inci (inci_key, product_id);"
EXPORT = [   # (本机表, 线上游标 SQL, 游标列, 本机插入)
    ("market_product_inci", "SELECT rowid AS r, product_id AS p, seq AS s, inci_key AS k FROM market_product_inci WHERE rowid > {last} ORDER BY rowid LIMIT {n}", "r",
     "INSERT INTO market_product_inci (rowid, product_id, seq, inci_key) VALUES (:r, :p, :s, :k)"),
    ("market_products", "SELECT id, brand, title, title_zh, country, cat, cat_zh, last_seen FROM market_products WHERE id > {last} ORDER BY id LIMIT {n}", "id",
     "INSERT INTO market_products VALUES (:id, :brand, :title, :title_zh, :country, :cat, :cat_zh, :last_seen)"),
    ("ingredient_facts", "SELECT rowid AS r, inci_key, name_zh, functions, functions_zh, rating FROM ingredient_facts WHERE rowid > {last} ORDER BY rowid LIMIT {n}", "r",
     "INSERT INTO ingredient_facts (rowid, inci_key, name_zh, functions, functions_zh, rating) VALUES (:r, :inci_key, :name_zh, :functions, :functions_zh, :rating)"),
]
STAT = {"read": 0, "written": 0}


def cn_key(s):
    """= apps/web/src/lib/inci-key.ts inciKey(页面的 ck):大写 → 去括号及内容 → 非字母数字压一个空格"""
    return re.sub(r"[^A-Z0-9]+", " ", re.sub(r"[（(][^）)]*[）)]", " ", str(s or "").upper())).strip()


def assert_db():
    t = io.open(CFG, encoding="utf-8").read()
    if f'database_id = "{DB_ID}"' not in t or f'database_name = "{DB}"' not in t:
        raise SystemExit(f"库不对:{CFG} 没指向公司库 {DB}/{DB_ID},停")
    if not _wenv().get("CLOUDFLARE_API_TOKEN"):
        raise SystemExit("缺 CLOUDFLARE_API_TOKEN(公司 .env),不跑 —— 否则会落到 OAuth 主账号")


def wrangler(args, parse, timeout=900):
    """跑一次 wrangler d1 execute。失败(网络抖动 / 7500 / 导入锁)歇 15-90 秒重试,连败 4 次停 —— 不把失败当成「没数据」。"""
    last = ""
    for i in range(4):
        try:
            p = subprocess.run(["node", WRANGLER, "d1", "execute", DB, "--remote", "-c", CFG, *args], capture_output=True, text=True,
                               encoding="utf-8", errors="replace", cwd=ROOT, env=_wenv(), timeout=timeout)
            out = re.sub(r"\x1b\[[0-9;]*m", "", p.stdout or "")
            try:
                return parse(out)
            except Exception:
                last = (out + re.sub(r"\x1b\[[0-9;]*m", "", p.stderr or "")).strip()[-300:]
        except subprocess.TimeoutExpired:
            last = f"超时 {timeout}s"
        print(f"  [wrangler 第 {i + 1} 次失败] {last[-200:]}", flush=True)
        time.sleep((15, 45, 90, 90)[i])
    raise SystemExit(f"wrangler 连败 4 次,停。最后一次:{last}")


def _meta(d):
    STAT["read"] += int(d["meta"].get("rows_read") or 0); STAT["written"] += int(d["meta"].get("rows_written") or 0)
    if STAT["read"] > READ_CAP:
        raise SystemExit(f"读已 {STAT['read']:,} 行,超单次上限 {READ_CAP:,},停(先查表是不是长大了,再决定要不要分两次跑)")


def query(sql):
    def parse(out):
        d = json.loads(out[out.index("[\n  {"):out.rindex("]") + 1])[0]
        if not d.get("success"): raise ValueError("success=false")
        _meta(d); return d["results"]
    return wrangler(["--json", "--command", sql], parse)


def execute_file(path):
    def parse(out):
        ds = json.loads(out[out.index("[\n  {"):out.rindex("]") + 1])
        if not all(d.get("success") for d in ds): raise ValueError("success=false")
        for d in ds: _meta(d)
        return sum(int(d["meta"].get("rows_written") or 0) for d in ds)
    return wrangler(["--json", "--file", path], parse)


def hexs(s):
    """字符串游标 / 键写成十六进制字面量:键来自抓来的成分表,什么字符都可能有,不拼引号"""
    return f"CAST(X'{s.encode('utf-8').hex()}' AS TEXT)"


def q(s):
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


# ── 1 导出 ──
def export(con, work):
    b = query("SELECT (SELECT MAX(rowid) FROM market_product_inci) a, (SELECT MAX(id) FROM market_products) b, (SELECT MAX(rowid) FROM ingredient_facts) c")[0]
    est = sum(int(b[k] or 0) for k in "abc")
    print(f"导出前估读(按最大 rowid,上限):{est:,} 行", flush=True)
    if est > READ_CAP: raise SystemExit(f"估读 {est:,} 行 > {READ_CAP:,},停。表长大了:改成分两次跑(先 --resume 续导)再算")
    for table, sql, key, ins in EXPORT:
        last = con.execute(f"SELECT COALESCE(MAX(rowid), 0) FROM {table}").fetchone()[0]
        n0, t0 = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], time.time()
        while True:
            n = BATCH if table == "market_product_inci" else BATCH // 5
            rows = query(sql.format(last=last, n=n))
            con.executemany(ins, rows); con.commit()
            n0 += len(rows)
            if rows: last = rows[-1][key]
            print(f"  {table}: {n0:,} 行(游标 {last},{time.time() - t0:.0f}s,累计读 {STAT['read']:,})", flush=True)
            if len(rows) < n: break
    con.executescript(LOCAL_INDEX)
    con.execute("INSERT OR REPLACE INTO _meta VALUES ('export_done', datetime('now'))"); con.commit()


# ── 2 本机算 ──
def compute(con):
    """每个产品表里出现过的键跑一遍原 SQL,绑 (键, cnKey(键)) = 页面 fk 为该键时的 IN (fk, ck)。
    产品为空的键不出行(页面原来也不显示);共现为空的键不进 ing_cooc(页面原来退回「同功能」那段,现在照旧)。"""
    con.executescript(io.open(MIGRATION, encoding="utf-8").read())
    con.execute("DELETE FROM ing_prods"); con.execute("DELETE FROM ing_cooc")
    keys = [r[0] for r in con.execute("SELECT DISTINCT inci_key FROM market_product_inci")]
    t0, n = time.time(), 0
    for i, k in enumerate(keys, 1):
        c = cn_key(k)
        ps = con.execute(PROD_SQL, (k, c)).fetchall()
        if ps:
            pj = json.dumps([{x: r[x] for x in P_COLS} for r in ps], ensure_ascii=False, separators=(",", ":"))
            con.execute("INSERT INTO ing_prods VALUES (?, ?, ?, ?)", (k, ps[0]["total"], pj, fp(ps[0]["total"], pj)))
            cs = con.execute(COOC_SQL, (k, c, k, c, *BASE)).fetchall()
            if cs:
                cj = json.dumps([{x: r[x] for x in C_COLS} for r in cs], ensure_ascii=False, separators=(",", ":"))
                con.execute("INSERT INTO ing_cooc VALUES (?, ?, ?)", (k, cj, fp(cj)))
            n += 1
        if i % 20000 == 0: print(f"  算到 {i:,}/{len(keys):,} 键({time.time() - t0:.0f}s)", flush=True)
    con.commit()
    print(f"本机算完:{len(keys):,} 个键,有产品的 {n:,},有共现的 {con.execute('SELECT COUNT(*) FROM ing_cooc').fetchone()[0]:,}({time.time() - t0:.0f}s)", flush=True)


def fp(*parts):
    return hashlib.sha1("\x1f".join(map(str, parts)).encode("utf-8", "replace")).hexdigest()[:16]


# ── 3 增量写 ──
def remote_h(table):
    got, last = {}, ""
    while True:
        rows = query(f"SELECT inci_key AS k, h FROM {table} WHERE inci_key > {hexs(last)} ORDER BY inci_key LIMIT {BATCH}")
        got.update((r["k"], r["h"]) for r in rows)
        if len(rows) < BATCH: return got
        last = rows[-1]["k"]


def sql_upserts(table, rows):
    """rows: [(键, total?, json, h)] → 多行 UPSERT 语句(每条 < 90KB,D1 单条上限 100KB)"""
    cols = "inci_key, total, json, h" if table == "ing_prods" else "inci_key, json, h"
    sets = ", ".join(f"{c} = excluded.{c}" for c in cols.split(", ")[1:])
    out, buf, size = [], [], 0
    for r in rows:
        v = "(" + ", ".join([hexs(r[0])] + [str(x) if isinstance(x, int) else q(x) for x in r[1:]]) + ")"
        if buf and size + len(v.encode("utf-8")) > 90_000:
            out.append(f"INSERT INTO {table} ({cols}) VALUES {', '.join(buf)} ON CONFLICT(inci_key) DO UPDATE SET {sets};"); buf, size = [], 0
        buf.append(v); size += len(v.encode("utf-8"))
    if buf: out.append(f"INSERT INTO {table} ({cols}) VALUES {', '.join(buf)} ON CONFLICT(inci_key) DO UPDATE SET {sets};")
    return out


def sql_deletes(table, keys):
    keys = sorted(keys)
    return [f"DELETE FROM {table} WHERE inci_key IN ({', '.join(hexs(k) for k in keys[i:i + 500])});" for i in range(0, len(keys), 500)]


def write(con, work, dry):
    plan = []
    for table, cols in (("ing_prods", "inci_key, total, json, h"), ("ing_cooc", "inci_key, json, h")):
        rh = remote_h(table)
        local = {r[0]: tuple(r) for r in con.execute(f"SELECT {cols} FROM {table}")}
        up = [r for k, r in local.items() if rh.get(k) != r[-1]]
        gone = [k for k in rh if k not in local]
        print(f"  {table}:线上 {len(rh):,} 行,本机 {len(local):,} 行 → 要写 {len(up):,},要删 {len(gone):,}", flush=True)
        plan.append((table, up, gone, local))
    total = sum(len(u) + len(g) for _, u, g, _ in plan)
    if total > WRITE_CAP: raise SystemExit(f"要写 {total:,} 行 > {WRITE_CAP:,},停。先查是不是口径变了导致整表重写,再分两次跑")
    if dry or not total:
        print("dry-run,不写库" if dry else "线上已是最新,不写"); return 0
    stmts = []
    for table, up, gone, _ in plan: stmts += sql_upserts(table, up) + sql_deletes(table, gone)
    files, buf, size = [], [], 0   # 每个文件约 4MB:导入失败时重来的代价小
    for s in stmts:
        if buf and size + len(s) > 4_000_000: files.append(buf); buf, size = [], 0
        buf.append(s); size += len(s)
    if buf: files.append(buf)
    for i, part in enumerate(files, 1):
        f = os.path.join(work, f"_ing_write_{i:03d}.sql")
        io.open(f, "w", encoding="utf-8", errors="replace", newline="\n").write("\n".join(part) + "\n")
        w = execute_file(f)
        print(f"  写入 {i}/{len(files)}:{len(part)} 条语句,rows_written {w:,}(累计写 {STAT['written']:,})", flush=True)
        if STAT["written"] > WRITE_CAP: raise SystemExit(f"写已 {STAT['written']:,} 行 > {WRITE_CAP:,},停")
    bad = 0   # 回显不等于结论:回读指纹核对最终状态。读预算够就全量回读,不够就抽查(下次运行的比对本身就是一次全量核对)
    full = STAT["read"] + sum(len(local) for *_, local in plan) <= READ_CAP
    for table, up, gone, local in plan:
        if full:
            rh = remote_h(table)
            bad += sum(1 for k, r in local.items() if rh.get(k) != r[-1]) + sum(1 for k in rh if k not in local)
            continue
        ks = [r[0] for r in random.sample(up, min(200, len(up)))] + random.sample(gone, min(200, len(gone)))
        if ks:
            rh = {r["k"]: r["h"] for r in query(f"SELECT inci_key AS k, h FROM {table} WHERE inci_key IN ({', '.join(hexs(k) for k in ks)})")}
            bad += sum(1 for k in ks if rh.get(k) != (local[k][-1] if k in local else None))
    print(f"回读核对({'全量' if full else '抽查'}):{'一致' if not bad else f'{bad} 行不一致,再跑一次补写'}", flush=True)
    return bad


# ── 自测:页面新读法读固定表 == 原查询,全在本机 ──
def selftest(con):
    if not con.execute("SELECT 1 FROM sqlite_master WHERE name = 'ing_prods'").fetchone():
        raise SystemExit("本机副本还没算过,先跑一次 --dry-run")
    keys = [r[0] for r in con.execute("SELECT inci_key FROM ing_prods ORDER BY inci_key")]
    ks = set(r[0] for r in con.execute("SELECT DISTINCT inci_key FROM market_product_inci"))
    facts = [r[0] for r in con.execute("SELECT inci_key FROM ingredient_facts ORDER BY inci_key")]
    rnd = random.Random(924)
    pairs = [("NIACINAMIDE", "NIACINAMIDE")]                                              # ① 大成分(产品多,共现走抽样)
    both = [k for k in keys if cn_key(k) != k and cn_key(k) in ks]                        # ② fk≠ck,两个键都有产品 → fk 那行是两键合并
    only_ck = [f for f in facts if f not in ks and cn_key(f) in ks]                       # ③ fk 不在产品表,只有 ck 有 → 页面退到 ck 那行
    pairs += [(rnd.choice(x), None) for x in (both, only_ck) if x]
    big = [r[0] for r in con.execute("SELECT inci_key FROM ing_prods WHERE total >= 13 ORDER BY inci_key")]
    while len(pairs) < 5: pairs.append((rnd.choice(big if len(pairs) % 2 else keys), None))   # ④⑤ 随机(一个多于 12 款,一个任意)
    pairs = [(f, c or cn_key(f)) for f, c in pairs]
    mem = sqlite3.connect(":memory:"); mem.row_factory = sqlite3.Row
    mem.executescript(io.open(MIGRATION, encoding="utf-8").read())
    for f, c in pairs:   # 把这几个键的行按线上同一套 SQL 生成器灌进一个只有迁移的空库,再用页面新 SQL 读
        for table, cols in (("ing_prods", "inci_key, total, json, h"), ("ing_cooc", "inci_key, json, h")):
            rows = con.execute(f"SELECT {cols} FROM {table} WHERE inci_key IN (?, ?)", (f, c)).fetchall()
            mem.executescript("\n".join(sql_upserts(table, [tuple(r) for r in rows])))
    for f, c in pairs:
        old_p = [dict(r) for r in con.execute(PROD_SQL, (f, c))]
        old_c = [dict(r) for r in con.execute(COOC_SQL, (f, c, f, c, *BASE))] if old_p else []
        ks = list(dict.fromkeys((f, c)))   # = 页面 [...new Set([fk, ck])]
        rows = mem.execute(PAGE_SQL.format(",".join("?" * len(ks))), ks).fetchall()
        hit = next((r for r in rows if r["inci_key"] == f), rows[0] if rows else None)   # 与页面同一取法
        new_p = json.loads(hit["pj"]) if hit else []
        new_c = json.loads(hit["cj"]) if hit and hit["cj"] else []
        assert new_p == [{x: r[x] for x in P_COLS} for r in old_p], f"{f}: 产品列表不一致"
        assert (hit["total"] if hit else 0) == (old_p[0]["total"] if old_p else 0), f"{f}: 总数不一致"
        assert new_c == [{x: r[x] for x in C_COLS} for r in old_c], f"{f}: 共现不一致"
        assert len(new_p) <= 12 and len(new_c) <= 8 and not ({x["inci_key"] for x in new_c} & set(BASE + [f, c])), f"{f}: 越界"
        print(f"  PASS fk={f!r} ck={c!r}:共 {(hit['total'] if hit else 0):,} 款,列 {len(new_p)} 款,共现 {len(new_c)} 个,取的是 {'fk' if hit and hit['inci_key'] == f else 'ck' if hit else '无'} 行")
    assert cn_key("Glycyrrhiza Glabra (Licorice) Root Extract") == "GLYCYRRHIZA GLABRA ROOT EXTRACT" and cn_key("1,2-Hexanediol") == "1 2 HEXANEDIOL"
    print(f"自测通过:{len(pairs)} 个成分,固定表经页面新读法 == 原查询")


def main():
    a = sys.argv[1:]
    work = a[a.index("--work") + 1] if "--work" in a else os.path.join(tempfile.gettempdir(), "ing-precompute")
    os.makedirs(work, exist_ok=True)
    path = os.path.join(work, "ing-precompute.sqlite")
    if "--selftest" in a:
        if not os.path.exists(path): raise SystemExit(f"本机副本 {path} 不存在(%TEMP% 可能被清过),先跑一次 --dry-run 重新导出")
        con = sqlite3.connect(path); con.row_factory = sqlite3.Row
        return selftest(con)
    assert_db()
    fresh = not ("--reuse" in a or "--resume" in a)
    if fresh and os.path.exists(path): os.remove(path)
    con = sqlite3.connect(path); con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode = OFF"); con.execute("PRAGMA synchronous = OFF")
    con.executescript(LOCAL_SCHEMA)
    done = con.execute("SELECT v FROM _meta WHERE k = 'export_done'").fetchone()
    if "--reuse" in a and not done: raise SystemExit("本机副本不完整,不能 --reuse;用 --resume 续导")
    if not done: export(con, work)
    compute(con)
    bad = write(con, work, "--dry-run" in a)
    print(f"本次读 D1 {STAT['read']:,} 行 · 写 D1 {STAT['written']:,} 行")
    if bad: sys.exit(1)


if __name__ == "__main__":
    main()

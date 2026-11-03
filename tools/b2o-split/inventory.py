#!/usr/bin/env python3
"""beauty2oem 拆站 · 表清单(只读代码,不连库)。施工图 2-2:表清单必须由脚本生成,不靠手抄。
从 beauty2oem 的入口文件出发,顺着 import 收集全部源文件,抓 SQL 里 FROM/JOIN/INTO/UPDATE 后面的表名,
只认 db/migrations 里 CREATE TABLE 过的名字(防止把注释里的英文单词当表)。
用法:python tools/b2o-split/inventory.py [--json]      施工当天再跑一遍,和施工图里的清单比对,多出来的表先查清再建库。
ponytail: 正则抓 SQL,拼接出来的表名(`FROM ${t}`)抓不到 —— 结果里会列出这类「动态表名」文件,人工过一眼。"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, 'apps', 'web', 'src')
CORE = os.path.join(ROOT, 'packages', 'core', 'src')

# 访客会走到的入口(拆站后 beauty2oem-web 只放行这些,见施工图 §3.3 白名单)+ Cron
VISITOR = ['middleware.ts', 'worker.ts', 'pages/[...path].astro', 'pages/[lang]/insights.astro', 'pages/[lang]/login.astro',
           'pages/api/b2o/brief.ts', 'pages/api/member/login.ts', 'pages/api/pulse.ts', 'pages/robots.txt.ts',
           'pages/favicon.ico.ts', 'pages/media/[id].ts', 'pages/asset/[...path].ts']
# 留在公司后台(bohui-web)、拆站后改读 B2O_DB 的页面与接口
ADMIN = sorted({os.path.relpath(p, WEB).replace('\\', '/') for pat in ('pages/bohui/b2o-*.astro', 'pages/api/admin/b2o-*.ts', 'pages/api/cron/b2o.ts')
                for p in glob.glob(os.path.join(WEB, pat))})

IMP = re.compile(r"""(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]""")
SQL = re.compile(r"\b(DELETE\s+FROM|INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE|FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)", re.I)
DYN = re.compile(r"\b(?:FROM|JOIN|INTO|UPDATE)\s+\$\{", re.I)


def known_tables():
    t = set()   # 建表散在三处:db/migrations(0012 起)、packages/cms/*.sql(早期基表)、tools/*.py(pulse 等脚本自建)
    for f in glob.glob(os.path.join(ROOT, 'db', 'migrations', '*.sql')) + glob.glob(os.path.join(ROOT, 'packages', 'cms', '*.sql')) \
            + glob.glob(os.path.join(ROOT, 'tools', '*.py')):
        s = open(f, encoding='utf-8', errors='replace').read()
        t |= {m.lower() for m in re.findall(r"CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?(\w+)", s, re.I)}
        t |= {m.lower() for m in re.findall(r"ALTER\s+TABLE\s+\w+\s+RENAME\s+TO\s+(\w+)", s, re.I)}
    return t


def resolve(src, spec):
    if spec.startswith('@cosmetic/core/'):
        base = os.path.join(CORE, spec[len('@cosmetic/core/'):])
    elif spec == '@cosmetic/core/i18n':
        base = os.path.join(CORE, 'i18n', 'index.ts')
    elif spec.startswith('.'):
        base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    else:
        return None                       # npm 包 / astro: / cloudflare: 虚拟模块
    for c in (base, base + '.ts', base + '.astro', base + '.mjs', base + '.js', os.path.join(base, 'index.ts')):
        if os.path.isfile(c) and not c.endswith(('.css', '.json', '.md')):
            return os.path.normpath(c)
    return None


def closure(entries):
    seen, todo = set(), [os.path.normpath(os.path.join(WEB, e)) for e in entries]
    while todo:
        f = todo.pop()
        if f in seen or not os.path.isfile(f):
            continue
        seen.add(f)
        s = open(f, encoding='utf-8', errors='replace').read()
        for m in IMP.finditer(s):
            r = resolve(f, next(g for g in m.groups() if g))
            if r and r not in seen:
                todo.append(r)
    return seen


NOT_TABLE = {'select', 'where', 'set', 'values', 'json_each', 'json_tree', 'the', 'a', 'an', 'to', 'of', 'and', 'or', 'on', 'in', 'is', 'it',
             'this', 'that', 'here', 'there', 'now', 'cache', 'db', 'env', 'url', 'request', 'response', 'import', 'export', 'default'}


def scan(files, tables):
    out = {}
    for f in sorted(files):
        s = open(f, encoding='utf-8', errors='replace').read()
        rw = {}
        for line in s.splitlines():   # 建表语句不在仓库里的表(如 regulation_updates 由脚本从 JSON 灌),靠「同一行有 SQL 动词」认出来
            if re.search(r'\b(SELECT|INSERT|UPDATE|DELETE)\b', line):
                for verb, name in SQL.findall(line):
                    n = name.lower()
                    if n not in tables and n not in NOT_TABLE and '_' in n:
                        tables.add(n); print(f'  [仓库里没有建表语句,按 SQL 行认作表] {n} ← {os.path.basename(f)}', file=sys.stderr)
        for verb, name in SQL.findall(s):
            n = name.lower()
            if n not in tables:
                continue
            w = not verb.upper().startswith(('FROM', 'JOIN'))
            rw[n] = rw.get(n, '') + ('w' if w else 'r')
        rel = os.path.relpath(f, ROOT).replace('\\', '/')
        if rw or DYN.search(s):
            out[rel] = {'tables': {k: ('写' if 'w' in v else '') + ('读' if 'r' in v else '') for k, v in sorted(rw.items())},
                        'dynamic': bool(DYN.search(s))}
    return out


def main():
    tables = known_tables()
    res = {'visitor': scan(closure(VISITOR), tables), 'admin': scan(closure(ADMIN), tables), 'admin_entries': ADMIN}
    if '--json' in sys.argv:
        print(json.dumps(res, ensure_ascii=False, indent=1)); return
    for part in ('visitor', 'admin'):
        agg = {}
        for f, v in res[part].items():
            for t, m in v['tables'].items():
                agg.setdefault(t, set()).add(f.split('/src/')[-1] + f'({m})')
        print(f'\n== {part}:{len(agg)} 张表,{len(res[part])} 个文件带 SQL')
        for t in sorted(agg):
            print(f'  {t:28s} ← ' + '; '.join(sorted(agg[t])))
        dyn = [f for f, v in res[part].items() if v['dynamic']]
        if dyn:
            print('  [动态表名,人工核] ' + '; '.join(dyn))


if __name__ == '__main__':
    main()

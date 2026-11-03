"""产品解读(summary_zh / summary_en / summary_at)双向同步:公司库 ⇄ 创始人账号 D1(平台)。
正向(09-21 起):公司库里本机 product_summaries.py 新写的 → 平台库;只搬三列、只搬 since 之后的行,比整表 --data-only 便宜。
反向(09-22 17:3x 拍板:**平台库从此是解读真源**,云端工人 bohui-automation summaries.yml 直接写平台库):平台库 summary_at ≥ 反向状态点
且 summary_zh 非空的行 → 公司库,只补公司库里还空的。正向落平台库也只补空的,不覆盖真源;两边都幂等,重跑无害。
用法:python tools/platform/sync-summaries.py [--since "2026-09-21 00:00"](--since 只管正向)
状态存 tools/platform/_sync-summaries.state:第 1 行正向 since(老格式不动),第 2 行 reverse=反向 since。"""
import io, os, re, sys, json, subprocess, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, 'F:/0cosmetic/cosmetic-sites/tools')
from _bohui import d1, d1_exec   # 公司库读 / 灌文件
STATE = os.path.join(ROOT, 'tools', 'platform', '_sync-summaries.state')
lines = io.open(STATE, encoding='utf-8').read().splitlines() if os.path.exists(STATE) else []
since = sys.argv[sys.argv.index('--since') + 1] if '--since' in sys.argv else (lines[0].strip() if lines else '2026-09-21 00:00')
rsince = next((l.split('=', 1)[1].strip() for l in lines if l.startswith('reverse=')), since)   # 首次:平台库 ≤ since 的行都来自公司库,从 since 起就够
q = lambda s: "'" + str(s or '').replace("'", "''") + "'"
web = os.path.join(ROOT, 'apps', 'web'); dist = sorted(x for x in os.listdir(web) if x.startswith('dist_'))[-1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from _net import cf_env; env = cf_env()
def platform(sql_path=None, select=None):
    """平台库(创始人账号,-c wrangler.copy.json,别 source .env):给 sql_path 就灌文件,返回 (成功?, 写入行数);给 select 就 --command --json 查,返回 (成功?, 行)。
    查询不能走 --file:远端 --file 是导入通道,只回「Total queries executed」不回结果行(09-22 17:4x 实测);SQL 须单行,shell=True 会吞换行后的 WHERE"""
    args = ['npx', 'wrangler', 'd1', 'execute', 'bohui-cms-v2', '--remote', '-c', 'wrangler.copy.json', '--yes'] + (['--json', '--command', ' '.join(select.split())] if select else ['--file', sql_path])
    r = subprocess.run(args, cwd=os.path.join(web, dist, 'server'), env=env, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    raw = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout or ''); tail = (r.stdout + r.stderr)[-160:].replace('\n', ' ')
    if not select:
        m = re.search(r'"rows_written":\s*(\d+)', raw); return bool(m), (int(m.group(1)) if m else tail)
    try: return True, json.loads(raw[raw.index('[\n  {'):raw.rindex(']') + 1])[0]['results']
    except Exception: return False, tail

# ── 正向:公司库 → 平台库 ──
rows, last = [], since
for off in range(0, 10 ** 6, 400):
    page = d1(f"SELECT id, summary_zh, summary_en, summary_at FROM market_products WHERE summary_at > {q(since)} ORDER BY summary_at, id LIMIT 400 OFFSET {off}")
    if not page: break
    rows += page
    if len(page) < 400: break
print(f"正向 since {since}:公司库 {len(rows)} 条候选", flush=True)
done = 0
for i in range(0, len(rows), 400):
    p = os.path.join(ROOT, 'tools', 'platform', '_sync_summaries.sql')
    # 09-22:只补平台库里还空的 —— 平台库是真源,本机兜底与云端重做同一批时不许盖掉云端的
    io.open(p, 'w', encoding='utf-8', newline='\n').write(''.join(f"UPDATE market_products SET summary_zh={q(r['summary_zh'])}, summary_en={q(r['summary_en'])}, summary_at={q(r['summary_at'])} WHERE id={int(r['id'])} AND (summary_zh IS NULL OR summary_zh='');\n" for r in rows[i:i + 400]))
    for t in range(3):
        ok, out = platform(p)
        if ok: done += out; break
        print('  重试', t + 1, out, flush=True)
    last = max(last, max(str(x['summary_at']) for x in rows[i:i + 400]))
    print(f"  {min(i + 400, len(rows))}/{len(rows)}", flush=True)

# ── 反向:平台库 → 公司库(只补空;≥ 而不是 >:summary_at 只到分钟,同一分钟后到的行别漏,重拉一分钟因幂等无害)──
rrows, rlast = [], rsince
for off in range(0, 10 ** 6, 500):
    ok, page = platform(select=f"SELECT id, summary_zh, summary_en, summary_at FROM market_products WHERE summary_at >= {q(rsince)} AND summary_zh IS NOT NULL AND summary_zh <> '' ORDER BY summary_at, id LIMIT 500 OFFSET {off}")
    if not ok: print('  反向读平台库失败:', page, flush=True); break
    rrows += page
    if len(page) < 500: break
print(f"反向 since {rsince}:平台库 {len(rrows)} 条候选", flush=True)
rdone = 0
for i in range(0, len(rrows), 500):
    p = os.path.join(ROOT, 'tools', 'platform', '_sync_summaries_rev.sql')   # 中文走 UTF-8 文件,不走命令行
    io.open(p, 'w', encoding='utf-8', newline='\n').write(''.join(f"UPDATE market_products SET summary_zh={q(r['summary_zh'])}, summary_en={q(r['summary_en'])}, summary_at={q(r['summary_at'])} WHERE id={int(r['id'])} AND (summary_zh IS NULL OR summary_zh='');\n" for r in rrows[i:i + 500]))
    rdone += d1_exec(p)
    rlast = max(rlast, max(str(x['summary_at']) for x in rrows[i:i + 500]))
    print(f"  反向 {min(i + 500, len(rrows))}/{len(rrows)} 公司库写入 {rdone}", flush=True)

io.open(STATE, 'w', encoding='utf-8').write(f"{last}\nreverse={rlast}\n")
print(f"完成:正向平台库写入 {done} 行(state={last}),反向公司库写入 {rdone} 行(reverse={rlast})")

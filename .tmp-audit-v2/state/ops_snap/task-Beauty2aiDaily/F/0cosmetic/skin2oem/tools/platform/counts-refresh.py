"""平台版:各库存量算一遍 → pulse 表 k='counts' 一行 JSON;首页 / llms.txt / 六站页只读这一行(lib/counts.ts getCounts)。
照公司站 tools/counts-refresh.py 写,连的是创始人账号 D1(wrangler.copy.json)。
为什么不现算:COUNT(*) 是全表扫,GPTBot 一周抓总览页 20 万次,一天能读 3 亿行;数字一天变不了几次 → 灌完数据跑一次这里。
创始人 09-22:「平台数字要对应 D1 的数字去自己变,而不是你去修改」——这里只 COUNT,不硬编。
    python tools/platform/counts-refresh.py"""
import io, os, re, sys, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from _net import cf_env
from _pd1 import cwd, assert_db   # cwd:只认 dist_<数字> 且必须带 copy.json(本文件原来那份 sorted[-1] 会被 dist_check_* 骗);assert_db:认库不认名
import re

Q = {
    # 首页 / llms.txt:全成分产品 / 原料目录 / 市场法规 / 全球品牌
    'products': "SELECT COUNT(*) n FROM market_products",   # 09-22 创始人:「不要删除重复的,先冲总量」—— 对外数字 = 库里全部行;有全成分的另记 products_inci
    'products_inci': "SELECT COUNT(*) n FROM market_products WHERE inci IS NOT NULL AND length(inci) > 30",
    'inci': 'SELECT COUNT(*) n FROM inci_catalog', 'regs': 'SELECT COUNT(*) n FROM regulations', 'brands': 'SELECT COUNT(*) n FROM brand_leads',
    'summaries': "SELECT COUNT(*) n FROM market_products WHERE summary_zh IS NOT NULL AND summary_zh <> ''",
    'formulas': "SELECT COUNT(*) n FROM formulas WHERE status IN ('sample','active')", 'packaging': "SELECT COUNT(*) n FROM packaging WHERE status IN ('sample','active') AND type IS NOT NULL AND type <> 'use-other'",   # 09-22:与 /packaging/ 货架和首页 packLib 逐字一致。全库 18,815 行里 14,315 行是 draft(收进来没过审),use-other 5,713 条里 3,947 条经 Jev 判过根本不是包材(淘米盆/挖耳勺/仿真花)。对外数字必须等于客户能翻到的
    # 六站页(stage/[key].astro 的 Q 表)同键
    'bases': 'SELECT COUNT(*) n FROM herb_bases', 'classics': 'SELECT COUNT(*) n FROM classics', 'graph': 'SELECT COUNT(*) n FROM kg_nodes',
    'paper': "SELECT COUNT(*) n FROM packaging WHERE status='active' AND type IN ('rigid-box','leaflet','overwrap-film','shrink-sleeve','seal-sticker')",
    'qc': 'SELECT COUNT(*) n FROM qc_items', 'trends': 'SELECT COUNT(*) n FROM ecom_items', 'reports': 'SELECT COUNT(*) n FROM trend_reports',
    'weeks': "SELECT COUNT(DISTINCT strftime('%Y-%W', date)) n FROM trend_reports", 'answers': 'SELECT COUNT(*) n FROM geo_answers', 'news': 'SELECT COUNT(*) n FROM news WHERE is_published = 1',
    'experts': 'SELECT COUNT(*) n FROM expert_skills', 'wiki': 'SELECT COUNT(*) n FROM wiki_pages', 'lab_projects': 'SELECT COUNT(*) n FROM formula_projects',
    # 09-24 P1:首页「证据六项」与工作台原来每次渲染现算 9 个 COUNT(ai_runs / packaging 全扫),改读这里。口径与原 SQL 逐字一致
    'ai_ok': "SELECT COUNT(*) n FROM ai_runs WHERE ts >= '2026-09-20 12:00' AND ok = 1", 'ai_24h': "SELECT COUNT(*) n FROM ai_runs WHERE ts >= datetime('now', '-1 day') AND ok = 1",
    'caps': 'SELECT COUNT(*) n FROM sc_capabilities', 'fac_cand': "SELECT COUNT(*) n FROM factories WHERE status IN ('listed','pending') AND verify_level < 2",
    'fac_ok': 'SELECT COUNT(*) n FROM factories WHERE verify_level >= 2', 'pack_ok': "SELECT COUNT(*) n FROM sc_nodes WHERE type = 'packaging' AND verify_level >= 2",
    'research': "SELECT COUNT(*) n FROM market_research WHERE status = 'listed'", 'renders': "SELECT COUNT(*) n FROM pack_jobs WHERE status = 'done'", 'opps': 'SELECT COUNT(*) n FROM opportunities',
}
# cwd():用 _pd1 的那份(见文件头 import)—— 原先本文件自带一份等价实现,09-22 夜收敛成一处,
#   免得「只认 dist_<数字> + 必须有 copy.json」这条规矩改一处漏三处。
def parse_d1(out):
    """只认「元素都带 success 键」的数组。09-22:原来拿第一个 '[' 当 JSON 起点,
    可 npm warn 横幅里也有 '[',结果写成功却判失败,再按重试逻辑歇 90 秒重跑同一批直到停机。"""
    i = 0
    while True:
        i = out.find('[', i)
        if i < 0: return None
        try:
            v = json.loads(out[i:out.rindex(']') + 1])
            if isinstance(v, list) and v and all(isinstance(x, dict) and 'success' in x for x in v): return v
        except Exception: pass
        i += 1


def d1(*args):
    assert_db(cwd())
    r = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'bohui-cms-v2', '--remote', '-c', 'wrangler.copy.json', '--yes', '--json', *args], cwd=cwd(), env=cf_env(), shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    res = parse_d1(r.stdout); assert res is not None and all(x.get('success') for x in res), (r.stdout + r.stderr)[-300:]
    return res
def main():
    out = {}
    for k, sql in Q.items():
        try: out[k] = int(d1('--command', sql)[0]['results'][0]['n'])
        except Exception as e: print('跳过', k, str(e)[:120])
    try: out['registry'] = {str(r['registry']): int(r['n']) for r in d1('--command', 'SELECT registry, COUNT(*) n FROM inci_catalog GROUP BY registry')[0]['results']}
    except Exception: pass
    # 09-22 X 线:成分索引页的「按市场筛」计数,现算要撞 15,410 × 25,394 行、净耗 3 秒,而索引页是高频页
    # ——正是「一天读 3 亿行」那个坑的形状。存成快照,页面优先读这一键,读不到才落兜底 JOIN。
    try: out['market_status'] = {str(r['market']): int(r['n']) for r in d1('--command', 'SELECT market, COUNT(*) n FROM ingredient_market_status GROUP BY market')[0]['results']}
    except Exception: pass
    # 两个口径别混:上面是「该市场有多少条法规状态行」(EU 2,321),下面是「该市场有多少个**已解读成分**」(EU 485)。
    # 成分索引页的市场筛显示的是后者 —— 拿前者去显示就会写出「欧盟 2,321」然后点进去只有 485 个,
    # 和首页写 18,815 款包材、货架只有 4,410 是同一种错。X 线 22:13 发现并拒绝将就,这里补上。
    try: out['market_status_facts'] = {str(r['market']): int(r['n']) for r in d1('--command', 'SELECT s.market market, COUNT(DISTINCT s.inci_key) n FROM ingredient_facts f JOIN ingredient_market_status s ON s.inci_key = f.inci_key GROUP BY s.market')[0]['results']}
    except Exception: pass
    # 09-24 R1:/decoder/ 列表页「总数 / 按国家 / 按类目」计数快照,页面读这一行在内存里加(lib/decoder.ts getFacets)。
    # 现算时三条 COUNT/GROUP BY 每次扫 10–43 万行,24h 合计约 25 亿行。口径与页面 BASE 一字不差。
    fac = None
    try: fac = [[r['c'], r['k'], int(r['n'])] for r in d1('--command', "SELECT NULLIF(country, '') c, NULLIF(COALESCE(cat_zh, cat), '') k, COUNT(*) n FROM market_products WHERE inci IS NOT NULL AND length(inci) > 30 GROUP BY 1, 2")[0]['results']]
    except Exception as e: print('跳过 mp_facets', str(e)[:120])
    js = json.dumps(out, ensure_ascii=False).replace("'", "''")
    # D1 单条 SQL 上限 100KB(SQLITE_TOOBIG),4,800 组明文三元组约 120KB → 存成「国家表 + 类目表 + 下标三元组」约 60KB
    if fac:
        cs = sorted({x[0] for x in fac}, key=str); ks = sorted({x[1] for x in fac}, key=str)
        ci = {v: i for i, v in enumerate(cs)}; ki = {v: i for i, v in enumerate(ks)}
        fac = {'c': cs, 'k': ks, 'f': [[ci[x[0]], ki[x[1]], x[2]] for x in fac]}
    fjs = json.dumps(fac, ensure_ascii=False, separators=(',', ':')) if fac else ''
    # 类目名多且长,压完仍 ~100KB → 按 3 万字切成 mp_facets:0、:1… 多行,页面按 k 顺序拼回(先删旧片,片数会变)
    parts = [fjs[i:i + 30000] for i in range(0, len(fjs), 30000)]
    f = os.path.join(ROOT, 'tools', 'platform', '_counts.sql')
    io.open(f, 'w', encoding='utf-8', newline='\n').write(
        "CREATE TABLE IF NOT EXISTS pulse (k TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));\n"
        f"INSERT OR REPLACE INTO pulse (k, json, updated_at) VALUES ('counts', '{js}', datetime('now'));\n"
        + ("DELETE FROM pulse WHERE k LIKE 'mp_facets:%';\n" if parts else '')
        + ''.join(f"INSERT INTO pulse (k, json, updated_at) VALUES ('mp_facets:{i}', '{x.replace(chr(39), chr(39) * 2)}', datetime('now'));\n" for i, x in enumerate(parts)))
    d1('--file', f); print('mp_facets', len(fac['f']) if fac else 0, '组', len(fjs), '字节'); print('counts 已写:', {k: v for k, v in out.items() if k != 'registry'}, '· 目录', len(out.get('registry', {})))
if __name__ == '__main__': main()

"""AI 机会引擎 v0(平台 2026-09-21 03:3x)—— 首页「今天,什么产品值得做?」不再用示例卡。
信号源(都是我们自己的库):
  ① ecom_items 跨境爆款监控:按 region × subcategory 统计「增长最快」榜条数、均价、评论量级(数字只做排序,不上页面写死)
  ② market_products 同类真实产品数(供应链/配方可行性的旁证)
  ③ regulations 目标市场准入一句(合规提示)
→ 取前 6 个 (region, subcategory) 组合,让模型按固定 JSON 写「机会解释 + 四维定性(强/中/弱)」,写进创始人 D1 的 pulse 表 k='opps'。
首页读 pulse 'opps';没有就回落示例卡。用法:python tools/platform/opps-daily.py(计划任务每天 06:10)。
纪律:模型只准用给它的统计事实定性,不写具体市场规模/价格数字;每张卡带 evidence 字段(条数/均价段)供后台核对。"""
import io, os, sys, json, re, datetime as dt, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, 'F:/0cosmetic/cosmetic-sites/tools'); sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from _bohui import d1, chat, fleet
REGION_MK = {'欧美': ('us', '🇺🇸 美国 / 欧洲'), '东南亚': ('id', '🇮🇩 东南亚'), '南美': ('br', '🇧🇷 南美'), '中东': ('sa', '🇸🇦 中东'), '日韩': ('kr', '🇰🇷 日韩')}
REGION_EN = {'欧美': '🇺🇸 US / Europe', '东南亚': '🇮🇩 Southeast Asia', '南美': '🇧🇷 South America', '中东': '🇸🇦 Middle East', '日韩': '🇰🇷 Japan / Korea'}
rows = d1("SELECT region, subcategory, category, COUNT(*) n, AVG(CASE WHEN price GLOB '[0-9]*' THEN CAST(price AS REAL) END) avg_price, SUM(COALESCE(reviews,0)) reviews FROM ecom_items WHERE board='增长最快' AND subcategory IS NOT NULL AND subcategory<>'' GROUP BY region, subcategory ORDER BY n DESC, reviews DESC LIMIT 40")
seen, picks = set(), []
for r in rows:
    key = (r['region'], r['category']);
    if key in seen: continue
    seen.add(key); picks.append(r)
    if len(picks) >= 6: break
cards_in = []
for r in picks:
    mk, label = REGION_MK.get(r['region'], ('', r['region']))
    peers = d1(f"SELECT COUNT(*) n FROM market_products WHERE inci IS NOT NULL AND length(inci)>30 AND (cat_zh LIKE '%{r['subcategory'][:4]}%' OR cat LIKE '%{r['subcategory'][:4]}%')")[0]['n']
    reg = d1(f"SELECT country_zh, authority_zh, substr(entry_zh,1,160) e FROM regulations WHERE id='{mk}'") if mk else []
    cards_in.append({'region': r['region'], 'label': label, 'market_code': mk, 'category': r['category'], 'subcategory': r['subcategory'],
                     'growth_board_items': int(r['n']), 'avg_price_usd': (round(float(r['avg_price']), 1) if r['avg_price'] and 1 <= float(r['avg_price']) <= 300 and int(r['n']) >= 5 else None),   # V1.1:极端均价(币种/单位/套装/异常值)不给模型,免得被解释成「价格空间」 'reviews_sum': int(r['reviews'] or 0),
                     'peer_products_in_library': int(peers), 'regulation': (reg[0] if reg else None)})
print('候选', [(c['region'], c['subcategory'], c['growth_board_items'], c['peer_products_in_library']) for c in cards_in], flush=True)
allp = fleet()
PROVS = [p for p in allp if p['id'].startswith('agnes-30flash')] + [p for p in allp if p['id'].startswith('sensenova')] + [p for p in allp if p['id'].startswith('agnes')]
SYS = """你是全球美妆产品平台的机会分析师。对每个候选,只根据给你的统计事实写机会卡,输出严格 JSON 数组:
[{"region":"原样","label":"原样","market_code":"原样","cat":"品类 · 细分(≤10 字)","cat_en":"英文同义(≤6 词)","scores":{"demand":1-5,"competition":1-5,"price_headroom":1-5,"feasibility":1-5},
"why":"60–90 字中文:为什么值得做、缺口在哪、合规要点(引用给你的事实,不写具体市场规模与价格数字)","why_en":"英文 40–60 词同义","evidence":"一句话列出用到的统计事实(条数/均价段/同类数)","evidence_en":"英文同义","confidence":"高/中/低(事实越少越低;没有均价或同类少于 20 就是低)","evidence_quality":"一句:数据覆盖与缺口"}]
scores 是相对定性:增长榜条数多→demand 高;同类库存多→competition 高但 feasibility 高;均价高→price_headroom 高。不得编造事实。
硬规则:peer_products_in_library=0 只表示平台库当前没有该品类样本,**不得写成「零竞品 / 无竞品 / 蓝海 / 供需错配」**;此时 competition 按 3(未知)给、confidence 写「低」、why 里写「平台库暂无同类样本,竞争强度待目标市场调研核实」。avg_price_usd 为 null 就不谈价格。"""
out, who, err = chat(PROVS, [{'role': 'system', 'content': SYS}, {'role': 'user', 'content': json.dumps(cards_in, ensure_ascii=False)}], max_tokens=3000, temperature=0.3, want_json=True)
if isinstance(out, dict): out = next((v for v in out.values() if isinstance(v, list)), None)
if not isinstance(out, list) or len(out) < 3: print('模型失败', err, out); sys.exit(1)
cards = []
for c in out[:6]:
    if not isinstance(c, dict) or not c.get('cat'): continue
    sc = c.get('scores') or {}
    cards.append({'label': c.get('label') or c.get('region'), 'market_code': c.get('market_code') or '', 'cat': c['cat'], 'cat_en': c.get('cat_en') or '', 'scores': [max(1, min(5, int(sc.get(k, 3)))) for k in ('demand', 'competition', 'price_headroom', 'feasibility')], 'why': c.get('why') or '', 'why_en': c.get('why_en') or '', 'evidence': c.get('evidence') or '', 'confidence': c.get('confidence') or '中', 'evidence_quality': c.get('evidence_quality') or '', 'evidence_en': c.get('evidence_en') or '', 'label_en': REGION_EN.get(c.get('region') or '', c.get('label') or '')})
payload = {'date': dt.date.today().isoformat(), 'provider': who, 'cards': cards}
q = lambda s: "'" + json.dumps(s, ensure_ascii=False).replace("'", "''") + "'"
sql = f"INSERT INTO pulse (k, json) VALUES ('opps', {q(payload)}) ON CONFLICT(k) DO UPDATE SET json=excluded.json, updated_at=datetime('now');\n"
# V1.1:同时落 opportunities 表(带证据字段与风险标记),同日重跑先删同批。q() 是给 JSON 用的,普通字段用 q2
q2 = lambda s: "'" + str(s if s is not None else '').replace("'", "''") + "'"
sql += f"DELETE FROM opportunities WHERE batch_date='{dt.date.today().isoformat()}';\n"
for c in cards:
    src = next((v for v in cards_in if v['label'] == c['label'] and (v['subcategory'] in c['cat'] or c['cat'].endswith(v['subcategory'][:2]))), None) or {}
    flags = [f for f, ok in (('no_peer_sample', not src.get('peer_products_in_library')), ('price_missing', src.get('avg_price_usd') is None), ('low_signal', (src.get('growth_board_items') or 0) < 20)) if ok]
    band = (f"~{src['avg_price_usd']} USD" if src.get('avg_price_usd') else None)
    # 证据等级(apps/web/src/lib/evidence.ts):爆款榜 + 同类库 = 市场观察 D,显式写不靠列默认值
    sql += ("INSERT INTO opportunities (batch_date, market_code, market_label, category, category_en, signal_count, competition_count, price_band, scores_json, why, why_en, evidence, confidence, evidence_quality, risk_flags, data_freshness, provider, evidence_level) VALUES ("
            + ",".join([q2(dt.date.today().isoformat()), q2(c['market_code']), q2(c['label']), q2(c['cat']), q2(c['cat_en']), str(int(src.get('growth_board_items') or 0)), str(int(src.get('peer_products_in_library') or 0)), (q2(band) if band else 'NULL'), q2(json.dumps(c['scores'])), q2(c['why']), q2(c['why_en']), q2(c['evidence']), q2(c.get('confidence') or '中'), q2(c.get('evidence_quality') or ''), q2(json.dumps(flags)), q2(dt.date.today().isoformat()), q2(who), "'D'"]) + ");\n")
p = os.path.join(ROOT, 'tools', 'platform', '_opps.sql'); io.open(p, 'w', encoding='utf-8', newline='\n').write(sql)
web = os.path.join(ROOT, 'apps', 'web'); dist = sorted(x for x in os.listdir(web) if x.startswith('dist_'))[-1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from _net import cf_env; env = cf_env()
r = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'bohui-cms-v2', '--remote', '-c', 'wrangler.copy.json', '--yes', '--file', p], cwd=os.path.join(web, dist, 'server'), env=env, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300)
print('写入平台库:', 'rows_written' in (r.stdout + r.stderr), '| 卡片', len(cards), '| 模型', who)
# 09-21 19:3x 创始人:「把 beauty2AI 上那些配方也同步到 biosphere-ai.com」—— 同一份机会卡同时写公司库 pulse(帛卉工厂版首页读),只写 pulse 一行,公司库没有 opportunities 表
try:
    d1(sql.split('\n', 1)[0]); print('写入公司库 pulse opps: ok')
except Exception as e: print('写入公司库失败', e)
for c in cards: print(' -', c['label'], c['cat'], c['scores'], c['why'][:50])

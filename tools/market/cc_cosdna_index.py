#!/usr/bin/env python3
"""Common Crawl 里 cosdna.com 的收录清单:每期索引按域名拉全部条目,汇总唯一产品 ID / 成分页 / 状态码。

    python tools/market/cc_cosdna_index.py            # 全部索引期(2018 起),结果写 data/cosdna/cc-index.jsonl + 汇总
    python tools/market/cc_cosdna_index.py --since 2024-10

产品 URL 形如 /eng/cosmetic_<4hex><id>.html,五语镜像共用 ID;status 200 的条目可直接从 WARC 取正文,不用碰站点。
"""
import os, sys, json, re, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "data", "cosdna"); os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "cc-index.jsonl")
SINCE = (sys.argv[sys.argv.index("--since") + 1] if "--since" in sys.argv else "2018-01")

def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "bohui-cc-index/1"}), timeout=300) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(3 * (i + 1))

colls = json.loads(get("https://index.commoncrawl.org/collinfo.json"))
ids = [c["id"] for c in colls if c["id"][8:12] + "-" + c["id"][13:15] >= SINCE.replace("-", "-")[:7] or c["id"][8:12] > SINCE[:4]]
seen = set()
if os.path.exists(OUT):
    for l in open(OUT, encoding="utf-8"):
        try: seen.add(json.loads(l)["_k"])
        except: pass
done_idx = {k.split("|")[0] for k in seen}
w = open(OUT, "a", encoding="utf-8")
for idx in ids:
    if idx in done_idx: continue
    base = f"https://index.commoncrawl.org/{idx}-index?url=cosdna.com&matchType=domain&output=json"
    try:
        pages = json.loads(get(base + "&showNumPages=true")).get("pages", 1)
    except Exception as e:
        print(idx, "pages 失败", str(e)[:80]); continue
    n = 0
    for p in range(pages):
        try: body = get(base + f"&page={p}")
        except Exception as e:
            print(idx, "page", p, "失败", str(e)[:80]); continue
        for l in body.splitlines():
            try: j = json.loads(l)
            except: continue
            if "url" not in j: continue
            j["_k"] = f"{idx}|{j['url']}|{j.get('timestamp','')}"
            w.write(json.dumps(j, ensure_ascii=False) + "\n"); n += 1
    w.flush(); print(idx, "pages", pages, "条目", n)
w.close()

# 汇总
prod = {}; ing = set(); st = {}
for l in open(OUT, encoding="utf-8"):
    j = json.loads(l); u = j["url"]; s = j.get("status")
    st[s] = st.get(s, 0) + 1
    m = re.search(r"/cosmetic_([0-9a-f]{4})(\d+)\.html", u)
    if m:
        pid = m.group(2); prod.setdefault(pid, {"prefix": m.group(1), "ok": False})
        if s == "200": prod[pid]["ok"] = True
    elif re.search(r"cosdna\.com/\w+/[0-9a-f]{5,}\.html", u): ing.add(u.rsplit("/", 1)[1])
json.dump({"products": prod, "ingredient_pages": sorted(ing)}, open(os.path.join(OUT_DIR, "cc-summary.json"), "w", encoding="utf-8"))
print("唯一产品 ID", len(prod), "其中有 200 正文", sum(1 for v in prod.values() if v["ok"]), "成分页", len(ing), "状态", st)

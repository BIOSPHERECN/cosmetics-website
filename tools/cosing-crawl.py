#!/usr/bin/env python3
"""欧盟 CosIng 全量抓取 —— 36,195 条成分,进 inci_catalog 的 eu-cosing 目录。

**入口是怎么找到的**(值得写下来,下次遇到 SPA 照这个来):
CosIng 是 Angular 单页应用,`/api/*` 一律返回外壳 HTML,盲猜路径试了八个全是 200 text/html。
用 playwright 把页面正常跑一遍、监听它自己发的请求,拿到
`assets/env-json-config.json` —— 里面明明白白写着后端地址与检索用的 API Key:

    euSearchApiUrl : https://webgate.ec.europa.eu/es/search-api/rest/search
    euSearchApiKey : 285a77fd-...(SPA 自己公开发布的前端 key)
    descrFileUrl   : https://api.tech.ec.europa.eu/cosing20/1.0/api/cosmetics  (401,另需鉴权)

走 EU Search API 这一条:`database=GROWTH_COSING`,一次最多 200 条(填 300/500 也只回 200),
36,195 条 = 181 页。这是欧盟自己的公开检索接口,不是绕过任何防护 —— 前端就用它。

字段映射(EU 没有中文名,别硬套中国目录那套表头):
    substanceId        -> no
    inciName           -> inci
    chemicalDescription-> name_zh(当作「名称」列用,页面按目录切表头)
    chemicalName       -> alias
    casNo / ecNo       -> cas / ec_no
    functionName + annexNo + maximumConcentration + cosmeticRestriction -> note

用法:
    python tools/cosing-crawl.py --pages 2        先抓两页看字段
    python tools/cosing-crawl.py                  抓全量到本地缓存
    python tools/cosing-crawl.py --apply          把缓存写进 D1
"""
import argparse
import glob
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "_cosing.jsonl")
API = "https://webgate.ec.europa.eu/es/search-api/rest/search"
KEY = "285a77fd-1257-4271-8507-f0c6b2961203"
PER = 200
REG = "eu-cosing"


def one(v, sep=" · "):
    """EU Search 每个字段都是数组,取出来拼成一行;空数组与 '-' 一律当没有。"""
    if isinstance(v, list):
        xs = [str(x).strip() for x in v if str(x).strip() and str(x).strip() != "-"]
        return sep.join(dict.fromkeys(xs))
    s = str(v or "").strip()
    return "" if s in ("-", "None") else s


def fetch(page: int, tries: int = 4) -> dict:
    url = f"{API}?{urllib.parse.urlencode({'apiKey': KEY, 'text': '***', 'pageSize': PER, 'pageNumber': page})}"
    last = ""
    for i in range(tries):
        try:
            rq = urllib.request.Request(url, method="POST",
                                        headers={"Accept": "application/json",
                                                 "User-Agent": "biosphere-ai-catalog/1.0 (+https://biosphere-ai.com)"})
            with urllib.request.urlopen(rq, timeout=90) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:  # 限流与偶发 5xx 都退避重试,不硬顶
            last = str(e)[:120]
            time.sleep(2.5 * (i + 1))
    print(f"    第 {page} 页失败:{last}", flush=True)
    return {}


def row(md: dict) -> dict:
    fn = one(md.get("functionName"), ", ")
    ann = one(md.get("annexNo"), ", ")
    mx = one(md.get("maximumConcentration"), "; ")
    res = one(md.get("cosmeticRestriction"), "; ") or one(md.get("otherRestrictions"), "; ")
    note = " · ".join(x for x in [
        (f"功能 {fn}" if fn else ""),
        (f"附录 {ann}" if ann else ""),
        (f"最高浓度 {mx}" if mx else ""),
        (f"限制 {res}" if res else ""),
    ] if x)
    return {
        "no": one(md.get("substanceId")),
        "inci": one(md.get("inciName"), ", "),
        "name": one(md.get("chemicalDescription"), "; "),
        "alias": one(md.get("chemicalName"), "; "),
        "cas": one(md.get("casNo"), ", "),
        "ec": one(md.get("ecNo"), ", "),
        "note": note,
    }


# EU Search 硬性只肯给前 10,000 条(offset 到 10000 之后返回空 +
# warnings: "The number of returned results exceed the search limit")。
# 36,195 条一次拉不完,得把查询切小。用前缀通配 `text=AB*`:
# 两字母前缀大多几百条,极少数超 10,000 的再往下切一层。
# 前缀是全文匹配、不是只匹配 INCI,所以各前缀之间会重叠 —— 靠 substanceId 去重,
# 重叠只是多花请求,不会污染数据。
ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
CAP = 10_000


def count_of(prefix: str) -> int:
    d = fetch_q(prefix, 1, 1)
    return int(d.get("totalResults") or 0)


def fetch_q(text: str, page: int, size: int = PER, tries: int = 4) -> dict:
    url = f"{API}?{urllib.parse.urlencode({'apiKey': KEY, 'text': text, 'pageSize': size, 'pageNumber': page})}"
    last = ""
    for i in range(tries):
        try:
            rq = urllib.request.Request(url, method="POST",
                                        headers={"Accept": "application/json",
                                                 "User-Agent": "biosphere-ai-catalog/1.0 (+https://biosphere-ai.com)"})
            with urllib.request.urlopen(rq, timeout=90) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:
            last = str(e)[:120]
            time.sleep(2.0 * (i + 1))
    print(f"    {text} 第 {page} 页失败:{last}", flush=True)
    return {}


def harvest(prefix: str, seen: set, got: list, pause: float, depth: int = 0):
    """把一个前缀抓干净;超过 10,000 条就再切一层字母。"""
    n = count_of(prefix + "*")
    if n == 0:
        return
    if n > CAP and depth < 3:
        for ch in ALPHA:
            harvest(prefix + ch, seen, got, pause, depth + 1)
        return
    pages = min((n + PER - 1) // PER, CAP // PER)
    for p in range(1, pages + 1):
        d = fetch_q(prefix + "*", p)
        rs = d.get("results") or []
        if not rs:
            break
        for r in rs:
            x = row(r.get("metadata") or {})
            k = x["no"] or (x["inci"] + "|" + x["cas"])
            if not k or k in seen or not (x["inci"] or x["name"]):
                continue
            seen.add(k)
            got.append(x)
        time.sleep(pause)


def crawl_prefix(pause: float):
    seen, got = set(), []
    total = count_of("***")
    print(f"CosIng 共 {total:,} 条 · 单次查询上限 {CAP:,} · 改走前缀切分", flush=True)
    for a in ALPHA:
        for b in ALPHA:
            harvest(a + b, seen, got, pause)
        print(f"    前缀 {a}* 跑完 · 累计 {len(got):,} / {total:,}", flush=True)
        with io.open(CACHE, "w", encoding="utf-8", newline="\n") as fh:
            for x in got:
                fh.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(f"缓存写入 {CACHE} · {len(got):,} 条", flush=True)
    return got


def crawl(pages: int, pause: float):
    got, seen = [], set()
    first = fetch(1)
    total = int(first.get("totalResults") or 0)
    npages = pages or (total + PER - 1) // PER
    print(f"CosIng 共 {total:,} 条 · 每页 {PER} · 计划抓 {npages} 页")
    for p in range(1, npages + 1):
        d = first if p == 1 else fetch(p)
        rs = d.get("results") or []
        if not rs:
            print(f"    第 {p} 页为空,停", flush=True)
            break
        for r in rs:
            x = row(r.get("metadata") or {})
            k = x["no"] or (x["inci"] + "|" + x["cas"])
            if not k or k in seen:
                continue
            if not (x["inci"] or x["name"]):
                continue
            seen.add(k)
            got.append(x)
        if p % 10 == 0 or p == npages:
            print(f"    {p}/{npages} 页 · 累计 {len(got):,} 条", flush=True)
        time.sleep(pause)
    with io.open(CACHE, "w", encoding="utf-8", newline="\n") as fh:
        for x in got:
            fh.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(f"缓存写入 {CACHE} · {len(got):,} 条 · {os.path.getsize(CACHE):,} 字节")
    return got


def apply_rows():
    if not os.path.exists(CACHE):
        print("没有缓存,先跑一遍抓取")
        return
    rows = [json.loads(l) for l in io.open(CACHE, encoding="utf-8") if l.strip()]
    print(f"缓存 {len(rows):,} 条,写入 registry={REG}")
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = []
    for x in rows:
        key = (x["inci"] or x["name"]).upper()
        vals.append("(" + ",".join([
            q(x["no"]), q(x["name"][:300]), q(x["inci"][:300]), q(x["alias"][:300]),
            "NULL", "NULL", q(x["note"][:600]),
            q("EU CosIng · European Commission"), q(key[:300]), q(x["cas"][:80]), q(x["ec"][:80]), q(REG),
        ]) + ")")
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,"
                     "inci_key,cas,ec_no,registry) VALUES " + ",".join(vals[i:i + 40]) + ";")
    for old in glob.glob(os.path.join(HERE, "_cosing-*.sql")):
        os.remove(old)
    total, part, buf = 0, 0, []
    for ln in lines:
        buf.append(ln)
        if sum(len(z) for z in buf) > 600_000:
            part += 1
            f = os.path.join(HERE, f"_cosing-{part:02d}.sql")
            io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
            total += d1_exec(f)
            print(f"    片 {part}: {os.path.getsize(f):,} 字节 · 累计 {total:,} 行", flush=True)
            buf = []
    if buf:
        part += 1
        f = os.path.join(HERE, f"_cosing-{part:02d}.sql")
        io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
        total += d1_exec(f)
        print(f"    片 {part}: {os.path.getsize(f):,} 字节 · 累计 {total:,} 行", flush=True)
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"完成:eu-cosing 共 {n[0]['n'] if n else '?'} 条")
    d1_exec_status()


def d1_exec_status():
    io.open(os.path.join(HERE, "_cosing.done"), "w", encoding="utf-8").write("ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=0)
    ap.add_argument("--pause", type=float, default=0.35)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    if a.apply and os.path.exists(CACHE):
        apply_rows()
        return
    got = crawl(a.pages, a.pause) if a.pages else crawl_prefix(a.pause)
    for x in got[:5]:
        print(f"  {x['no']:<8} {x['inci'][:34]:<36} CAS {x['cas'][:14]:<16} {x['note'][:50]}")
    if a.apply:
        apply_rows()


if __name__ == "__main__":
    main()

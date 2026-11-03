#!/usr/bin/env python3
"""资讯写稿 —— 在**本机**跑,因为 AI 从 Cloudflare Workers 出去被拦。

2026-09-07 的诊断(实测,不是猜):
  Workers 出口:Agnes 返回 429 error code: 1015(Cloudflare 的限流码),商汤超时;
  本机出口:11 家探活 8 家通(Agnes 700ms、商汤 1.5s)。
  → 凭据和额度都没问题,被拦的是 Workers 那条出口。
  资讯管线因此三天零产出,而九个定时任务全报 rc=0。

于是把管线切成两段,各自待在能跑通的地方:
  本机  抓 RSS → 调模型写稿 → 回传
  云端  /api/cron/news-relay 下发提示词与去重清单,回传时走**原有质量闸**再入库

两条纪律:
  · **提示词不在本机硬编码**,每次从 relay 取。两边各存一份、改了一边忘另一边,
    稿子会一天天悄悄变形,而且不报错。
  · **质量闸不绕过**。validateArticle 在云端,本机写得再快也过不了那道门 ——
    编造数字、缺末节、伪引语一律挡回。宁可 0 篇,不要 1 篇编的。
"""
import io
import os
import re
import sys
import json
import time
import html
import argparse
import subprocess
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://biosphere-ai.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124 Safari/537.36")


def env():
    out = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()
CRON = E.get("CRON_KEY")
if not CRON:
    raise SystemExit(".env 里没有 CRON_KEY")


def http(url, data=None, headers=None, timeout=90, method=None):
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as f:
            return f.read()
    except urllib.error.HTTPError as e:
        # 报清楚是哪个 URL、哪个方法、服务端说了什么 —— 一个裸的 404 会把人引去查路由,
        # 而真正的原因可能在别处(2026-09-07 我为此绕了一圈)。
        body = ""
        try:
            body = e.read(400).decode("utf-8", "replace")
        except Exception:
            pass
        raise RuntimeError(f"{method or ('POST' if data else 'GET')} {url} → HTTP {e.code} {body[:220]}") from None


# ── 线索发现:Google News RSS 聚合 + 两个直连行业源 ──────────────────
QUERIES = [
    ("industry", "cosmetics OEM ODM contract manufacturer", "en-US", "US", "US:en"),
    ("industry", "化妆品 代工 OEM 工厂", "zh-CN", "CN", "CN:zh-Hans"),
    ("brand", "skincare brand launch private label", "en-US", "US", "US:en"),
    ("reg", "cosmetics regulation NMPA CPNP FDA", "en-US", "US", "US:en"),
    ("ingredient", "cosmetic ingredient botanical extract launch", "en-US", "US", "US:en"),
]
DIRECT = [
    ("https://www.cosmeticsbusiness.com/rss", "Cosmetics Business", "industry"),
    ("https://www.premiumbeautynews.com/spip.php?page=backend", "Premium Beauty News", "brand"),
]


def parse_rss(xml, default_source, topic):
    out = []
    for m in re.finditer(r"<item>(.*?)</item>", xml, re.S):
        it = m.group(1)
        g = lambda tag: (re.search(rf"<{tag}[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{tag}>", it, re.S) or [None, ""])[1]
        title = html.unescape(re.sub(r"<[^>]+>", "", g("title"))).strip()
        link = html.unescape(g("link")).strip()
        if not title or not link:
            continue
        src = html.unescape(re.sub(r"<[^>]+>", "", g("source"))).strip() or default_source
        snip = html.unescape(re.sub(r"<[^>]+>", " ", g("description")))[:400].strip()
        out.append({"title": title[:300], "link": link[:500], "source": src[:80],
                    "date": g("pubDate")[:40], "snippet": snip, "topic": topic})
    return out


def discover(want):
    leads = []
    for topic, q, hl, gl, ceid in QUERIES:
        u = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(q)
             + f"&hl={hl}&gl={gl}&ceid={urllib.parse.quote(ceid)}")
        try:
            leads += parse_rss(http(u, timeout=30).decode("utf-8", "replace"), "Google News", topic)
        except Exception as e:
            print(f"  源失败 {q[:28]}: {str(e)[:50]}")
    for u, src, topic in DIRECT:
        try:
            leads += parse_rss(http(u, timeout=30).decode("utf-8", "replace"), src, topic)
        except Exception as e:
            print(f"  源失败 {src}: {str(e)[:50]}")
    seen, uniq = set(), []
    for l in leads:
        if l["link"] in seen:
            continue
        seen.add(l["link"])
        uniq.append(l)
    return uniq[:want * 4]


# ── 模型:直接读 providers 表,和站点同一套配置 ──────────────────────
def providers():
    p = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--json", "--command",
         "SELECT id,base_url,model,api_keys FROM providers WHERE enabled=1 AND can_text=1 ORDER BY tier,id"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=ROOT, env={**os.environ, **E}, shell=(os.name == "nt"))
    raw = re.sub(r"\x1b\[[0-9;]*m", "", p.stdout or "")
    return json.loads(raw[raw.index("[\n  {"):raw.rindex("]") + 1])[0]["results"]


def chat(provs, system, user, max_tokens=3600):
    """按 tier 顺序试,第一个成功的就用。失败原因逐个留痕,不静默吞。"""
    errs = []
    for p in provs:
        keys = [k.strip() for k in str(p["api_keys"] or "").replace("\n", ",").split(",") if k.strip()]
        if not keys:
            continue
        body = json.dumps({"model": p["model"], "temperature": 0.4, "max_tokens": max_tokens,
                           "messages": [{"role": "system", "content": system},
                                        {"role": "user", "content": user}]}).encode()
        try:
            r = http((p["base_url"] or "").rstrip("/") + "/chat/completions", data=body,
                     headers={"Content-Type": "application/json",
                              "Authorization": f"Bearer {keys[0]}"}, timeout=180)
            d = json.loads(r.decode("utf-8", "replace"))
            txt = (d.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
            if txt.strip():
                return txt, p["id"], errs
            errs.append(f"{p['id']}: 空响应")
        except Exception as e:
            errs.append(f"{p['id']}: {str(e)[:60]}")
    return None, None, errs


KEYS = ["TITLE_ZH", "TITLE_EN", "SUMMARY_ZH", "SUMMARY_EN", "TOPIC", "BODY_ZH", "BODY_EN"]


def parse_article(text):
    """和 Worker 端 parseArticle 同一套规则 —— 包括 [END] 那条。
       没有 [END] = 撞 max_tokens 被切断,整篇判坏(2026-09-02 有半截英文入过库)。"""
    src = re.sub(r"^```\w*|```$", "", text, flags=re.M)
    if "[END]" not in src:
        return None
    out = {}
    for k in KEYS:
        m = re.search(rf"\[{k}\]([\s\S]*?)(?=\n?\[(?:{'|'.join(KEYS)}|END)\]|$)", src)
        out[k.lower()] = (m.group(1).strip() if m else "")
    if not (out["title_zh"] and out["title_en"] and out["body_zh"] and out["body_en"]):
        return None
    return out


def slugify(link):
    import hashlib
    return time.strftime("%Y-%m-%d-") + hashlib.sha1(link.encode()).hexdigest()[:6]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=4, help="写几篇")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--dry", action="store_true", help="只写不回传")
    a = ap.parse_args()

    # Origin 必须带 —— 站点对 /api/ 的写入有同源校验,不带这个头会被判 404,
    # 而 404 看着像"路由不存在",很容易往错的方向排查(2026-09-07 我就绕了一圈)。
    H = {"x-cron-key": CRON, "Origin": BASE}
    cfg = json.loads(http(f"{BASE}/api/cron/news-relay?days=60", headers=H, timeout=60))
    if not cfg.get("ok"):
        raise SystemExit(f"取配置失败:{cfg}")
    seen = set(cfg.get("seen") or [])
    P = cfg["prompts"]
    if not P.get("deep") or not P.get("brief"):
        raise SystemExit("relay 没给提示词")
    print(f"提示词 deep {len(P['deep'])} / brief {len(P['brief'])} 字符 · 已入库来源 {len(seen)}")

    leads = [l for l in discover(a.n) if l["link"] not in seen]
    print(f"线索 {len(leads)} 条(已去重),取前 {a.n} 条写稿\n")
    leads = leads[:a.n]
    if not leads:
        print("没有新线索"); return

    provs = providers()
    print(f"可用模型 {len(provs)} 家,按档位顺序试\n")

    def one(l):
        rich = len(l.get("snippet") or "") > 400
        sysmsg = P["deep"] if rich else P["brief"]
        user = (f"标题:{l['title']}\n来源:{l['source']}\n"
                f"要点线索:{(l.get('snippet') or '')[:3000] or '(无,仅标题)'}")
        txt, who, errs = chat(provs, sysmsg, user)
        if not txt:
            return l, None, None, errs
        d = parse_article(txt)
        return l, d, who, errs

    arts = []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for l, d, who, errs in ex.map(one, leads):
            if not d:
                print(f"  ✗ {l['title'][:44]} —— {'模型输出缺关键段' if not errs else errs[0]}")
                continue
            print(f"  ✓ {l['title'][:44]}  by {who}")
            arts.append({
                "slug": slugify(l["link"]), "source_url": l["link"], "source_name": l["source"],
                "topic": d.get("topic") or l["topic"], "orig_date": l.get("date", ""),
                "title_zh": d["title_zh"], "title_en": d["title_en"],
                "summary_zh": d.get("summary_zh", ""), "summary_en": d.get("summary_en", ""),
                "body_zh": d["body_zh"], "body_en": d["body_en"],
                # material / deep 要一起回传:云端的数字校验拿正文数字和材料数字比对,
                # 不给材料这道闸就等于没有。deep 决定用哪套结构要求。
                "material": (l.get("snippet") or "")[:3000],
                "deep": len(l.get("snippet") or "") > 400,
            })

    if not arts:
        print("\n一篇都没写成"); sys.exit(1)
    if a.dry:
        print(f"\n[dry] 写成 {len(arts)} 篇,未回传"); return

    r = json.loads(http(f"{BASE}/api/cron/news-relay/", data=json.dumps({"articles": arts}).encode(),
                        headers={**H, "Content-Type": "application/json"}, timeout=180))
    print(f"\n回传:入库 {r.get('inserted')} · 被质量闸挡回 {r.get('rejected')} · 重复 {r.get('dup')}")
    for p in (r.get("problems") or []):
        print(f"  挡回原因:{p}")


if __name__ == "__main__":
    main()

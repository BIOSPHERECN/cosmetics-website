#!/usr/bin/env python3
"""GEO 实测腿 —— 诚实版。

为什么这个探针不报"被引用率":
  biosphere 是海外 OEM 线,真实买家在海外用 Google/ChatGPT/Perplexity。
  本机在中国:cn.bing.com 是中国区索引(测错市场),国际 Google 直抓被 captcha 拦,
  没有注册 Google Search Console、也没有 Bing Webmaster API key ——
  所以没有任何权威的"索引/引用"数可拿。
  强行抓 Bing 早期版本报出过"0/20 未收录",事后查是三重探针事故
  (cn.bing 正则不匹配 target 属性 + 中国区 locale + Google captcha),
  不是真实收录情况 —— 那个数绝不进报告。

这个探针做两件诚实的事:
  ① 锁定 20 个买手真问句作为 GEO 目标集(这是 durable 的:不管后面换什么量具,
     要测的就是这 20 句有没有被 AI 引用)。
  ② 探国际 Google 是否仍被 captcha 拦(用代理 + 真 UA),如实记录"被拦/通",
     不把"被拦"读成"未收录"。这一步的唯一目的=确认抓取通道能不能用,
     不能用就明确说"本月无权威数",等 GSC key 到位再补。

根因动作(写在方法卡 #1):注册 Google Search Console + 生成 Bing Webmaster API key。
有了 GSC API,这个探针加一个 channel 就能出真"索引页数 + 展示量 + 平均位次"。

用法:  python tools/geo-probe.py            # 探通道 + 落目标集
"""
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(HERE)), "助手交付", "31-GEO获客")
os.makedirs(OUT_DIR, exist_ok=True)
MONTH = time.strftime("%Y-%m")
TARGETS = os.path.join(OUT_DIR, "geo-targets-20.json")
PROBE_LOG = os.path.join(OUT_DIR, f"geo-channel-{MONTH}.jsonl")

DOMAIN = "biosphere-ai.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
PROXIES = ["http://127.0.0.1:7890", "http://127.0.0.1:1081", "http://127.0.0.1:1082"]

# 20 题:长尾=geo_answers 真问句(海外买家原话);头部=商业词。
# 这套是 GEO 目标集 —— 不管换什么量具,要测的就是这 20 句有没有被 AI 引用。
QUESTIONS = [
    "cosmetics OEM factory China Guangzhou",
    "private label skincare manufacturer",
    "halal cosmetics manufacturer China",
    "cosmetics contract manufacturer GMPC ISO 22716",
    "skincare OEM Indonesia BPOM",
    "herbal cosmetics OEM ODM factory",
    "How do you tell whether a cosmetics contract manufacturer is credible?",
    "Do halal cosmetics need reformulation, and how does Indonesia's 2026 halal mandate work?",
    "Entering the Indonesia cosmetics market: what are the notification steps and where does it stall?",
    "Selling into the six ASEAN markets: how long does notification take and where does it stall?",
    "Sunscreen is regulated as an OTC drug in the United States: what must the OEM factory hold, how is SPF tested, and what goes on the label?",
    "Selling sunscreen in Indonesia: which SPF / PA test report is accepted, and how is the product notified?",
    "Entering the Singapore cosmetics market: what are the notification steps and where does it stall?",
    "Body lotion and body wash OEM for the Philippines: how are fragrance allergens and labeling handled?",
    "ISO 11930 versus USP <51> preservative challenge testing: what differs and which one does an export need?",
    "Exporting cosmetics to the EU: what do the CPSR, the Responsible Person and CPNP each require?",
    "Amino-acid cleanser OEM for the Philippines: how is the surfactant system chosen, and what must be right for notification and labeling?",
    "Folding carton or rigid box: how do MOQ and freight compare?",
    "One product in six countries: how are labels and leaflets laid out without being rejected?",
    "Jar or airless bottle: which packaging suits a high-active serum?",
]


def probe_google_channel(q: str):
    """探国际 Google 抓取通道通不通。返回 blocked/ok + h3 数。
    blocked 不等于"未收录" —— 只代表抓不动,不能当结论。"""
    url = "https://www.google.com/search?" + urllib.parse.urlencode(
        {"q": q, "num": 10, "hl": "en"})
    last = None
    for px in PROXIES:
        try:
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": px, "https": px}))
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
            with opener.open(req, timeout=15) as r:
                html = r.read().decode("utf-8", "replace")
            blocked = bool(re.search(r"unusual traffic|detected.*traffic|/sorry/|captcha", html, re.I))
            n_h3 = len(re.findall(r"<h3", html))
            cited = DOMAIN in html
            return {"proxy": px, "blocked": blocked, "n_h3": n_h3,
                    "biosphere_in_page": cited, "bytes": len(html)}
        except Exception as e:
            last = f"{type(e).__name__}: {e}"
    return {"proxy": None, "blocked": True, "error": last, "n_h3": 0}


def main():
    # ① 锁定目标集(幂等覆盖写)
    io.open(TARGETS, "w", encoding="utf-8", newline="\n").write(
        json.dumps({"domain": DOMAIN, "questions": QUESTIONS,
                    "locked_at": time.strftime("%Y-%m-%d %H:%M:%S")},
                   ensure_ascii=False, indent=2) + "\n")
    print(f"GEO 目标集已锁: {TARGETS} · {len(QUESTIONS)} 题")

    # ② 探通道(只探前 3 题够判通不通,别浪费请求)
    fout = io.open(PROBE_LOG, "a", encoding="utf-8", newline="\n")
    print(f"\n探国际 Google 抓取通道(只探 3 题判通/阻):")
    results = []
    for q in QUESTIONS[:3]:
        r = {"q": q, "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
             "channel": "google_intl_via_proxy", **probe_google_channel(q)}
        fout.write(json.dumps(r, ensure_ascii=False) + "\n"); fout.flush()
        results.append(r)
        tag = ("被captcha拦" if r.get("blocked") and not r.get("error")
               else f"通 · {r.get('n_h3',0)} 条结果 · 含biosphere: {r.get('biosphere_in_page')}"
               if not r.get("error") else f"代理全失败: {r.get('error')}")
        print(f"  {tag} · {q[:50]}")
        time.sleep(3)
    fout.close()

    blocked_all = all(r.get("blocked") or r.get("error") for r in results)
    print("\n" + "=" * 60)
    if blocked_all:
        print("结论:抓取通道被拦 —— 本月无权威引用数。")
        print("根因:Google 直抓 captcha + 无 GSC/Bing-WMT API key。")
        print("解锁动作:注册 Google Search Console + 生成 Bing Webmaster API key")
        print("         (见 助手交付/31-GEO获客/方法卡-01-GEO测量根因与解锁路径.md)")
    else:
        ok = [r for r in results if not r.get("blocked") and not r.get("error")]
        print(f"结论:通道可用(前 3 题中 {len(ok)} 题通)。")
        print("下一步:扩展到全 20 题 + 解析位次。")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())

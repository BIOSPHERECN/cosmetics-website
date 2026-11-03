# -*- coding: utf-8 -*-
"""
中文行业媒体采集器(crawl4ai 驱动)—— 创始人:「类似 crawl4ai 这样的开源,用起来」。

为什么上无头浏览器:聚美丽这类国内行业站没有 RSS、列表靠 JS 渲染,
手写 fetch 拿不全;crawl4ai(GitHub 4 万星)+ 自备便携 Chrome(CDP 直连,
免下载 playwright 浏览器)是最省事的组合。

纪律与全线一致:
  - 只取 标题/链接/日期/摘要 当**线索**,正文由 Worker 端改写管线用自己的话写;
  - 无可信日期不发、超 14 天不发(端点 tooOld 兜底,这里先筛一遍少跑冤枉路);
  - 逐页间隔 1.2s,礼貌抓取,单轮上限 12 条线索。
运行:python tools/crawl_cn_news.py(计划任务 BohuiNewsCN 每日两次)
"""
import asyncio, json, re, subprocess, tempfile, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(r"F:/0cosmetic/cosmetic-sites")
BASE = "https://biosphere-ai.com"
PORT = 9339
LOG = ROOT / "node_modules/.cache/news-cn.log"

SITES = [
    {   # 青眼情报(青眼旗下情报站,创始人点名关注青眼系)——2026-09-02 实测:
        # 主站 iqingyan.cn 反爬且时常超时;情报站列表 JS 渲染但便携 Chrome 能拿到,文章带日期,
        # 文章页没有标题元素,标题靠列表页锚文字。排在聚美丽前:名额优先给它。
        "home": "https://www.iqyqb.com/",
        "source": "青眼情报",
        "link_re": re.compile(r"articleDetails\?types=(\d+)&(?:amp;)?id=(\d+)", re.I),
        "build": lambda m: f"https://www.iqyqb.com/articleDetails?types={m.group(1)}&id={m.group(2)}",
        "title_strip": r"[_|-]\s*青眼.*$",
    },
    {   # 聚美丽:中国美妆产业媒体,首页即最新文章流
        "home": "https://www.jumeili.cn/",
        "source": "聚美丽",
        "link_re": re.compile(r"/news/view/(\d+)\.html", re.I),
        "build": lambda m: f"https://www.jumeili.cn/news/view/{m.group(1)}.html",
    },
]

def env_key(name: str) -> str:
    text = (ROOT / ".env").read_text("utf-8")
    return re.search(rf"^{name}=(.+)$", text, re.M).group(1).strip()

def log(msg: str):
    line = f"{datetime.now():%m-%d %H:%M}  {msg}"
    print(line)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")

async def crawl():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    bc = BrowserConfig(cdp_url=f"http://127.0.0.1:{PORT}", verbose=False)
    run = lambda extra=0.0: CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS, page_timeout=45000,
        delay_before_return_html=2.0 + extra, verbose=False)

    leads = []
    async with AsyncWebCrawler(config=bc) as c:
        for s in SITES:
            r = await c.arun(s["home"], config=run(1.0))
            html = r.html or ""
            seen, arts, list_titles = set(), [], {}
            # 列表页锚文字当标题兜底:青眼情报文章页没有标题元素,列表页的链接文字才是标题
            for am in re.finditer(r'<a[^>]*href="([^"]+)"[^>]*?(?:title="([^"]*)")?[^>]*>([\s\S]*?)</a>', html, re.I):
                href, tattr, inner = am.group(1), am.group(2) or "", re.sub(r"<[^>]+>", " ", am.group(3) or "")
                text = max((tattr.strip(), " ".join(inner.split())), key=len)
                mm = s["link_re"].search(href)
                if mm and 6 < len(text) < 120:
                    u = s["build"](mm)
                    if len(text) > len(list_titles.get(u, "")): list_titles[u] = text
            for m in s["link_re"].finditer(html):
                url = s["build"](m)          # 每站自己拼原文地址,别再写死聚美丽的路径
                if url not in seen:
                    seen.add(url); arts.append(url)
            log(f"{s['source']} 列表:{len(arts)} 篇候选")

            per_site = 0
            for url in arts[:14]:
                if per_site >= 6 or len(leads) >= 12: break
                await asyncio.sleep(1.2)
                try:
                    a = await c.arun(url, config=run())
                    h = a.html or ""
                    # 标题三路取最优(2026-09-02):青眼情报无 <h1> 且 og/<title> 是站名,
                    # 靠 trafilatura 元数据拿标题;聚美丽 <h1> 最准;都没有再退回 og/<title>。
                    title = ""
                    try:
                        import trafilatura
                        meta = trafilatura.bare_extraction(h, include_comments=False)
                        mtitle = (getattr(meta, "title", None) or (meta or {}).get("title") if meta else "") or ""
                    except Exception:
                        mtitle = ""
                    site_names = ("青眼情报", "聚美丽")
                    h1s = [re.sub(r"<[^>]+>", "", x).strip() for x in re.findall(r"<h1[^>]*>([\s\S]*?)</h1>", h)]
                    h1s = [x for x in h1s if 8 < len(x) < 120 and not any(x.startswith(n) for n in site_names)]
                    if h1s:
                        title = h1s[0]
                    elif mtitle and 8 < len(mtitle) < 120 and not any(mtitle.startswith(n) for n in site_names):
                        title = mtitle.strip()
                    elif list_titles.get(url):
                        # 列表锚文字常把日期一起带出来(「…限时启幕 2026-09-01」),剥掉尾巴
                        title = re.sub(r"\s*20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s*$", "", list_titles[url]).strip()
                    else:
                        mt = re.search(r'property="og:title" content="([^"]+)"', h) \
                            or re.search(r"<title>(.*?)</title>", h, re.S)
                        if mt:
                            title = re.sub(s.get("title_strip", r"[_|-]\s*聚美丽.*$"), "", mt.group(1).strip()).strip()
                    md = re.search(r'name="description" content="([^"]+)"', h)
                    snippet = (md.group(1).strip() if md else "")[:300]
                    # 日期实况是 2025/4/18 这种斜杠不补零(也见 2025年4月18日)——三种分隔都认,
                    # 取页面**第一个**日期 = 正文头部的发布日
                    dm = re.search(r"(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})", h)
                    if not (title and dm and len(title) > 8):
                        continue
                    dt = datetime(int(dm.group(1)), int(dm.group(2)), int(dm.group(3)), tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) - dt > timedelta(days=14):
                        continue
                    # 正文节选做深度稿底料(<p> 聚合,滤短段)
                    # 正文两路取长者:trafilatura(正文抽取标杆)对青眼情报抽到 3800 字,
                    # 对聚美丽只有 280 字(正文不在常规容器里),<p> 聚合反而更多 —— 谁长用谁。
                    paras = [re.sub(r"<[^>]+>", " ", x).strip()
                             for x in re.findall(r"<p[^>]*>([\s\S]*?)</p>", h)]
                    ex_p = "\n".join(q for q in paras if len(q) > 30)
                    try:
                        ex_t = trafilatura.extract(h, include_comments=False, favor_recall=True) or ""
                    except Exception:
                        ex_t = ""
                    excerpt = (ex_t if len(ex_t) >= len(ex_p) else ex_p)[:3200]
                    per_site += 1
                    leads.append({
                        "title": title[:200], "link": url, "source": s["source"],
                        "date": dt.strftime("%a, %d %b %Y 12:00:00 GMT"), "topic": "industry",
                        "snippet": snippet, "excerpt": excerpt,
                    })
                except Exception as e:
                    log(f"  跳过 {url[-18:]}: {str(e)[:40]}")
    return leads

def post_leads(leads):
    """分批投喂(2026-09-02):深度稿改写要 30–50 秒/篇,10 条一次丢过去 Worker 要 300+ 秒,
    客户端 280 秒断连、Worker 被取消,结果整批 0 入库还没日志。每批 3 条,批批落袋。"""
    """一次一条(2026-09-02 实测):3 条一批仍超 280 秒断连 —— 深度稿改写 30–150 秒/篇,
    客户端一断 Worker 就被取消,整批 0 入库。单条请求 ≤ 150 秒,600 秒超时绰绰有余,坏一条不连累其它。"""
    total = {"inserted": 0, "skipped": 0, "errors": []}
    for i, one in enumerate(leads):
        try:
            j = _post_batch([one])
        except Exception as e:
            j = {"inserted": 0, "skipped": 0, "errors": [f"投喂失败:{str(e)[:80]}"]}
        total["inserted"] += j.get("inserted", 0); total["skipped"] += j.get("skipped", 0)
        total["errors"] += j.get("errors", [])
        log(f"  第{i + 1}条 [{one['source']}] 入{j.get('inserted')} 滤{j.get('skipped')} 错{len(j.get('errors', []))}"
            + ("  | " + str(j.get("errors", [""])[0])[:140] if j.get("errors") else "") + f"  | {one['title'][:28]}")
    return total

def _post_batch(leads):
    body = json.dumps({"cap": 1, "leads": leads}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/cron/news/", data=body, method="POST",
        headers={"x-cron-key": env_key("CRON_KEY"), "origin": BASE,
                 "content-type": "application/json",
                 # CF 浏览器完整性检查会 403(1010)掉 Python-urllib 默认 UA
                 "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) bohui-cron/1.0"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read().decode())

def main():
    prof = tempfile.mkdtemp(prefix="c4a-cn-")
    chrome = subprocess.Popen(
        [r"D:/ie/Chrome/App/chrome.exe", "--headless=new",
         f"--remote-debugging-port={PORT}", f"--user-data-dir={prof}",
         "--no-first-run", "--no-default-browser-check", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)
    try:
        leads = asyncio.run(crawl())
        import sys as _s
        # 单轮默认最多 6 条(两站各 3):每条要等 Worker 改写 30–150 秒,6 条 ≈ 10 分钟内跑完
        limit = int(_s.argv[_s.argv.index("--max") + 1]) if "--max" in _s.argv else 6
        leads = leads[:limit]
        if not leads:
            log("无新鲜线索"); return
        j = post_leads(leads)
        log(f"线索{len(leads)} 入{j.get('inserted')} 滤{j.get('skipped')} 错{len(j.get('errors', []))}")
    finally:
        chrome.kill()

if __name__ == "__main__":
    main()

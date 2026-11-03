#!/usr/bin/env python3
"""验收前全站体检 —— 把导航能点到的每一页都打一遍,量化「有没有东西」。

由来:创始人 2026-09-11 02:1x「下午公司老板需要全面验收!每个版块需要真的有东西,而不是找不到看不清楚」。
只看 HTTP 200 不够:200 也可能是空壳(数据整理中 / 0 张卡 / 正文 300 字)。这里每页取:
状态码、字节数、<title>、<h1>、正文(main)字数、卡片数(class="card"/li 数)、占位词(整理中/暂无/待抓取/undefined/NaN…)、图片数。
按正文字数 + 卡片数排出最薄的页,先补它们。

用法:
    python tools/site-audit.py                 zh-cn 全量
    python tools/site-audit.py --lang en       英文
    python tools/site-audit.py --host https://biosphere-ai.hosonzuo.workers.dev   打副本
输出:控制台表 + data/audit/site-audit-{lang}.md
"""
import argparse
import io
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from curl_cffi import requests  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "data", "audit")
PLACEHOLDER = ["整理中", "暂无", "待抓取", "待补充", "coming soon", "Coming soon", "TODO", "lorem", "undefined", "NaN", "[object", "null,", "数据源未就绪", "404"]

# 导航七站 + 子项 + 代表性详情页(slug 由首页/列表页里再抓,这里先放已知的)
PAGES = [
    ("首页", "/"), ("选品链路", "/chain/"),
    ("总览·源头", "/stage/source/"), ("总览·包材", "/stage/containers/"), ("总览·配方", "/stage/formula/"), ("总览·成品", "/stage/products/"), ("总览·质检合规", "/stage/compliance/"), ("总览·市场", "/stage/market/"), ("原料基地线索", "/bases/"),
    ("① 源头·原料 /origin", "/origin/"), ("草本原料库", "/ingredients/"), ("各国原料目录", "/inci/"), ("知识图谱", "/graph/"), ("AI 搜索", "/search/"),
    ("② 包材", "/packaging/"), ("包材方案", "/capabilities/packaging/"), ("AI 包装设计", "/pack/"),
    ("③ 配方", "/formulas/"), ("技术与配方", "/rnd/formulation/"), ("实验室与检测", "/rnd/lab/"), ("AI 共创", "/studio/"), ("AI 工作台", "/ai/"),
    ("④ 包装盒", "/packaging/?t=use-gift,outer-carton"), ("彩盒·说明书·烟包膜", "/packaging/?t=rigid-box,leaflet,overwrap-film,shrink-sleeve,seal-sticker"),
    ("⑤ 成品", "/products/"), ("生产制造", "/capabilities/manufacturing/"), ("工厂与产能", "/about/plants/"), ("OEM/ODM 服务", "/services/"), ("品牌孵化", "/capabilities/incubation/"), ("工厂实力", "/capabilities/"),
    ("⑥ 质检·合规", "/quality/"), ("质检体系", "/qc/"), ("各国法规", "/regulations/"), ("东南亚通报账号", "/compliance/"),
    ("⑦ 市场·获客", "/guides/"), ("海外爆款调研", "/trends/"), ("买手问答", "/answers/"), ("选型对比", "/compare/"), ("客户场景", "/cases/"), ("常见问题", "/faq/"), ("行业资讯", "/news/"), ("AI 肌肤检测", "/skin/"),
    ("联系询盘", "/contact/"), ("关于帛卉", "/about/"), ("创始人", "/about/founder/"), ("发展历程", "/about/history/"),
    ("产品库 hub(退出导航)", "/libraries/"),
]


def fetch(host, lang, label, path):
    url = f"{host}/{lang}{path}" + ("&" if "?" in path else "?") + f"kk={int(time.time())}"
    try:
        r = requests.get(url, impersonate="chrome", timeout=60, headers={"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"})
        h = r.text
    except Exception as e:
        return {"label": label, "path": path, "status": "ERR", "bytes": 0, "title": str(e)[:60], "h1": "", "words": 0, "cards": 0, "imgs": 0, "flags": ""}
    title = re.search(r"<title>(.*?)</title>", h, re.S); title = re.sub(r"\s+", " ", title.group(1)).strip()[:70] if title else ""
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S); h1 = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h1.group(1))).strip()[:50] if h1 else ""
    main = re.search(r"<main[^>]*>(.*?)</main>", h, re.S)
    body = main.group(1) if main else h
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", body, flags=re.S)
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()
    words = len(re.sub(r"\s", "", text))
    cards = len(re.findall(r'class="(?:card|item|qc|tile|row|entry)\b', body)) or len(re.findall(r"<li\b", body))
    imgs = len(re.findall(r"<img\b", body))
    flags = [k for k in PLACEHOLDER if k in text]
    return {"label": label, "path": path, "status": r.status_code, "bytes": len(h), "title": title, "h1": h1, "words": words, "cards": cards, "imgs": imgs, "flags": ",".join(flags)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="https://biosphere-ai.com")
    ap.add_argument("--lang", default="zh-cn")
    a = ap.parse_args()
    with ThreadPoolExecutor(max_workers=6) as ex:
        rows = list(ex.map(lambda p: fetch(a.host, a.lang, p[0], p[1]), PAGES))
    rows_sorted = sorted(rows, key=lambda r: (r["status"] != 200, r["words"]))
    os.makedirs(OUT, exist_ok=True)
    lines = [f"# 全站体检 · {a.lang} · {a.host} · {time.strftime('%Y-%m-%d %H:%M')}", "", "| 版块 | 路径 | 状态 | 正文字数 | 卡片/条目 | 图 | 占位词 | H1 |", "|:--|:--|--:|--:|--:|--:|:--|:--|"]
    for r in rows_sorted:
        lines.append(f"| {r['label']} | `{r['path']}` | {r['status']} | {r['words']:,} | {r['cards']} | {r['imgs']} | {r['flags']} | {r['h1']} |")
    thin = [r for r in rows if r["status"] != 200 or r["words"] < 600 or r["flags"]]
    lines += ["", f"**薄 / 异常页 {len(thin)}**:" + "、".join(f"{r['label']}({r['status']}·{r['words']}字{'·' + r['flags'] if r['flags'] else ''})" for r in thin)]
    io.open(os.path.join(OUT, f"site-audit-{a.lang}.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    for r in rows_sorted:
        print(f"{str(r['status']):>4} {r['words']:>7,}字 {r['cards']:>4}卡 {r['imgs']:>3}图  {r['label']:<22} {r['path']:<60} {r['flags']}")
    print(f"\n薄/异常 {len(thin)} 页 → data/audit/site-audit-{a.lang}.md")


if __name__ == "__main__":
    main()

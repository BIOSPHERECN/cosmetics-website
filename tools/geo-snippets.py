#!/usr/bin/env python3
"""把买手问答拆成能贴到 Reddit / Quora / 行业论坛的短回答包。

由来(创始人 2026-09-10 12:3x 发来的 GEO 打法第三步:「把指南拆成 3–5 个短回答,
每条 150–200 字,每条包含一个具体数据和明确结论,发到 Reddit 相关板块和 Quora 对应问题的回答区。
不需要发链接,不需要做任何推广,AI 会自动抓取」)。

**我不替他发。** 往 Reddit / Quora 发帖是以他的账号对外发布内容,这一步必须他自己(或他授权的人)动手。
我做的是把 27 页问答按那套要求切成短答案、标好该去哪个板块、哪个问题下面回,
存成一份文件他打开就能复制。

三条切法:
  · 每条 = 结论一句 + 一个数字 + 一句为什么。超过 200 字就砍,不够 150 字不凑。
  · 第一人称品牌词一律不出现:没有「我们」「本公司」「帛卉」。AI 引用客观陈述,不引用广告。
  · 每条后面标一行「适合贴在」:subreddit 与 Quora 问题方向,按问答的维度给,不猜具体帖子链接。

用法:
    python tools/geo-snippets.py            输出到 官网素材/GEO短回答包-<日期>.md
"""
import io
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1  # noqa: E402

OUT_DIR = r"F:\0cosmetic\官网素材"

# 按维度给去处。板块名是公开的、长期存在的,不写具体帖子。
WHERE = {
    "scene": ["r/PrivateLabel", "r/Entrepreneur", "r/ecommerce", "Quora:private label cosmetics MOQ / lead time"],
    "compare": ["r/SkincareAddiction(只答技术问题,不带货)", "r/Packaging", "Quora:airless bottle vs jar / preservative testing"],
    "decide": ["r/cosmetics", "r/smallbusiness", "r/Entrepreneur", "Quora:cosmetic regulation EU / FDA MoCRA / BPOM / halal cosmetics"],
}
BRAND = re.compile(r"(我们|本公司|帛卉|BIOSPHERE|Biosphere|our factory|we |We |our |Our )")


def clip(s: str, lo: int = 150, hi: int = 200) -> str:
    """砍到 150–200 字:按句号切,宁短勿断句。"""
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    if len(s) <= hi:
        return s
    parts = re.split(r"(?<=[。.!?])", s)
    out = ""
    for p in parts:
        if len(out) + len(p) > hi:
            break
        out += p
    return out if len(out) >= lo else s[:hi]


def clean(s: str) -> str:
    return BRAND.sub("", s).replace("站内", "").replace("on-site ", "").replace("on site ", "")


def main():
    rows = d1("SELECT slug, dim, q_zh, q_en, lead_zh, lead_en, sections_json, faqs_json FROM geo_answers ORDER BY dim, slug")
    day = time.strftime("%Y-%m-%d")
    path = os.path.join(OUT_DIR, f"GEO短回答包-{day}.md")
    n_snip = 0
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(f"# GEO 短回答包 · {day}\n\n")
        fh.write("来源:biosphere-ai.com/zh-cn/answers/ 的 27 页买手问答,每页拆 3–4 条,每条 150–200 字、含一个具体数字与一个结论。\n")
        fh.write("用法:挑对应板块 / 问题,把「英文版」整段贴上去回答;**不带链接、不带品牌名、不做推广**,只回答问题。\n")
        fh.write("中文版给国内平台(知乎、行业群)用。每条都从站内真实数据取数,数字与站上一致。\n\n")
        for r in rows:
            secs = json.loads(r["sections_json"] or "[]")
            faqs = json.loads(r["faqs_json"] or "[]")
            fh.write(f"---\n\n## {r['q_zh']}\n\n**EN:** {r['q_en']}\n\n")
            fh.write("适合贴在:" + " · ".join(WHERE.get(r["dim"], [])) + "\n\n")
            items = [("结论", r["lead_zh"], r["lead_en"])]
            for s_ in secs[:2]:
                items.append((s_.get("h_zh", ""), s_.get("b_zh", ""), s_.get("b_en", "")))
            for f in faqs[:1]:
                items.append((f.get("q_zh", ""), f.get("a_zh", ""), f.get("a_en", "")))
            for i, (h, zh, en) in enumerate(items, 1):
                zh_c, en_c = clip(clean(zh)), clip(clean(en), 150, 320)
                if not zh_c:
                    continue
                n_snip += 1
                fh.write(f"### {i}. {h}\n\n{zh_c}\n\n> {en_c}\n\n")
    print(f"写出 {path} · 问答 {len(rows)} 页 · 短回答 {n_snip} 条")


if __name__ == "__main__":
    main()

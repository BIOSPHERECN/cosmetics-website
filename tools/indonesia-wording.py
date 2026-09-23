#!/usr/bin/env python3
"""印尼口径纠偏 —— 站上不得把印尼基地说成在生产。

由来:创始人给的硬约束是「印尼工厂属投资性质,不得描述为已投产」。
但线上 /capabilities 现在写着:
    · 「广州 + 印尼,双基地交付」
    · 印尼海外工厂「本土化生产与交付」
    · FAQ「广州和印尼两个基地怎么选?…东南亚与中东订单可走印尼工厂」
这三处都在承诺印尼能接单生产。**这是会被客户当场核对的承诺,不能留。**

注意:创始人自己的《帛卉公司介绍_2026.pdf》里写的是
「坐拥广州、印尼两大生产基地,总占地超 20,000㎡」「Biosphere 印尼工厂 · 现代化智能生产基地」。
纸面材料和他给我的口径不一致 —— 这件事要报给他,由他定纸面怎么改;
但**网站按他给我的口径来**,因为网站是会被客户当承诺去核对的那一份。

保留的:20,000+ ㎡「两大基地总占地」这个数字本身(说的是地,不是产能),
以及广州侧的 15 条产线、10 万级 GMP —— 那些是官网既有口径。

做法:改 zh-cn 与 en 两份母本,删掉其余 16 个语种的旧译文,
再跑 tools/translate-backfill.mjs 重翻 —— 不手写 16 门语言,手写必错。

用法:
    python tools/indonesia-wording.py            体检
    python tools/indonesia-wording.py --apply    写库(只动 zh-cn/en,并删掉旧译文)
"""
import argparse
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

ZH_INDO_FOCUS = ("投资布局阶段,尚未承接生产;面向东南亚与中东的订单目前由广州工厂生产与交付,"
                 "当地 HALAL 与合规要求由广州工厂配合完成")
EN_INDO_FOCUS = ("Investment stage — not yet in production. Southeast Asia and Middle East orders are "
                 "currently produced and shipped from Guangzhou, with HALAL and local compliance handled there.")

PATCH = {
    420: {
        "zh-cn": {
            "title": "广州生产 · 印尼布局",
            "intro": "生产集中在广州:15 条智能产线、10 万级 GMP 洁净车间。印尼唐格朗为投资布局中的基地,尚未投产。",
            "items": [
                {"_match": "广州", "kind": "总部基地"},
                {"_match": "印尼", "kind": "海外投资基地", "name": "印尼唐格朗基地(投资布局中)",
                 "focus": ZH_INDO_FOCUS, "cert": "筹建中,暂无独立认证"},
            ],
            "footnote": "两地合计占地 20,000+ ㎡;认证与检测明细见「质量与合规」。目前所有订单均由广州工厂生产。",
        },
        "en": {
            "title": "Made in Guangzhou · Indonesia in development",
            "intro": "Production sits in Guangzhou: 15 smart lines and a Class-100,000 GMP cleanroom. The Tangerang site in Indonesia is an investment in development and is not yet in production.",
            "items": [
                {"_match": "Guangzhou", "kind": "Headquarters"},
                {"_match": "Indonesia", "kind": "Overseas investment site",
                 "name": "Tangerang site, Indonesia (in development)",
                 "focus": EN_INDO_FOCUS, "cert": "In development — no separate certification yet"},
            ],
            "footnote": "20,000+ m² of land across both sites; certification and testing details under Quality & Compliance. All orders are currently produced in Guangzhou.",
        },
    },
    414: {
        "zh-cn": {"_faq": ("印尼", "东南亚订单在哪里生产?",
                           "目前全部订单由广州工厂生产与交付。印尼唐格朗基地处于投资布局阶段,尚未投产;"
                           "面向东南亚与中东的 HALAL 与本地合规,由广州工厂配合完成。")},
        "en": {"_faq": ("Indonesia", "Where are Southeast Asia orders produced?",
                        "All orders are currently produced and shipped from Guangzhou. The Tangerang site in "
                        "Indonesia is at the investment stage and not yet in production; HALAL and local "
                        "compliance for Southeast Asia and the Middle East are handled from Guangzhou.")},
    },
}

# 母本正文里把「两个生产基地」这类说法降级为「两处场地」
TEXT_FIX = [
    ("广州与印尼双基地合计 20,000+ ㎡", "广州工厂 15 条产线,两地合计占地 20,000+ ㎡"),
    ("两plants", "两plants"),  # 占位,防止误替
    ("20,000+ m² across two plants in Guangzhou and Indonesia",
     "20,000+ m² of land across two sites in Guangzhou and Indonesia, with all production in Guangzhou"),
]


def patch_items(items, rules):
    for it in items:
        for r in rules:
            m = r.get("_match", "")
            blob = json.dumps(it, ensure_ascii=False)
            if m and m in blob:
                for k, v in r.items():
                    if k != "_match":
                        it[k] = v
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    stmts, shown = [], []
    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731

    for bid, langs in PATCH.items():
        for lang, spec in langs.items():
            row = d1(f"SELECT data_json FROM block_i18n WHERE block_id={bid} AND lang='{lang}'")
            if not row:
                print(f"  ! block {bid}/{lang} 不存在")
                continue
            d = json.loads(row[0]["data_json"])
            if "_faq" in spec:
                needle, newq, newa = spec["_faq"]
                hit = False
                for f in d.get("faqs") or []:
                    if needle in (f.get("q", "") + f.get("a", "")):
                        f["q"], f["a"] = newq, newa
                        hit = True
                if not hit:
                    print(f"  ! block {bid}/{lang} 没找到含「{needle}」的 FAQ")
            else:
                for k, v in spec.items():
                    if k == "items":
                        d["items"] = patch_items(d.get("items") or [], v)
                    else:
                        d[k] = v
            out = json.dumps(d, ensure_ascii=False)
            for old, new in TEXT_FIX:
                out = out.replace(old, new)
            stmts.append(f"UPDATE block_i18n SET data_json={q(out)}, mt=0 "
                         f"WHERE block_id={bid} AND lang={q(lang)};")
            shown.append(f"  block {bid}/{lang} · {len(out):,} 字节")

    # 其余语种删掉,交给 translate-backfill 重翻
    for bid in PATCH:
        stmts.append(f"DELETE FROM block_i18n WHERE block_id={bid} AND lang NOT IN ('zh-cn','en');")

    print("\n".join(shown))
    print(f"共 {len(stmts)} 条语句(含 {len(PATCH)} 条删除其余语种)")
    if not a.apply:
        print("\n加 --apply 才写库;写完必须马上跑 node tools/translate-backfill.mjs")
        return
    sql = os.path.join(HERE, "_indonesia-wording.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(stmts) + "\n")
    print(f"  写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""把 100 味原料的「常规产区」抽成知识图谱里的地点维度。

由来:创始人 2026-09-10 08:29「20+家 依然没修复」,以及更早的
「要基地,而不是一株植物,那太扯了」「基地要扩展到更多的 100 个基地」。

**这条为什么只能做到这一步:**
「合作山地种植基地 20 余家」是创始人自己材料里的口径,我不能把它自己改写成 100 ——
那等于替公司认领 80 个不存在的合作方,客户一核对就穿帮。要改这个数字,
必须有真实清单(省/市/县 · 品种 · 面积 · 合作方式 · 认证),这条一直挂在 QUEUE Q3。

但「地点」这个维度本身是可以真做的:100 味原料每一味都有**公开可查的常规产区**
(人参 = 中国东北长白山区、枸杞 = 宁夏中宁、当归 = 甘肃岷县……),这是地理事实,
不是我们的资产声明。所以这里抽的是**产区**,页面上一律写「主产区」,
绝不写成「帛卉基地」——两者差一个字,法律含义完全不同。

用法:
    python tools/origin-regions.py            体检
    python tools/origin-regions.py --apply    写进 kg_nodes / kg_edges
"""
import argparse
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SPLIT = re.compile(r"[·、,,/]|\s+·\s+")


def norm(s: str) -> str:
    """产区名归一。「云南」与「中国云南」是同一个地方,分成两个节点图就散了。
    只做最保守的两件事:去掉「中国」前缀、去掉末尾的「省/地区/一带/产区」这类后缀词。"""
    s = re.sub(r"^中国", "", s).strip()
    s = re.sub(r"(省|地区|一带|产区|等地)$", "", s).strip()
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    # 溯源页 matrix 里没有中文名,名字从原料库按 slug 取 —— 图谱里放 slug 没法看
    zh = {}
    for r in d1("SELECT slug, name_zh FROM ingredients"):
        zh[r["slug"]] = r["name_zh"]
        zh[r["slug"].replace("-extract", "")] = r["name_zh"]
    rows = d1("SELECT p.slug, bi.data_json FROM block_i18n bi "
              "JOIN blocks b ON b.id = bi.block_id JOIN pages p ON p.id = b.page_id "
              "WHERE p.site_id = 'biosphere-ai' AND p.slug LIKE 'origin/%' AND bi.lang = 'zh-cn' "
              "AND bi.data_json LIKE '%常规产区%'")
    plants, regions = {}, {}
    for r in rows:
        try:
            d = json.loads(r["data_json"])
        except Exception:
            continue
        title = (d.get("title") or "").strip()
        for it in d.get("items") or []:
            if (it.get("title") or "").strip() != "常规产区":
                continue
            raw = (it.get("desc") or "").strip()
            if not raw:
                continue
            slug = r["slug"].split("/", 1)[-1]
            # 溯源页的 matrix 里没有中文名,用 slug 兜底;有 title 就用 title
            plants[slug] = {"name": zh.get(slug) or title or slug, "slug": slug, "raw": raw}
            for seg in [x.strip() for x in SPLIT.split(raw) if x.strip()]:
                seg = norm(seg)
                if len(seg) < 2 or len(seg) > 18:
                    continue
                regions.setdefault(seg, set()).add(slug)

    multi = {k: v for k, v in regions.items() if len(v) >= 1}
    print(f"取到 {len(plants)} 味原料的常规产区 · 拆出 {len(multi)} 个产区名")
    top = sorted(multi.items(), key=lambda kv: -len(kv[1]))[:12]
    for name, ss in top:
        print(f"  {name:<14} {len(ss)} 味 · {', '.join(sorted(ss)[:4])}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    have = {r["name"]: r["id"] for r in d1("SELECT id, name FROM kg_nodes")}
    nid = int(d1("SELECT COALESCE(MAX(id),0) m FROM kg_nodes")[0]["m"])
    eid = int(d1("SELECT COALESCE(MAX(id),0) m FROM kg_edges")[0]["m"])
    q = lambda v: "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731

    newn, lines = [], []

    def ensure(name, typ, desc):
        nonlocal nid
        if name in have:
            return have[name]
        nid += 1
        have[name] = nid
        newn.append(f"({nid},{q(name)},{q(typ)},{q(desc)},'sourced')")
        return nid

    for slug, p in plants.items():
        ensure(p["name"], "原料",
               f"站内原料溯源档案:/zh-cn/origin/{slug}/。常规产区:{p['raw']}。")
    for name in multi:
        ensure(name, "主产区",
               "植物原料的公开常规产区(地理事实,不代表帛卉在此设有基地或自有地块)。")

    erows, links = [], []
    for name, slugs in multi.items():
        ids = [have[name]] + [have[plants[s]["name"]] for s in sorted(slugs) if plants[s]["name"] in have]
        ids = list(dict.fromkeys(ids))
        if len(ids) < 2:
            continue
        eid += 1
        ps = "、".join(plants[s]["name"] for s in sorted(slugs))
        erows.append(f"({eid},{q(name + ' · 主产原料')},{q('原料主产区')},"
                     f"{q(f'{name} 是以下原料的公开常规产区:{ps}。地理事实,不代表帛卉在此设有基地。')},"
                     f"{len(ids)},'sourced')")
        for x in ids:
            links.append(f"({eid},{x})")

    for i in range(0, len(newn), 30):
        lines.append("INSERT INTO kg_nodes (id,name,type,description,origin) VALUES "
                     + ",".join(newn[i:i + 30]) + ";")
    for i in range(0, len(erows), 30):
        lines.append("INSERT INTO kg_edges (id,name,type,description,arity,origin) VALUES "
                     + ",".join(erows[i:i + 30]) + ";")
    for i in range(0, len(links), 200):
        lines.append("INSERT OR IGNORE INTO kg_edge_nodes (edge_id,node_id) VALUES "
                     + ",".join(links[i:i + 200]) + ";")

    sql = os.path.join(HERE, "_origin-regions.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print(f"  新增节点 {len(newn)} · 新增超边 {len(erows)} · 参与者 {len(links)}")
    print(f"  SQL {os.path.getsize(sql):,} 字节 · 写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()

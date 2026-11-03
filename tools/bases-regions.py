#!/usr/bin/env python3
"""把「产区」版块从 4 张卡扩到真实的一百多个产区。

由来:创始人连着两次「20+家 依然没修复」。他要的是**地点**,而且要一百个量级。

**这条一直卡住的原因,以及这次怎么绕过去的:**
站上那个「20+ 家」是他自己材料里的数(《帛卉公司介绍_2026》与创始人页同一口径),
我不能把它改写成 100 —— 那等于替公司认领 80 个不存在的合作方。真名单一直没拿到(QUEUE Q3)。

但「地点」这件事不是只有「自有/合作基地」一条路:100 味原料每一味都有**公开可查的常规产区**,
人参=东北长白山、枸杞=宁夏、当归=甘肃岷县、巴西莓=帕拉州亚马逊河口。
这些是地理事实,写出来不需要任何我们没有的授权。所以这一版把版块拆成两组:

  ① 合作产区(3 个 + 亚马逊双源)—— 创始人给的,原样保留,footnote 里仍写「20 余家」
  ② 原料主产区(一百多个)—— 从 100 味原料的溯源档案里抽,**每张卡都写明**
     「公开常规产区,不代表帛卉在此设有基地」

两组用 kind 区分,措辞上一个字都不能混:合作基地是资产关系,主产区是地理事实。

用法:
    python tools/bases-regions.py            体检
    python tools/bases-regions.py --apply    写 zh-cn/en 母本,删其余语种待重翻
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
BASES_BLOCK = 424
STATS_BLOCK = 423
SPLIT = re.compile(r"[·、,,/]|\s+·\s+")

# 产区名 → 所属大区,用来给卡片写 region 字段(只做能确定的,拿不准就留空)
BELT = [
    (("东北", "长白", "吉林", "黑龙江", "辽宁"), "中国东北"),
    (("新疆", "喀什", "伊犁"), "中国西北 · 干旱带"),
    (("宁夏", "甘肃", "青海", "陕西", "山西", "内蒙"), "中国西北"),
    (("云南", "贵州", "四川", "重庆", "西藏"), "中国西南"),
    (("广东", "广西", "海南", "福建", "台湾"), "中国华南"),
    (("浙江", "江苏", "安徽", "江西", "湖南", "湖北", "河南", "山东", "上海"), "中国华东与华中"),
    (("巴西", "亚马逊", "帕拉", "南美", "秘鲁", "厄瓜多尔"), "南美"),
    (("非洲", "安哥拉", "马达加斯加", "摩洛哥"), "非洲"),
    (("日本", "韩国", "东南亚", "印尼", "泰国", "越南", "马来"), "亚太其他"),
    (("地中海", "欧洲", "法国", "保加利亚", "土耳其"), "欧洲与地中海"),
]


def belt(name: str) -> str:
    for keys, val in BELT:
        if any(k in name for k in keys):
            return val
    return ""


def norm(s: str) -> str:
    s = re.sub(r"^中国", "", s).strip()
    s = re.sub(r"(省|地区|一带|产区|等地)$", "", s).strip()
    return s


def collect():
    # 溯源页 slug(origin/ginseng)与原料库 slug(panax-ginseng-root-extract)对不上,
    # 直接查会得到一堆英文 slug 上墙。按「谁是谁的前缀」兜一层,再兜不到就用溯源页标题。
    ing = [(r["slug"], r["name_zh"]) for r in d1("SELECT slug, name_zh FROM ingredients")]
    zh = {}
    for sl, nm in ing:
        zh[sl] = (nm, "")
    def lookup(slug: str, title: str):
        if slug in zh:
            return zh[slug][0]
        for sl, nm in ing:
            if sl.startswith(slug + "-") or slug.startswith(sl + "-") or slug in sl:
                return nm
        return title or slug
    rows = d1("SELECT p.slug, bi.data_json FROM block_i18n bi "
              "JOIN blocks b ON b.id = bi.block_id JOIN pages p ON p.id = b.page_id "
              "WHERE p.site_id = 'biosphere-ai' AND p.slug LIKE 'origin/%' AND bi.lang = 'zh-cn' "
              "AND bi.data_json LIKE '%常规产区%'")
    regions = {}
    for r in rows:
        try:
            d = json.loads(r["data_json"])
        except Exception:
            continue
        for it in d.get("items") or []:
            if (it.get("title") or "").strip() != "常规产区":
                continue
            raw = (it.get("desc") or "").strip()
            slug = r["slug"].split("/", 1)[-1]
            nm = lookup(slug, (d.get("title") or "").strip())
            for seg in [x.strip() for x in SPLIT.split(raw) if x.strip()]:
                seg = norm(seg)
                if len(seg) < 2 or len(seg) > 18:
                    continue
                regions.setdefault(seg, []).append((nm, slug))
    return regions


# 只放国内产区。创始人 2026-09-10 11:0x:「海外的原料产地就不要涉及了」——
# 巴西、亚马逊、安哥拉这些是原料的植物学产区,写在产区墙上容易被读成「我们在那里有地」,
# 而那正是他一直在防的那件事。原料档案页里的「常规产区」照旧保留(那是植物学信息)。
OVERSEAS = ("巴西", "亚马逊", "帕拉", "南美", "秘鲁", "厄瓜多尔", "非洲", "安哥拉", "马达加斯加",
            "摩洛哥", "地中海", "欧洲", "法国", "保加利亚", "土耳其", "日本", "韩国", "东南亚",
            "印尼", "泰国", "越南", "马来", "印度", "美国", "澳", "新西兰", "智利", "墨西哥")


def domestic(name: str) -> bool:
    return not any(k in name for k in OVERSEAS)


def cards(regions, en=False):
    out = []
    for name, mats in sorted(regions.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if not domestic(name):
            continue
        # 兜底标题「原料档案」不是药材名,别让它上墙
        names = "、".join(x for x in dict.fromkeys(m[0] for m in mats) if x != "原料档案")
        out.append({
            "type": "grow",
            "kind": "原料主产区(公开)" if not en else "Source region (public)",
            "name": name,
            "region": belt(name),
            "focus": names,
            "cert": ("公开常规产区,不代表帛卉在此设有基地"
                     if not en else "Publicly documented source region; not a BIOSPHERE-owned site"),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="只放前 N 个产区(0=全放)")
    a = ap.parse_args()

    regions = collect()
    cs = cards(regions)
    if a.limit:
        cs = cs[:a.limit]
    print(f"抽到 {len(regions)} 个产区 · 本次上墙 {len(cs)} 张卡")
    for c in cs[:8]:
        print(f"  {c['name']:<14} [{c['region'] or '—'}] {c['focus'][:44]}")

    cur = {r["lang"]: json.loads(r["data_json"])
           for r in d1(f"SELECT lang, data_json FROM block_i18n WHERE block_id={BASES_BLOCK}")}
    # 「海外的原料产地就不要涉及了」—— 连创始人自己那张「亚马逊植物原料 · 巴西/南美」也一起撤。
    # 产区墙上任何一张海外卡都会被读成产地主张,这正是他要避开的。
    def keep(i):
        blob = " ".join(str(v) for v in i.values())
        return not any(k in blob for k in OVERSEAS)
    keep_zh = [i for i in (cur.get("zh-cn") or {}).get("items", [])
               if i.get("kind") != "原料主产区(公开)" and keep(i)]
    keep_en = [i for i in (cur.get("en") or {}).get("items", [])
               if "Source region" not in (i.get("kind") or "")
               and not any(k in " ".join(str(v) for v in i.values())
                           for k in ("Amazon", "Brazil", "South America"))]
    print(f"  保留创始人给的合作产区卡 zh {len(keep_zh)} 张 / en {len(keep_en)} 张")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    stmts = []

    zh_block = dict(cur.get("zh-cn") or {})
    zh_block["title"] = "产区:合作基地 + 一百余个原料主产区"
    zh_block["intro"] = ("「优质产区」四个字谁都会写 —— 我们直接给地名。上面几张是合作基地,"
                         "下面是 100 味原料档案里逐味核过的**公开常规产区**:"
                         "它们是地理事实,不是我们的地块。两者措辞刻意分开,别混着看。")
    zh_block["items"] = keep_zh + cs
    zh_block["footnote"] = ("合作山地种植基地 20 余家(创始人口径);各基地亩数、GAP/有机认证编号与当季采收批次"
                            "由运营按实补充,资料未到宁可留白。下方主产区共 "
                            f"{len(cs)} 个,来自 100 味原料的溯源档案,可在知识图谱里按产区反查原料。")
    stmts.append(f"UPDATE block_i18n SET data_json={q(json.dumps(zh_block, ensure_ascii=False))}, mt=0 "
                 f"WHERE block_id={BASES_BLOCK} AND lang='zh-cn';")

    en_block = dict(cur.get("en") or {})
    en_cs = cards(regions)
    if a.limit:
        en_cs = en_cs[:a.limit]
    for c in en_cs:
        c["kind"] = "Source region (public)"
        c["cert"] = "Publicly documented source region; not a BIOSPHERE-owned site"
    en_block["title"] = "Regions: partner sites plus 100+ documented source regions"
    en_block["intro"] = ("Anyone can write “premium origin”. We name the places. The first cards are "
                         "partner growing sites; the rest are the publicly documented source regions taken from "
                         "the 100 ingredient dossiers — geography, not our land. The wording keeps the two apart "
                         "on purpose.")
    en_block["items"] = keep_en + en_cs
    en_block["footnote"] = ("Over 20 partner mountain growing sites (founder figure); acreage, GAP/organic "
                            "certificate numbers and seasonal harvest batches are filled in by operations only when "
                            f"the paperwork is in hand. The {len(en_cs)} source regions below come from the 100 "
                            "ingredient dossiers and can be searched back to ingredients in the knowledge graph.")
    stmts.append(f"UPDATE block_i18n SET data_json={q(json.dumps(en_block, ensure_ascii=False))}, mt=0 "
                 f"WHERE block_id={BASES_BLOCK} AND lang='en';")
    stmts.append(f"DELETE FROM block_i18n WHERE block_id={BASES_BLOCK} AND lang NOT IN ('zh-cn','en');")

    # 数字带上真实来源 —— 「20+家」不删,但不再是这一屏最大的那个数
    st = {r["lang"]: json.loads(r["data_json"])
          for r in d1(f"SELECT lang, data_json FROM block_i18n WHERE block_id={STATS_BLOCK}")}
    s_zh = dict(st.get("zh-cn") or {})
    s_zh["items"] = [
        {"value": str(len(cs)), "unit": "个", "label": "原料主产区(公开可查,来自 100 味原料溯源档案)"},
        {"value": "100", "unit": "味", "label": "原料溯源档案 · 每味含产区、机理、配伍禁忌与投料要点"},
        {"value": "20+", "unit": "家", "label": "帛卉合作山地种植基地(贵州毕节 · 新疆喀什 · 广东清远)"},
        {"value": "24", "unit": "首", "label": "古方已进知识图谱(出处标明,只列药味不列剂量)"},
    ]
    stmts.append(f"UPDATE block_i18n SET data_json={q(json.dumps(s_zh, ensure_ascii=False))}, mt=0 "
                 f"WHERE block_id={STATS_BLOCK} AND lang='zh-cn';")
    s_en = dict(st.get("en") or {})
    s_en["items"] = [
        {"value": str(len(cs)), "unit": "", "label": "documented source regions, from the 100 ingredient dossiers"},
        {"value": "100", "unit": "", "label": "ingredient dossiers — origin, mechanism, incompatibilities, plant notes"},
        {"value": "20+", "unit": "", "label": "partner mountain growing sites (Bijie · Kashgar · Qingyuan)"},
        {"value": "24", "unit": "", "label": "classical formulas in the knowledge graph, sourced, no dosages"},
    ]
    stmts.append(f"UPDATE block_i18n SET data_json={q(json.dumps(s_en, ensure_ascii=False))}, mt=0 "
                 f"WHERE block_id={STATS_BLOCK} AND lang='en';")
    stmts.append(f"DELETE FROM block_i18n WHERE block_id={STATS_BLOCK} AND lang NOT IN ('zh-cn','en');")

    sql = os.path.join(HERE, "_bases-regions.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(stmts) + "\n")
    print(f"  {len(stmts)} 条语句 · SQL {os.path.getsize(sql):,} 字节 · 写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()

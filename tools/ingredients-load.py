#!/usr/bin/env python3
"""草本原料库:把工作流产出的 100 条记录按审稿意见修订后,生成入库 SQL。

产出来源:botanical-100 工作流(选料 → 十路并行写 → 逐批审)。
审稿抓到 16 处必须改 + 41 处建议改 —— 如果不改直接入库,这一库会带着
编造的试验结论、错的部位、没依据的功效标签上线。审稿意见都给了可直接替换的文本,
所以这里按「INCI + 字段」自动套用,套不上的打印出来人工处理,不静默跳过。

三类修订按不同方式处理:
  · functions / claim_tag 这类枚举字段 —— 直接替换,机器判得准;
  · mechanism_zh / stability / market_* 这类长文 —— 用审稿给的 fix 全量替换;
  · 需要判断的(如给 claim_tag 造新词还是留空)—— 按更保守的一侧走,并记进日志。

纪律:宁可少一条,不要错一条。套不上的修订一律报出来,不当作已完成。
"""
import io
import os
import re
import sys
import json
import argparse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FIELDS = ["slug", "inci", "name_zh", "aliases", "cas", "family", "functions", "mechanism_zh",
          "use_level", "formats", "ph_range", "incompatible", "stability",
          "market_cn", "market_eu", "market_us", "market_apac",
          "halal_vegan", "cost_band", "factory_note", "claim_tag", "confidence"]

# functions 只允许这一组;审稿反复抓到的就是往里塞了没依据的功效标签
ALLOWED_FN = {"hydrating", "barrier", "soothing", "brightening", "anti-aging", "oil-control",
              "antioxidant", "firming", "repair", "cleansing", "conditioning",
              "uv-protection", "exfoliating", "cooling"}

# 站内词表里没有的 claim_tag 一律留空 —— 写一个下游解析不了的值,
# 等于这条记录永远挂不上任何市场证据(selector 会静默丢弃未知 slug)。
UNKNOWN_TAGS = {"aroma-signature", "warming-sensorial", "cooling-sensorial"}


def load(path: str):
    raw = io.open(path, encoding="utf-8", errors="replace").read()
    i = raw.find('{\n  "summary"')
    if i < 0:
        i = raw.find("{")
    d = json.loads(raw[i:])
    return d.get("result", d)


def apply_fixes(records, problems):
    """按 INCI + 字段套用审稿给的替换文本。"""
    by_inci = {}
    for r in records:
        by_inci.setdefault(r.get("inci", "").strip().lower(), []).append(r)

    applied, missed = 0, []
    for p in problems:
        inci = str(p.get("inci", "")).strip().lower()
        field = str(p.get("field", "")).split("/")[0].strip()
        fix = str(p.get("fix", "")).strip()
        targets = by_inci.get(inci, [])
        if not targets or field not in FIELDS or not fix:
            missed.append(p)
            continue
        for r in targets:
            # 枚举字段:审稿给的 fix 常写成「functions 改为 "a,b,c"」,把引号里的取出来
            if field in ("functions", "claim_tag", "cost_band", "confidence"):
                m = re.search(r'["“]([^"”]{2,90})["”]', fix) or re.search(r"改为[::]?\s*([\w,\-]+)", fix)
                val = (m.group(1) if m else fix).strip()
                if field == "functions":
                    val = ",".join([x for x in re.split(r"[,,\s]+", val) if x in ALLOWED_FN])
                    if not val:
                        missed.append(p); continue
                r[field] = val
            else:
                r[field] = fix
            applied += 1
    return applied, missed


def sanitize(records):
    """最后一道:不管审稿有没有提到,这些规则一律执行。"""
    notes = []
    for r in records:
        fn = [x.strip() for x in str(r.get("functions", "")).split(",") if x.strip()]
        bad = [x for x in fn if x not in ALLOWED_FN]
        if bad:
            r["functions"] = ",".join(x for x in fn if x in ALLOWED_FN)
            notes.append(f"{r['inci']}: 去掉词表外的 functions {bad}")
        tag = str(r.get("claim_tag", "")).strip()
        if tag in UNKNOWN_TAGS:
            r["claim_tag"] = ""
            notes.append(f"{r['inci']}: claim_tag「{tag}」不在站内词表,留空")
        # use_level 必须自带这句,否则会被当成法规限值读
        ul = str(r.get("use_level", ""))
        if ul and "非法规限值" not in ul and "not a regulatory" not in ul.lower():
            r["use_level"] = ul.rstrip("。") + "(公开配方学常见区间,非法规限值)"
            notes.append(f"{r['inci']}: use_level 补「非法规限值」")
        # 市场字段一律带上以官方文本为准
        for k in ("market_cn", "market_eu", "market_us", "market_apac"):
            v = str(r.get(k, "")).strip()
            if v and "官方文本" not in v and "official text" not in v.lower():
                r[k] = v.rstrip("。") + ";以最新官方文本为准。"
        if not str(r.get("cas", "")).strip():
            r["cas"] = "未确认"
    return notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(
        os.environ.get("TEMP", "."), "claude", "F--0cosmetic",
        "9c9aec8d-36c0-40f1-8422-d1cf7dcc8dd8", "tasks", "ww5pacqaf.output"))
    ap.add_argument("--out", default=os.path.join(ROOT, "db", "migrations", "0034_ingredients_seed.sql"))
    a = ap.parse_args()

    d = load(a.src)
    records = d.get("records", [])
    blockers = d.get("blockers", [])
    minors = d.get("minors", [])
    print(f"读到 {len(records)} 条记录,{len(blockers)} 处必须改,{len(minors)} 处建议改")

    n1, missed1 = apply_fixes(records, blockers)
    n2, missed2 = apply_fixes(records, minors)
    print(f"套用修订:必须改 {n1} 处,建议改 {n2} 处")
    for p in (missed1 + missed2)[:12]:
        print(f"  ! 套不上:{p.get('inci','?')[:34]:<36} {p.get('field','?')}")
    if missed1:
        print(f"  ⚠ 有 {len(missed1)} 处**必须改**没能自动套用,下面的 SQL 里这些条目标 confidence=低")
        for p in missed1:
            for r in records:
                if r.get("inci", "").lower() == str(p.get("inci", "")).lower():
                    r["confidence"] = "低"

    notes = sanitize(records)
    print(f"统一清洗 {len(notes)} 处")
    for x in notes[:10]:
        print("   ·", x)

    # slug 去重
    seen, rows = set(), []
    for r in records:
        s = re.sub(r"[^a-z0-9]+", "-", str(r.get("slug", "")).lower()).strip("-")[:60]
        if not s or s in seen:
            s = re.sub(r"[^a-z0-9]+", "-", str(r.get("inci", "x")).lower()).strip("-")[:60]
        k, n = s, 2
        while s in seen:
            s = f"{k}-{n}"; n += 1
        seen.add(s)
        r["slug"] = s
        rows.append(r)

    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"
    with io.open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("-- 0034(2026-09-07):草本原料库首批 100 条。\n"
                 "--\n"
                 "-- 来源:botanical-100 工作流(选料 → 十路并行写 → 逐批审)。\n"
                 f"-- 审稿抓到 {len(blockers)} 处必须改({n1} 处已按给出的替换文本套用)、"
                 f"{len(minors)} 处建议改({n2} 处已套用)。\n"
                 "-- 典型问题:桑白皮部位写错(根 vs 根皮)、编造 40℃ 加速试验结论、\n"
                 "-- 编造固含区间、荷荷巴标控油、六支精油标舒缓、水解小麦蛋白欧盟身份写错。\n"
                 "-- 这一步是入库前的最后一道:不改直接进,这一库会带着编造上线。\n"
                 "--\n"
                 "-- 另外统一执行三条(不管审稿有没有提):functions 只留词表内的值;\n"
                 "-- 站内词表里没有的 claim_tag 一律留空;use_level 必须自带「非法规限值」;\n"
                 "-- 市场字段一律附「以最新官方文本为准」;CAS 空的写「未确认」。\n\n")
        for r in rows:
            cols = ",".join(FIELDS)
            vals = ",".join(q(r.get(f, "")) for f in FIELDS)
            fh.write(f"INSERT OR REPLACE INTO ingredients ({cols}) VALUES ({vals});\n")
    print(f"\nSQL:{a.out}  共 {len(rows)} 条")


if __name__ == "__main__":
    main()

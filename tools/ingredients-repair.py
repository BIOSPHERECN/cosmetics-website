#!/usr/bin/env python3
"""修复被审稿意见污染的原料记录。

上一版 ingredients-load.py 把散文式的审稿建议整段写进了字段,一百条里污染了三十条。
最糟的两条连 INCI 都成了指令文本(「INCI 保持 Morus Alba Root Extract;name_zh 改为…」),
而 INCI 决定 slug、标题与页面 H1。

这次的原则和上次相反:
  · 只做**能确定**的还原 —— 值形如「…改为:「真正的值」」时,把括号里那段取出来。
    这一步是纯字符串操作,对错一眼可验。
  · 剩下的**一律下架**(status='draft'),不再猜。
    九十条干净的记录,比一百条里混着十条垃圾强得多。
  · 下架的逐条列出来,等人工重写。

产出一份 SQL,不直接连库 —— 改动要能被审、能回滚。
"""
import io
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL_IN = os.path.join(ROOT, "db", "migrations", "0034_ingredients_seed.sql")
SQL_OUT = os.path.join(ROOT, "db", "migrations", "0040_ingredients_repair.sql")

# 指令外壳:「(某字段)改为:「真正的值」」。取得出括号里的内容才算能救。
UNWRAP = re.compile(r"^[^「」]{0,40}?(?:改为|改成|替换为)[::]?\s*[「\"']?(.+?)[」\"']?\s*$", re.S)
# 一眼就知道是给人看的话,不是字段值
INSTRUCTION = re.compile(r"(?:^|[;;。])\s*(?:INCI|inci|name_zh|aliases|mechanism_zh|incompatible|"
                         r"stability|factory_note|functions|claim_tag|market_\w+)\s*(?:改为|保持|删掉|补上)")
# 只认「开头就是指令」或「整段是某字段改为…」这两种形态。
# 第一版把关键词往全文里搜,结果误伤了正文里写着「应改用黄原胶」这类合法内容 ——
# 判据太宽会把好记录也下架,那是另一种伤害。
HEAD = re.compile(r"^\s*(?:\(?删掉[^)]*\)?|该句|该条|把[^,,。]{2,20}(?:挪进|收口)|"
                  r"[A-Za-z_]{3,14}\s*(?:改为|保持|删掉)|改为|改成|替换为)")
SMELL_ANY = re.compile(r"severity|blocker|属于编造|必须改")


def polluted(v: str) -> bool:
    v = (v or "").strip()
    if not v:
        return False
    return bool(HEAD.match(v) or SMELL_ANY.search(v) or INSTRUCTION.search(v))


def split_values(raw: str):
    vals, cur, q, i = [], "", False, 0
    while i < len(raw):
        ch = raw[i]
        if ch == "'":
            if q and i + 1 < len(raw) and raw[i + 1] == "'":
                cur += "'"; i += 2; continue
            q = not q; i += 1; continue
        if ch == "," and not q:
            vals.append(cur); cur = ""; i += 1; continue
        cur += ch; i += 1
    vals.append(cur)
    return [v.strip() for v in vals]


def main():
    fixed, dropped, clean = [], [], 0
    q = lambda v: "'" + str(v).replace("'", "''") + "'"

    out = [
        "-- 0040(2026-09-07):修复被审稿意见污染的原料记录。\n"
        "--\n"
        "-- 0034 那一版自动套用审稿修订时,把散文式的建议整段写进了字段:\n"
        "-- 一百条里三十条受影响,最糟的两条连 INCI 都成了指令文本\n"
        "--(「INCI 保持 Morus Alba Root Extract;name_zh 改为…」),而 INCI 决定 slug 与页面标题。\n"
        "--\n"
        "-- 教训:自动套用只适合「值 → 值」的修订。审稿意见是写给人看的,\n"
        "-- 里面既有新值也有理由,机器分不清哪一段该写进去。\n"
        "-- 要么把审稿产出约束成纯值,要么就别自动套 —— 上一版两样都没做。\n"
        "--\n"
        "-- 这一版只做能确定的还原(值形如「…改为:「X」」就取 X),\n"
        "-- 救不回来的一律下架等人工重写 —— 九十条干净的,比一百条混着垃圾的强。\n"
    ]

    for line in io.open(SQL_IN, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line.startswith("INSERT"):
            continue
        cols = [c.strip() for c in line[line.index("(") + 1:line.index(")")].split(",")]
        raw = line[line.index("VALUES (") + 8:line.rindex(");")]
        vals = split_values(raw)
        if len(vals) != len(cols):
            continue
        d = dict(zip(cols, vals))
        slug = d.get("slug", "")
        bad = [c for c in cols if polluted(d.get(c, ""))]
        if not bad:
            clean += 1
            continue

        # INCI 或 slug 被污染 = 这条记录的身份都不对,救不了
        if any(c in ("inci", "slug") for c in bad) or INSTRUCTION.search(d.get("inci", "")):
            dropped.append((slug, d.get("inci", "")[:50], bad))
            out.append(f"UPDATE ingredients SET status='draft' WHERE slug={q(slug)};")
            continue

        sets, unresolved = [], []
        for c in bad:
            m = UNWRAP.match(d[c])
            cand = m.group(1).strip() if m else ""
            # 还原出来的值本身不能再带指令味,也不能长得离谱
            if cand and not polluted(cand) and len(cand) < 900:
                sets.append(f"{c}={q(cand)}")
            else:
                unresolved.append(c)
        if unresolved:
            dropped.append((slug, d.get("inci", "")[:50], unresolved))
            out.append(f"UPDATE ingredients SET status='draft' WHERE slug={q(slug)};")
        elif sets:
            fixed.append((slug, bad))
            out.append(f"UPDATE ingredients SET {', '.join(sets)} WHERE slug={q(slug)};")

    io.open(SQL_OUT, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
    print(f"干净 {clean} 条 · 已还原 {len(fixed)} 条 · 下架待人工重写 {len(dropped)} 条")
    print(f"\n下架的:")
    for slug, inci, cols in dropped:
        print(f"  {slug[:40]:<42} {', '.join(cols)}")
    print(f"\nSQL:{SQL_OUT}")


if __name__ == "__main__":
    main()

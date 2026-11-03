#!/usr/bin/env python3
"""查出「把审稿意见原文当成字段值」的记录。

事故:ingredients-load.py 自动套用审稿修订时,对散文式的建议直接整段写进了字段。
结果光果甘草那条的 name_zh 变成了
「name_zh 改为「光果甘草(根)提取物」;aliases 保留…」—— 一句给人看的指令,
被当成了产品名印在页面上。

教训:自动套用只适合「值 → 值」的修订。审稿意见是写给人看的,
里面既有值也有理由,机器分不清哪一段才是要写进去的那一段。
所以要么把审稿产出约束成纯值,要么就别自动套 —— 我两样都没做。

这个脚本只做检测与逐条列出,不自动改 —— 同一个坑不踩第二次。
"""
import io
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(ROOT, "db", "migrations", "0034_ingredients_seed.sql")

# 一句「给人看的话」才会出现的词。出现在字段值里就是污染。
SMELL = re.compile(r"改为|改成|替换为|应改|建议改|删掉|整段删|severity|blocker|minor|"
                   r"这条记录|本条|该字段|属于编造|必须改")


def split_values(raw: str):
    """按逗号切,但引号内的逗号不算。SQL 里的单引号是成对的 '' 转义。"""
    vals, cur, q, i = [], "", False, 0
    while i < len(raw):
        ch = raw[i]
        if ch == "'":
            if q and i + 1 < len(raw) and raw[i + 1] == "'":
                cur += "'"; i += 2; continue
            q = not q; i += 1; continue
        if ch == "," and not q:
            vals.append(cur.strip()); cur = ""; i += 1; continue
        cur += ch; i += 1
    vals.append(cur.strip())
    return vals


def main():
    bad = []
    total = 0
    for line in io.open(SQL, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line.startswith("INSERT"):
            continue
        total += 1
        try:
            cols = [c.strip() for c in line[line.index("(") + 1:line.index(")")].split(",")]
            raw = line[line.index("VALUES (") + 8:line.rindex(");")]
        except ValueError:
            continue
        vals = split_values(raw)
        if len(vals) != len(cols):
            continue
        d = dict(zip(cols, vals))
        hits = [c for c in cols if d.get(c) and SMELL.search(str(d[c]))]
        if hits:
            bad.append((d.get("inci", "?"), d.get("name_zh", "?"), hits, d))

    print(f"共 {total} 条,其中 {len(bad)} 条字段里混进了审稿意见原文\n")
    for inci, name, hits, d in bad:
        print(f"  {inci[:40]:<42} 受影响字段: {', '.join(hits)}")
        for h in hits[:2]:
            print(f"      {h}: {str(d[h])[:96]}")
    if bad:
        print(f"\n这些条目必须逐条人工核对后重写,不能再自动套 —— "
              f"上一版自动套就是这么污染的。")


if __name__ == "__main__":
    main()

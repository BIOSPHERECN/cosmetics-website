#!/usr/bin/env python3
"""日本《化粧品基準》(平成12年厚生省告示第331号)別表 1–4 —— 从厚労省法令检索页解析进 inci_catalog(jp-std)。

来源(官方,2026-09-10 检索所得,两页):
    https://www.mhlw.go.jp/web/t_doc?dataId=81aa1263&dataType=0&pageNo=1
    https://www.mhlw.go.jp/web/t_doc?dataId=81aa1263&dataType=0&pageNo=2
用 tools/pw-fetch.py 取回到 data/registries/jp_std.html 与 jp_std2.html。

结构(实测):
  別表第1 配合禁止成分  —— 正文里的编号纯文本列表(「1 6―アセトキシ… 2 アミノエーテル型…」),30 项,不是表格
  別表第2 配合制限成分  —— 表格:成分名 / 100g中の最大配合量;第二段按「化粧品の種類」分三列上限
  別表第3 防腐剤        —— 表格:成分名 / 三类化妆品各自上限(g/100g)
  別表第4 紫外線吸収剤  —— 表格,同上,跨到第 2 页
表格列头是空的(版式表),靠首行文字「成分名 / 100g中の最大配合量」认表;
三列上限的表,首个数据行是三类化妆品的名称行,跳过它,把三列拼成「洗い流す / 洗い流さない / 粘膜」。

只收原文(日文成分名 + 上限),不翻译、不做 INCI 映射 —— 日本成分表示名称与 INCI 的对应要查別的名录。

用法:
    python tools/jp-std-crawl.py            体检
    python tools/jp-std-crawl.py --apply    写库
"""
import argparse
import glob
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REG = "jp-std"
SRC = "化粧品基準(平成12年厚生省告示第331号)· 厚生労働省 法令等データベース"
THREE = ("洗い流す", "洗い流さない", "粘膜")


def plain(html: str) -> str:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", html, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t)


def cell(x: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x)).strip()


def parse_list1(t: str):
    """別表第1:『1 名称 2 名称 …』到『別表第2』为止。"""
    i, j = t.find("別表第1 (平"), t.find("別表第2 (平")
    if i < 0 or j < 0:
        return []
    seg = t[i:j]
    seg = seg[seg.find(")") + 1:]           # 去掉「(平14厚労告389・…一部改正)」
    items = re.split(r"\s(?=\d{1,2}\s)", " " + seg)
    out = []
    for it in items:
        m = re.match(r"^\s*(\d{1,2})\s+(.+?)\s*$", it)
        if m and 1 <= int(m.group(1)) <= 60:
            out.append({"no": f"1/{m.group(1)}", "name": m.group(2).strip(), "limit": "配合禁止",
                        "tbl": "別表第1 配合禁止成分"})
    return out


def parse_tables(html: str, which: str, default_tbl: str = "別表第2 配合制限成分"):
    """別表第2–4 的表格。which 只用于备注;表属于哪张別表按它在正文中的位置判断。"""
    t = plain(html)
    pos = {k: t.find(k) for k in ("別表第2 (", "別表第3 (", "別表第4 (")}
    out = []
    for tb in re.findall(r"<table.*?</table>", html, re.S):
        rows = [[cell(c) for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S)]
                for r in re.findall(r"<tr.*?</tr>", tb, re.S)]
        rows = [r for r in rows if any(r)]
        if not rows or "成分名" not in rows[0][0]:
            continue
        # 这张表在正文里的位置 → 属于哪张別表
        first = next((r[0] for r in rows[1:] if r and r[0]), "")
        at = t.find(first) if first else -1
        tbl = default_tbl
        for k, p in sorted(pos.items(), key=lambda kv: kv[1]):
            if p >= 0 and at >= p:
                tbl = {"別表第2 (": "別表第2 配合制限成分", "別表第3 (": "別表第3 防腐剤",
                       "別表第4 (": "別表第4 紫外線吸収剤"}[k]
        three = len(rows[0]) >= 3 or (len(rows) > 1 and any("洗い流" in c for c in rows[1]))
        body = rows[1:]
        if three and body and any("洗い流" in c for c in body[0]):
            body = body[1:]
        for r in body:
            name = r[0]
            if not name or name in ("成分名",):
                continue
            if three and len(r) >= 4:
                lim = " / ".join(f"{k} {v}" for k, v in zip(THREE, r[1:4]) if v)
            else:
                lim = r[1] if len(r) > 1 else ""
            out.append({"no": "", "name": name, "limit": lim, "tbl": tbl})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(HERE), "data", "registries"))
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    h1 = io.open(os.path.join(a.dir, "jp-std_MHLW_t_doc_81aa1263_p1.html"), encoding="utf-8", errors="replace").read()
    h2 = io.open(os.path.join(a.dir, "jp-std_MHLW_t_doc_81aa1263_p2.html"), encoding="utf-8", errors="replace").read()
    # 第 2 页没有「別表第N (」标记,它是第 4 表(紫外線吸収剤)的续页
    rows = parse_list1(plain(h1)) + parse_tables(h1, "p1") + parse_tables(h2, "p2", "別表第4 紫外線吸収剤")
    # 表 3/4 的续页在第 2 页,第 2 页正文没有「別表第N (」标记,按第 1 页最后一张表的归属补
    seen = {}
    for r in rows:
        key = (r["tbl"], r["name"])
        if key in seen:
            continue
        seen[key] = r
    rows = list(seen.values())
    from collections import Counter
    print(f"共 {len(rows)} 条:", Counter(r["tbl"] for r in rows).most_common())
    for r in rows[:3] + rows[31:34]:
        print("   ", r["tbl"][:8], "|", r["name"][:36], "|", r["limit"][:50])
    if not a.apply:
        print("\n加 --apply 才写库")
        return
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    lines = [f"DELETE FROM inci_catalog WHERE registry = '{REG}';"]
    vals = []
    for i, x in enumerate(rows, 1):
        no = x["no"] or f"{x['tbl'][2:5]}/{i}"
        note = f"{x['tbl']} · {x['limit']}" if x["limit"] else x["tbl"]
        vals.append("(" + ",".join([q(no), q(x["name"][:300]), "NULL", "NULL", "NULL", "NULL", q(note[:600]),
                                    q(SRC), q(x["name"][:300].upper()), "NULL", "NULL", q(REG)]) + ")")
    for i in range(0, len(vals), 40):
        lines.append("INSERT INTO inci_catalog (no,name_zh,inci,alias,max_rinse,max_leave,note,source,inci_key,cas,ec_no,registry) VALUES "
                     + ",".join(vals[i:i + 40]) + ";")
    lines.append(f"UPDATE inci_registry SET status='live' WHERE id='{REG}';")
    for old in glob.glob(os.path.join(HERE, "_jp-std-*.sql")):
        os.remove(old)
    f = os.path.join(HERE, "_jp-std-01.sql")
    io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    total = d1_exec(f)
    n = d1(f"SELECT COUNT(*) n FROM inci_catalog WHERE registry='{REG}'")
    print(f"写入 {total:,} 行 · jp-std 共 {n[0]['n'] if n else '?'} 条")


if __name__ == "__main__":
    main()

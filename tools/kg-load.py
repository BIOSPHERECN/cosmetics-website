#!/usr/bin/env python3
"""把 Hyper-Extract 抽出来的知识图谱灌进 D1,让网站能查。

由来(创始人 2026-09-10 03:5x:「hyper-extract 更好的知识图谱,你看下怎么样重构系统」)。
图谱躺在 tools/.kg/data.json 里对客户没有任何用处 —— 要能在站上查,才算交付。

**为什么是超图不是普通图**:普通图只能表达「A—关系—B」两两之间的边。
而配方知识本来就是多元的:「甘草提取物 + 阳离子调理剂 + 清洁体系 → 泡沫质量下降、粘度掉」
是一条五方参与的事实,拆成两两边就把「在什么体系下」这个条件丢了。
Hyper-Extract 抽出来的 edges 带 participants 数组,中位数 4 个参与者、81% 在 3 个以上,
这正是我们要的那种「条件-组合-后果」结构。

**认知档标注**:图谱是**机器从我们自己的语料里抽的**,不是原文直证。
所以入库时统一标 `origin='machine'`,页面上必须写明「机器抽取,以原文与官方文本为准」,
不能让客户以为这是我们背书的结论。

用法:
    python tools/kg-load.py            体检
    python tools/kg-load.py --apply    建表并灌库
"""
import argparse
import ast
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
KA = os.path.join(HERE, ".kg", "data.json")


def parts(v):
    """participants 有时是 JSON 数组,有时是 Python 列表的字符串写法。两种都吃。"""
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    s = str(v or "").strip()
    if not s:
        return []
    for loader in (json.loads, ast.literal_eval):
        try:
            out = loader(s)
            if isinstance(out, list):
                return [str(x).strip() for x in out if str(x).strip()]
        except Exception:
            pass
    return [x.strip() for x in re.split(r"[,,、]", s) if x.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    j = json.loads(io.open(KA, encoding="utf-8").read())
    nodes = {(_n.get("name") or "").strip(): _n for _n in (j.get("nodes") or []) if (_n.get("name") or "").strip()}
    edges = []
    for e in j.get("edges") or []:
        name = (e.get("name") or "").strip()
        ps = parts(e.get("participants"))
        if not name or len(ps) < 2:
            continue
        edges.append((name, e.get("type") or "", e.get("description") or "", ps))
    # 只保留在节点表里认得出的参与者 —— 认不出的多半是模型顺手写的短语,不是实体
    known = set(nodes)
    kept = [(n, t, d, [p for p in ps if p in known]) for n, t, d, ps in edges]
    kept = [x for x in kept if len(x[3]) >= 2]
    print(f"节点 {len(nodes)} · 超边 {len(edges)} · 参与者全部可识别的超边 {len(kept)}")
    from collections import Counter
    print("  节点类型:", Counter(v.get("type") for v in nodes.values()).most_common(8))
    print("  超边类型:", Counter(t for _, t, _, _ in kept).most_common(8))
    print(f"  参与者对照表将写 {sum(len(x[3]) for x in kept):,} 行")
    if not a.apply:
        print("\n加 --apply 才建表灌库")
        return

    q = lambda v: "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_kg-load.sql")
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        # **只清 origin='machine' 那一批,绝不 DROP TABLE。**
        # 同一套表里还躺着两批不是机器抽的:
        #   · origin='classic' —— tools/gufang.py 导的 24 首古方(公有领域医籍)
        #   · origin='sourced' —— tools/origin-regions.py 抽的 100 味原料主产区
        # 上一版这里是 DROP TABLE,重跑一次就把那两批连同超边一起抹掉,而且不报错 ——
        # 页面还在、内容没了,是最难发现的那种坏法。
        fh.write("CREATE TABLE IF NOT EXISTS kg_nodes (id INTEGER PRIMARY KEY, name TEXT UNIQUE, type TEXT, description TEXT, origin TEXT DEFAULT 'machine');\n")
        fh.write("CREATE TABLE IF NOT EXISTS kg_edges (id INTEGER PRIMARY KEY, name TEXT, type TEXT, description TEXT, arity INTEGER, origin TEXT DEFAULT 'machine');\n")
        fh.write("CREATE TABLE IF NOT EXISTS kg_edge_nodes (edge_id INTEGER, node_id INTEGER, PRIMARY KEY (edge_id, node_id));\n")
        fh.write("DELETE FROM kg_edge_nodes WHERE edge_id IN (SELECT id FROM kg_edges WHERE origin='machine');\n")
        fh.write("DELETE FROM kg_edges WHERE origin='machine';\n")
        fh.write("DELETE FROM kg_nodes WHERE origin='machine';\n")
        fh.write("CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(type);\n")
        fh.write("CREATE INDEX IF NOT EXISTS idx_kg_en_node ON kg_edge_nodes(node_id);\n")
        # 名字重了要**让位给古方/产区那一批**,不能覆盖:
        # kg_nodes.name 是 UNIQUE,INSERT OR REPLACE 撞名时会把那一行连 id 一起换掉,
        # 而 kg_edge_nodes 里古方与产区的边还指着旧 id —— 换完边就断了,页面上表现为
        # 「点开甘草,古方那几条关系不见了」。所以撞名的一律复用已有 id,不重新插。
        keep = {r["name"]: int(r["id"]) for r in
                d1("SELECT id, name FROM kg_nodes WHERE origin IN ('classic','sourced')")}
        nid = {}
        rows = []
        i = 100000
        for name, n in sorted(nodes.items()):
            if name in keep:
                nid[name] = keep[name]
                continue
            i += 1
            nid[name] = i
            rows.append(f"({i},{q(name)},{q(n.get('type') or '')},{q(n.get('description') or '')})")
        print(f"  与古方/产区同名、复用已有节点 {len(keep) and sum(1 for k in nodes if k in keep)} 个")
        for i in range(0, len(rows), 40):
            fh.write("INSERT OR REPLACE INTO kg_nodes (id,name,type,description) VALUES " + ",".join(rows[i:i + 40]) + ";\n")
        erows, links = [], []
        for i, (name, t, d, ps) in enumerate(kept, start=100001):
            erows.append(f"({i},{q(name)},{q(t)},{q(d)},{len(ps)})")
            for p in ps:
                links.append(f"({i},{nid[p]})")
        for i in range(0, len(erows), 40):
            fh.write("INSERT OR REPLACE INTO kg_edges (id,name,type,description,arity) VALUES " + ",".join(erows[i:i + 40]) + ";\n")
        for i in range(0, len(links), 200):
            fh.write("INSERT OR IGNORE INTO kg_edge_nodes (edge_id,node_id) VALUES " + ",".join(links[i:i + 200]) + ";\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节 · 写入 {d1_exec(sql):,} 行")
    for t in ("kg_nodes", "kg_edges", "kg_edge_nodes"):
        r = d1(f"SELECT COUNT(*) n FROM {t}")
        print(f"  {t}: {r[0]['n'] if r else '?'}")


if __name__ == "__main__":
    main()

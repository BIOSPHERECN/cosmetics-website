#!/usr/bin/env python3
"""把 55 位角色专家(41 配方/工艺/合规 + 14 获客团,2026-09-17)(.claude/skills/bohui-*/SKILL.md)导入 expert_skills 表,给配方实验室召集用。

为什么要入库而不是运行时读文件:Worker 里没有文件系统,召集专家时要 `SELECT slug,title,core FROM expert_skills`
把「头部 + 开口前必问 + 判断口径 + 红线」装进提示词。kb_entries 里那 40 条「给客户看的版本」是对外口径,
这里存的是对内的判断口径,两者不混。

两个解析分支:
    专家(40 篇):description「。」前最后一个括号 = domain;`**何时召集**` 行 = triggers;末行「检索词:」= keywords;
                 core = 头部(一级标题到第一个 ## 之前)+ 开口前必问 + 判断口径 + 红线 三段。
    panel(bohui-expert-panel):description 无括号、无何时召集、无检索词,标题只有 怎么用 / 红线 / 缺口 / 名册,
                 kind='panel', domain='总控', core=body。

for_lab=1 的 23 位 = 规范 5.1 席位表全部 slug(20)+ process-scaleup-emulsion + incoming-material-supplier + label-claims-review;
其余 18 位(含 panel)+ 获客团 14 位(domain 含「获客/市场/客户/谈判」)入库不召集,for_lab=0。

用法:
    python tools/expert-import.py            体检:打印 55 行 slug / kind / domain / len(core)
    python tools/expert-import.py --apply    写 tools/_expert-import.sql 再 d1_exec
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
SKILLS = r"F:/0cosmetic/.claude/skills"
PANEL = "bohui-expert-panel"

# 进 core 的三段。标题后面可能带括号说明(「## 开口前必问(问不到就不下结论)」),按前缀认。
CORE_SECS = ["开口前必问", "判断口径", "红线"]

# 配方实验室召集范围(规范 5.1 末段)。不带 bohui- 前缀写,入库时补。
FOR_LAB = {
    "color-cosmetics-lip-base", "sunscreen-spf-systems", "sheet-mask-substrate", "cleansing-surfactant-systems",
    "formulation-aqueous-serum", "formulation-emulsion", "micro-preservation", "stability-shelf-life",
    "regulatory-china", "regulatory-eu", "regulatory-us-na", "regulatory-apac-emerging",
    "safety-assessor-toxicology", "formulation-actives-efficacy", "nmpa-reviewer-perspective",
    "ethics-sustainability-claims", "botanical-actives-claims", "fragrance-development",
    "packaging-compatibility", "cost-formulation-structure",
    "process-scaleup-emulsion", "incoming-material-supplier", "label-claims-review",
}
assert len(FOR_LAB) == 23


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def split_front(txt):
    """frontmatter(--- … ---)与正文分开。返回 (description 原文, body)。"""
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n", txt, flags=re.S)
    if not m:
        raise ValueError("没有 frontmatter")
    fm = m.group(1)
    dm = re.search(r"^description:\s*(.*)$", fm, flags=re.M)
    desc = (dm.group(1) if dm else "").strip().strip('"')
    return desc, txt[m.end():].strip("\n")


def sections(body):
    """按「## 」切段:返回 (头部, {标题: 段原文}),段原文含标题行。"""
    parts = re.split(r"(?m)^(?=## )", body)
    head = parts[0].rstrip()
    secs = {}
    for p in parts[1:]:
        title = p.splitlines()[0][3:].strip()
        secs[title] = p.rstrip()
    return head, secs


def pick(secs, prefix):
    for t, s in secs.items():
        if t.startswith(prefix):
            return s
    return ""


def parse(path):
    name = os.path.basename(os.path.dirname(path))
    txt = io.open(path, encoding="utf-8").read()
    desc, body = split_front(txt)
    head, secs = sections(body)
    tm = re.search(r"(?m)^# (.+)$", head)
    title = tm.group(1).strip() if tm else name
    if name == PANEL:
        return dict(slug=name, kind="panel", domain="总控", title=title, triggers="", core=body, body=body, keywords="", for_lab=0)
    # domain:description 第一个「。」之前、最后一个括号里的字(4 篇是双括号,取最后一个即可)
    first = desc.split("。", 1)[0]
    parens = re.findall(r"[（(]([^（）()]*)[）)]", first)
    if not parens:
        raise ValueError(f"{name}:description 里没有 domain 括号")
    domain = parens[-1].strip()
    trig = re.search(r"(?m)^\*\*何时召集\*\*[::]?\s*(.+)$", body)
    kw = re.search(r"(?m)^检索词[::]\s*(.+)$", body)
    core_parts = [head] + [pick(secs, p) for p in CORE_SECS]
    missing = [p for p, s in zip(CORE_SECS, core_parts[1:]) if not s]
    if missing or not trig or not kw:
        raise ValueError(f"{name}:缺 {missing or ''} {'何时召集' if not trig else ''} {'检索词' if not kw else ''}")
    return dict(slug=name, kind="expert", domain=domain, title=title, triggers=trig.group(1).strip(),
                core="\n\n".join(core_parts), body=body, keywords=kw.group(1).strip(),
                for_lab=int(name[len("bohui-"):] in FOR_LAB))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(SKILLS, "bohui-*", "SKILL.md")))
    rows = [parse(f) for f in files]
    for r in rows:
        print(f"{r['slug']:<48} {r['kind']:<7} {r['domain']:<12} lab={r['for_lab']} core={len(r['core'])}")
    n_lab = sum(r["for_lab"] for r in rows)
    print(f"共 {len(rows)} 篇 · panel {sum(r['kind'] == 'panel' for r in rows)} · for_lab {n_lab}")
    assert len(rows) == 55 and n_lab == 23, "篇数或 for_lab 数不对,先别写库"
    if not a.apply:
        print("体检完成(未写库)。--apply 写库")
        return
    cols = ["slug", "kind", "domain", "title", "triggers", "core", "body", "keywords", "for_lab"]
    upd = ", ".join(f"{c}=excluded.{c}" for c in cols if c != "slug")
    # 一行一条语句:每篇 body+core 约 17KB,10 篇合一条就 170KB,D1 报 SQLITE_TOOBIG(2026-09-17 实测)。文件仍是一次 d1_exec。
    out = []
    for r in rows:
        vals = "(" + ", ".join(q(r[c]) for c in cols) + ")"
        out.append(f"INSERT INTO expert_skills ({', '.join(cols)}) VALUES\n{vals}\n"
                   f"ON CONFLICT(slug) DO UPDATE SET {upd}, updated_at=datetime('now');\n")
    f = os.path.join(HERE, "_expert-import.sql")
    io.open(f, "w", encoding="utf-8", newline="\n").write("".join(out))
    print("写库:", d1_exec(f), "行")
    print(d1("SELECT COUNT(*) n, SUM(kind='panel') p, SUM(for_lab) f FROM expert_skills"))


if __name__ == "__main__":
    main()

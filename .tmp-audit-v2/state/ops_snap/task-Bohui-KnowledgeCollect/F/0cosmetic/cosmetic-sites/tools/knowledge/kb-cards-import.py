"""C4 知识库后台 · 说服卡 / 方法卡 / 架构文档 → playbooks(2026-09-24)。

来源(22-知识库与专家思维/):
  说服卡-v1.md           → 7 张「知识卡片」(④ 对外层) slug card-k01…
  专家思维卡库-v1.md      → 23 张「方法卡」(② 方法层)  slug method-j01…
  帛卉行业知识库-架构-v1.md / 知识库-说服客户用法-v1.md / 说服卡「用前 30 秒」→ 3 篇「资料」
卡片一律 status='待审' 入库,管理员在 /bohui/kb 人审通过才「在用」。
INSERT … ON CONFLICT(slug) DO NOTHING:重跑不覆盖后台改过的卡;v2 用新 slug 另存,旧版保留。

读量:PRAGMA 1 次 + 核对 1 次(playbooks 全表,几十行)。一次性工具,不排计划任务。
写库拿公司库锁 _LOCK_D1_COMPANY(mkdir 锁,同 ledger-sync)。
用法:python tools/knowledge/kb-cards-import.py [--dry]
"""
import io, os, re, sys, time

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, TOOLS)
from _bohui import d1, d1_exec  # noqa: E402

SRC = "F:/0cosmetic/助手交付/22-知识库与专家思维"
MIG = os.path.join(os.path.dirname(TOOLS), "db", "migrations", "0124_c4_kb_cards.sql")
LOCK = "F:/0cosmetic/skin2oem/tools/platform/_LOCK_D1_COMPANY"
OUT = os.path.join(TOOLS, "_kb_cards.sql")
K_STAGE = {"K01": "合规", "K02": "市场", "K03": "询盘", "K04": "谈判", "K05": "合规", "K06": "合规", "K07": "谈判"}
M_STAGE = {"J": "通用", "E": "合规", "P": "市场", "S": "跟进"}


def read(name):
    return io.open(os.path.join(SRC, name), encoding="utf-8").read()


def sections(md, pat):
    """### 标题 切段:到下一个同级或更高级标题为止。"""
    hs = list(re.finditer(r"^(#{2,3}) (.+)$", md, re.M))
    for i, h in enumerate(hs):
        m = re.match(pat, h.group(2))
        if not m:
            continue
        end = next((x.start() for x in hs[i + 1:] if len(x.group(1)) <= 3), len(md))
        yield m, md[h.start():end].strip().removesuffix("---").strip()


def rows():
    out = []
    cards = read("说服卡-v1.md")
    for m, body in sections(cards, r"(K\d\d) (.+)"):
        cid, title = m.group(1), m.group(2).strip()
        ask = re.search(r"\*\*客户会问\*\*[::](.+)", body)
        tags = re.sub(r"[「」“”\"]", "", ask.group(1)).strip() if ask else ""
        out.append((f"card-{cid.lower()}", "知识卡片", K_STAGE.get(cid, "通用"), f"{cid} {title}", tags[:200], body,
                    f"《说服卡-v1》{cid}(22-知识库与专家思维,2026-09-24)", 50 + int(cid[1:]), "待审"))

    lib = read("专家思维卡库-v1.md")
    quick = {}   # 速查表:问题 → 卡号,拿来当检索词
    for line in re.findall(r"^\|(.+)\|$", lib.split("## 一、")[0], re.M):
        cells = [c.strip() for c in line.split("|")]
        if len(cells) >= 3 and not cells[0].startswith(("---", "你遇到")):
            for cid in set(re.findall(r"\b([JEPS]\d\d)\b", " ".join(cells[1:]))):
                quick.setdefault(cid, []).append(re.sub(r"[「」]", "", cells[0]))
    for m, body in sections(lib.split("## 五、")[0], r"([JEPS]\d\d) (.+)"):
        cid, title = m.group(1), m.group(2).strip()
        use = re.search(r"\*\*用在\*\*[::](.+)", body)
        tags = ";".join(quick.get(cid, []) + ([use.group(1).strip()] if use else []))
        out.append((f"method-{cid.lower()}", "方法卡", M_STAGE[cid[0]], f"{cid} {title}", tags[:200], body,
                    f"《专家思维卡库-v1》{cid}(22-知识库与专家思维,2026-09-23)", 100 + "JEPS".index(cid[0]) * 10 + int(cid[1:]), "待审"))

    guide = cards.split("### K01")[0] + "\n\n" + cards[cards.index("## 暂不入卡"):]
    for slug, title, body, src in [
        ("kb-arch-v1", "帛卉行业知识库 · 四层架构 v1", read("帛卉行业知识库-架构-v1.md"), "《帛卉行业知识库-架构-v1》(2026-09-23)"),
        ("kb-usage-v1", "知识库 · 说服客户用法 v1", read("知识库-说服客户用法-v1.md"), "《知识库-说服客户用法-v1》(2026-09-23)"),
        ("kb-cards-guide-v1", "说服卡 · 用前 30 秒与缺口清单", guide, "《说服卡-v1》卡前说明与卡后清单(2026-09-24)"),
    ]:
        out.append((slug, "资料", "通用", title, "知识库,说服卡,四层,事实层,方法层,经验层,对外层", body.strip(), src, 40, None))
    return out


def q(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def selftest():
    r = rows()
    ks = [x for x in r if x[1] == "知识卡片"]; ms = [x for x in r if x[1] == "方法卡"]
    assert len(ks) == 7 and len(ms) == 23, (len(ks), len(ms))
    assert all("出处" in x[5] for x in ks), "每张说服卡正文都要带「证据与出处」"
    assert "method-p07" in {x[0] for x in ms} and "能不能用" in dict((x[0], x[4]) for x in ms)["method-p07"]
    assert all(len(x[5]) < 40000 for x in r)
    return r


def main(dry):
    r = selftest()
    cols = "slug, kind, stage, title, tags, body, source, sort, status"
    sql = [f"INSERT INTO playbooks ({cols}) VALUES ({', '.join(q(v) for v in x)}) ON CONFLICT(slug) DO NOTHING;" for x in r]
    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(sql) + "\n")
    print(f"{len(r)} 行 → {OUT}")
    if dry:
        return 0
    for _ in range(30):
        try:
            os.mkdir(LOCK); break
        except FileExistsError:
            time.sleep(60)
    else:
        print("公司库锁 30 分钟未拿到,停"); return 1
    try:
        io.open(os.path.join(LOCK, "owner.txt"), "w", encoding="utf-8").write(f"C4 kb-cards-import {time.strftime('%F %T')}\n")
        have = {c["name"] for c in d1("PRAGMA table_info(playbooks)")}
        if not have:
            print("读不到 playbooks 表结构,停"); return 1
        if "status" not in have:
            print("迁移 0124 写入:", d1_exec(MIG))
        print("卡片写入行数:", d1_exec(OUT))
        print(d1("SELECT kind, status, COUNT(*) n FROM playbooks WHERE status IS NOT NULL OR kind='资料' GROUP BY kind, status"))
        return 0
    finally:
        for f in os.listdir(LOCK):
            os.remove(os.path.join(LOCK, f))
        os.rmdir(LOCK)


if __name__ == "__main__":
    sys.exit(main("--dry" in sys.argv))

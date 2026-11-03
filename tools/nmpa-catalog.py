#!/usr/bin/env python3
"""《已使用化妆品原料目录(2021年版)》—— 8,972 条,从 NMPA 公告 PDF 解析进库。

为什么做这个(2026-09-09,创始人:「护肤外面公开的成分有几万个配方,要深度搜索啊」):
自建原料库只有 94 条,是我自己一条条写的。而这份目录是**国家药监局公告的客观收录**,
覆盖在中国境内生产、销售的化妆品已使用过的全部原料 —— 8,972 条,带标准中文名、
INCI 名,以及**最高历史使用量**。

最高历史使用量这一栏不是装饰:按 2021 年第 62 号公告说明八,它可以直接作为
《化妆品安全评估报告(简化版)》的证据类型。客户问「这个原料我能加到多少」,
以前我们只能说「按法规」,现在能说「淋洗类历史最高 X%、驻留类 Y%,出处是国家目录」。

三条纪律:
  1. **不改数**。目录里没有最高使用量的原料就留空,不拿别的来源填 ——
     安全评估要引用的东西,填错比留空危险得多。
  2. **原文留档**。解析结果与原始 PDF 文本一起留在 tools/,模型或规则改了能重跑对账。
  3. **解析质量要量化**。不是「跑通了」就算完 —— 每次跑都打印异常行数,
     异常率超过 1% 就不许写库。PDF 抽文本天生会串行,不检查就是把脏数据倒进库里。

用法:
    python tools/nmpa-catalog.py            解析并打印质量报告(不写库)
    python tools/nmpa-catalog.py --apply    写入 D1 的 inci_catalog 表
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, "_nmpa2021.pdf")
TXT = os.path.join(HERE, "_nmpa2021.txt")
OUT = os.path.join(HERE, "_nmpa2021.json")
SRC = "https://extract-resource.oss-cn-hangzhou.aliyuncs.com/mt_file/16636590854308.pdf"
SRC_NOTE = "国家药监局 2021 年第 62 号公告 · 已使用化妆品原料目录(2021年版)"

CJK = re.compile(r"[㐀-鿿]")
# 备注是一个很小的封闭集合(约 770 行)。字符之间允许空白 ——
# PDF 抽文本会在换行处塞空格,「化妆品安全技术规 范」就是这么来的。
NOTE_PATTERNS = [
    "拟调整为《化妆品安全技术规范》禁用成分",
    "《化妆品安全技术规范》禁用组分",
    "按照《化妆品安全技术规范》要求使用",
    "按照《化妆品安全技术规范》要求",
]
NOTE_RE = [(p, re.compile(r"\s*".join(re.escape(c) for c in p) + r"\s*$")) for p in NOTE_PATTERNS]
# 两个用量列,没有的地方印成 "/"
TAIL = re.compile(r"((?:(?:\d+(?:\.\d+)?|/)\s+)*(?:\d+(?:\.\d+)?|/))\s*$")


def fetch():
    if not os.path.exists(PDF):
        print("下载公告 PDF …")
        req = urllib.request.Request(SRC, headers={"User-Agent": "Mozilla/5.0"})
        io.open(PDF, "wb").write(urllib.request.urlopen(req, timeout=300).read())
    if not os.path.exists(TXT):
        import pypdf
        r = pypdf.PdfReader(PDF)
        io.open(TXT, "w", encoding="utf-8", newline="\n").write(
            "\n".join((p.extract_text() or "") for p in r.pages))
    return io.open(TXT, encoding="utf-8").read()


def squeeze(s: str) -> str:
    """把换行造成的空格收掉:两个汉字之间、汉字与括号之间的空格都是假的。"""
    s = re.sub(r"\s+", " ", s).strip()
    for _ in range(3):
        s = re.sub(r"(?<=[㐀-鿿（）《》，、（）])\s+(?=[㐀-鿿（）《》，、])", "", s)
    return s


def parse_one(no: str, raw: str) -> dict:
    s = squeeze(raw)

    note = ""
    for text, rx in NOTE_RE:
        m = rx.search(s)
        if m:
            note, s = text, s[:m.start()].strip()
            break

    nums = []
    m = TAIL.search(s)
    if m:
        nums = [x for x in m.group(1).split() if x]
        s = s[:m.start()].strip()

    # 说明七:一个序号后列出两个名称的是同一原料,后一个标「曾用名」。
    # 曾用名是中文,挂在整行最后 —— 不先摘掉,下面「最后一个汉字」就会落在它身上,
    # 于是整条 INCI 被划进中文名。
    alias = ""
    m = re.search(r"曾用名", s)
    if m:
        alias, s = s[m.end():].strip(), s[:m.start()].strip()

    # 中文名与 INCI 的分界 = 最后一个汉字。中文名里本来就可能有 ASCII
    # (「C20-40 醇」「PEG-8」),按第一个 ASCII 切会把名字切碎。
    k = 0
    for mm in CJK.finditer(s):
        k = mm.end()
    zh, inci = (s[:k].strip(), s[k:].strip()) if k else ("", s)

    # 着色剂那一段整行没有汉字(「CI 10020 CI 10020」「CI 15850 AKA 202」),
    # 上面那把尺子量不出分界。这些行的中文名就是色号本身。
    if not zh:
        m = re.match(r"^(CI\s*\d+)\s+(.*)$", s)
        if m:
            zh, inci = m.group(1), m.group(2).strip()
            # 色号尾巴的数字刚才被当成用量吃掉了,还回去
            if inci and not re.search(r"\d$", inci) and nums:
                inci = f"{inci} {nums.pop(0)}"
        else:
            zh, inci = s, ""

    # 「油醇聚醚-5 OLETH-5」这类:抽文本时把中文名尾巴的「-5」推到了 INCI 前面,
    # 而 INCI 自己的「-5」被当成用量数字吃掉了。两边各还回去。
    m = re.match(r"^-\s*(\d+)\b\s*(.*)$", inci)
    if m:
        zh = f"{zh}-{m.group(1)}"
        inci = m.group(2).strip()
    if inci.endswith("-") and nums:
        inci += nums.pop(0)

    rinse = leave = None
    vals = [None if x == "/" else x for x in nums]
    if len(vals) >= 2:
        rinse, leave = vals[0], vals[1]
    elif len(vals) == 1:
        # 说明八:只有驻留类信息的,淋洗类可参照驻留类使用 —— 所以单值归驻留列
        leave = vals[0]

    return {"no": no, "zh": zh, "inci": inci, "rinse": rinse, "leave": leave,
            "note": note, "alias": alias}


def inci_key(x: str) -> str:
    """归一化 INCI,用来和自建原料库对账。

    目录里的植物原料写成「GLYCYRRHIZA GLABRA (LICORICE) ROOT EXTRACT」,
    我们库里写的是「Glycyrrhiza Glabra Root Extract」—— 括号里那段俗名让精确匹配掉了 22 条。
    去括号、去标点、大写之后 93 条能对上 88 条。
    这一列写进库,页面才不用在 SQLite 里做正则(它没有正则)。
    """
    x = re.sub(r"[（(][^）)]*[）)]", " ", (x or "").upper())
    return re.sub(r"[^A-Z0-9]+", " ", x).strip()


def parse_all(txt: str) -> list:
    txt = txt[txt.find("00001"):]
    parts = re.split(r"(?m)^\s*(\d{5})\s", txt)
    rows = [parse_one(parts[i], parts[i + 1]) for i in range(1, len(parts) - 1, 2)]
    for r in rows:
        r["key"] = inci_key(r["inci"])
    return rows


def report(rows: list) -> float:
    no_inci = [r for r in rows if not r["inci"]]
    zh_in_inci = [r for r in rows if CJK.search(r["inci"] or "")]
    no_zh = [r for r in rows if not r["zh"]]
    dup = len(rows) - len({r["no"] for r in rows})
    # 真正的解析错 = INCI 漏进了中文名(中文名尾巴挂着一长串大写字母)。
    # 「没有 INCI」不算错:目录里麦饭石、五灵脂、菜籽油这些本来就没有 INCI 名。
    # 要求尾巴上有连续 4 个以上字母才算 INCI 泄漏 ——
    # 着色剂的中文名本来就长「CI 10020」这样,按「大写+数字」判会把它们全冤枉进来。
    leaked = [r for r in rows if re.search(r"[A-Z]{4,}[A-Z0-9 ,\-()/.]*$", r["zh"] or "")]
    bad = {r["no"] for r in zh_in_inci} | {r["no"] for r in no_zh} | {r["no"] for r in leaked}
    print(f"  INCI 漏进中文名 {len(leaked)}")
    rate = len(bad) / max(1, len(rows))
    print(f"解析 {len(rows)} 条(目录共 8,972 条)")
    print(f"  INCI 缺失 {len(no_inci)} · INCI 混中文 {len(zh_in_inci)} · 中文名缺失 {len(no_zh)} · 重号 {dup}")
    print(f"  异常率 {rate:.2%}")
    has_use = sum(1 for r in rows if r["rinse"] or r["leave"])
    print(f"  带最高历史使用量 {has_use} 条({has_use / max(1, len(rows)):.0%})")
    for r in [x for x in rows if x["no"] in bad][:5]:
        print(f"    异常样本 {r['no']} zh={r['zh'][:30]!r} inci={r['inci'][:30]!r}")
    return rate


def apply(rows: list) -> None:
    sql = os.path.join(HERE, "_nmpa-catalog.sql")
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(
            "CREATE TABLE IF NOT EXISTS inci_catalog ("
            "no TEXT PRIMARY KEY, name_zh TEXT, inci TEXT,"
            " alias TEXT, inci_key TEXT, max_rinse TEXT, max_leave TEXT, note TEXT,"
            " source TEXT, updated_at TEXT);\n")
        fh.write("CREATE INDEX IF NOT EXISTS idx_inci_catalog_inci ON inci_catalog(inci);\n")
        cols = "no,name_zh,inci,alias,inci_key,max_rinse,max_leave,note,source,updated_at"
        upd = ",".join(f"{c}=excluded.{c}" for c in cols.split(",") if c != "no")
        for i in range(0, len(rows), 40):
            vals = ",".join(
                "(" + ",".join([q(r["no"]), q(r["zh"]), q(r["inci"]), q(r["alias"]), q(r["key"]), q(r["rinse"]),
                                q(r["leave"]), q(r["note"]), q(SRC_NOTE), "datetime('now')"]) + ")"
                for r in rows[i:i + 40])
            fh.write(f"INSERT INTO inci_catalog ({cols}) VALUES {vals} "
                     f"ON CONFLICT(no) DO UPDATE SET {upd};\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")
    n = d1("SELECT COUNT(*) n FROM inci_catalog")
    print(f"完成:inci_catalog 共 {n[0]['n'] if n else '?'} 条")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    rows = parse_all(fetch())
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(json.dumps(rows, ensure_ascii=False))
    rate = report(rows)
    if not a.apply:
        return
    if rate > 0.01:
        print("异常率超过 1%,不写库。先修解析再来 —— 脏数据进了库就分不清是解析错还是目录本来如此。")
        sys.exit(1)
    apply(rows)


if __name__ == "__main__":
    main()

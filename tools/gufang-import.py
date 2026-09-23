#!/usr/bin/env python3
"""把创始人导出的古方候选集导入知识图谱。

数据来源(创始人 2026-09-10 09:4x 导出到本机):
    F:/0book/数据导出/古方_2026-09-10/
      · 化妆品候选_外用美容方_无禁用成分.jsonl      706 条
      · 化妆品候选_含铅汞砒等禁用成分_仅供研究.jsonl  441 条(汞 133 / 铅 86 / 砷 61 / 其他 322)
    每条带:方名 · 出处典籍 · 卷 · 用途分类 · 外用/内服标记 · 组成 · 古籍原文引文。

**不转录剂量与原文,这条不是洁癖:**
原文里写的是「皂角一斤、升麻二兩六錢」。把它原样搬上化妆品工厂的官网,等于以工厂名义
发布方剂用量 —— 那是诊疗行为,不是我们的资质范围。所以只入库:
方名、出处、用途分类、**去掉分量的药味**,再加一句「原文见《X》,本站不转录剂量与煎服法」。
要看原文的人应该去查那本书,这也更诚实。

**含禁用成分那 441 条照样入库,但必须显式标红。**
古代美白方大半含铅粉、水银 —— 不收录,客户拿着古书来问的时候我们答不上;
收录而不标,更糟。所以单独一类 `含禁用组分 · 仅供研究`,每条挂一条到
《化妆品安全技术规范》的超边,写明「不得用于化妆品」。

用法:
    python tools/gufang-import.py            体检
    python tools/gufang-import.py --apply    写库
    python tools/gufang-import.py --limit 50 --apply   先小批验
"""
import argparse
import glob
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r"F:/0book/数据导出/古方_2026-09-10"
CLEAN = "化妆品候选_外用美容方_无禁用成分.jsonl"
TOXIC = "化妆品候选_含铅汞砒等禁用成分_仅供研究.jsonl"

# 组成串里的分量表达。**先切分,再逐段砍掉分量** —— 直接全局删数字会把「三七」「七白」砍坏。
QTY = re.compile(
    r"(各)?[一二三四五六七八九十百千零〇兩两半0-9]+"
    r"[分錢钱兩两斤合升斗枚個个字銖铢片枝條条根撮盞盏碗匙錠锭丸粒團团塊块寸尺][^、,,]*$")
NOISE = re.compile(r"^(一方|又方|共|右|上|各|等分|加|入|以|凡|每|用|水|煎|為末|为末|研末|細末|细末|同|合|和|末|末子|等)$"
                   r"|^(一方|又方|共为|共為|右件|上件|以水|以酒|以醋|研为|研為)")
SEP = re.compile(r"[、,,;;]|[ 　]{1,}")   # 有的书用顿号,有的用空格分隔药味
BOOKMARK = re.compile(r"^[《〈]?|[》〉]?$")

PURPOSE_NOTE = {
    "洁面沐浴": "古籍记载用于洗面、澡豆、沐浴一类清洁用途。",
    "头发须眉": "古籍记载用于头发、须眉的养护或染乌。",
    "齿": "古籍记载用于揩齿、固齿一类口腔用途。",
    "瘢痕疣痣": "古籍记载用于瘢痕、疣痣的外治。",
    "美白祛斑": "古籍记载用于面上䵟𪒟、黑斑一类。",
    "唇口": "古籍记载用于唇口皲裂、口脂一类。",
    "润肤悦泽": "古籍记载用于润泽肌肤。",
    "手足皴裂": "古籍记载用于手足皴裂。",
    "体气香身": "古籍记载用于香身、除体气。",
    "痤疮粉刺": "古籍记载用于痤痱、粉刺一类。",
}
TOX_NOTE = {
    "汞": "含汞类矿物药(水银、轻粉、朱砂等)。汞及其化合物是《化妆品安全技术规范》禁用组分。",
    "铅": "含铅类矿物药(铅粉、密陀僧、黄丹等)。铅及其化合物是禁用组分。",
    "砷": "含砷类矿物药(雄黄、砒石等)。砷及其化合物是禁用组分。",
    "其他": "含其他需要复核的矿物或毒性药材,复刻前必须逐味核对现行禁用与限用清单。",
}


def herbs(comp: str) -> list:
    """从组成串里取药味,**丢掉全部分量**。"""
    out = []
    for seg in SEP.split(str(comp or "")):
        seg = seg.strip()
        if not seg:
            continue
        seg = QTY.sub("", seg).strip()
        seg = re.sub(r"[（(][^）)]*[）)]", "", seg).strip()
        # 「用桑根白皮切」这类:去掉动词前缀与炮制后缀,留药名本身
        seg = re.sub(r"^(用|以|取|入|加|各|同)", "", seg).strip()
        seg = re.sub(r"(切|细切|細切|去皮|去核|炒|焙|炙|研|末|为末|為末|少许|少許)$", "", seg).strip()
        if not seg or NOISE.match(seg):
            continue
        if not re.match(r"^[\u4e00-\u9fff]{1,7}$", seg):
            continue
        if seg not in out:
            out.append(seg)
    return out[:24]


def load(fn: str) -> list:
    p = os.path.join(SRC, fn)
    if not os.path.exists(p):
        return []
    return [json.loads(l) for l in io.open(p, encoding="utf-8") if l.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    clean, toxic = load(CLEAN), load(TOXIC)
    if a.limit:
        clean, toxic = clean[:a.limit], toxic[:a.limit]
    print(f"外用美容方(无禁用成分) {len(clean)} 条 · 含禁用组分(仅供研究) {len(toxic)} 条")

    hcount = [len(herbs(r.get("composition"))) for r in clean if r.get("composition")]
    print(f"  药味解析:平均 {sum(hcount)/max(1,len(hcount)):.1f} 味 · 解析不出药味的 "
          f"{sum(1 for x in hcount if x == 0)} 条")
    for r in clean[:4]:
        print(f"    {r['name']}《{r['book']}》{list((r.get('purposes') or {}).keys())} -> "
              f"{'、'.join(herbs(r.get('composition'))[:8])}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    have = {r["name"]: int(r["id"]) for r in d1("SELECT id, name FROM kg_nodes")}
    nid = int(d1("SELECT COALESCE(MAX(id),0) m FROM kg_nodes WHERE id < 100000")[0]["m"])
    eid = int(d1("SELECT COALESCE(MAX(id),0) m FROM kg_edges WHERE id < 100000")[0]["m"])
    q = lambda v: "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731

    newn, erows, links = [], [], []

    def ensure(name, typ, desc):
        nonlocal nid
        name = name.strip()
        if not name:
            return None
        if name in have:
            return have[name]
        nid += 1
        have[name] = nid
        newn.append(f"({nid},{q(name)},{q(typ)},{q(desc[:400])},'classic')")
        return nid

    ensure("《化妆品安全技术规范》", "法规", "中国现行化妆品禁用与限用组分的依据文本。")
    for p, note in PURPOSE_NOTE.items():
        ensure(p, "古方用途", note)

    def add(rows, banned: bool):
        nonlocal eid
        for r in rows:
            nm, bk = str(r.get("name") or "").strip(), str(r.get("book") or "").strip()
            if not nm:
                continue
            key = nm if nm not in have else f"{nm}《{bk}》"
            ps = list((r.get("purposes") or {}).keys())
            hs = herbs(r.get("composition"))
            if not hs:
                continue
            tox = list((r.get("toxic") or {}).keys())
            desc = (f"《{bk}》{('卷' + str(r.get('vol'))) if r.get('vol') else ''}所载。"
                    + ("；".join(PURPOSE_NOTE.get(x, x) for x in ps[:3]))
                    + ("【含禁用组分,仅供研究,不得用于化妆品:" + "、".join(tox) + "】" if banned else "")
                    + " 本站只列药味,不转录剂量与煎服法;原文见该书。")
            fid = ensure(key, "古方(含禁用组分)" if banned else "古方", desc)
            bid = ensure(f"《{bk}》" if bk else "", "典籍", f"古籍。收录本站候选古方若干。") if bk else None
            ids = [fid] + ([bid] if bid else [])
            for h in hs:
                hid = ensure(h, "药材", "古方组成药味。")
                if hid:
                    ids.append(hid)
            for p in ps:
                if p in have:
                    ids.append(have[p])
            ids = list(dict.fromkeys([x for x in ids if x]))
            if len(ids) < 2:
                continue
            eid += 1
            erows.append(f"({eid},{q(key + ' · 组成与用途')},"
                         f"{q('古方组成(含禁用组分)' if banned else '古方组成')},"
                         f"{q(desc)},{len(ids)},'classic')")
            for x in ids:
                links.append(f"({eid},{x})")
            if banned:
                bids = [fid, have["《化妆品安全技术规范》"]]
                eid += 1
                erows.append(f"({eid},{q(key + ' · 复刻前必须处理的组分')},{q('化妆品禁用组分')},"
                             f"{q('；'.join(TOX_NOTE.get(t, t) for t in tox) or '含需复核的矿物药。')},"
                             f"{len(bids)},'classic')")
                for x in bids:
                    links.append(f"({eid},{x})")

    add(clean, False)
    add(toxic, True)

    lines = []
    for i in range(0, len(newn), 30):
        lines.append("INSERT OR IGNORE INTO kg_nodes (id,name,type,description,origin) VALUES "
                     + ",".join(newn[i:i + 30]) + ";")
    for i in range(0, len(erows), 30):
        lines.append("INSERT OR IGNORE INTO kg_edges (id,name,type,description,arity,origin) VALUES "
                     + ",".join(erows[i:i + 30]) + ";")
    for i in range(0, len(links), 200):
        lines.append("INSERT OR IGNORE INTO kg_edge_nodes (edge_id,node_id) VALUES "
                     + ",".join(links[i:i + 200]) + ";")

    print(f"  新节点 {len(newn)} · 新超边 {len(erows)} · 参与者 {len(links)} · 语句 {len(lines)}")
    # 大文件切片灌 —— 一次几 MB 的 SQL 会把 wrangler 卡到超时
    for old in glob.glob(os.path.join(HERE, "_gufang-import-*.sql")):
        os.remove(old)
    total, part, buf = 0, 0, []
    for ln in lines:
        buf.append(ln)
        if sum(len(x) for x in buf) > 600_000:
            part += 1
            f = os.path.join(HERE, f"_gufang-import-{part:02d}.sql")
            io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
            total += d1_exec(f)
            print(f"    片 {part}: {os.path.getsize(f):,} 字节,累计写入 {total:,} 行", flush=True)
            buf = []
    if buf:
        part += 1
        f = os.path.join(HERE, f"_gufang-import-{part:02d}.sql")
        io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n")
        total += d1_exec(f)
        print(f"    片 {part}: {os.path.getsize(f):,} 字节,累计写入 {total:,} 行", flush=True)
    for t in ("kg_nodes", "kg_edges", "kg_edge_nodes"):
        r = d1(f"SELECT COUNT(*) n FROM {t}")
        print(f"  {t}: {r[0]['n'] if r else '?'}")


if __name__ == "__main__":
    main()

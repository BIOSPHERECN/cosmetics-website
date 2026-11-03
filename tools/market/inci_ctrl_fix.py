"""公司库 market_product_inci 控制字符键还原(W0,2026-09-24)。
由来:inci_index.py 第 48 行替换串被写文件工具把反斜杠 1 转成了 0x01,位号逗号前那个数字被吃掉
(`1,2-HEXANEDIOL` → `<0x01>,2-HEXANEDIOL`,`2,3-BUTANEDIOL` 也成了同一个坏键)。0x01 不能一律还原成 1,
所以按 market_products.inci 原文、用修好的 split_inci/fact_key 逐行重算(先用「坏函数」复算核对与库里一致才采用)。
原文自带的控制字符:0x02/0x1a(替代符,原是连字符)→ '-',其余删除,再压空白。
    python tools/market/inci_ctrl_fix.py            dry run(只读)
    python tools/market/inci_ctrl_fix.py --apply    按主键 UPDATE,旧键先备份到 助手交付/W0-备份-20260924/
幂等:库里没有控制字符键就什么也不做。inci_index.py 还有进程在跑的话,它结束后再跑一次本脚本。"""
import io, json, os, re, sys, time, importlib.util
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from _bohui import d1, d1_exec  # noqa: E402
_sp = importlib.util.spec_from_file_location("ii", os.path.join(HERE, "inci_index.py"))
ii = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(ii)
BAK = "F:/0cosmetic/助手交付/W0-备份-20260924"
COND = " OR ".join(f"instr(inci_key,char({i}))>0" for i in range(1, 32))
LOC = re.compile(r"(\d)\s*,\s*(?=\d)")


def clean(k):
    k = re.sub(r"[\x02\x1a]", "-", k)
    k = re.sub(r"[\t\n\r]", " ", k)
    k = re.sub(r"[\x00-\x1f]", "", k)
    return re.sub(r"^[\s.]+|[\s.]+$", "", re.sub(r"\s+", " ", k))


def _pre(name):
    s = ii._DIRTY.sub(" ", ii._INVIS.sub("", ii.PAREN.sub(" ", name).upper()))
    return re.sub(r"^[\s.]+|[\s.]+$", "", re.sub(r"\s+", " ", s))


def fk_bug(name): return LOC.sub(chr(1) + ",", _pre(name))   # 复现当时的坏函数,只用来核对


def R(sql):
    for _ in range(5):
        r = d1(sql)
        if r: return r
        time.sleep(15)
    raise SystemExit("查询连续为空,停:" + sql[:100])


def plan():
    rows, lp, ls = [], -1, -1
    while True:
        part = d1(f"SELECT product_id p, seq s, inci_key k FROM market_product_inci WHERE ({COND}) AND (product_id > {lp} OR (product_id = {lp} AND seq > {ls})) ORDER BY product_id, seq LIMIT 2000")
        rows += part
        if len(part) < 2000: break
        lp, ls = part[-1]["p"], part[-1]["s"]
    pids = sorted({r["p"] for r in rows}); raw = {}
    for i in range(0, len(pids), 150):
        for x in R(f"SELECT id, inci FROM market_products WHERE id IN ({','.join(map(str, pids[i:i + 150]))})"): raw[x["id"]] = x["inci"]
    out, fallback = [], 0
    for r in rows:
        parts = ii.split_inci(raw.get(r["p"]) or "")
        name = parts[r["s"] - 1] if 0 < r["s"] <= len(parts) else None
        if name is not None and fk_bug(name) == r["k"]: new = clean(ii.fact_key(name))
        elif chr(1) not in r["k"]: new = clean(r["k"])
        else: new = clean(r["k"].replace(chr(1), "1")); fallback += 1
        out.append((r["p"], r["s"], r["k"], new))
    return out, fallback


def main():
    apply = "--apply" in sys.argv
    rows, fb = plan()
    print(f"控制字符键 {len(rows)} 行 · 原文核对不上按 1 兜底 {fb} 行 · 修后仍含控制字符 {sum(1 for *_, n in rows if re.search(r'[\x00-\x1f]', n))}")
    for p, s, o, n in rows[:5]: print("  ", p, s, repr(o), "→", n)
    if not rows or not apply:
        # W0 验收补:d1() 解析失败也返回 [],空结果必须用带重试的 COUNT 复查,别把查询失败当成「已修完」
        print("dry run,加 --apply 才写库" if rows else f"库里已无控制字符键(COUNT 复查 {R(f'SELECT COUNT(*) n FROM market_product_inci WHERE {COND}')[0]['n']})"); return
    os.makedirs(BAK, exist_ok=True)
    bak = os.path.join(BAK, f"market_product_inci_旧键_{time.strftime('%H%M%S')}.json")
    json.dump(rows, io.open(bak, "w", encoding="utf-8"), ensure_ascii=False)
    print("旧键已备份", bak)
    q = lambda v: "'" + v.replace("'", "''") + "'"  # noqa: E731
    stm = [f"UPDATE market_product_inci SET inci_key={q(n)} WHERE product_id={p} AND seq={s};" for p, s, o, n in rows]
    tmp = os.path.join(HERE, "_ctrlfix.sql"); done = 0
    for i in range(0, len(stm), 500):
        io.open(tmp, "w", encoding="utf-8", newline="\n").write("\n".join(stm[i:i + 500]) + "\n")
        for t in range(3):
            w = d1_exec(tmp)
            if w: done += w; break
            time.sleep(90)
        else: raise SystemExit(f"第 {i // 500 + 1} 批连败 3 次,停(已写 {done})")
        print(f"  {min(i + 500, len(stm))}/{len(stm)} 写入 {done}", flush=True)
        time.sleep(10)
    os.remove(tmp)
    print("剩余控制字符键", R(f"SELECT COUNT(*) n FROM market_product_inci WHERE {COND}")[0]["n"])


if __name__ == "__main__":
    assert clean("C12\x1a16 ALCOHOLS") == "C12-16 ALCOHOLS" and clean("\x03DISODIUM EDTA") == "DISODIUM EDTA" and clean("EAU\x1b") == "EAU"
    assert fk_bug("2,3-Butanediol") == chr(1) + ",3-BUTANEDIOL" and ii.fact_key("2, 3-Butanediol") == "2,3-BUTANEDIOL"
    main()

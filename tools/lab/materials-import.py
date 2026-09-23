# -*- coding: utf-8 -*-
"""原料库导入器(2026-09-18 创始人:「晚点资料就会导入」·列名未知,按表头猜列并让人核对)。

用法:
  python tools/lab/materials-import.py <xlsx|csv> [--sheet 名]        只打印 列映射 + 前 5 行 + 无法映射的列,让人核对
  python tools/lab/materials-import.py <xlsx|csv> [--sheet 名] --apply  生成 tools/_materials_N.sql 并 d1_exec(每 200 行一个文件)
  MAT_SELFTEST=1 python tools/lab/materials-import.py x                 解析函数自检

合并规则:code 非空按 code 更新;否则按 name_zh+inci 更新;其余插入。价格只认表里的数,不编(创始人 09-17)。
"""
import argparse, csv, io, os, re, sys, datetime
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _bohui import d1, d1_exec, _q, ROOT  # noqa: E402

# 表头模糊映射:顺序即优先级,一个字段只认第一列(「中文名」要先于「名称」,「INCI」要先于「英文名」)
HEADERS = [
    ("code",        ["物料编码", "物料代码", "原料编码", "编码", "代码", "code"]),
    ("inci",        ["inci", "成分", "英文名", "英文"]),
    ("name_zh",     ["原料名", "中文名", "名称", "原料", "品名"]),
    ("supplier",    ["供应商", "厂家", "生产商", "supplier"]),
    ("origin",      ["产地", "origin"]),   # 与页面 GUESS 对齐(契约对齐审 09-18)
    ("trade_name",  ["牌号", "商品名", "型号", "trade"]),
    ("price",       ["单价", "价格", "元/kg", "报价", "price"]),
    ("use_range",   ["用量", "添加量", "范围", "推荐", "use"]),
    ("cas",         ["cas"]),
    ("function_zh", ["功能", "用途", "功效", "function"]),
    ("moq",         ["起订", "moq", "最小"]),
    ("lead_days",   ["交期", "货期", "lead"]),
    ("price_at",    ["报价日期", "日期", "date"]),
    ("note",        ["备注", "说明", "note", "remark"]),
]
NUM = re.compile(r"\d+(?:\.\d+)?")


def map_headers(headers):
    """返回 {列序号: 字段};没命中的列列入「无法映射」"""
    used, out = set(), {}
    for i, h in enumerate(headers):
        hl = str(h or "").strip().lower()
        if not hl:
            continue
        for field, keys in HEADERS:
            if field in used:
                continue
            if any(k in hl for k in keys):
                out[i] = field
                used.add(field)
                break
    return out


def parse_range(s):
    """「1-5%」「0.5~2」「0.1–2%(…)」→ (0.1, 2);单个数 → (x, x);没数 → (None, None)。括号里的口径说明不参与"""
    s = re.split(r"[（(]", str(s or ""), 1)[0]
    ns = [float(x) for x in NUM.findall(s)][:2]
    if not ns:
        return None, None
    return (ns[0], ns[-1]) if len(ns) == 2 else (ns[0], ns[0])


def parse_price(s):
    """去掉 ¥/元/kg/斜杠,纯数字;元/g 换算 ×1000 并返回 note 提示。不是数 → (None, None)"""
    raw = str(s or "").strip()
    if not raw:
        return None, None
    per_g = bool(re.search(r"/\s*g\b|元/克|每克", raw, re.I)) and not re.search(r"kg|公斤|千克", raw, re.I)
    m = NUM.search(raw.replace(",", ""))
    if not m:
        return None, None
    v = float(m.group())
    return (v * 1000, "原单位 元/g") if per_g else (v, None)


def inci_key(s):
    """与 lib/decoder.ts factKey 同口径:取第一个成分(逗号前),去括号,大写,空白压一格,去首尾句点"""
    s = re.split(r"[,，]", str(s or ""), 1)[0]
    s = re.sub(r"[（(][^）)]*[）)]", " ", s.upper())
    return re.sub(r"\s+", " ", s).strip(" .")


def read_table(path, sheet=None):
    if path.lower().endswith(".csv"):
        with open(path, encoding="utf-8-sig", newline="") as f:
            rows = [r for r in csv.reader(f)]
    else:
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb[sheet] if sheet else wb.worksheets[0]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    rows = [r for r in rows if any(str(c or "").strip() for c in r)]
    return rows[0], rows[1:]


def to_record(row, mapping):
    """一行表格 → lab_materials 字段 dict(只含表里给了值的字段)"""
    rec, notes = {}, []
    for i, field in mapping.items():
        raw = row[i] if i < len(row) else None
        v = "" if raw is None else str(raw).strip()
        if not v:
            continue
        if field == "use_range":
            lo, hi = parse_range(v)
            if lo is not None:
                rec["use_min"], rec["use_max"] = lo, hi
        elif field == "price":
            p, n = parse_price(v)
            if p is not None:
                rec["price"] = p
            if n:
                notes.append(n)
        elif field == "lead_days":
            m = NUM.search(v)
            if m:
                rec["lead_days"] = int(float(m.group()))
        elif field == "price_at":
            rec["price_at"] = v[:10] if isinstance(raw, datetime.date) or re.match(r"\d{4}-\d{2}-\d{2}", v) else v
        else:
            rec[field] = v
    if notes:
        rec["note"] = "; ".join(([rec["note"]] if rec.get("note") else []) + notes)
    if "inci" in rec:
        rec["inci_key"] = inci_key(rec["inci"])
    return rec


def existing_index():
    """整表 (id, code, name_zh, inci) —— 按 rowid 分页,d1() 大结果会静默返回 []"""
    out, last = [], 0
    while True:
        rs = d1(f"SELECT rowid rid, id, code, name_zh, inci FROM lab_materials WHERE rowid>{last} ORDER BY rowid LIMIT 500")
        if not rs:
            break
        out += rs
        last = rs[-1]["rid"]
    by_code = {r["code"]: r["id"] for r in out if r["code"]}
    by_name = {(r["name_zh"], (r["inci"] or "").upper()): r["id"] for r in out}
    return by_code, by_name


def build_sql(records, who):
    """返回 (语句列表, 新增, 更新, 跳过)。SQLite 无唯一键,先查存在与否再分 UPDATE / INSERT"""
    by_code, by_name = existing_index()
    stmts, ins, upd, skip = [], 0, 0, 0
    for rec in records:
        if not rec.get("name_zh") or not rec.get("inci"):
            skip += 1
            continue
        rec["updated_by"] = who
        hit = by_code.get(rec.get("code")) if rec.get("code") else None
        if hit is None:
            hit = by_name.get((rec["name_zh"], rec["inci"].upper()))
        if hit and hit > 0:
            sets = ", ".join(f"{k}={_q(v)}" for k, v in rec.items())
            stmts.append(f"UPDATE lab_materials SET {sets}, updated_at=CURRENT_TIMESTAMP WHERE id={int(hit)};")
            upd += 1
        elif hit == -1:
            skip += 1   # 同一张表里重复行
        else:
            stmts.append(f"INSERT INTO lab_materials ({', '.join(rec)}) VALUES ({', '.join(_q(v) for v in rec.values())});")
            ins += 1
            by_name[(rec["name_zh"], rec["inci"].upper())] = -1
            if rec.get("code"):
                by_code[rec["code"]] = -1
    return stmts, ins, upd, skip


def apply(stmts, tag):
    """每 200 行一个 tools/_materials_<tag>_N.sql,d1_exec;返回写入行数合计"""
    total = 0
    for n, i in enumerate(range(0, len(stmts), 200), 1):
        path = os.path.join(ROOT, "tools", f"_materials_{tag}_{n}.sql")
        with io.open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(stmts[i:i + 200]) + "\n")
        w = d1_exec(path)
        total += w
        print(f"  {os.path.basename(path)}: {len(stmts[i:i + 200])} 句 → 写入 {w}")
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--sheet")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    headers, rows = read_table(a.path, a.sheet)
    mapping = map_headers(headers)
    print("列映射:")
    for i, h in enumerate(headers):
        print(f"  [{i}] {str(h):<14} → {mapping.get(i, '(无法映射,忽略)')}")
    miss = [k for k in ("name_zh", "inci") if k not in mapping.values()]
    if miss:
        print(f"缺必填列 {miss}:原料名 / INCI 必须有,改表头后再来")
        sys.exit(2)
    records = [to_record(r, mapping) for r in rows]
    print(f"\n共 {len(rows)} 行,前 5 行解析结果:")
    for rec in records[:5]:
        print("  ", rec)
    if not a.apply:
        print("\n核对无误后加 --apply 写库")
        return
    tag = datetime.datetime.now().strftime("%m%d%H%M")
    stmts, ins, upd, skip = build_sql(records, f"import:{os.path.basename(a.path)}")
    print(f"\n计划:新增 {ins} / 更新 {upd} / 跳过 {skip}(缺原料名或 INCI / 表内重复)")
    if stmts:
        print("写入合计:", apply(stmts, tag))


if __name__ == "__main__":
    if os.environ.get("MAT_SELFTEST"):   # ponytail: 最小自检,解析逻辑坏了这里先红
        assert parse_range("1-5%") == (1.0, 5.0) and parse_range("0.5~2") == (0.5, 2.0)
        assert parse_range("0.05%(口径)") == (0.05, 0.05) and parse_range("") == (None, None)
        assert parse_price("¥120/kg") == (120.0, None) and parse_price("0.8元/g") == (800.0, "原单位 元/g") and parse_price("面议") == (None, None)
        assert inci_key("Aqua (Water), Glycerin") == "AQUA"
        assert map_headers(["原料名", "INCI", "单价(元/kg)", "颜色"]) == {0: "name_zh", 1: "inci", 2: "price"}
        print("selftest ok")
        sys.exit(0)
    main()

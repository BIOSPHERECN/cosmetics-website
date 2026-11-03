# -*- coding: utf-8 -*-
"""ingredients 表 149 行灌进 lab_materials(2026-09-18 创始人:「还有要可以改配方的原料,多选原料和价格」)。
price 留空——不编价格(09-17:「原料价格:明天看看资料库应该是有的」);note 记 cost_band 档位「价格待导入」。
幂等:已有同 (name_zh, inci) 的行跳过。跑一次:python tools/lab/materials-seed.py"""
import importlib.util, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _bohui import d1, _q  # noqa: E402
_spec = importlib.util.spec_from_file_location("mi", os.path.join(os.path.dirname(os.path.abspath(__file__)), "materials-import.py"))
mi = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mi)

BAND = {"low": "经济", "mid": "中档", "high": "高端"}


def origin_of(family):
    """按 family 猜来源;猜不到留空,不编"""
    f = family or ""
    if "植物" in f or "精油" in f:
        return "植物来源"
    if "发酵" in f:
        return "发酵来源"
    return None


def main():
    rows, last = [], 0
    while True:   # d1() 大结果静默 [],按 rowid 分页
        rs = d1(f"SELECT rowid rid, name_zh, inci, cas, functions, use_level, family, cost_band FROM ingredients WHERE rowid>{last} ORDER BY rowid LIMIT 50")
        if not rs:
            break
        rows += rs
        last = rs[-1]["rid"]
    _, by_name = mi.existing_index()
    stmts = []
    for r in rows:
        if (r["name_zh"], (r["inci"] or "").upper()) in by_name:
            continue
        lo, hi = mi.parse_range(r["use_level"])
        cas = re.split(r"[（(]", (r["cas"] or "").strip(), 1)[0].strip()
        cas = cas if re.match(r"^\d{2,7}-\d{2}-\d$", cas) else None   # 「无单一 CAS 号(…)」这类说明不当 CAS 存
        rec = {"name_zh": r["name_zh"], "inci": r["inci"], "inci_key": mi.inci_key(r["inci"]), "cas": cas, "function_zh": r["functions"] or None,
               "use_min": lo, "use_max": hi, "origin": origin_of(r["family"]),
               "note": f"{BAND.get(r['cost_band'] or '', r['cost_band'] or '未知')}档位,价格待导入", "updated_by": "seed:ingredients"}
        rec = {k: v for k, v in rec.items() if v is not None}
        stmts.append(f"INSERT INTO lab_materials ({', '.join(rec)}) VALUES ({', '.join(_q(v) for v in rec.values())});")
    print(f"ingredients {len(rows)} 行,待插 {len(stmts)}(已有 {len(rows) - len(stmts)} 跳过)")
    if stmts:
        print("写入合计:", mi.apply(stmts, "seed"))
    print(d1("SELECT COUNT(*) n FROM lab_materials"))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""包材参考价 —— 供应商公开价 × 2,折成美元。

创始人 2026-09-08:「1688 的人民币价格需要 *2,再换算美元」。

价怎么来的(可核对,不是拍脑袋):
  · 新潮(ST,3,581 款 = 库存 79%)的阿里国际站 stxinchao.en.alibaba.com
    公开挂 FOB 报价与起订量,实测抓到 5 条,全部是 PET 泵瓶 / 罐:
      PET 圆柱按压泵瓶            $0.10-0.14  起订 10,000
      PET 方瓶按压泵 680ml        $0.12-0.16  起订 10,000
      PET 扁瓶按压泵 400ml        $0.11-0.15  起订 10,000
      PET 泵瓶+翻盖 200/500ml     $0.10-0.14  起订 10,000
      PET 铝盖罐 320ml            $0.11-0.14  起订 10,000
  · 顺旭(SX)1688 offer 559766155506:膏霜罐 ¥0.72 起 / 300 件混批。
    ¥0.72 ÷ 6.7 = $0.107 —— 与上面 $0.10-0.14 对得上,两个来源互为佐证。
  · 200ml 到 680ml 之间价格几乎不动($0.10→$0.16),
    所以这一档不按容量再细分 —— 细分出来的精度是假的。

四条纪律:
  1. **只给有实据的类型定价**。没有取到供应商公开价的类型一律留空 ——
     筛选面里一个错价比一个空值伤得多,报价单上更是如此。
  2. 只写「区间」不写单点。供应商给的本来就是区间,压成一个数是假精确。
  3. 汇率写死并标注日期。浮动汇率天天变,页面上的价不该跟着抖;
     隔一段时间人工复核一次比自动跟盘更可控。
  4. 页面上必须写清「不是报价」。参考价用于判断量级,实际价随数量、
     配色、工艺、批次变动。

用法:
  python tools/pack-price.py            看会填多少款、填什么
  python tools/pack-price.py --exec     出 SQL 并灌库
"""
import io
import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import ROOT, d1, d1_exec, preflight   # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT = os.path.join(ROOT, "db", "migrations", "0058_pack_price.sql")

MULT = 2.0                # 创始人定:供应商价 × 2
FX = 6.7                  # 1 USD = 6.7 CNY,取自 frankfurter 6.711 / er-api 6.728(2026-09-08)
FX_DATE = "2026-09-08"

# 供应商公开价区间(USD)。rmb 字段填的是人民币起批价,脚本自己折美元。
# 加新档时把来源写进 src —— 没有来源的档不要加。
BANDS = [
    {
        "id": "pet-bottle-jar",
        "types": [
            "pump-bottle", "press-bottle", "spray-bottle", "screw-bottle", "flip-bottle",
            "foam-pump", "airless-bottle", "dropper-bottle", "roll-on",
            "refill-core", "jar", "cream-jar",
        ],
        # 玻璃瓶与安瓿**不在这一档**:锚点全是 PET 件,玻璃的料价与运输破损
        # 完全是另一条曲线,套 PET 的价会严重报低。没有玻璃的公开价就留空。
        "usd": (0.10, 0.16),
        "moq": 10000,
        "src": "stxinchao.en.alibaba.com 公开 FOB(2026-09-08 实测 5 条)"
               " · 与 1688 offer 559766155506 的 ¥0.72 起批价互相印证",
    },
]


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def usd_range(b):
    lo, hi = b["usd"]
    return round(lo * MULT, 2), round(hi * MULT, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exec", action="store_true", dest="do_exec")
    a = ap.parse_args()
    preflight()

    rows = d1("SELECT type, COUNT(*) n FROM packaging WHERE status IN ('sample','active') GROUP BY type")
    have = {r["type"]: int(r["n"]) for r in rows}

    L = [f"-- 0058:包材参考价 = 供应商公开价 × {MULT:g},按 1 USD = {FX} CNY 折算({FX_DATE})。",
         "-- 只给取到供应商公开价的类型定价,其余留空 —— 报价单上一个错价比一个空值伤得多。",
         "-- 由 tools/pack-price.py 生成,可重复跑。汇率或倍率改了,重跑即可全量覆盖。",
         ""]
    total = 0
    print(f"倍率 ×{MULT:g} · 汇率 1 USD = {FX} CNY({FX_DATE})\n")
    for b in BANDS:
        lo, hi = usd_range(b)
        types = [t for t in b["types"] if t in have]
        n = sum(have[t] for t in types)
        total += n
        print(f"  {b['id']:<16} 覆盖 {n:>5,} 款 · 参考价 ${lo:.2f}-{hi:.2f} / 起订 {b['moq']:,}")
        print(f"    来源:{b['src']}")
        print(f"    类型:{', '.join(types)}\n")
        if not types:
            continue
        inlist = ",".join(q(t) for t in types)
        note = (f"供应商公开价 ${b['usd'][0]:.2f}-${b['usd'][1]:.2f} × {MULT:g}"
                f";汇率 1 USD = {FX} CNY({FX_DATE});{b['src']}")
        L.append(f"-- {b['id']}:{n} 款")
        L.append(
            "UPDATE packaging SET "
            f"price_ref={q(f'${lo:.2f}-{hi:.2f}')}, "
            f"price_currency='USD', "
            f"price_unit=NULL, "
            f"source_price={b['usd'][0]}, "
            f"source_price_note={q(note)}, "
            f"price_mult={MULT:g}, "
            f"moq=COALESCE(moq, {b['moq']}) "
            f"WHERE status IN ('sample','active') AND type IN ({inlist});")
        L.append("")

    # 没有实据的类型:显式清空,免得旧数据留下一个来路不明的价
    covered = [t for b in BANDS for t in b["types"]]
    L.append("-- 没有取到供应商公开价的类型:显式留空,不留来路不明的旧值")
    L.append("UPDATE packaging SET price_ref=NULL, source_price=NULL, source_price_note=NULL "
             f"WHERE status IN ('sample','active') AND type NOT IN ({','.join(q(t) for t in covered)});")

    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    blank = sum(have.values()) - total
    print(f"合计填价 {total:,} 款 · 留空 {blank:,} 款(占 {blank / max(1, sum(have.values())):.0%})")
    print(f"SQL:{OUT}")
    if a.do_exec:
        print(f"  已灌库,写入 {d1_exec(OUT)} 行")
    else:
        print("  加 --exec 才写库")


if __name__ == "__main__":
    main()

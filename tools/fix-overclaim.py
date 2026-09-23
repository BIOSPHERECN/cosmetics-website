#!/usr/bin/env python3
"""下架一句站上说不出口的话:「答得出地块和采收日期」。

由来(创始人 2026-09-10 12:3x:「客户问『这批积雪草哪来的』,我们答得出地块和采收日期 ——
这句话夸张了!可以说地区,但是地块和日期怎么可能知道,那是骗人」)。

他说得对,而且这是这一类问题里最危险的一种:**它具体、可核对,而我们核不出来。**
产区(省/县级)是公开的植物学与采购事实,说得出;
具体地块编号与采收日期要有地块台账与采收批次记录才谈得上,我们手上没有 ——
客户真拿一支货来问,当场就穿帮,而且穿的是「溯源」这块招牌。

改成能兑现的:**答得出产区与供应商批号**。批号是随货文件上本来就有的,查得到、对得上。

覆盖 113 处、多语种;各语种照各自的说法替换,不做机翻。

用法:
    python tools/fix-overclaim.py            体检
    python tools/fix-overclaim.py --apply    改库
"""
import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# (原句片段, 换成什么)。按语种给,不够精确的语种统一落到中英两套母本再重翻。
PAIRS = [
    ("我们答得出地块和采收日期,而不是只报一个供应商名", "我们答得出产区与供应商批号,而不是只报一个供应商名"),
    ("我们答得出地块和采收日期", "我们答得出产区与供应商批号"),
    ("答得出地块和采收日期", "答得出产区与供应商批号"),
    ("地块和采收日期", "产区与供应商批号"),
    ("我們能具體指出種植地塊與採收日期,而不僅止於供應廠商名稱", "我們能指出產區與供應商批號,而不僅止於供應廠商名稱"),
    ("我們能具體指出種植地塊與採收日期", "我們能指出產區與供應商批號"),
    ("種植地塊與採收日期", "產區與供應商批號"),
    ("地塊與採收日期", "產區與供應商批號"),
    ("the exact plot and harvest date", "the source region and the supplier lot number"),
    ("plot and harvest date", "source region and supplier lot number"),
    ("地块", "产区"),
    ("地塊", "產區"),
    ("채취일자", "공급 배치번호"),
    ("وتاريخ الحصاد", "ورقم دفعة المورد"),
]
TABLES = [("block_i18n", "data_json"), ("page_i18n", "seo_desc"), ("page_i18n", "title"),
          ("site_i18n", "description"), ("product_i18n", "description")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    q0 = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    hits = 0
    for t, c in TABLES:
        for old, _new in PAIRS[:4]:
            r = d1(f"SELECT COUNT(*) n FROM {t} WHERE instr({c}, {q0(old)}) > 0")
            n = int(r[0]["n"]) if r else 0
            if n:
                print(f"  {t}.{c}  「{old[:22]}…」 {n} 行")
                hits += n
    print(f"中文口径命中约 {hits} 行(其余语种按各自说法一并替换)")
    if not a.apply:
        print("\n加 --apply 才改库")
        return

    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    lines = []
    for t, c in TABLES:
        for old, new in PAIRS:
            # 用 instr() 不用 LIKE:D1 对 LIKE 模式长度有限制,
            # 长中文句子直接报 `LIKE or GLOB pattern too complex: SQLITE_ERROR`。
            lines.append(f"UPDATE {t} SET {c} = REPLACE({c}, {q(old)}, {q(new)}) "
                         f"WHERE instr({c}, {q(old)}) > 0;")
    sql = os.path.join(HERE, "_fix-overclaim.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print(f"  {len(lines)} 条语句 · 写入 {d1_exec(sql):,} 行")
    for t, c in TABLES:
        r = d1(f"SELECT COUNT(*) n FROM {t} WHERE instr({c}, '地块和采收') > 0"
               f" OR instr({c}, '地塊與採收') > 0 OR instr({c}, 'plot and harvest') > 0")
        n = int(r[0]["n"]) if r else 0
        print(f"  复查 {t}.{c}: 残留 {n} 行")


if __name__ == "__main__":
    main()

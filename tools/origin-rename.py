#!/usr/bin/env python3
"""把「种植基地」这一栏正名为「原料溯源」。

由来(创始人 2026-09-10 02:xx):「要基地,而不是一株植物,那太扯了」。
他说得对 —— 这一栏底下挂的是 100 篇**植物原料**档案(玫瑰、人参、积雪草…),
不是帛卉自有的种植地块。用「种植基地」当标题,等于替公司认领了并不存在的资产;
真有基地那是另一件事,得等他给出省/市/县 · 品种 · 面积 · 合作方式 · 认证的真名单
(排在 QUEUE Q3),在那之前一个字都不能编。

所以这里只做一件事:把 18 个语种的 nav_label / title 从「种植基地」改成「原料溯源」,
让标题跟页面里真实存在的内容对上。slug 不动 —— /origin/ 本来就是「溯源」的意思,
改 slug 会把已收录的 100 个地址全变成 404。

用法:
    python tools/origin-rename.py            体检
    python tools/origin-rename.py --apply    写库
"""
import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE_ID = 96

# nav_label(菜单里那一格,要短) / title(页头大标题,可以长一点)
NAMES = {
    "zh-cn": ("原料溯源", "植物原料溯源档案"),
    "zh-tw": ("原料溯源", "植物原料溯源檔案"),
    "en": ("Ingredient Origins", "Botanical Ingredient Origins & Traceability"),
    "jp": ("原料トレーサビリティ", "植物原料のトレーサビリティ資料"),
    "kr": ("원료 이력 추적", "식물 원료 이력 추적 자료"),
    "fr": ("Origine des ingrédients", "Origine et traçabilité des ingrédients végétaux"),
    "de": ("Rohstoff-Herkunft", "Herkunft und Rückverfolgbarkeit pflanzlicher Rohstoffe"),
    "ru": ("Происхождение сырья", "Происхождение и прослеживаемость растительного сырья"),
    "id": ("Asal Bahan Baku", "Asal dan Ketertelusuran Bahan Baku Nabati"),
    "my": ("Asal Bahan Mentah", "Asal dan Kebolehkesanan Bahan Mentah Botani"),
    "th": ("แหล่งที่มาวัตถุดิบ", "แหล่งที่มาและการตรวจสอบย้อนกลับวัตถุดิบจากพืช"),
    "vn": ("Nguồn gốc nguyên liệu", "Nguồn gốc và truy xuất nguyên liệu thực vật"),
    "ph": ("Pinagmulan ng Sangkap", "Pinagmulan at Traceability ng Halamang Sangkap"),
    "es": ("Origen de ingredientes", "Origen y trazabilidad de ingredientes botánicos"),
    "pt": ("Origem dos ingredientes", "Origem e rastreabilidade de ingredientes botânicos"),
    "ar": ("مصدر المكونات", "مصدر المكونات النباتية وإمكانية تتبعها"),
    "tr": ("Hammadde Kökeni", "Bitkisel Hammadde Kökeni ve İzlenebilirlik"),
    "in": ("सामग्री का स्रोत", "वानस्पतिक सामग्री का स्रोत और ट्रेसबिलिटी"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    cur = {r["lang"]: (r["nav_label"], r["title"])
           for r in d1(f"SELECT lang, nav_label, title FROM page_i18n WHERE page_id={PAGE_ID}")}
    miss = [k for k in cur if k not in NAMES]
    print(f"库内 {len(cur)} 语种 · 译名表 {len(NAMES)} 条 · 没覆盖到的: {miss or '无'}")
    for lang, (nav, title) in NAMES.items():
        if lang not in cur:
            print(f"  ! {lang} 库里没有这一行,跳过")
            continue
        print(f"  {lang:<6} {cur[lang][0]}  ->  {nav}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    sql = os.path.join(HERE, "_origin-rename.sql")
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        for lang, (nav, title) in NAMES.items():
            if lang not in cur:
                continue
            # 一条语句一行:wrangler 的 --file 按换行切语句,字符串里带换行会被切断
            fh.write(f"UPDATE page_i18n SET nav_label={q(nav)}, title={q(title)} "
                     f"WHERE page_id={PAGE_ID} AND lang={q(lang)};\n")
    print(f"  SQL {os.path.getsize(sql):,} 字节,写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()

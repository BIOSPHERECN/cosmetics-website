#!/usr/bin/env python3
"""货架体检 —— 把「看起来是空的」条目从前台下架。

创始人 2026-09-08:「各种库,把空余的删除,我们需要保持真实的上架」。

判据只有一条硬的:**卡片上拿不出实拍图的,不算上架**。
采购在货架上第一眼看的是图;一张写着「实拍整理中」的占位卡,
比少一款货更伤 —— 它让人怀疑后面那四千多款是不是也是凑数的。

**下架不是删除**:status 改成 'draft',前台不再出现,后台还看得到,
补上图片改回 'active' 就回来了。真删掉的话,那些手写得很细的规格
(「PP 瓶身+PET 外壳+PP 活塞泵头(无金属弹簧可选)」这种)就没了 ——
这些条目缺的是照片,不是资料。

其余三个维度只报数不动手,因为它们不是同一回事:
  · 材质空:卡片照样有图有容量,是缺一个属性,不是空壳;
  · 类型还是用途桶(use-*):视觉判不出来的那些,是待办不是废品;
  · 容量空:同上。
这三样要不要一起下架,是生意上的判断,我不替你决定 —— 跑一次看数字,你说了算。

用法:
  python tools/shelf-prune.py            只体检,不改任何东西
  python tools/shelf-prune.py --apply    把「无实拍」的下架为 draft
  python tools/shelf-prune.py --restore  把之前下架的改回 active
"""
import io
import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import ROOT, d1, d1_exec, preflight   # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT = os.path.join(ROOT, "db", "migrations", "0059_shelf_prune.sql")
LIVE = "('sample','active')"
NO_IMG = (f"SELECT code FROM packaging p WHERE p.status IN {LIVE} "
          "AND NOT EXISTS(SELECT 1 FROM pack_assets a WHERE a.our_code=p.code AND a.reviewed=1)")


def one(sql, key):
    r = d1(sql)
    return int(r[0][key]) if r else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", action="store_true")
    a = ap.parse_args()
    preflight()

    print("【体检】")
    rows = d1(
        "SELECT "
        f"(SELECT COUNT(*) FROM packaging WHERE status IN {LIVE}) pack, "
        f"(SELECT COUNT(*) FROM ({NO_IMG})) pack_noimg, "
        f"(SELECT COUNT(*) FROM packaging WHERE status IN {LIVE} AND (material IS NULL OR TRIM(material)='')) pack_nomat, "
        f"(SELECT COUNT(*) FROM packaging WHERE status IN {LIVE} AND type LIKE 'use-%') pack_bucket, "
        f"(SELECT COUNT(*) FROM packaging WHERE status IN {LIVE} AND (capacity IS NULL OR TRIM(capacity)='')) pack_nocap, "
        f"(SELECT COUNT(*) FROM packaging WHERE status='draft') pack_draft, "
        f"(SELECT COUNT(*) FROM formulas WHERE status IN {LIVE}) f, "
        f"(SELECT COUNT(*) FROM formulas WHERE status IN {LIVE} AND (actives_json IS NULL OR TRIM(actives_json)='' OR actives_json='[]')) f_bad, "
        "(SELECT COUNT(*) FROM ingredients WHERE status='published') i, "
        "(SELECT COUNT(*) FROM ingredients WHERE status='published' AND (inci IS NULL OR TRIM(inci)='')) i_bad, "
        "(SELECT COUNT(*) FROM products WHERE status='published') pr, "
        "(SELECT COUNT(*) FROM products WHERE status='published' AND cover_media IS NULL) pr_bad")
    if not rows:
        raise SystemExit("查不到,先看上面的 d1 报错")
    n = rows[0]

    def pct(x, of):
        return f"{x / of:.1%}" if of else "—"

    print(f"  包材库  在架 {n['pack']:>5,}  已下架 {n['pack_draft']:,}")
    print(f"    ✗ 无实拍(卡片显示「实拍整理中」) {n['pack_noimg']:>5,}  {pct(n['pack_noimg'], n['pack'])}   ← 只有这一档会被下架")
    print(f"    · 无材质                        {n['pack_nomat']:>5,}  {pct(n['pack_nomat'], n['pack'])}")
    print(f"    · 类型仍是用途桶 use-*          {n['pack_bucket']:>5,}  {pct(n['pack_bucket'], n['pack'])}")
    print(f"    · 无容量                        {n['pack_nocap']:>5,}  {pct(n['pack_nocap'], n['pack'])}")
    print(f"  配方库  在架 {n['f']:>5,}  缺关键成分 {n['f_bad']}")
    print(f"  原料库  在架 {n['i']:>5,}  缺 INCI    {n['i_bad']}")
    print(f"  产品库  在架 {n['pr']:>5,}  缺封面     {n['pr_bad']}")

    if a.restore:
        sql = ("-- 把之前因为缺实拍下架的包材改回在架(补了图之后跑这个)\n"
               "UPDATE packaging SET status='active' WHERE status='draft';\n")
        io.open(OUT, "w", encoding="utf-8", newline="\n").write(sql)
        print(f"\n恢复:写入 {d1_exec(OUT)} 行")
        return

    if not a.apply:
        print("\n只体检,没动任何数据。加 --apply 才把「无实拍」那一档下架为 draft。")
        return

    if not n["pack_noimg"]:
        print("\n没有需要下架的。")
        return

    codes = [r["code"] for r in d1(NO_IMG)]
    q = lambda v: "'" + str(v).replace("'", "''") + "'"
    sql = [
        "-- 0059:把拿不出实拍图的包材下架(status='draft')。",
        "-- 不是删除 —— 这些条目的规格是手写的、很细,缺的只是照片。",
        "-- 补上图之后跑 python tools/shelf-prune.py --restore 就回来了。",
        "",
        f"UPDATE packaging SET status='draft' WHERE code IN ({','.join(q(c) for c in codes)});",
    ]
    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(sql) + "\n")
    print(f"\n下架 {len(codes)} 款:{', '.join(codes[:8])}{' …' if len(codes) > 8 else ''}")
    print(f"  已灌库,写入 {d1_exec(OUT)} 行")
    print("  记得重建快照并发布:python tools/pack-shelf-snapshot.py && python tools/chain-counts.py --write")


if __name__ == "__main__":
    main()

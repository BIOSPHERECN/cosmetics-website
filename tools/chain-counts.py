#!/usr/bin/env python3
"""重算产线链路上那五个计数,并把 chain.ts 里的常量原地改掉。

为什么是常量而不是每页一条 COUNT:
  一个货架页多一条 COUNT 看着不多,乘以四个入口 × 十八个语种,
  就是 2026-09-07 那天把 D1 日读额度打爆的量级。

为什么要这个脚本:
  chain.ts 的注释一直写着「数据变了跑 tools/chain-counts.py」,
  而这个脚本此前**并不存在**。结果是数据变了没人重算 ——
  2026-09-08 实测:页面上「包装盒 92」,库里只有 17。
  链路条是给采购看工序规模的,写一个不存在的数字比不写更糟。

包装盒的口径要和货架的筛选口径一致:
  chain.ts 第 3 步链到 /packaging/?t=use-gift,outer-carton,
  所以这里数的就是 GROUP_OF 里归到 carton 那一组的全部类型。
  两边口径一旦分家,页面上的数字和点进去看到的条数就对不上。

用法:python tools/chain-counts.py          看数字,不改文件
      python tools/chain-counts.py --write  改 chain.ts
"""
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import ROOT, d1, preflight   # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CHAIN_TS = os.path.join(ROOT, "packages", "core", "src", "content", "chain.ts")
CATALOG_TS = os.path.join(ROOT, "apps", "web", "src", "lib", "catalog.ts")


def carton_types():
    """从 catalog.ts 的 GROUP_OF 里读出归到 carton 的类型 ——
       在这里再抄一份,迟早和那边分家。"""
    src = io.open(CATALOG_TS, encoding="utf-8").read()
    m = re.search(r"const GROUP_OF[^=]*=\s*\{(.*?)\n\};", src, re.S)
    if not m:
        raise SystemExit("在 catalog.ts 里找不到 GROUP_OF")
    body = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    return [k.strip().strip("'\"")
            for k, v in re.findall(r"([\w'\"-]+)\s*:\s*'([\w-]+)'", body) if v == "carton"]


def main():
    preflight()
    ct = carton_types()
    if not ct:
        raise SystemExit("GROUP_OF 里没有归到 carton 的类型 —— 先检查 catalog.ts")
    inlist = ",".join("'" + t.replace("'", "''") + "'" for t in ct)
    sql = ("SELECT "
           "(SELECT COUNT(*) FROM packaging WHERE status IN ('sample','active')) packaging, "
           f"(SELECT COUNT(*) FROM packaging WHERE status IN ('sample','active') AND type IN ({inlist})) carton, "
           "(SELECT COUNT(*) FROM formulas WHERE status IN ('sample','active')) formula, "
           "(SELECT COUNT(*) FROM ingredients WHERE status = 'published') ingredient, "
           "(SELECT COUNT(*) FROM products WHERE status = 'published') product")
    # 写成单行 —— wrangler 在 Windows 上走 shell,SQL 里带换行会被截断,
    # 报的是「Missing required option --command」而不是语法错,不容易联想到换行
    rows = d1(sql)
    if not rows:
        raise SystemExit("查不到计数,先看上面的 d1 报错")
    n = rows[0]
    print(f"包装盒口径:{', '.join(ct)}")
    for k in ("packaging", "carton", "formula", "ingredient", "product"):
        print(f"  {k:<11} {n[k]:>6,}")

    src = io.open(CHAIN_TS, encoding="utf-8").read()
    old = re.search(r"export const CHAIN_COUNTS = \{.*?\n\} as const;", src, re.S)
    if not old:
        raise SystemExit("在 chain.ts 里找不到 CHAIN_COUNTS")
    new = ("export const CHAIN_COUNTS = {\n"
           + "".join(f"  {k}: {n[k]},\n" for k in
                     ("packaging", "carton", "formula", "ingredient", "product"))
           + "} as const;")
    if old.group(0) == new:
        print("chain.ts 已经是这些数字,不用改")
        return
    if "--write" not in sys.argv:
        print("\n要改成:\n" + new + "\n\n加 --write 才会写文件")
        return
    io.open(CHAIN_TS, "w", encoding="utf-8", newline="\n").write(
        src[:old.start()] + new + src[old.end():])
    print("\nchain.ts 已更新 —— 记得重新构建发布,否则页面上还是旧数字")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""手机端体检 —— 源码层的回归闸,防止今晚修好的东西被下一次改动悄悄改回去。

由来(2026-09-09,创始人:「整体布局要从更深的层次架构,利于手机端客户的习惯,
要深层吸引客户,而不是展示而展示」)。当晚 375×812 实测首页:

    页头 104px(占屏 12.8%) · 61 个文本节点里 47 个小于 14px
    110 个可点元素里 81 个不到 44px · 总高 9.6 屏

修完:页头 65px · 小于 14px 的 0 个 · 小靶 1 个(无障碍跳转链,本来就隐藏)。

问题是这些数字会漂回去 —— 下一个人写一行 `font-size: 0.75rem` 谁也不会注意。
所以把三条硬规则做成源码 lint,发布前跑一次:

  1. **字号不得低于 14px**。写 `0.75rem` 要包成 `max(0.75rem, 14px)`。
     手机根字号封顶 17px,0.75rem 就是 12.75px —— 能看见,但不想看。
  2. **手机端触控靶不得低于 44px**。Apple 与 WCAG 的下限。
     按不准就点错,点错就退出,而退出在日志里长得跟「没兴趣」一模一样。
  3. **吸顶页头不得超过 72px**。812px 的屏,页头每多 10px 就少一行正文。

这个 lint 只查得了第 1 条(源码里有字面量);2 和 3 要靠浏览器实测,
所以第二段打印的是**实测口径与当日基线**,让人照着量,不是让人凭感觉说「挺好的」。

用法:
    python tools/mobile-lint.py          查全部,有问题退出码 1
    python tools/mobile-lint.py --fix    把过小的字号自动包上 max(..., 14px)
"""
import argparse
import io
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ["packages/core/src", "apps/web/src"]
# 手机端根字号封顶 17px,所以 14/17 = 0.8235rem 是分界。取 0.875rem 留余量。
MIN_REM = 0.875
BARE = re.compile(r"font-size:\s*(0\.\d+)rem\s*;")
MOBILE_BASELINE = {
    "页头高": (65, 72, "px"),
    "小于14px的文本": (0, 0, "个"),
    "小于44px的触控靶": (1, 2, "个"),
    "横向溢出": (0, 0, "处"),
}
PROBE = """在浏览器里按 375×812 打开页面,控制台跑这段:

const H=innerHeight, hdr=document.querySelector('header');
const vis=[...document.querySelectorAll('a,button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});
const small=vis.filter(e=>{const r=e.getBoundingClientRect();return r.height<44||r.width<44});
const tiny=[...document.querySelectorAll('main *')].filter(e=>e.children.length===0&&e.textContent.trim().length>8)
  .map(e=>parseFloat(getComputedStyle(e).fontSize));
({页头高:Math.round(hdr.getBoundingClientRect().height), 总屏:+(document.documentElement.scrollHeight/H).toFixed(1),
  小靶:small.length+'/'+vis.length, 小字:tiny.filter(s=>s<14).length+'/'+tiny.length,
  横向溢出:document.documentElement.scrollWidth>innerWidth})"""


def scan(fix: bool):
    hits = []
    for d in DIRS:
        for dp, _dn, fn in os.walk(os.path.join(ROOT, d)):
            for f in fn:
                if not f.endswith((".astro", ".css")):
                    continue
                p = os.path.join(dp, f)
                s = io.open(p, encoding="utf-8").read()
                out, n = s, 0
                for m in BARE.finditer(s):
                    if float(m.group(1)) < MIN_REM:
                        hits.append((os.path.relpath(p, ROOT), m.group(1)))
                        n += 1
                if fix and n:
                    out = BARE.sub(
                        lambda m: (f"font-size: max({m.group(1)}rem, 14px);"
                                   if float(m.group(1)) < MIN_REM else m.group(0)), s)
                    io.open(p, "w", encoding="utf-8", newline="\n").write(out)
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    a = ap.parse_args()

    hits = scan(a.fix)
    print("① 字号下限(≥14px)")
    if not hits:
        print("   通过:没有裸写的过小字号")
    else:
        by = {}
        for p, v in hits:
            by.setdefault(p, []).append(v)
        print(f"   {'已修' if a.fix else '不通过'}:{len(hits)} 处,分布在 {len(by)} 个文件")
        for p, vs in list(by.items())[:10]:
            print(f"     {p}  {', '.join(sorted(set(vs)))}")
        if not a.fix:
            print("   修法:python tools/mobile-lint.py --fix  (包成 max(Xrem, 14px),版式不变)")

    print("\n② 手机端实测口径(源码查不了,要在浏览器里量)")
    print("   2026-09-09 基线 → 上限:")
    for k, (base, cap, unit) in MOBILE_BASELINE.items():
        print(f"     {k:<16} 当日 {base}{unit}  ·  超过 {cap}{unit} 就算回退")
    print("\n" + PROBE)

    if hits and not a.fix:
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""ali1688-next.js 的离线自检 —— 不碰 1688,本地 chromium 跑五个夹具。

为什么要有它:旧的选择器是 `page.query_selector("text=下一页") or query_selector("[class*='next']")`,
坏在哪只有真的上店铺页才知道,而上店铺页每天只有 8 次额度。把「找下一页」抽成一个 js 文件之后,
这些形态在本地就能判对错,线上那 8 次额度留给真采集。

    python tools/_test-next-selector.py
"""
import io, os, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

NEXT_JS = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ali1688-next.js"), encoding="utf-8").read()
PAGER = '<div class="pagination"><a class="prev">上一页</a><a class="next" id="want">下一页</a></div>'

CASES = [
    # (名字, 页面, 滚动后才找?, 期望命中的 id;None = 期望找不到)
    ("标准分页条", f'<div class="list">货</div>{PAGER}', False, "want"),
    ("容器也含「下一页」三个字", f'<div class="wrap"><div class="list">货</div>{PAGER}</div>', False, "want"),
    ("末页:下一页置灰", '<div class="pagination"><a class="next disabled">下一页</a></div>', False, None),
    ("末页:aria-disabled", '<div class="pagination"><a class="next" aria-disabled="true">下一页</a></div>', False, None),
    ("页眉有个无关的 .next-btn,真分页在底部",
     f'<div class="header"><span class="next-btn">next</span></div><div class="list" style="height:1200px">货</div>{PAGER}', False, "want"),
    ("懒加载:分页条先隐藏", f'<div class="list">货</div><div id="lazy" style="display:none">{PAGER}</div>', True, "want"),
    # 这一条是重点:分页条压根不在 DOM 里,滚到底才插进来。旧代码 goto 完从不滚动,
    # 于是 query_selector 返回 None 直接 break —— 14 家店只收到首屏 30 条,根子多半在这儿。
    ("滚到底才插入分页条",
     '<div class="list" style="height:4000px">货</div>'
     '<script>addEventListener("scroll", () => { if (!document.querySelector(".pagination") && '
     'scrollY > 800) document.body.insertAdjacentHTML("beforeend", \'' + PAGER + '\'); })</script>', "scroll", "want"),
    ("图标按钮:只有一个 ›", '<div class="pagination"><a class="page-next" id="want">›</a></div>', False, "want"),
    ("真的没有下一页", '<div class="list">货</div>', False, None),
]


def run():
    bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        for name, html, lazy, want in CASES:
            pg.set_content(f"<body style='margin:0'>{html}</body>")
            if lazy == "scroll":
                assert pg.evaluate_handle(NEXT_JS).as_element() is None, name + ":滚动前就找到了,夹具写错了"
                for _ in range(3): pg.mouse.wheel(0, 6000); pg.wait_for_timeout(120)   # 和 shop_ids 里滚的次数一致
            elif lazy: pg.evaluate("() => document.getElementById('lazy').style.display = 'block'")
            el = pg.evaluate_handle(NEXT_JS).as_element()
            got = el.get_attribute("id") if el else None
            ok = (got == want) if want else (el is None)
            if not ok: bad += 1
            print(("  ok  " if ok else "  FAIL") + f" {name}:期望 {want!r} 得到 {got!r}")
        b.close()
    print(("全过" if not bad else f"{bad} 条不过"))
    return bad


if __name__ == "__main__":
    sys.exit(1 if run() else 0)

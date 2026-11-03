"""自测:源码/脚本里不许出现 0x00-0x1F 控制字符(制表、换行、回车除外)。
来由:09-2x 有写文件的环节把 "\\b" 解释成退格 0x08,正则 \\b 变成「要求字面退格」,整条规则静默失效。
用法:python tools/check-ctrl-chars.py   → 命中则列出并退出 1
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {"node_modules", ".git", ".astro", ".wrangler", "__pycache__", "旧版"}
EXTS = (".ts", ".tsx", ".js", ".mjs", ".cjs", ".astro", ".py", ".ps1", ".sh")
BAD = re.compile(rb"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def scan():
    hits = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP and not d.startswith("dist")]
        for f in fn:
            if not f.endswith(EXTS):
                continue
            p = os.path.join(dp, f)
            for i, line in enumerate(open(p, "rb").read().split(b"\n"), 1):
                if BAD.search(line):
                    hits.append(f"{os.path.relpath(p, ROOT)}:{i}")
    return hits


def regex_checks():
    # news.ts 英文套话闸门:修前 /\x08(...)/ 永不命中
    src = open(os.path.join(ROOT, "apps/web/src/lib/news.ts"), encoding="utf-8").read()
    ai_en = re.compile(re.search(r"const AI_EN = /(.+?)/;", src).group(1))
    assert ai_en.search("This is a game-changer for brands.")
    assert ai_en.search("Furthermore, the rule applies.")
    assert not ai_en.search("The megaparadigm shift")          # \b 生效:词中不命中
    # _bohui.py key 轮转:429/402/403 换下一把 key
    kpat = re.search(r'if not re\.search\(r"(.+?)", kerr', open(os.path.join(ROOT, "tools/_bohui.py"), encoding="utf-8").read()).group(1)
    assert re.search(kpat, "HTTP Error 429: Too Many Requests", re.I)
    assert not re.search(kpat, "HTTP Error 500: id 14290", re.I)


if __name__ == "__main__":
    regex_checks()
    h = scan()
    for x in h:
        print("控制字符:", x)
    print("ok" if not h else f"{len(h)} 处命中")
    sys.exit(1 if h else 0)

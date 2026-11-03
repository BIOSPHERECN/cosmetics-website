# -*- coding: utf-8 -*-
"""参考效果图 709 张全量反推 → render_prompts(src='reference')。

创始人 2026-09-19 03:5x:「你看看他们为什么那么好,你做的那么简陋呢」—— 差在场景/道具/构图的库太小(12 套模板 + 72 条反推)。
这里把 素材/参考效果图-715张 全部反推入库(跳过已有编号),之后改写提示词时按品类 + 道具关键词检索这张表。
只吸收风格,不出现第三方站名;prompt 里品牌一律 fictional wordmark。
用法:python tools/render/refs-all.py [--dir 目录] [--limit N]
"""
import sys, os, re, io, json, argparse, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, fleet, job
from _look import PROMPT, to_b64
from _bohui import chat
import time as _t

def look(provs, path):
    """逐家问,记下每家的错(原 _look.look 只留最后一家,看不出是 kimi 限流还是 Agnes 超时)"""
    msgs = [{"role": "user", "content": [{"type": "text", "text": PROMPT}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{to_b64(path)}"}}]}]
    errs = []
    for p in provs:
        j, who, err = chat([p], msgs, max_tokens=1500, temperature=0.2, want_json=True)
        if isinstance(j, dict) and j.get("prompt_en"):
            j["by"] = who; return j, ""
        errs.append(f"{p['id']}:{(err or '无 prompt_en')[:60]}")
        _t.sleep(2)
    return None, " | ".join(errs)

CAT_MAP = [  # 模型自由描述 → 我们的品类键;特异词在前(香水/口红/面膜/气垫),通用词在后,免得 perfume 被 jar 抢走
    (r"perfume|fragrance|eau de|香水", "perfume"), (r"lipstick|口红|唇釉|lip gloss|lip balm", "lipstick"), (r"sheet mask|面膜|clay mask", "mask"),
    (r"cushion|compact|powder|气垫|粉饼", "compact"), (r"sachet|pouch|小袋", "sachet"), (r"spray|mist|喷雾", "spray-bottle"),
    (r"dropper|serum|滴管|精华", "dropper-bottle"), (r"pump|按压|乳液瓶|洗发|沐浴|body wash|shampoo", "pump-bottle"),
    (r"\btube\b|软管|洁面|防晒|squeeze", "tube"), (r"\bjar\b|cream jar|面霜|膏霜|罐", "jar"), (r"\bstick\b|棒", "stick"),
]
def cat_of(j):
    text = " ".join(str(j.get(k, "")) for k in ("subject", "prompt_en", "prompt_zh", "scene")).lower()
    for pat, c in CAT_MAP:
        if re.search(pat, text): return c
    return "lifestyle"

def esc(s): return str(s or "").replace("'", "''")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dir", default="F:/0cosmetic/素材/参考效果图-715张"); ap.add_argument("--limit", type=int, default=0); ap.add_argument("--provs", default="sensenova-kimi,agnes-25pro,sensenova-68")
    a = ap.parse_args()
    have = {int(m.group(1)) for r in d1("SELECT sample_img FROM render_prompts WHERE src='reference'") if (m := re.search(r"/(\d+)\.jpg$", r["sample_img"] or ""))}
    files = sorted((f for f in os.listdir(a.dir) if f.lower().endswith(".jpg")), key=lambda f: int(re.sub(r"\D", "", f) or 0))
    todo = [f for f in files if int(re.sub(r"\D", "", f)) not in have]
    if a.limit: todo = todo[: a.limit]
    want = [x.strip() for x in a.provs.split(',') if x.strip()]
    allp = fleet(vision=True); provs = [p for w in want for p in allp if p['id'] == w] or allp   # 指定顺序:kimi 看图快且稳,Agnes 2.5 flash 常超时
    print(f"已有 {len(have)} · 待反推 {len(todo)} · 渠道 {[p['id'] for p in provs]}")
    ok = fail = 0; buf = []
    def flush():
        nonlocal buf
        if not buf: return
        # 走 SQL 文件(d1_exec)而不是 --command:提示词里的双引号 / 反斜杠会把 wrangler 命令行拆坏,批次报 ok 实际一条没进库(09-19 07:0x 教训)
        sql = "INSERT INTO render_prompts (category, scene, prompt_en, prompt_zh, lighting, camera, props, palette, mood, src, sample_img, score) VALUES " + ",".join(buf) + ";" + chr(10)
        tmp = os.path.join(os.environ.get("TEMP", "."), "refs-batch.sql"); io.open(tmp, "w", encoding="utf-8").write(sql)
        n = d1_exec(tmp)
        if not n: print(f"  !! 入库失败(写入 {n} 行),本批 {len(buf)} 条丢弃,下次重跑会自动补")
        buf = []
    with job("render-refs-all", total=len(todo)) as jb:
        for i, f in enumerate(todo, 1):
            path = os.path.join(a.dir, f); n = int(re.sub(r"\D", "", f))
            j, err = look(provs, path)
            if not j: fail += 1; print(f"  ✗ {f}: {err[:200]}"); _t.sleep(15); continue
            _t.sleep(4)
            cat = cat_of(j)
            buf.append("('%s','%s','%s','%s','%s','%s','%s','%s','%s','reference','素材/参考效果图-715张/%s',NULL)" % (
                cat, esc(j.get("scene"))[:300], esc(j.get("prompt_en"))[:1500], esc(j.get("prompt_zh"))[:1500], esc(j.get("lighting"))[:300],
                esc(j.get("camera"))[:300], esc(j.get("props"))[:300], esc(j.get("palette"))[:200], esc(j.get("mood"))[:200], f))
            ok += 1
            if len(buf) >= 15: flush()
            if i % 10 == 0: print(f"{i}/{len(todo)} ok={ok} fail={fail} 最近 {f} → {cat} by {j.get('by')}"); jb.tick(i)
        flush()
    print(f"完成 ok={ok} fail={fail}")

if __name__ == "__main__":
    main()

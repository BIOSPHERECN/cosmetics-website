#!/usr/bin/env python3
"""从实拍图判出包材的**瓶型**与**材质**,补上库里的空洞。

为什么必须做(2026-09-07 实测):
  包材库 3,716 款 —— 材质 2,322 空(62.5%);类型 0 空,
  但 60% 是 use-wash / use-skincare 这种**用途桶**,说的是"装什么"不是"长什么样"。
  后果在前台一眼可见:「大类」筛选里「按用途 2,222」占六成,
  而「罐」只有 6、「管」只有 9 —— 采购找膏霜罐会以为我们只有六款。

  源目录只有「编码/容量/用途分类/图」,商品详情页可读正文 326 字(探过两页),
  抓也抓不出材质。但我们有 3,674 张白底实拍 —— 答案本来就在图里。

2026-09-07 重写为稳定版。创始人:「这些要写成稳定的脚本,而不是你一直在修改」。
上一版当天改了五轮,每轮一个坑:
  max_tokens 太小把 JSON 从中间切断(而报错信息是空的)、模型用 ```json 围栏、
  按 can_text 选到**看不见图**的纯文本模型(它不报错,只是每张都答 unknown)、
  第一家答 unknown 就被采纳、台账只在整批结束时落盘(中断一次几百张全丢)。
  这些现在全部收进 tools/_bohui.py,本文件只留业务逻辑。

四条纪律:
  1. **只补空的**。已有材质的 1,394 款一个字不动。
  2. **只准从固定清单里选**。让模型自由写,会得到「高级磨砂质感亚克力」
     这种没法做筛选面的东西。
  3. **拿不准就 unknown,而 unknown 与低把握都不写库**。
     筛选面里一个错值比一个空值伤得多。
  4. **只出 SQL 不直接写库**;逐条落盘,随时可中断续跑。

用法:
  python tools/pack-vision.py --probe 8     先看几张,人工核对
  python tools/pack-vision.py --run         跑到完(可反复跑,断点续)
  python tools/pack-vision.py --sql         把已有结果导成 SQL
  python tools/pack-vision.py --status
"""
import io
import os
import sys
import json
import time
import base64
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import ROOT, fleet, chat, preflight, http   # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

LEDGER = os.path.join(ROOT, "tools", "pack-vision.json")
SNAP = os.path.join(ROOT, "tools", "pack-all.json")
IMG_ROOT = r"F:\0cosmetic\_r2迁移中转\media\pack"
IMG_DIRS = [os.path.join(IMG_ROOT, d) for d in ("stnewwave", "shunxu", "mz", "al", "mx")]

SHAPES = {
    "press-bottle": "按压瓶(带乳液泵头)",
    "spray-bottle": "喷雾瓶(细雾或触发喷头)",
    "flip-bottle": "翻盖瓶(掀盖、尖嘴)",
    "screw-bottle": "旋盖瓶(无泵无喷)",
    "dropper-bottle": "滴管瓶(胶头滴管)",
    "airless-bottle": "真空瓶(无气泵)",
    "cream-jar": "膏霜罐(广口带盖)",
    "tube": "软管(可挤压,尾部封口)",
    "roll-on": "走珠瓶(顶部滚珠)",
    "foam-pump": "泡沫泵瓶(慕斯泵头)",
    "stick": "棒管(旋出式)",
    "compact": "粉盒或气垫盒(扁平)",
    "sachet": "袋装(软包、面膜袋)",
    "carton": "纸盒、外盒",
    "part": "配件(盖、泵头、内塞、托 —— 不是完整容器)",
    "unknown": "看不出来",
}
MATERIALS = {
    "PET": "PET(透明、壁薄、光泽硬挺)",
    "PETG": "PETG(透明厚壁,常见于膏霜罐)",
    "PP": "PP(不透明或半透明,哑光偏软)",
    "PE": "PE 或 HDPE(不透明,软管与洗护瓶常见)",
    "亚克力": "亚克力 PMMA(厚壁透明,折射明显)",
    "玻璃": "玻璃(高透、边缘厚、反光锐利)",
    "铝": "铝(金属光泽)",
    "纸": "纸(纸盒、纸罐)",
    "unknown": "看不出来",
}

PROMPT = (
    "你在给化妆品代工厂的包材库做归类。图是白底实拍的空包材。\n"
    "只回答两件事:瓶型、主体材质。\n\n"
    "瓶型只能选一个:\n" + "\n".join(f"  {k} = {v}" for k, v in SHAPES.items()) + "\n\n"
    "材质只能选一个:\n" + "\n".join(f"  {k} = {v}" for k, v in MATERIALS.items()) + "\n\n"
    "规矩:\n"
    "· 图里只有盖子、泵头、内塞、托这类零件而没有完整容器 —— 填 part。\n"
    "· 看不清、拿不准、图里有多个不同款式 —— 填 unknown。**留空比猜错好。**\n"
    "· 材质看外观:透明高光锐利=玻璃,透明厚壁有折射=亚克力,透明轻薄=PET,\n"
    "  不透明哑光=PP 或 PE,金属光泽=铝。分不清 PP 与 PE 就填 unknown。\n"
    "· 只看主体容器,不看盖子或泵头的材质。\n\n"
    '只输出 JSON:{"shape":"...","material":"...","confidence":"high|medium|low"}'
)

_lock = threading.Lock()


def find_img(code):
    """本地找不到就从线上拉一张缓存下来。

    2026-09-08:1688 那批(MZ / AL / MX 共 802 款)只上了 R2,本地没有副本,
    于是 `targets()` 把它们全过滤掉了 —— 表现是「跑完了」但货架上
    「按用途」仍占 26%,而且不报错。图明明就在 /pack/{code} 上。
    所以本地缺图不再当作「没图」,拉一次存下来,下轮直接用。"""
    for d in IMG_DIRS:
        p = os.path.join(d, f"{code}.webp")
        if os.path.exists(p):
            return p
    cache = os.path.join(IMG_ROOT, "web")
    os.makedirs(cache, exist_ok=True)
    p = os.path.join(cache, f"{code}.webp")
    if os.path.exists(p):
        return p
    try:
        b = http(f"https://biosphere-ai.com/pack/{code}", timeout=30, retries=2)
        if len(b) < 512:            # 占位图或错误页,不当作图
            return None
        io.open(p, "wb").write(b)
        return p
    except Exception:
        return None


def load():
    if os.path.exists(LEDGER):
        try:
            return json.load(io.open(LEDGER, encoding="utf-8"))
        except Exception:
            pass
    return {"items": {}}


def save(led):
    """原子写。逐条落盘 —— 上一版只在整批结束时写,中断一次几百张全丢。"""
    tmp = LEDGER + ".tmp"
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(
        json.dumps(led, ensure_ascii=False, separators=(",", ":")))
    os.replace(tmp, LEDGER)


def targets():
    """有图就算候选 —— 图在不在本地由 find_img 现拉,别在这里过滤掉。"""
    rows = json.load(io.open(SNAP, encoding="utf-8"))
    out = []
    for r in rows:
        need_mat = not (r.get("material") or "").strip()
        need_shape = str(r.get("type") or "").startswith("use-")
        if (need_mat or need_shape) and r.get("img"):
            out.append({"code": r["code"], "need_mat": need_mat, "need_shape": need_shape})
    return out


def classify(provs, path):
    """问到有人给出非 unknown 的答案为止。
       两项都 unknown 不算答案 —— 只有所有家都说不知道,才是真不知道。"""
    b64 = base64.b64encode(io.open(path, "rb").read()).decode()
    msgs = [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:image/webp;base64,{b64}"}},
    ]}]
    fallback, note = None, ""
    for p in provs:
        j, who, err = chat([p], msgs, max_tokens=800, temperature=0, want_json=True)
        if not isinstance(j, dict):
            note = err
            continue
        r = {
            "shape": j.get("shape") if j.get("shape") in SHAPES else "unknown",
            "material": j.get("material") if j.get("material") in MATERIALS else "unknown",
            "confidence": j.get("confidence") if j.get("confidence") in ("high", "medium", "low") else "low",
            "by": who,
        }
        if r["shape"] == "unknown" and r["material"] == "unknown":
            fallback = fallback or r
            continue
        return r, ""
    return fallback, note


ALIGN = {
    # 0055 之后库里的正式词表。模型答的是左边,写库必须用右边 ——
    # 否则重跑一次就把 0055 的对齐顶回去(press-bottle 在视觉里指按压泵,
    # 在原目录里指挤压瓶,同名不同物)。
    "press-bottle": "pump-bottle",
    "cream-jar": "jar",
    "compact": "compact-powder-case",
    "sachet": "mask-pouch",
    "carton": "outer-carton",
    "part": "cap",
}


def write_sql(led, tg):
    q = lambda v: "'" + str(v).replace("'", "''") + "'"
    out = os.path.join(ROOT, "db", "migrations", "0056_pack_vision2.sql")
    by_code = {t["code"]: t for t in tg}
    lines = [
        "-- 用实拍图补包材的瓶型与材质(由 tools/pack-vision.py --sql 生成,可重复跑)。",
        "-- 只补空的:材质原本为空、或类型是 use-* 用途桶的那些。已有值一律不覆盖。",
        "-- 模型只从固定清单里选,清单外的值在脚本侧已丢弃;",
        "-- unknown 与低把握(confidence=low)都不写库 ——",
        "-- 筛选面里一个错值比一个空值伤得多,宁可留空等下一轮。",
        "",
    ]
    n_m = n_s = 0
    for code, r in led["items"].items():
        t = by_code.get(code)
        if not t or r.get("confidence") == "low":
            continue
        sets = []
        if t["need_mat"] and r["material"] != "unknown":
            sets.append(f"material={q(r['material'])}")
            n_m += 1
        if t["need_shape"] and r["shape"] != "unknown":
            sets.append(f"type={q(ALIGN.get(r['shape'], r['shape']))}")
            n_s += 1
        if sets:
            lines.append(f"UPDATE packaging SET {', '.join(sets)} WHERE code={q(code)} "
                         f"AND status IN ('sample','active');")
    io.open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print(f"  SQL:{out}")
    print(f"  可补材质 {n_m} 款 · 可补瓶型 {n_s} 款")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", type=int, default=0)
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--sql", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--limit", type=int, default=100000)
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()

    preflight(need_keys=("CRON_KEY",), need_files=(SNAP,))
    led, tg = load(), targets()
    done = len(led["items"])
    got = sum(1 for v in led["items"].values() if v["shape"] != "unknown")
    print(f"需要补的 {len(tg):,} 款 · 已跑 {done:,} · 其中判出瓶型 {got:,}")

    if a.status and not (a.probe or a.run or a.sql):
        return
    if a.sql and not (a.probe or a.run):
        write_sql(led, tg)
        return

    provs = fleet(vision=True)
    if not provs:
        raise SystemExit("没有可用的视觉模型 —— 检查 providers 表的 can_vision")
    print(f"视觉模型 {len(provs)} 家:{', '.join(p['id'] for p in provs)}\n")

    todo = [t for t in tg if t["code"] not in led["items"]][:(a.probe or a.limit)]
    if not todo:
        print("没有待处理的了")
        return

    t0, n_ok, n_unk, n_err = time.time(), 0, 0, 0

    def one(t):
        r, note = classify(provs, find_img(t["code"]))
        return t["code"], r, note

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for i, (code, r, note) in enumerate(ex.map(one, todo), 1):
            if r:
                with _lock:
                    led["items"][code] = r
                    save(led)          # 逐条落盘,中断不丢
                if r["shape"] == "unknown":
                    n_unk += 1
                else:
                    n_ok += 1
                if a.probe:
                    print(f"  {code:<22} {r['shape']:<16} {r['material']:<8} "
                          f"{r['confidence']:<7} {r['by']}")
            else:
                n_err += 1
                if a.probe:
                    print(f"  {code:<22} 失败:{note[:60]}")
            if not a.probe and i % 50 == 0:
                el = time.time() - t0
                print(f"  {i}/{len(todo)} · 判出 {n_ok} · 说不知道 {n_unk} · 失败 {n_err} "
                      f"· {el:.0f} 秒 · 剩约 {(len(todo)-i)*el/i/60:.0f} 分钟", flush=True)

    print(f"\n本批:判出瓶型 {n_ok} · 说不知道 {n_unk} · 失败 {n_err} · {time.time()-t0:.0f} 秒")
    if a.run:
        write_sql(led, tg)


if __name__ == "__main__":
    main()

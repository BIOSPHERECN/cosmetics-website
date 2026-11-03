# -*- coding: utf-8 -*-
"""试渲染 20 张:render_templates 模板 × packaging 真实包材 → Agnes 出图 → 落盘。

创始人 2026-09-17:「批量生产AI更好的效果图,才可以交付」「不是太简单,完全没视觉效果的,无法吸引客户的」。
  · 产品:packaging 里有实拍图的(pack_assets.our_code=code 且 r2_key 非空),按压瓶 / 面霜罐 / 软管 / 滴管瓶 / 喷雾各 4;
  · 模板:render_templates 按类目取(喷雾没有专属类,套 lifestyle「手持喷雾」模板);两个模板轮流用;
  · 出图:Agnes(providers.agnes-image)n=1 一次一张;失败换下一把 key 重试一次;两把都失败记失败继续下一款;
  · 落盘:F:/0cosmetic/助手交付/6-包材规范/试渲染-20260917/<code>-<cat>.png + 同名 .txt(最终提示词)。
用法:python tools/render/pilot.py [--n 20] [--out 目录]
"""
import sys, os, io, json, re, time, argparse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _bohui import d1, http

OUT = "F:/0cosmetic/助手交付/6-包材规范/试渲染-20260917"
# packaging.type → (模板类目, 文件名里的 cat, 产品英文)
TYPES = {
    "pump-bottle":    ("pump-bottle",    "pump",    "lotion pump bottle"),
    "jar":            ("jar",            "jar",     "cream jar"),
    "tube":           ("tube",           "tube",    "squeeze tube"),
    "dropper-bottle": ("dropper-bottle", "dropper", "serum dropper bottle"),
    "spray-bottle":   ("lifestyle",      "spray",   "fine mist spray bottle"),
}
MAT = {"PP": "matte PP plastic", "PET": "clear PET plastic", "PETG": "thick-wall PETG", "玻璃": "frosted glass", "铝": "brushed aluminum",
       "AS": "clear AS plastic", "ABS": "ABS plastic", "亚克力": "acrylic", "PCR": "recycled PCR plastic"}


def material_en(m):
    m = m or ""
    hits = [v for k, v in MAT.items() if k in m]
    return hits[0] if hits else "frosted glass"        # 库里材质常为空:默认磨砂玻璃(参考站样例里出现最多的材质)


def products(per=4):
    out = []
    for t, (tcat, cat, en) in TYPES.items():
        rows = d1(f"SELECT p.code, p.material, p.capacity FROM packaging p JOIN pack_assets a ON a.our_code=p.code "
                  f"WHERE a.r2_key<>'' AND p.type='{t}' GROUP BY p.code ORDER BY p.code LIMIT {per}")
        for r in rows:
            out.append({"code": r["code"], "type": t, "tcat": tcat, "cat": cat,
                        "product": f"{(r['capacity'] or '').split('/')[0]} {en}".strip(),
                        "material": material_en(r["material"])})
    return out


def fill(tpl, p):
    # 颜色与盖子库里没有 → 给中性默认,别让占位空着(空着模型会把 "{color}" 当文字画进去)
    return (tpl.replace("{product}", p["product"]).replace("{material}", p["material"])
               .replace("{color}", "off-white").replace("{cap}", "brushed silver"))


def agnes():
    r = d1("SELECT base_url, model, api_keys FROM providers WHERE id='agnes-image' AND enabled=1")
    if not r: raise SystemExit("providers 里没有 agnes-image")
    keys = [k.strip() for k in str(r[0]["api_keys"]).replace("\n", ",").split(",") if k.strip()]
    return r[0]["base_url"].rstrip("/"), r[0]["model"], keys


def gen(base, model, keys, prompt):
    """n=1 一次一张(Agnes n>1 直接 400);第一把 key 失败换下一把再试一次。返回图片 bytes。"""
    last = ""
    for key in keys[:2]:
        try:
            raw = http(base + "/images/generations", timeout=150, retries=1,
                       data=json.dumps({"model": model, "prompt": prompt, "n": 1, "size": "1024x1024"}).encode(),
                       headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
            d = json.loads(raw.decode("utf-8", "replace")).get("data") or []
            if d and d[0].get("b64_json"):
                import base64; return base64.b64decode(d[0]["b64_json"]), ""
            if d and d[0].get("url"):
                return http(d[0]["url"], timeout=90, retries=2), ""
            last = "响应无图片"
        except Exception as e:
            last = str(e)[:160]
        time.sleep(4)   # 出图接口前面挂着限流,换 key 前歇一下
    return None, last


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=20); ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    tpls = {}
    for t in d1("SELECT category, name, template_en FROM render_templates ORDER BY id"):
        tpls.setdefault(t["category"], []).append(t)
    base, model, keys = agnes()
    items = products()[:a.n]
    # D1 查完再挂代理:wrangler 走 7890 会 fetch failed(2026-09-17 实测),而 Agnes 境外 API 直连断时 http() 靠它兜底
    os.environ.setdefault("BOHUI_PROXY", "http://127.0.0.1:7890")
    print(f"模型 {model},{len(keys)} 把 key;产品 {len(items)} 款", flush=True)
    ok, fail = 0, []
    for i, p in enumerate(items):
        tl = tpls.get(p["tcat"]) or []
        if not tl: fail.append(f"{p['code']}: 无模板 {p['tcat']}"); continue
        t = tl[i % len(tl)]
        prompt = fill(t["template_en"], p)
        name = f"{p['code']}-{p['cat']}"
        png = os.path.join(a.out, name + ".png")
        if os.path.exists(png): ok += 1; print(name, "已存在,跳过"); continue
        img, err = gen(base, model, keys, prompt)
        io.open(os.path.join(a.out, name + ".txt"), "w", encoding="utf-8").write(f"[{p['type']} · 模板 {t['name']}]\n{prompt}\n")
        if img:
            open(png, "wb").write(img); ok += 1
            print(f"{i+1:02d} {name} OK {len(img)//1024}KB", flush=True)
        else:
            fail.append(f"{name}: {err}"); print(f"{i+1:02d} {name} FAIL {err}", flush=True)
        time.sleep(3)
    print(f"\n成功 {ok}/{len(items)}", *fail, sep="\n")

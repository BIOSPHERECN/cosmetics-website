# -*- coding: utf-8 -*-
"""反推提示词:看一张(或一批)效果图,让视觉模型写出可复用的商业产品摄影提示词。

创始人 2026-09-17:「后台要有个图片转提示词」「工具都很强大,提示词不行,AI图就很惨」
「一定要看参考站的规范……需要更专业」。

用法:
  python tools/render/_look.py <jpg|文件夹> [--range 601-709] [--n 12] [--out x.json]
图压到长边 1024 转 base64,走 fleet(vision=True)(sensenova-6.8-flash-lite / agnes-3.0-flash),
按 _bohui.chat 的档位挨家问,要 JSON:scene/lighting/camera/props/palette/mood/prompt_en/prompt_zh。
"""
import sys, os, io, json, base64, re, argparse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _bohui import fleet, chat
from PIL import Image

PROMPT = """You are a senior commercial product photographer and Midjourney/Flux prompt engineer.
Look at this cosmetic product render (bottle / jar / tube in a scene). Reverse-engineer it.
Return ONLY a JSON object with these keys (no markdown fence):
{
 "scene": "背景/环境,中文,一句",
 "lighting": "光位与光质,中文,一句(主光方向、硬软、轮廓光、反光板)",
 "camera": "机位/焦段/景深/视角,中文,一句",
 "props": "道具与材质,中文,逗号分隔",
 "palette": "主色与配色,中文,逗号分隔",
 "mood": "情绪与风格关键词,中文,逗号分隔",
 "prompt_en": "60-110 words. Midjourney/Flux style commercial product photography prompt. Cover: subject + material/finish, lighting, background/environment, composition, lens/camera, post-processing. Do NOT mention any brand name or label text; say 'blank label' if needed.",
 "prompt_zh": "prompt_en 的中文对照"
}"""


def to_b64(path, side=1024):
    im = Image.open(path).convert("RGB")
    im.thumbnail((side, side))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode()


def look(provs, path):
    msgs = [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{to_b64(path)}"}},
    ]}]
    for p in provs:
        j, who, err = chat([p], msgs, max_tokens=1500, temperature=0.2, want_json=True)
        if isinstance(j, dict) and j.get("prompt_en"):
            j["by"] = who
            return j, ""
        last = err or f"{p['id']}: 无 prompt_en"
    return None, last


def pick(folder, lo, hi, n):
    files = sorted((f for f in os.listdir(folder) if re.fullmatch(r"\d+\.jpg", f)),
                   key=lambda f: int(f[:-4]))
    files = [f for f in files if lo <= int(f[:-4]) <= hi]
    if len(files) <= n: return files
    return [files[round(i * (len(files) - 1) / (n - 1))] for i in range(n)]  # 均匀取


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("path"); ap.add_argument("--range", default="1-99999")
    ap.add_argument("--n", type=int, default=12); ap.add_argument("--out", default="")
    a = ap.parse_args()
    lo, hi = map(int, a.range.split("-"))
    provs = fleet(vision=True)
    if not provs: raise SystemExit("没有可用视觉模型")
    print("视觉模型:", ", ".join(f"{p['id']}={p['model']}" for p in provs))
    items = [os.path.join(a.path, f) for f in pick(a.path, lo, hi, a.n)] if os.path.isdir(a.path) else [a.path]
    out = []
    for f in items:
        j, err = look(provs, f)
        print(os.path.basename(f), "OK" if j else f"FAIL {err}", flush=True)
        out.append({"img": os.path.basename(f), **(j or {"error": err})})
    s = json.dumps(out, ensure_ascii=False, indent=1)
    if a.out: io.open(a.out, "w", encoding="utf-8").write(s)
    else: print(s)

"""分子结构图上 R2 —— 创始人 2026-09-17:「他们还有图片,是不是很多网站都有这种化学结构」「那么多资源库都要抓回来,图文展示」。
把 data/ingredients/structures/<slug>.png 传到站点桶 bohui-photo,键 = media/ingredients/structures/<slug>.png ——
沿用 /asset/[...path] 那条公开路由的键规则(R2 键 = "media/" + 路径),公开地址就是 /asset/ingredients/structures/<slug>.png,
与 ingredient_structures.png_key(= ingredients/structures/<slug>.png)一致:URL = "/asset/" + png_key。
传图只走 wrangler(memory r2-two-buckets-same-name:boto3 会静默落到旧账号)。wrangler 单文件 ~6s,开 8 路并发。
幂等:wrangler 没有 object list,所以已传键记在 tools/ingredients/structures-r2-state.json 里跳过(同 r2-copy-state.json 的做法);
要强制重传就删掉状态文件。用法:python tools/ingredients/structures-r2.py [--workers 8] [--limit N]"""
import io, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import _wenv   # 与 d1() 同一套环境(.env + 代理),wrangler 才落到站点账号
SRC = os.path.join(ROOT, "data", "ingredients", "structures")
STATE = os.path.join(ROOT, "tools", "ingredients", "structures-r2-state.json")
WEB = os.path.join(ROOT, "apps", "web")   # wrangler 在 apps/web 下跑,读它的 wrangler.toml(memory 里的规矩)
arg = lambda k, d: type(d)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
WORKERS, LIMIT = arg("--workers", 8), arg("--limit", 10 ** 6)

done = set(json.load(io.open(STATE, encoding="utf-8")).get("done", [])) if os.path.exists(STATE) else set()
pngs = sorted(f for f in os.listdir(SRC) if f.endswith(".png"))
todo = [f for f in pngs if f not in done][:LIMIT]
print(f"本地 png {len(pngs)} 张 · 已传 {len(done)} · 本次待传 {len(todo)}", flush=True)

def put(f):
    key = f"media/ingredients/structures/{f}"
    for i in range(3):   # 同 d1_exec:fetch failed / timed out 是网络抖动,重试
        try:
            p = subprocess.run(["npx", "wrangler", "r2", "object", "put", f"bohui-photo/{key}", f"--file={os.path.join(SRC, f)}",
                                "--content-type=image/png", "--remote"], capture_output=True, text=True, encoding="utf-8", errors="replace",
                               cwd=WEB, env=_wenv(), shell=(os.name == "nt"), timeout=120)
            out = (p.stdout or "") + (p.stderr or "")
        except subprocess.TimeoutExpired:
            out = "timed out"
        if "Upload complete" in out: return f, None
        if not any(s in out for s in ("fetch failed", "timed out", "ECONNRESET")): return f, out[-200:]
        time.sleep(3 * (i + 1))
    return f, out[-200:]

ok, fail, t0 = 0, [], time.time()
def save(): json.dump({"done": sorted(done)}, io.open(STATE, "w", encoding="utf-8"))
with ThreadPoolExecutor(WORKERS) as ex:
    for n, (f, err) in enumerate(ex.map(put, todo), 1):
        if err: fail.append((f, err))
        else: done.add(f); ok += 1
        if n % 50 == 0: save(); print(f"  {n}/{len(todo)} 成功 {ok} 失败 {len(fail)} {time.time() - t0:.0f}s", flush=True)
save()
print(f"上传 {ok} · 失败 {len(fail)} · 累计已传 {len(done)} · {time.time() - t0:.0f}s")
for f, e in fail[:10]: print("  失败", f, e.replace("\n", " "))

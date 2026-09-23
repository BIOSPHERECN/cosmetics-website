#!/usr/bin/env python3
"""包材图逐步上传队列。

创始人 2026-09-07:「要建立逐步上传的机制,不可以打爆 D1」。

上一版是「一次性把三千五百张洗完上传、再灌四万行 SQL」,后果有两个:
  · D1 的每日读额度被相关的验证与统计连带烧穿,三个库同时空白;
  · 中途出错就要从头再来,没有断点。

这一版改成**有台账的队列**,四条纪律:
  1. 台账在本地 JSON,上传过程**完全不碰 D1** —— 一次运行只在最后产出一份 SQL,
     人确认后再灌。上传和入库解耦,谁出问题都不牵连另一个。
  2. 一次只跑一批(默认 200 张),跑完就停。要多跑就再执行一次。
     好处不只是温和,更是「每一批都能被看一眼」。
  3. 幂等:已完成的跳过。中断、重跑、换机器都不会重复上传或重复计费。
  4. 每张记状态与原因(pending / uploaded / skipped / failed),
     失败的留着可重试,跳过的写明为什么跳 —— 不静默丢。

支持的图源:
  stnw     新潮塑胶目录(本地已下载,还剩没上传的)
  shunxu   顺旭 1688 主图(创始人用 Fatkun 下的)
  pages    老图册整页(全部 reviewed=0,需人工审过才会进队列)
"""
import io
import os
import re
import sys
import json
import time
import glob
import hashlib
import argparse

import boto3
import urllib.parse
import urllib.request
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, "tools", "pack-queue.json")
STNW_CACHE = os.path.join(ROOT, "tools", ".stnw-img")
STNW_CATALOG = os.path.join(ROOT, "tools", "stnewwave-catalog.json")
SHUNXU_DIR = os.environ.get("PACKLOCAL_SRC", r"D:\360安全浏览器下载")
SHUNXU_NAME = "广州市顺旭塑料科技有限公司"


def env():
    out = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()


def s3():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{E.get('R2_ACCOUNT_ID') or E['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=E["R2_ACCESS_KEY_ID"], aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"],
        region_name="auto")


def load():
    if os.path.exists(LEDGER):
        return json.load(open(LEDGER, encoding="utf-8"))
    return {"items": {}, "runs": []}


def save(led):
    io.open(LEDGER, "w", encoding="utf-8", newline="\n").write(
        json.dumps(led, ensure_ascii=False, indent=0))


def screen(im: Image.Image) -> str:
    w, h = im.size
    if min(w, h) < 260:
        return "太小"
    ar = w / h
    if ar < 0.55 or ar > 1.9:
        return f"长宽比 {ar:.2f}"
    a = np.asarray(im.convert("RGB"))
    if len(np.unique((a[::5, ::5] // 32).reshape(-1, 3), axis=0)) < 8:
        return "色阶太少"
    return ""


def square(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGB")
    im.thumbnail((size, size), Image.LANCZOS)
    out = Image.new("RGB", (size, size), (255, 255, 255))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out


# ── 扫源:只登记,不下载不上传 ───────────────────────────────────────
def scan_stnw(led):
    if not os.path.exists(STNW_CATALOG):
        return 0
    rows = json.load(open(STNW_CATALOG, encoding="utf-8"))
    n = 0
    seen = set()
    for r in rows:
        vs = r.get("variants") or []
        if not vs or not vs[0].get("model"):
            continue
        code = f"ST-{vs[0]['model']}"
        if code in seen:
            continue
        seen.add(code)
        if code in led["items"]:
            continue
        p = os.path.join(STNW_CACHE, hashlib.sha1(r["img"].encode()).hexdigest()[:20] + ".bin")
        if not os.path.exists(p):
            continue
        led["items"][code] = {
            "src": "stnw", "file": p, "key": f"media/pack/stnewwave/{code}.webp",
            "type": r.get("cat_zh", ""), "sku_raw": r.get("model_raw", ""),
            "capacity": "/".join(v["capacity"] for v in vs if v.get("capacity")),
            "url": r.get("url", ""), "uid": r.get("uid", ""), "state": "pending",
        }
        n += 1
    return n


# 是不是包材 —— 用于过滤混杂目录。
# 「1」那个文件夹里既有喷雾瓶、PET 广口罐,也有天猫的洗衣液、洁牙片、
# 吸管杯、化妆包、banner 和一个 .crx 插件文件。
# 靠文件夹名判:命中容器词才收,命中消费品/平台词一律排除。
# 判据宁严勿宽 —— 一张不该进库的图,比十张漏收伤得多(2026-09-06 那批
# 混进别家 logo 与展会照的教训)。
PACK_WORDS = ('瓶', '罐', '管', '泵', '喷', '盖', '膏霜', '分装', '滴管',
              '慕斯', '起泡', '走珠', '真空', '安瓶', '面霜', '乳液瓶', '洗手液')
NOT_PACK = ('tmall', '天猫', '洗衣液', '洁牙', '吸管', '水杯', '保温杯', '杯子',
            '水壶', '化妆包', '收纳', '手提包', '单肩包', '凯莉包', '刺绣',
            'banner', '.crx', 'screencapture', '牙膏', '面膜贴', '毛巾', '睡衣')
# 2026-09-07 收紧:第一版 12 个里放行了 4 个错的 ——
# 「吸管杯」命中了容器词「管」,「包盖式凯莉包」命中了「盖」。
# 单字容器词在中文里太容易被别的词借走,所以排除词要写得比收录词更细。
# 这条规矩上次(09-06 那批混进别家 logo 与展会照)就该学会。


def looks_like_pack(name: str) -> bool:
    low = name.lower()
    if any(w in low for w in NOT_PACK):
        return False
    return any(w in name for w in PACK_WORDS)


def scan_dir(led, base, prefix, supplier, folder_filter=None):
    """通用扫描:base 下每个子文件夹是一个商品,取其中的「主图*」。

    2026-09-07 扩展:原来只认顺旭一家,现在同一套逻辑扫多个来源 ——
      名作(109 商品)、顶层散单(8 商品)、混杂目录「1」(按名过滤)。
    编码前缀区分来源,对外只显示我们自己的编码,不出现供应商名。
    """
    if not os.path.isdir(base):
        return 0
    n = 0
    dirs = sorted(d for d in os.listdir(base)
                  if os.path.isdir(os.path.join(base, d)) and d != "店铺首页")
    if folder_filter:
        dirs = [d for d in dirs if folder_filter(d)]
    for i, d in enumerate(dirs, 1):
        for j, f in enumerate(sorted(glob.glob(os.path.join(base, d, "主图*.*"))), 1):
            code = f"{prefix}-{i:03d}-{j}"
            if code in led["items"]:
                continue
            title = re.sub(r"\s*-\s*阿里巴巴\s*$", "", d)
            caps = sorted({f"{c[0]}{'ml' if c[1].lower() in ('ml', '毫升') else 'g'}"
                           for c in re.findall(r"(\d+(?:\.\d+)?)\s*(ml|ML|g|G|毫升)", title)},
                          key=lambda x: float(re.match(r"[\d.]+", x).group()))
            led["items"][code] = {
                "src": prefix.lower(), "file": f,
                "key": f"media/pack/{prefix.lower()}/{code}.webp",
                "type": "", "sku_raw": title[:80], "capacity": "/".join(caps),
                "url": "", "uid": "", "supplier": supplier, "state": "pending",
            }
            n += 1
    return n


def scan_more(led):
    """2026-09-07 新增的三个来源。顺旭那份保持原样,不动已有编码。"""
    root = SHUNXU_DIR
    total = 0
    # ① 名作 —— 第二家供应商,和顺旭同构
    total += scan_dir(led, os.path.join(root, "名作"), "MZ", "名作")
    # ② 顶层散落的单品文件夹(文件夹名以「- 阿里巴巴」结尾)
    total += scan_dir(led, root, "AL", "1688 散单",
                      folder_filter=lambda d: d.endswith("阿里巴巴"))
    # ③ 混杂目录「1」—— 只收看着像包材的
    total += scan_dir(led, os.path.join(root, "1"), "MX", "1688 杂项",
                      folder_filter=looks_like_pack)
    return total


def scan_shunxu(led):
    base = os.path.join(SHUNXU_DIR, SHUNXU_NAME)
    if not os.path.isdir(base):
        return 0
    n = 0
    dirs = sorted(d for d in os.listdir(base)
                  if os.path.isdir(os.path.join(base, d)) and d != "店铺首页")
    for i, d in enumerate(dirs, 1):
        for j, f in enumerate(sorted(glob.glob(os.path.join(base, d, "主图*.*"))), 1):
            code = f"SX-{i:03d}-{j}"
            if code in led["items"]:
                continue
            title = re.sub(r"\s*-\s*阿里巴巴\s*$", "", d)
            caps = sorted({f"{c[0]}{'ml' if c[1].lower() in ('ml', '毫升') else 'g'}"
                           for c in re.findall(r"(\d+(?:\.\d+)?)\s*(ml|ML|g|G|毫升)", title)},
                          key=lambda x: float(re.match(r"[\d.]+", x).group()))
            led["items"][code] = {
                "src": "shunxu", "file": f, "key": f"media/pack/shunxu/{code}.webp",
                "type": "", "sku_raw": title[:80], "capacity": "/".join(caps),
                "url": "", "uid": "", "state": "pending",
            }
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", action="store_true", help="登记新图源,不上传")
    ap.add_argument("--run", action="store_true", help="处理一批")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--batch", type=int, default=200, help="一次处理多少张")
    ap.add_argument("--size", type=int, default=900)
    ap.add_argument("--src", default="", help="只处理某个源:stnw / shunxu")
    a = ap.parse_args()
    if not (a.scan or a.run or a.status):
        a.status = True

    led = load()

    if a.scan:
        n1, n2 = scan_stnw(led), scan_shunxu(led)
        n3 = scan_more(led)
        # 先跟 R2 对一遍:已经在桶里的直接标成已上传,免得重复传、重复计费。
        # 第一次跑忘了这一步,队列把三千五百张已上传的又排了一遍。
        cli, bucket, have, tok = s3(), E.get("R2_BUCKET", "bohui-photo"), set(), None
        while True:
            kw = {"Bucket": bucket, "Prefix": "media/pack/", "MaxKeys": 1000}
            if tok:
                kw["ContinuationToken"] = tok
            r = cli.list_objects_v2(**kw)
            for o in r.get("Contents", []):
                have.add(o["Key"])
            if not r.get("IsTruncated"):
                break
            tok = r.get("NextContinuationToken")
        already = 0
        for v in led["items"].values():
            if v["state"] == "pending" and v["key"] in have:
                v["state"] = "uploaded"; v["why"] = "R2 里已存在"; already += 1
        save(led)
        print(f"登记:新潮 +{n1},顺旭 +{n2},新增三源 +{n3};其中 {already} 张 R2 里已有,直接标记完成")

    if a.status or a.scan:
        by = {}
        for k, v in led["items"].items():
            by.setdefault((v["src"], v["state"]), 0)
            by[(v["src"], v["state"])] += 1
        print("\n台账:")
        for (src, st), n in sorted(by.items()):
            print(f"  {src:<8} {st:<10} {n:>5}")
        pend = sum(n for (s_, st), n in by.items() if st == "pending")
        print(f"\n  待处理合计 {pend} 张"
              + (f",按每批 {a.batch} 张需要跑 {-(-pend // a.batch)} 次" if pend else ""))
        if not a.run:
            return

    if not a.run:
        return

    todo = [(k, v) for k, v in led["items"].items()
            if v["state"] == "pending" and (not a.src or v["src"] == a.src)][:a.batch]
    if not todo:
        print("没有待处理的了")
        return

    """上传改走 Worker 的直传口。
       2026-09-07 图片桶迁到网站所在账号之后,.env 里那套 S3 密钥指的是**旧账号** ——
       继续用它上传会把新图写进已经不再服务的旧桶,而且不会报错。
       新账号的 S3 密钥我们没有也不需要:Worker 手里有原生绑定,本机把字节交过去即可。"""
    cron = E.get("CRON_KEY")
    if not cron:
        raise SystemExit(".env 里没有 CRON_KEY")
    api = "https://biosphere-ai.com/api/cron/r2-copy/"

    # 绕过本机代理直连。这台机器配了 HTTPS_PROXY=127.0.0.1:1082,
    # urllib 默认会走它,而它把上传请求判成 403 —— curl 加 --noproxy 就通。
    # 2026-09-07 为这个丢了两轮批次:失败信息只有「403 Forbidden」,
    # 看着像鉴权问题,其实请求根本没到 Cloudflare。
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def put(key, blob):
        req = urllib.request.Request(
            f"{api}?key={urllib.parse.quote(key, safe='/')}", data=blob, method="POST",
            headers={"x-cron-key": cron, "Origin": "https://biosphere-ai.com",
                     "Content-Type": "image/webp",
                     # 必须带浏览器 UA:Cloudflare 的浏览器签名检查会挡掉
                     # Python-urllib 默认的 UA,返回 `error code: 1010`。
                     # 那个响应是 403 且 body 只有一行,看着像鉴权失败 ——
                     # 2026-09-07 为此丢了三轮批次才查出请求根本没进 Worker。
                     "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                                    "Chrome/124.0.0.0 Safari/537.36")})
        # 重试三次、退避递增:单张能传通,连着快传会超时或被限速 ——
        # 一次抖动就把整张判失败太浪费,而且失败原因会掩盖真问题。
        last = ""
        for attempt in range(3):
            try:
                with opener.open(req, timeout=120) as f:
                    r = json.loads(f.read().decode("utf-8", "replace"))
                if r.get("ok"):
                    return
                last = str(r)[:110]
            except Exception as e:
                last = f"{type(e).__name__}: {str(e)[:80]}"
            time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(last)

    t0, ok, skip, fail, size = time.time(), 0, 0, 0, 0
    done_rows = []

    for code, it in todo:
        try:
            im = Image.open(it["file"])
        except Exception as e:
            it["state"] = "failed"; it["why"] = f"打不开:{str(e)[:40]}"; fail += 1; continue
        why = screen(im)
        if why:
            it["state"] = "skipped"; it["why"] = why; skip += 1; continue
        try:
            buf = io.BytesIO()
            square(im, a.size).save(buf, "WEBP", quality=82, method=4)
            blob = buf.getvalue()
            put(it["key"], blob)
        except Exception as e:
            it["state"] = "failed"; it["why"] = f"上传失败:{str(e)[:40]}"; fail += 1; continue
        it["state"] = "uploaded"; it["bytes"] = len(blob); it.pop("why", None)
        size += len(blob); ok += 1
        done_rows.append((code, it))

    save(led)

    # 一次运行产出一份 SQL,人确认后再灌 —— 上传与入库解耦
    if done_rows:
        stamp = hashlib.sha1(str(sorted(c for c, _ in done_rows)).encode()).hexdigest()[:8]
        out = os.path.join(ROOT, "tools", f"pack-queue-{stamp}.sql")
        q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"
        with io.open(out, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(f"-- 队列批次 {stamp}:{len(done_rows)} 张已上传 R2,这里只补数据库索引。\n"
                     "-- 上传与入库分开:图先上去,SQL 人看过再灌 —— 两边都能单独重来。\n"
                     "-- book/page 是 NOT NULL(2026-09-07 踩过:漏了这两列,\n"
                     "-- INSERT OR IGNORE 把三千五百行静默丢光,还不报错)。\n\n")
            for i, (code, it) in enumerate(done_rows, 1):
                sup = it.get("supplier") or ("新潮塑胶" if it["src"] == "stnw"
                                             else "广州市顺旭塑料科技有限公司")
                slug = it["src"] if it["src"] not in ("stnw",) else "stnewwave"
                fh.write(
                    "INSERT OR IGNORE INTO pack_assets "
                    "(supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ("
                    f"{q(sup)},{q(slug)},'队列批次{stamp}',{i},'item',{q(it['key'])},{q(code)},"
                    f"'queue',{q(it.get('url'))},1);\n")
        print(f"\nSQL:{out}")

    led["runs"].append({"n": ok, "skip": skip, "fail": fail, "bytes": size})
    save(led)
    print(f"本批:上传 {ok} · 跳过 {skip} · 失败 {fail} · {size/1024/1024:.1f} MB · "
          f"{time.time()-t0:.0f} 秒")
    left = sum(1 for v in led["items"].values() if v["state"] == "pending")
    print(f"剩余待处理 {left} 张" + (f",再跑 {-(-left // a.batch)} 次" if left else " —— 全部完成"))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""把 R2 图片从旧账号迁到网站所在的 CF 账号,本地硬盘中转。

创始人 2026-09-07:
  「图片迁回这个 CF 账号」「用本地硬盘中转」
  「原有的先别删除,晚点我要新建另外一个网站」

现状:
  源  账号 b736…(个人号)桶 bohui-photo,9,134 个对象 / 551 MB,
       网站靠 S3 签名密钥远程读 —— 跨账号,每张图都要走一次外部 HTTP。
  目标 账号 8944…(Worker 与 D1 所在,今天刚升 Workers 付费档),R2 已启用、零个桶。
  迁过去之后可以用**原生 R2 绑定**(env.PHOTO),不再走签名 S3,更快也更省。

四条纪律(和包材上传队列同一套,踩过的坑不再踩):
  1. **零删除**。源桶一个字节都不动 —— 创始人还要拿它建另一个站。
     这个脚本里没有任何 delete 调用,以后也不许加。
  2. 本地台账(r2-migrate.json)记每个对象的状态与大小,
     中断、重跑、换机器都不会重复传。
  3. 下载与上传**分成两个阶段**,各自可单独重跑。
     下载只碰源桶(只读),上传只碰目标桶(只写)。任一边出问题都不牵连另一边。
  4. 校验按**大小 + ETag** 比对,不是"传过就算数"。
     ETag 对单段上传就是 MD5;分段上传的形如 "xxx-N",那种只比大小。

用法:
  python tools/r2-migrate.py --plan              清点并写台账,不传任何东西
  python tools/r2-migrate.py --download          下载到本地(可反复跑,断点续)
  python tools/r2-migrate.py --upload            上传到目标桶(需目标账号的 S3 密钥)
  python tools/r2-migrate.py --verify            对账:两边数量、大小、ETag
  python tools/r2-migrate.py --status            看台账
"""
import io
import os
import sys
import json
import time
import hashlib
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.config import Config

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, "tools", "r2-migrate.json")
STAGE = os.environ.get("R2_STAGE_DIR", r"F:\0cosmetic\_r2迁移中转")

_lock = threading.Lock()


def env():
    out = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()
CFG = Config(retries={"max_attempts": 5, "mode": "standard"}, max_pool_connections=32)


def src_client():
    return boto3.client(
        "s3", endpoint_url=f"https://{E['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=E["R2_ACCESS_KEY_ID"], aws_secret_access_key=E["R2_SECRET_ACCESS_KEY"],
        region_name="auto", config=CFG)


def dst_client():
    """目标账号的密钥。没有就明确报错,不要静默回落到源账号 —— 那会把图片又写回旧桶。"""
    ak = E.get("R2_DST_ACCESS_KEY_ID")
    sk = E.get("R2_DST_SECRET_ACCESS_KEY")
    acct = E.get("R2_DST_ACCOUNT_ID") or E.get("CLOUDFLARE_ACCOUNT_ID")
    if not (ak and sk):
        raise SystemExit(
            "缺目标账号的 R2 密钥。请在 Cloudflare 控制台(账号 "
            f"{(acct or '')[:4]}…)新建一个 R2 API Token(权限:Object Read & Write),\n"
            "把这三行加进 .env(不要贴进聊天里):\n"
            "  R2_DST_ACCOUNT_ID=...\n  R2_DST_ACCESS_KEY_ID=...\n  R2_DST_SECRET_ACCESS_KEY=...")
    return boto3.client(
        "s3", endpoint_url=f"https://{acct}.r2.cloudflarestorage.com",
        aws_access_key_id=ak, aws_secret_access_key=sk, region_name="auto", config=CFG)


SRC_BUCKET = E.get("R2_BUCKET", "bohui-photo")
DST_BUCKET = E.get("R2_DST_BUCKET", "bohui-photo")


def load():
    if os.path.exists(LEDGER):
        return json.load(io.open(LEDGER, encoding="utf-8"))
    return {"objects": {}, "runs": []}


def save(led):
    tmp = LEDGER + ".tmp"
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(
        json.dumps(led, ensure_ascii=False, separators=(",", ":")))
    os.replace(tmp, LEDGER)


def local_path(key: str) -> str:
    """本地落盘路径。key 里的 / 转成目录;文件名过长或有非法字符就用哈希兜底。"""
    parts = key.split("/")
    safe = []
    for p in parts:
        if len(p) > 120 or any(c in p for c in '<>:"\\|?*'):
            p = hashlib.sha1(p.encode()).hexdigest()[:24] + os.path.splitext(p)[1][:8]
        safe.append(p)
    return os.path.join(STAGE, *safe)


def plan(led):
    """清点源桶。只列不取,按前缀分批,可反复跑。"""
    cli = src_client()
    n_new = 0
    tok = None
    total = 0
    while True:
        kw = {"Bucket": SRC_BUCKET, "MaxKeys": 1000}
        if tok:
            kw["ContinuationToken"] = tok
        r = cli.list_objects_v2(**kw)
        for o in r.get("Contents", []):
            total += 1
            k = o["Key"]
            cur = led["objects"].get(k)
            meta = {"size": o["Size"], "etag": (o.get("ETag") or "").strip('"')}
            if cur is None:
                led["objects"][k] = {**meta, "state": "pending"}
                n_new += 1
            elif cur.get("size") != meta["size"] or cur.get("etag") != meta["etag"]:
                # 源变了就重来一遍,别拿旧的顶数
                led["objects"][k] = {**meta, "state": "pending", "why": "源已变更"}
                n_new += 1
        if not r.get("IsTruncated"):
            break
        tok = r.get("NextContinuationToken")
    save(led)
    print(f"清点:源桶 {total:,} 个对象,新登记/需重来 {n_new:,} 个")
    return total


def download(led, workers, limit):
    cli = src_client()
    todo = [(k, v) for k, v in led["objects"].items()
            if v["state"] in ("pending", "failed")][:limit]
    if not todo:
        print("没有待下载的了")
        return
    ok = fail = skip = 0
    got = 0
    t0 = time.time()

    def one(item):
        k, v = item
        p = local_path(k)
        # 本地已有且大小对得上 —— 直接过,不重复下载
        if os.path.exists(p) and os.path.getsize(p) == v["size"]:
            return k, "downloaded", v["size"], "本地已有"
        os.makedirs(os.path.dirname(p), exist_ok=True)
        try:
            tmp = p + ".part"
            cli.download_file(SRC_BUCKET, k, tmp)
            if os.path.getsize(tmp) != v["size"]:
                os.remove(tmp)
                return k, "failed", 0, "大小不符"
            os.replace(tmp, p)
            return k, "downloaded", v["size"], ""
        except Exception as e:
            return k, "failed", 0, str(e)[:80]

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for k, st, sz, why in ex.map(one, todo):
            with _lock:
                led["objects"][k]["state"] = st
                if why:
                    led["objects"][k]["why"] = why
                else:
                    led["objects"][k].pop("why", None)
            if st == "downloaded":
                if why:
                    skip += 1
                else:
                    ok += 1
                got += sz
            else:
                fail += 1
    save(led)
    dt = time.time() - t0
    print(f"下载:新取 {ok} · 本地已有 {skip} · 失败 {fail} · "
          f"{got/1024/1024:.1f} MB · {dt:.0f} 秒")
    left = sum(1 for v in led["objects"].values() if v["state"] in ("pending", "failed"))
    print(f"剩余 {left:,} 个" if left else "本地中转已齐")


def upload(led, workers, limit):
    cli = dst_client()
    todo = [(k, v) for k, v in led["objects"].items()
            if v["state"] == "downloaded"][:limit]
    if not todo:
        print("没有待上传的了(先跑 --download)")
        return
    ok = fail = 0
    sent = 0
    t0 = time.time()
    ctype = {".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
             ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml",
             ".mp4": "video/mp4", ".pdf": "application/pdf", ".json": "application/json",
             ".txt": "text/plain", ".webm": "video/webm", ".avif": "image/avif"}

    def one(item):
        k, v = item
        p = local_path(k)
        if not os.path.exists(p):
            return k, "pending", 0, "本地文件不见了"
        ext = os.path.splitext(k)[1].lower()
        try:
            cli.upload_file(p, DST_BUCKET, k, ExtraArgs={
                "ContentType": ctype.get(ext, "application/octet-stream")})
            return k, "uploaded", v["size"], ""
        except Exception as e:
            return k, "downloaded", 0, f"上传失败:{str(e)[:70]}"

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for k, st, sz, why in ex.map(one, todo):
            with _lock:
                led["objects"][k]["state"] = st
                if why:
                    led["objects"][k]["why"] = why
                else:
                    led["objects"][k].pop("why", None)
            if st == "uploaded":
                ok += 1
                sent += sz
            else:
                fail += 1
    save(led)
    print(f"上传:成功 {ok} · 失败 {fail} · {sent/1024/1024:.1f} MB · {time.time()-t0:.0f} 秒")
    left = sum(1 for v in led["objects"].values() if v["state"] == "downloaded")
    print(f"剩余待上传 {left:,} 个" if left else "全部已上传")


def verify(led):
    """对账:目标桶里的数量/大小/ETag 和台账逐个比。不合的列出来,不自动修。"""
    cli = dst_client()
    have = {}
    tok = None
    while True:
        kw = {"Bucket": DST_BUCKET, "MaxKeys": 1000}
        if tok:
            kw["ContinuationToken"] = tok
        r = cli.list_objects_v2(**kw)
        for o in r.get("Contents", []):
            have[o["Key"]] = (o["Size"], (o.get("ETag") or "").strip('"'))
        if not r.get("IsTruncated"):
            break
        tok = r.get("NextContinuationToken")
    miss, bad_size, bad_etag, multipart = [], [], [], 0
    for k, v in led["objects"].items():
        if k not in have:
            miss.append(k)
            continue
        sz, et = have[k]
        if sz != v["size"]:
            bad_size.append(k)
        elif "-" in v.get("etag", "") or "-" in et:
            multipart += 1          # 分段上传的 ETag 不是 MD5,只比大小
        elif et != v["etag"]:
            bad_etag.append(k)
    print(f"对账:台账 {len(led['objects']):,} · 目标桶 {len(have):,}")
    print(f"  缺失 {len(miss)} · 大小不符 {len(bad_size)} · ETag 不符 {len(bad_etag)} · "
          f"分段(只比大小){multipart}")
    for lbl, arr in (("缺失", miss), ("大小不符", bad_size), ("ETag 不符", bad_etag)):
        for k in arr[:8]:
            print(f"    {lbl}: {k}")
        if len(arr) > 8:
            print(f"    …{lbl}还有 {len(arr)-8} 个")
    if not (miss or bad_size or bad_etag):
        print("  ✓ 两边一致。源桶原样保留,一个字节都没动。")
    return not (miss or bad_size or bad_etag)


def status(led):
    by = {}
    size_by = {}
    for v in led["objects"].values():
        by[v["state"]] = by.get(v["state"], 0) + 1
        size_by[v["state"]] = size_by.get(v["state"], 0) + v.get("size", 0)
    print("台账:")
    for st in ("pending", "downloaded", "uploaded", "failed"):
        if st in by:
            print(f"  {st:<12} {by[st]:>6} 个 · {size_by[st]/1024/1024:>8.1f} MB")
    bad = [(k, v.get("why", "")) for k, v in led["objects"].items() if v["state"] == "failed"]
    for k, why in bad[:10]:
        print(f"    失败:{k} —— {why}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--limit", type=int, default=100000)
    a = ap.parse_args()
    if not any([a.plan, a.download, a.upload, a.verify, a.status]):
        a.status = True

    led = load()
    print(f"源 {SRC_BUCKET}@{E['R2_ACCOUNT_ID'][:4]}… → 目标 {DST_BUCKET}@"
          f"{(E.get('R2_DST_ACCOUNT_ID') or E.get('CLOUDFLARE_ACCOUNT_ID',''))[:4]}…")
    print(f"中转目录 {STAGE}\n")
    if a.plan:
        plan(led)
    if a.download:
        if not led["objects"]:
            plan(led)
        download(led, a.workers, a.limit)
    if a.upload:
        upload(led, a.workers, a.limit)
    if a.verify:
        verify(led)
    if a.status or a.plan:
        status(led)


if __name__ == "__main__":
    main()

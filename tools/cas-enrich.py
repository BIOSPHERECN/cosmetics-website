#!/usr/bin/env python3
"""给原料补 CAS 号 —— 数据来自 PubChem(美国国立卫生研究院 NCBI),公有领域,免费无 key。

由来(2026-09-09,创始人:「我们还要建原料库,有很多 CAS 查询网站」):
`inci_catalog` 里 8,965 条国家目录原料只有中文名和 INCI 名,没有 CAS。
采购和法规同事查原料是按 CAS 查的 —— 没有 CAS,这张表对他们就只能看不能用。

为什么用 PubChem 而不是别的 CAS 查询站:
  · 公有领域,批量取用没有授权问题。商业 CAS 库(SciFinder / CAS Common Chemistry)
    的条款都限制批量抓取和转载,拿来做公开页面是给自己埋雷。
  · 有正经 REST 接口,不用爬 HTML,站点改版不会把我们打死。
  · CID → synonyms 支持一次几百个,不用一条一条问。

三条纪律:
  1. **CAS 要过校验位**。PubChem 的 synonym 里混着 EC 号(202-713-4 这种)、
     内部编号、甚至电话号。只按「数字-数字-数字」挑,挑回来的一半是假的。
     CAS 最后一位是校验位,算一下就能把假的挡在门外。
  2. **对不上就留空**。植物提取物、聚合物、色淀本来就没有单一 CAS,
     硬塞一个最像的,客户拿去做法规申报会出事。
  3. **缓存 + 断点续跑**。8,965 条要问 8,965 次,中间断了不能从头再来。

代理注意:本机 HTTPS_PROXY 指向 127.0.0.1:1082,那条路走不通 NIH(连接直接断)。
所以这里显式装一个空 ProxyHandler —— 不是「绕过公司网络」,是本机代理不通这个站。

用法:
    python tools/cas-enrich.py --limit 200     先跑 200 条看命中率
    python tools/cas-enrich.py                 跑完全部(约 30 分钟)
    python tools/cas-enrich.py --apply         把缓存里的结果写进 D1
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import threading
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "_pubchem-cache.json")
BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
UA = "bohui-ingredient-research/1.0 (+https://biosphere-ai.com)"
# 本机代理到不了 NIH,显式走直连
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
OPENER.addheaders = [("User-Agent", UA)]

CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")
EC_RE = re.compile(r"^\d{3}-\d{3}-\d$")


def cas_ok(s: str) -> bool:
    """CAS 校验位:从右往左给每位数字乘 1,2,3…,求和取模 10 就是最后一位。

    不做这一步的话,PubChem synonym 里的内部编号会有一小半被当成 CAS 收进来。
    """
    if not CAS_RE.match(s):
        return False
    digits = s.replace("-", "")
    body, check = digits[:-1], int(digits[-1])
    return sum(int(d) * i for i, d in enumerate(reversed(body), 1)) % 10 == check


class Throttle:
    """令牌桶 + 服务端拥塞信号。

    PubChem 公布的上限是 **5 次/秒、400 次/分钟、每分钟总运行时间 300 秒**。
    只按秒限速不够 —— 分钟额度先到,它就开始回 503,再硬打就是封。

    真正好用的是它每个响应都带的 `X-Throttling-Control` 头,形如
    `Request Count status: Green (20%), Request Time status: Green (5%)`。
    Green/Yellow/Red 是服务端告诉你「你占了多少配额」。
    见 Yellow 就减速一半,见 Red 就停 30 秒 —— 这一条是「别一下子被堵住」的关键,
    不是靠 sleep 猜。
    """

    def __init__(self, rate: float = 4.0):
        self.base = rate
        self.rate = rate
        self.lock = threading.Lock()
        self.next_at = 0.0
        self.hold_until = 0.0

    def wait(self):
        """取一个发车位。

        **只预约一次**。第一版写成 while 循环里反复取号:线程拿到号之后 sleep,
        醒来再进循环又取一个新号,把 next_at 又往后推一个 gap ——
        四个线程互相推,有效速率朝零收敛。表现是跑了 100 分钟一条都没写出来,
        日志还一切正常(2026-09-10 03:04 那次)。限速器写错不会报错,只会「变慢到不动」。
        """
        with self.lock:
            now = time.time()
            gap = 1.0 / max(0.5, self.rate)
            start = max(now, self.next_at, self.hold_until)
            self.next_at = start + gap
        sleep = start - time.time()
        if sleep > 0:
            time.sleep(sleep)

    def observe(self, header: str):
        """按服务端的拥塞灯调速。"""
        if not header:
            return
        h = header.lower()
        with self.lock:
            if "red" in h:
                self.rate = 1.0
                self.hold_until = time.time() + 30
            elif "yellow" in h:
                self.rate = max(1.0, self.rate * 0.5)
            elif "green" in h:
                self.rate = min(self.base, self.rate * 1.15 + 0.05)


TH = Throttle()


def get(url: str, tries: int = 5):
    """取一次。503/429 指数退避;每次都把服务端的拥塞灯喂回令牌桶。"""
    for i in range(tries):
        TH.wait()
        try:
            with OPENER.open(url, timeout=45) as r:
                TH.observe(r.headers.get("X-Throttling-Control", ""))
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            TH.observe(e.headers.get("X-Throttling-Control", "") if e.headers else "")
            if e.code == 404:
                return None            # 查无此名,不是错
            if e.code in (503, 429):
                # 服务端明确说忙:退避,并把速率压下去,不要靠重试硬顶
                with TH.lock:
                    TH.rate = max(0.8, TH.rate * 0.5)
                    TH.hold_until = max(TH.hold_until, time.time() + 2.0 * (i + 1))
                continue
            return None
        except Exception:
            if i < tries - 1:
                time.sleep(1.0 * (i + 1))
                continue
            return None
    return None


def load_cache() -> dict:
    if os.path.exists(CACHE):
        return json.loads(io.open(CACHE, encoding="utf-8").read())
    return {}


def save_cache(c: dict) -> None:
    io.open(CACHE, "w", encoding="utf-8", newline="\n").write(json.dumps(c, ensure_ascii=False))


def resolve_cids(names: list, cache: dict, workers: int = 4) -> None:
    """名字 → CID。并发跑,但速率由 Throttle 统一管 ——
       并发数只决定「同时有几个请求在飞」,真正的节流在令牌桶那一层。

       这一步只能一条一条问:POST 传多个 name 会被合并成一个结果集,
       分不清哪个 CID 属于哪个名字。
    """
    todo = [n for n in names if n not in cache]
    print(f"待查 {len(todo)} 条(缓存已有 {len(names) - len(todo)} 条)· 并发 {workers}")
    t0 = time.time()
    done = [0]
    lock = threading.Lock()

    def one(name):
        q = urllib.parse.quote(name, safe="")
        j = get(f"{BASE}/compound/name/{q}/cids/JSON")
        cid = None
        if j:
            ids = (j.get("IdentifierList") or {}).get("CID") or []
            cid = ids[0] if ids else None
        with lock:
            cache[name] = {"cid": cid}
            done[0] += 1
            n = done[0]
            if n % 50 == 0:
                save_cache(cache)
                hit = sum(1 for x in names if (cache.get(x) or {}).get("cid"))
                el = time.time() - t0
                print(f"  {n}/{len(todo)} · 命中 {hit} · {el:.0f}s · "
                      f"速率 {TH.rate:.1f}/s · 预计还需 {el / n * (len(todo) - n) / 60:.0f} 分钟",
                      flush=True)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, todo))
    save_cache(cache)


def resolve_cas(cache: dict, batch: int = 100, pause: float = 0.25) -> None:
    """CID → CAS / EC。这一步可以一次问一百个。"""
    need = sorted({v["cid"] for v in cache.values() if v.get("cid") and "cas" not in v})
    print(f"待取 CAS 的 CID {len(need)} 个")
    got = {}
    for i in range(0, len(need), batch):
        chunk = need[i:i + batch]
        j = get(f"{BASE}/compound/cid/{','.join(str(c) for c in chunk)}/synonyms/JSON")
        for info in ((j or {}).get("InformationList") or {}).get("Information", []):
            syns = info.get("Synonym") or []
            cas = next((s for s in syns if cas_ok(s)), None)
            ec = next((s for s in syns if EC_RE.match(s)), None)
            got[info["CID"]] = {"cas": cas, "ec": ec}
        print(f"  {min(i + batch, len(need))}/{len(need)}", flush=True)
        time.sleep(pause)
    for v in cache.values():
        cid = v.get("cid")
        if cid and cid in got:
            v.update(got[cid])
        elif cid and "cas" not in v:
            v.update({"cas": None, "ec": None})
    save_cache(cache)


def apply_to_d1(rows: list, cache: dict) -> None:
    sql = os.path.join(HERE, "_cas-enrich.sql")
    q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    n = 0
    with io.open(sql, "w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            v = cache.get(r["inci"] or "") or {}
            if not (v.get("cas") or v.get("ec") or v.get("cid")):
                continue
            fh.write(f"UPDATE inci_catalog SET cas={q(v.get('cas'))}, ec_no={q(v.get('ec'))}, "
                     f"pubchem_cid={q(v.get('cid'))} WHERE no={q(r['no'])};\n")
            n += 1
    print(f"  {n} 条有 CAS/EC/CID,SQL {os.path.getsize(sql):,} 字节")
    print(f"  写入 {d1_exec(sql):,} 行")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 条,用来试命中率")
    ap.add_argument("--workers", type=int, default=4, help="并发数;真正的节流在 Throttle 令牌桶")
    ap.add_argument("--apply", action="store_true", help="把缓存写进 D1")
    a = ap.parse_args()

    # 分页拉。一次性 SELECT 8,965 行会让 wrangler CLI 吐一坨巨大 JSON,
    # 表现是进程挂住、日志一个字都不出(2026-09-10 03:00 卡了十分钟才发现)。
    rows = []
    while True:
        chunk = d1("SELECT no, inci FROM inci_catalog WHERE inci IS NOT NULL AND inci <> '' "
                   f"ORDER BY no LIMIT 1500 OFFSET {len(rows)}")
        if not chunk:
            break
        rows += chunk
        print(f"  拉到 {len(rows)} 行", flush=True)
        if len(chunk) < 1500:
            break
    if a.limit:
        rows = rows[:a.limit]
    names = sorted({r["inci"] for r in rows})
    print(f"目录内有 INCI 名的 {len(rows)} 条,去重后 {len(names)} 个名字")

    cache = load_cache()
    if not a.apply:
        resolve_cids(names, cache, a.workers)
        resolve_cas(cache)

    hit_cid = sum(1 for n in names if (cache.get(n) or {}).get("cid"))
    hit_cas = sum(1 for n in names if (cache.get(n) or {}).get("cas"))
    hit_ec = sum(1 for n in names if (cache.get(n) or {}).get("ec"))
    print(f"命中:CID {hit_cid} ({hit_cid / max(1, len(names)):.0%}) · "
          f"CAS {hit_cas} ({hit_cas / max(1, len(names)):.0%}) · EC {hit_ec}")
    for n in names[:400]:
        v = cache.get(n) or {}
        if v.get("cas"):
            print(f"    例 {n[:44]:<44} CAS {v['cas']}")
            break

    if a.apply:
        apply_to_d1(rows, cache)


if __name__ == "__main__":
    main()

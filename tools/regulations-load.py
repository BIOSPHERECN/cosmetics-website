#!/usr/bin/env python3
"""各国化妆品法规 —— 把调研 JSON(data/regulations/*.json)灌进 D1 的 regulations / regulation_updates。

由来:创始人 2026-09-11 00:4x「你只写了东南亚的,还有全球的各国法规,还需要去收集最新的法规规定,那才是更全面的」。
站上原来的「各国备案索引」只写了东南亚六国的通报账号;这里按市场(欧盟 / 英国 / 美国 / 加拿大 / 中国 / 日韩 /
东盟各国 / 印度 / 澳新 / 海湾 / 拉美 / 非洲 …)各给一条:主管机构、主法规与引用号、生效时间、最近一次修订、
上市路径(通报 / 备案 / 注册)、境内责任人、安全档案、标签要点、动物试验、禁限用清单(能对上本站目录的挂链接)、官方链接、来源。

调研 JSON 由三个子代理用搜索引擎从官方站 / 法规咨询机构页面整理,每条带 sources;字段是英文一句话,
中文由 Agnes 逐句翻(短句,稳定),翻不出来留英文。**不写没有来源的条目;不确定的写在 notes 里。**

用法:
    python tools/regulations-load.py            体检(读 JSON、数条、不写库、不翻译)
    python tools/regulations-load.py --apply    翻译 + 写库
"""
import argparse
import glob
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import chat, d1, d1_exec, fleet  # noqa: E402
import html as htmlmod  # noqa: E402

PROVS = None
SYS = "你是化妆品法规翻译。把用户给的英文句子译成简体中文,专业、简洁,保留法规编号、机构缩写、系统名与英文专名(如 CPNP、MoCRA、RDC 752/2022),只输出译文,不加解释。"

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(os.path.dirname(HERE), "data", "regulations")
REGION_ZH = {
    "Europe": "欧洲", "Eurasia": "欧亚", "North America": "北美", "Latin America": "拉美", "East Asia": "东亚",
    "Southeast Asia": "东南亚", "South Asia": "南亚", "Oceania": "大洋洲", "Middle East": "中东", "Africa": "非洲",
}
REGION_SORT = ["East Asia", "Southeast Asia", "South Asia", "Oceania", "Europe", "Eurasia", "North America", "Latin America", "Middle East", "Africa"]
# 市场 → 本站目录 id(能对上的才挂)
INCI_REG = {"eu": "eu-cosing", "uk": "eu-annex", "cn": "cn-stsc", "jp": "jp-std", "kr": "kr-safety", "ca": "ca-hotlist", "us": "us-fda",
            "br": "br-anvisa", "asean": "asean-acd", "sg": "asean-acd", "my": "asean-acd", "th": "asean-acd", "id": "asean-acd",
            "vn": "asean-acd", "ph": "asean-acd"}
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''").replace(chr(10), " ") + "'"  # noqa: E731


def zh_of(text: str, cache: dict) -> str:
    """英文一句话 → 中文一句话。短句走 Agnes,失败留英文。"""
    global PROVS
    if not text or text in cache:
        return cache.get(text, "")
    if PROVS is None:
        # 舰队默认顺序是商汤 / 美团在前,短句翻译一条要等 20 秒;Agnes 3.0 思考关掉 1–2 秒一条,放前面
        allp = fleet()
        PROVS = [p for p in allp if str(p["model"]).startswith("agnes-3")] + [p for p in allp if not str(p["model"]).startswith("agnes-3")]
    try:
        out, who, err = chat(PROVS, [{"role": "system", "content": SYS}, {"role": "user", "content": text}],
                             max_tokens=500, temperature=0.1, think=False)
        out = (out or "").strip().strip("「」\"'")
        # 译文比原文还长两倍以上 = 模型在解释而不是在翻,留英文
        cache[text] = out if out and len(out) < len(text) * 2 + 40 and "\n\n" not in out else text
    except Exception:
        cache[text] = text
    return cache[text]


def clean(o):
    """子代理回的 JSON 里夹着 &amp; / &gt; 这类 HTML 实体,统一还原。"""
    if isinstance(o, str):
        return htmlmod.unescape(o)
    if isinstance(o, list):
        return [clean(x) for x in o]
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    return o


def load_json():
    markets, updates = [], []
    for f in sorted(glob.glob(os.path.join(DIR, "*.json"))):
        try:
            j = clean(json.load(io.open(f, encoding="utf-8")))
        except Exception as e:
            print("  坏 JSON:", os.path.basename(f), e); continue
        markets += j.get("markets", [])
        updates += j.get("updates_2025_2026", [])
        print(f"  {os.path.basename(f)}: 市场 {len(j.get('markets', []))} · 动态 {len(j.get('updates_2025_2026', []))}")
    return markets, updates


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    markets, updates = load_json()
    seen = set()
    good = []
    for m in markets:
        mid = str(m.get("id") or "").strip().lower()
        if not mid or mid in seen or not m.get("law_en") or not m.get("sources"):
            print("  跳过(缺 id/法规名/来源):", mid or m.get("country_en")); continue
        seen.add(mid); good.append(m)
    print(f"共 {len(good)} 个市场 · {len(updates)} 条 2025–2026 动态")
    if not a.apply:
        print("\n加 --apply 才翻译写库"); return
    cache = {}
    cachef = os.path.join(DIR, "_zh-cache.json")
    if os.path.exists(cachef):
        cache = json.load(io.open(cachef, encoding="utf-8"))
    # 先把要翻的句子并行预热进缓存(6 路),再串行写库;42 个市场 × 7 句 + 28 条动态 × 2 句
    texts = []
    for m in good:
        lu = m.get("latest_update") or {}
        for k in ("market_entry", "responsible_person", "safety_file", "labeling_key", "animal_testing", "ingredient_lists"):
            if isinstance(m.get(k), str) and m.get(k):
                texts.append(m[k])
        if not m.get("law_zh") and m.get("law_en"):
            texts.append(m["law_en"])
        if lu.get("what"):
            texts.append(str(lu["what"]))
    for u in updates:
        for k in ("title_en", "summary_en"):
            if u.get(k):
                texts.append(str(u[k]))
    texts = [t for t in dict.fromkeys(texts) if t not in cache]
    print(f"待翻译 {len(texts)} 句(缓存已有 {len(cache)})")
    from concurrent.futures import ThreadPoolExecutor
    done = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        for _ in ex.map(lambda t: zh_of(t, cache), texts):
            done += 1
            if done % 25 == 0:
                print(f"  已翻 {done}/{len(texts)}"); json.dump(cache, io.open(cachef, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump(cache, io.open(cachef, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    n = 0
    stmts = []
    for m in good:
        mid = m["id"].strip().lower()
        region = m.get("region") or "Europe"
        sort = REGION_SORT.index(region) * 100 + n if region in REGION_SORT else 9000 + n
        lu = m.get("latest_update") or {}
        f = lambda k: (m.get(k) or "") if isinstance(m.get(k), str) else ""  # noqa: E731
        row = {
            "id": mid, "region": region, "sort_order": sort,
            "country_zh": f("country_zh"), "country_en": f("country_en"), "authority_zh": f("authority_zh"), "authority_en": f("authority_en"),
            "law_zh": f("law_zh") or zh_of(f("law_en"), cache), "law_en": f("law_en"), "law_ref": f("law_ref"), "in_force": str(m.get("in_force_since") or ""),
            "latest_date": str(lu.get("date") or ""), "latest_what_en": str(lu.get("what") or ""), "latest_what_zh": zh_of(str(lu.get("what") or ""), cache),
            "latest_src": str(lu.get("source") or ""),
            "entry_en": f("market_entry"), "entry_zh": zh_of(f("market_entry"), cache),
            "rp_en": f("responsible_person"), "rp_zh": zh_of(f("responsible_person"), cache),
            "safety_en": f("safety_file"), "safety_zh": zh_of(f("safety_file"), cache),
            "labeling_en": f("labeling_key"), "labeling_zh": zh_of(f("labeling_key"), cache),
            "animal_en": f("animal_testing"), "animal_zh": zh_of(f("animal_testing"), cache),
            "lists_en": f("ingredient_lists"), "lists_zh": zh_of(f("ingredient_lists"), cache),
            "inci_registry": INCI_REG.get(mid, ""), "official_url": f("official_url"),
            "sources_json": json.dumps(m.get("sources") or [], ensure_ascii=False), "notes": f("notes"),
        }
        cols = ",".join(row.keys()); vals = ",".join(q(v) for v in row.values())
        sets = ",".join(f"{k} = excluded.{k}" for k in row if k != "id")
        # 不走 d1(--command):Windows 上 shell=True 会把 URL 里的 & 当命令分隔符,SQL 被截断(jp/tw/mx 三条就这么丢的);攒成文件走 d1_exec
        stmts.append(f"INSERT INTO regulations ({cols}) VALUES ({vals}) ON CONFLICT(id) DO UPDATE SET {sets}, updated_at = datetime('now');")
        n += 1
        print(f"  {mid:<6} {row['country_zh'] or row['country_en']:<12} {row['law_ref'][:40]:<42} 最近 {row['latest_date']}")
        json.dump(cache, io.open(cachef, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    stmts.append("DELETE FROM regulation_updates;")
    k = 0
    for u in sorted(updates, key=lambda x: str(x.get("date") or ""), reverse=True):
        if not u.get("date") or not u.get("title_en") or not u.get("source"):
            continue
        mid = str(u.get("market_id") or "").lower()
        stmts.append("INSERT INTO regulation_updates (date, market_id, title_en, title_zh, summary_en, summary_zh, source) VALUES ("
                     + ",".join([q(u["date"]), q(mid), q(u["title_en"]), q(zh_of(u["title_en"], cache)), q(u.get("summary_en") or ""),
                                 q(zh_of(u.get("summary_en") or "", cache)), q(u["source"])]) + ");")
        k += 1
    json.dump(cache, io.open(cachef, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    f = os.path.join(HERE, "_regulations.sql")
    io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(stmts) + "\n")
    total = d1_exec(f)
    got = d1("SELECT COUNT(*) n FROM regulations")[0]["n"]; gu = d1("SELECT COUNT(*) n FROM regulation_updates")[0]["n"]
    print(f"写入 市场 {n} · 动态 {k} · 译句缓存 {len(cache)} · D1 执行 {total} 行 · 库里 市场 {got} / 动态 {gu}")


if __name__ == "__main__":
    main()

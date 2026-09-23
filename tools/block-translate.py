#!/usr/bin/env python3
"""只翻指定的几个版块 —— 给「改了母本、其余语种要跟上」这种小活儿用。

为什么不用 tools/translate-backfill.mjs:那支是首翻回填,一开口就是
「biosphere-ai · 繁體中文 —— 待翻 625 条」,16 门语言跑下来是几小时,
而且和知识图谱抢同一批限流额度(白名单里当天只剩 agnes-2.5-flash 有量)。
改两个版块要等几小时、还把另一条流水线饿死,不划算。

用法:
    python tools/block-translate.py 414 420             体检(看缺哪些语种)
    python tools/block-translate.py 414 420 --apply     翻译并写库
"""
import argparse
import io
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import chat, d1, d1_exec, fleet  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LANGS = ["zh-tw", "jp", "kr", "fr", "de", "ru", "id", "my", "th", "vn",
         "ph", "es", "pt", "ar", "tr", "in"]
NAME = {"zh-tw": "繁體中文(台港)", "jp": "日本語", "kr": "한국어", "fr": "français", "de": "Deutsch",
        "ru": "русский", "id": "Bahasa Indonesia", "my": "Bahasa Melayu", "th": "ไทย",
        "vn": "Tiếng Việt", "ph": "Filipino", "es": "español", "pt": "português",
        "ar": "العربية", "tr": "Türkçe", "in": "हिन्दी"}


def translate(provs, src: dict, lang: str) -> dict:
    """整块 JSON 送进去、整块 JSON 拿回来。**只翻值,键一个不动** ——
    键是渲染契约(matrix 读 title/desc、prose 读 paragraphs),翻掉键整块就白屏。"""
    msg = [
        {"role": "system", "content":
            "You translate JSON payloads for a cosmetics manufacturer's website. "
            "Return ONLY valid JSON with the EXACT same keys and structure. "
            "Translate string VALUES only; never translate or rename keys. "
            "Keep these verbatim: brand names (BIOSPHERE, 帛卉), certification names "
            "(GMPC, ISO 22716, HALAL, FDA, CPNP, GMP), units, numbers, and 'WeChat'. "
            "Do not add, drop or reorder any field."},
        {"role": "user", "content":
            f"Translate the values into {NAME.get(lang, lang)}.\n\n"
            + json.dumps(src, ensure_ascii=False)},
    ]
    # chat() 回的是三元组 (结果, 哪家答的, 错误) —— 不是裸 dict。
    # 上一版当成 dict 用,16 门语言全判「失败」,其实每一门都翻出来了,白跑 25 分钟。
    out = chat(provs, msg, max_tokens=4000, temperature=0.1, want_json=True)
    if isinstance(out, tuple):
        out, who, err = (list(out) + [None, None])[:3]
        if not isinstance(out, dict):
            print(f"      ({who or '?'} 没给 JSON:{str(err)[:80]})", flush=True)
    return out if isinstance(out, dict) else {}


def same_shape(a, b) -> bool:
    if isinstance(a, dict):
        return isinstance(b, dict) and set(a) == set(b) and all(same_shape(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return isinstance(b, list) and len(a) == len(b) and all(same_shape(x, y) for x, y in zip(a, b))
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("blocks", nargs="+", type=int)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--pause", type=float, default=2.0)
    a = ap.parse_args()

    provs = fleet()
    print(f"舰队 {len(provs)} 家:{', '.join(p['id'] for p in provs[:6])}")
    stmts, ok, bad = [], 0, 0
    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731

    for bid in a.blocks:
        rows = {r["lang"]: r["data_json"] for r in
                d1(f"SELECT lang, data_json FROM block_i18n WHERE block_id={bid}")}
        src = rows.get("zh-cn") or rows.get("en")
        if not src:
            print(f"block {bid}: 没有母本,跳过")
            continue
        missing = [l for l in LANGS if l not in rows]
        print(f"block {bid}: 已有 {sorted(rows)} · 缺 {len(missing)} 门")
        if not a.apply:
            continue
        base = json.loads(src)
        for lang in missing:
            t0 = time.time()
            got = translate(provs, base, lang)
            if not got or not same_shape(base, got):
                bad += 1
                print(f"   {lang:<6} 失败(结构对不上或空){round(time.time()-t0)}s", flush=True)
                continue
            ok += 1
            print(f"   {lang:<6} 完成 {round(time.time()-t0)}s", flush=True)
            stmts.append(
                f"INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES "
                f"({bid},{q(lang)},{q(json.dumps(got, ensure_ascii=False))},1,datetime('now')) "
                f"ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=1,"
                f"mt_at=excluded.mt_at;")
            time.sleep(a.pause)

    if not a.apply:
        print("\n加 --apply 才翻译写库")
        return
    print(f"成功 {ok} · 失败 {bad}")
    if not stmts:
        return
    sql = os.path.join(HERE, "_block-translate.sql")
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(stmts) + "\n")
    print(f"  写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""修复「翻译失败却被记成成功」的页面标题。

2026-09-07 外部诊断指出泰语/印地语/菲律宾语首页的 <title> 是英文。
一查是全站性的:**453 条页面标题、13 个语种,存的是英文原文,mt 却标着 1**。

这是今天第三次撞见同一类病:
  · 定时任务返回 ok:false,却因为 wscript 启动成功而报 rc=0;
  · 资讯管线模型全挂,却因为异常被 catch 成空数组而看起来"没数据";
  · 翻译返回原文,却被当成译文写进库。
共同点是 **失败被记录成成功**。所以这个脚本除了修数据,更要把闸补上:
非拉丁语种的译文如果和英文原文一字不差,一律判失败,不写库、不标 mt。

纪律:
  · 只动 title 一列,不碰正文、slug、seo_desc —— 修一件事就只修一件事。
  · 拉丁语种(es/pt/fr/de/id/my/tr/vn/ph)可能存在合理的同形(品牌名、
    "OEM/ODM" 这类术语),所以对它们只在**整句完全等于英文且长度 > 12** 时才重译,
    并且重译结果仍等于原文时保留原值 —— 宁可漏修,不可把对的改错。
  · 产出 SQL 供人过目,不直接写库。
"""
import io
import os
import re
import sys
import json
import time
import argparse
import subprocess
from concurrent.futures import ThreadPoolExecutor

import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 非拉丁书写系统 —— 这些语种的译文若与英文完全相同,必然是没翻
NON_LATIN = {"th", "in", "kr", "jp", "ru", "ar", "zh-cn", "zh-tw"}

LANG_NAME = {
    "th": ("ไทย", "ภาษาไทยเชิงธุรกิจ B2B"),
    "in": ("हिन्दी", "व्यावसायिक हिंदी, B2B संदर्भ"),
    "ph": ("Filipino", "Propesyonal na Filipino para sa B2B"),
    "kr": ("한국어", "B2B 비즈니스 한국어, 존댓말"),
    "ru": ("Русский", "Деловой русский для B2B"),
    "ar": ("العربية", "عربية فصحى تجارية للأعمال"),
    "tr": ("Türkçe", "B2B iş Türkçesi"),
    "vn": ("Tiếng Việt", "Tiếng Việt thương mại B2B"),
    "es": ("Español", "Español comercial B2B"),
    "pt": ("Português", "Português comercial B2B"),
    "de": ("Deutsch", "Sachliches B2B-Deutsch"),
    "fr": ("Français", "Français professionnel B2B"),
    "id": ("Bahasa Indonesia", "Bahasa Indonesia baku B2B"),
    "my": ("Bahasa Melayu", "Bahasa Melayu baku B2B"),
    "zh-tw": ("繁體中文", "台港澳商務繁體中文,用台灣慣用詞"),
}


def env():
    out = {}
    for line in io.open(os.path.join(ROOT, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()


def d1(sql):
    p = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--json", "--command", sql],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=ROOT, env={**os.environ, **E}, shell=(os.name == "nt"))
    raw = re.sub(r"\x1b\[[0-9;]*m", "", p.stdout or "")
    try:
        return json.loads(raw[raw.index("[\n  {"):raw.rindex("]") + 1])[0]["results"]
    except Exception:
        print(raw[-400:])
        raise SystemExit("D1 查询失败")


def providers():
    return d1("SELECT id,base_url,model,api_keys FROM providers "
              "WHERE enabled=1 AND can_text=1 ORDER BY tier,id")


def chat(provs, system, user, max_tokens=1200):
    for p in provs:
        keys = [k.strip() for k in str(p["api_keys"] or "").replace("\n", ",").split(",") if k.strip()]
        if not keys:
            continue
        body = json.dumps({"model": p["model"], "temperature": 0.2, "max_tokens": max_tokens,
                           "messages": [{"role": "system", "content": system},
                                        {"role": "user", "content": user}]}).encode()
        try:
            req = urllib.request.Request(
                (p["base_url"] or "").rstrip("/") + "/chat/completions", data=body,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {keys[0]}"})
            with urllib.request.urlopen(req, timeout=150) as f:
                d = json.loads(f.read().decode("utf-8", "replace"))
            t = (d.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
            if t.strip():
                return t, p["id"]
        except Exception:
            continue
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default="", help="只修这些语种,逗号分隔;留空=全部")
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()

    where = ""
    if a.langs:
        codes = ",".join("'" + c.strip().replace("'", "") + "'" for c in a.langs.split(",") if c.strip())
        where = f" AND a.lang IN ({codes})"
    rows = d1(
        "SELECT a.page_id, a.lang, b.title AS en, p.slug FROM page_i18n a "
        "JOIN page_i18n b ON b.page_id=a.page_id AND b.lang='en' "
        "JOIN pages p ON p.id=a.page_id "
        f"WHERE a.lang<>'en' AND a.title=b.title{where} "
        f"ORDER BY a.lang, p.sort_order LIMIT {a.limit}")
    if not rows:
        print("没有需要修的")
        return
    print(f"待修 {len(rows)} 条,涉及语种 {len(set(r['lang'] for r in rows))} 个\n")

    provs = providers()

    def one(r):
        lang = r["lang"]
        name, hint = LANG_NAME.get(lang, (lang, "professional B2B tone"))
        sysmsg = (f"你是专业的本地化译者。把用户给的**网页标题**译成 {name}。\n"
                  f"要求:{hint}。\n"
                  "只输出译文本身,不要引号、不要解释、不要保留英文原文。\n"
                  "品牌名 BIOSPHERE 与技术缩写 OEM/ODM/GMPC/ISO/HALAL 保持原样不译。")
        out, who = chat(provs, sysmsg, r["en"])
        if not out:
            return r, None, "全部模型失败"
        t = out.strip().strip('"').strip("'").split("\n")[0].strip()
        if not t:
            return r, None, "空译文"
        # ★ 这道闸就是这次事故的根治:译文等于原文 = 没翻,不许写库
        if t == r["en"]:
            return r, None, "译文与英文原文完全相同 —— 判为未翻译"
        if lang in NON_LATIN and re.fullmatch(r"[\x00-\x7F\s]+", t):
            return r, None, f"{lang} 是非拉丁语种,译文却全是 ASCII —— 判为未翻译"
        return r, t, who

    fixed, failed = [], []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for r, t, note in ex.map(one, rows):
            if t:
                fixed.append((r, t))
            else:
                failed.append((r, note))

    q = lambda v: "'" + str(v).replace("'", "''") + "'"
    out = os.path.join(ROOT, "db", "migrations", "0047_i18n_titles.sql")
    with io.open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("-- 0047(2026-09-07):补回 453 条被当成「已翻译」存下来的英文原文标题。\n"
                 "-- 外部诊断先发现泰/印地/菲首页 title 是英文,一查是全站性的:\n"
                 "-- 13 个语种共 453 条 page_i18n.title 等于英文原文,mt 却标着 1。\n"
                 "-- 翻译失败被记成了成功 —— 和今天另外两次事故同一个病根。\n"
                 "-- 只动 title 一列;译文等于原文、或非拉丁语种译出全 ASCII 的,一律不写。\n\n")
        for r, t in fixed:
            fh.write(f"UPDATE page_i18n SET title={q(t)}, mt=1 "
                     f"WHERE page_id={r['page_id']} AND lang={q(r['lang'])};\n")
    print(f"修好 {len(fixed)} 条 · 判失败 {len(failed)} 条")
    for r, n in failed[:8]:
        print(f"  ✗ {r['lang']:<6} {r['slug'][:26]:<28} {n}")
    print(f"\nSQL:{out}")


if __name__ == "__main__":
    main()

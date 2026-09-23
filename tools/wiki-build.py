#!/usr/bin/env python3
"""配方维基第一版:由库编译原料页(ingredients 149 张)与剂型页(formulas GROUP BY format),写进 wiki_pages。

默认全部由库编译、不调模型,页尾标「①有出处 · 脚本编译」—— 每一句都能指回某张表某一行,
这样召集专家时装进提示词的维基才是①,而不是模型自己编的②③。

**先整表拉进内存,再逐页拼(不许逐页查库)**:_bohui.d1() 每次起一个 wrangler 远程进程(30–90 秒),
逐页查 149 张 × 5 次 = 750 次 ≈ 6–18 小时。这里开头一次性拉取(约 25 次),之后零查库。
Windows 下 d1() 走 cmd.exe,命令行上限 8,191 字符,所以 IN 列表每批 ≤40 个值。

用法:
    python tools/wiki-build.py                                  体检:拉取 + 拼页 + 打印页数与每页字符数,不写
    python tools/wiki-build.py --kind ingredient --limit 10 --apply   先小批验
    python tools/wiki-build.py --kind ingredient --apply
    python tools/wiki-build.py --kind format --apply
    python tools/wiki-build.py --kind format --limit 1 --model  可行性尝试:页尾追加模型综述,tier 记 ②
    --slug ingredient/xxx 单页重编;--cached 复用上次拉取的 tools/_wiki-fetch.json(省 15–40 分钟)
"""
import argparse
import io
import json
import os
import re
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, fleet, chat  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ZH = json.load(io.open(os.path.join(ROOT, "apps/web/src/lib/formula-lab-zh.json"), encoding="utf-8"))
CACHE = os.path.join(HERE, "_wiki-fetch.json")
BATCH = 40          # IN 列表每批上限(cmd.exe 8,191 字符)
PAGES_PER_STMT = 20
STMT_BYTES = 50_000  # D1 单条语句约 100KB 上限(SQLITE_TOOBIG);**按 UTF-8 字节算**,中文一个字 3 字节,按字符数切 60K 实测 149 页/8 条仍报错(2026-09-17)
KG_TYPES = ("配伍禁忌", "稳定性", "工艺", "法规", "配方应用")
# cn-stsc 的 no 前缀 → 目录性质(CN-109 禁用原料 / CN-110 禁用植(动)物 / CN-111 限用 / CN-112~115 准用防腐/防晒/着色/染发)
STSC_KIND = {"CN-109": "禁用", "CN-110": "禁用", "CN-111": "限用"}
TIER_LINES = ("认知三档:①公开常识(有出处)/ ②经验推演(推断)/ ③存疑。"
              "脚本编译的内容全部为 ①;模型综述一律标 ②,不许把 ②③ 当 ① 用。涉及法规处以最新官方文本为准。")


def fmt_zh(f):
    return ZH["FORMAT_ZH"].get(f) or f"{f}(待译)"


def cat_zh(c):
    return ZH["CAT_ZH"].get(c) or f"{c}(待译)"


def ben_zh(b):
    return ZH["BENEFIT_ZH"].get(b) or b


def inci_key(x):
    """与 tools/nmpa-catalog.py:142 同算法(去括号 → 去标点 → 大写),两边必须一致,否则目录对不上。"""
    x = re.sub(r"[（(][^）)]*[）)]", " ", (x or "").upper())
    return re.sub(r"[^A-Z0-9]+", " ", x).strip()


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def split_csv(s):
    return [x.strip() for x in str(s or "").replace(";", ",").split(",") if x.strip()]


def batched(vals, fn):
    """分批 IN 查询,合并结果。每批一行日志,失联时能看到卡在哪。"""
    vals = sorted(set(v for v in vals if v is not None and v != ""))
    out = []
    for i in range(0, len(vals), BATCH):
        part = vals[i:i + BATCH]
        rows = fn(", ".join(q(v) for v in part))
        out += rows
        print(f"    批 {i // BATCH + 1}/{(len(vals) + BATCH - 1) // BATCH}:{len(part)} 个值 → {len(rows)} 行")
    return out


# ---------- 7.0 拉取 ----------
def fetch(kind):
    t0 = time.time()
    data = {}
    print("[1/6] ingredients")
    data["ingredients"] = d1("SELECT slug,inci,name_zh,aliases,cas,family,functions,mechanism_zh,use_level,formats,ph_range,"
                             "incompatible,stability,market_cn,market_eu,market_us,market_apac,market_other,halal_vegan,"
                             "cost_band,factory_note,confidence FROM ingredients")
    print(f"    {len(data['ingredients'])} 行")
    print("[2/6] formulas")
    data["formulas"] = d1("SELECT code,category,format,benefits,actives_json,ph,preservative,viscosity,fill_temp,shelf_life_m,"
                          "reg_class FROM formulas WHERE status IN ('sample','active')")
    print(f"    {len(data['formulas'])} 行")
    if kind == "format":
        # 剂型页只用 formulas + ingredients(对链接),目录与星图不拉
        data["catalog"], data["nodes"], data["edge_nodes"], data["edges"] = [], [], [], []
    else:
        print("[3/6] inci_catalog(按 inci_key)")
        data["catalog"] = batched([inci_key(r["inci"]) for r in data["ingredients"]],
                                  lambda s: d1(f"SELECT registry,no,name_zh,inci,inci_key,max_rinse,max_leave,note FROM inci_catalog WHERE inci_key IN ({s})"))
        print("[4/6] kg_nodes(按 name_zh)")
        data["nodes"] = batched([r["name_zh"] for r in data["ingredients"]],
                                lambda s: d1(f"SELECT id,name,type FROM kg_nodes WHERE name IN ({s})"))
        print("[5/6] kg_edge_nodes")
        data["edge_nodes"] = batched([n["id"] for n in data["nodes"]],
                                     lambda s: d1(f"SELECT edge_id,node_id FROM kg_edge_nodes WHERE node_id IN ({s})"))
        print("[6/6] kg_edges")
        types = ", ".join(q(t) for t in KG_TYPES)
        data["edges"] = batched([e["edge_id"] for e in data["edge_nodes"]],
                                lambda s: d1(f"SELECT id,name,type,description,origin FROM kg_edges WHERE id IN ({s}) AND type IN ({types})"))
    data["fetched_kind"] = kind or "all"   # 缓存里记这份是哪种拉取:format 版没有目录与星图,不能拿去编原料页
    print(f"拉取完成 {int(time.time() - t0)} 秒")
    return data


# ---------- 7.1 原料页 ----------
def ingredient_page(ing, data):
    inci = ing["inci"] or ""
    key = inci_key(inci)
    cat = [c for c in data["catalog"] if c["inci_key"] == key]
    nmpa = sorted((c for c in cat if c["registry"] == "cn-nmpa-2021"), key=lambda c: str(c["no"]))
    stsc = sorted((c for c in cat if c["registry"] == "cn-stsc"), key=lambda c: str(c["no"]))
    others = sorted({c["registry"] for c in cat} - {"cn-nmpa-2021", "cn-stsc"})
    node_ids = {n["id"] for n in data["nodes"] if n["name"] == ing["name_zh"]}
    edge_ids = {e["edge_id"] for e in data["edge_nodes"] if e["node_id"] in node_ids}
    edges = [e for e in data["edges"] if e["id"] in edge_ids]
    # 用过它的配方:actives_json 里 "inci" 与本原料同 key(大小写与括号不敏感)
    used = [f for f in data["formulas"] if any(inci_key(a.get("inci")) == key for a in actives(f))][:20]

    L = [f"# {ing['name_zh']}({inci})", "", "## 基本",
         f"- INCI:{inci}", f"- 中文名:{ing['name_zh']}", f"- 别名:{ing['aliases'] or '—'}", f"- CAS:{ing['cas'] or '—'}",
         f"- 家族:{ing['family'] or '—'}",
         f"- 功效标签:{'、'.join(ben_zh(b) for b in split_csv(ing['functions'])) or '—'}",
         f"- 作用机理:{ing['mechanism_zh'] or '—'}", "",
         "## 常见用量",
         f"- 常见添加量:{ing['use_level'] or '—'}(公开常见添加区间,非法规限值)",
         f"- pH 范围:{ing['ph_range'] or '—'}",
         f"- 适用剂型:{'、'.join(fmt_zh(f) for f in split_csv(ing['formats'])) or '—'}", "",
         "## 目录状态"]
    if nmpa:
        L.append("- cn-nmpa-2021(已使用化妆品原料目录 2021):")
        for c in nmpa:
            L.append(f"  - 序号 {c['no']} · {c['name_zh']} · 最高历史使用量 淋洗 {c['max_rinse'] or '—'} / 驻留 {c['max_leave'] or '—'}")
    else:
        L.append("- cn-nmpa-2021:未命中。正面目录未收录 ≠ 禁用(可能是名称写法差异或属新原料,需人工核对)。")
    if stsc:
        L.append("- cn-stsc(化妆品安全技术规范):")
        for c in stsc:
            kind = STSC_KIND.get(str(c["no"]).split("/")[0], "准用")
            L.append(f"  - {kind} · {c['no']} · {c['note'] or ''}")
    else:
        L.append("- cn-stsc:未命中。负面清单未命中 ≠ 无限制(限用/准用表按用途另有条件,以最新官方文本为准)。")
    L.append(f"- 其他目录命中:{'、'.join(others) if others else '无'}")
    L += ["", "## 配伍与稳定性",
          f"- 不相容:{ing['incompatible'] or '—'}", f"- 稳定性:{ing['stability'] or '—'}", f"- 工厂备注:{ing['factory_note'] or '—'}", "",
          "## 市场",
          f"- 中国:{ing['market_cn'] or '—'}", f"- 欧盟:{ing['market_eu'] or '—'}", f"- 美国:{ing['market_us'] or '—'}",
          f"- 亚太:{ing['market_apac'] or '—'}", f"- 其他:{ing['market_other'] or '—'}",
          f"- 清真/纯素:{ing['halal_vegan'] or '—'}", f"- 成本档:{ing['cost_band'] or '—'}", f"- 资料可信度:{ing['confidence'] or '—'}", "",
          "## 星图注意事项(机器抽取,以官方文本为准)"]
    if edges:
        for e in sorted(edges, key=lambda e: (e["type"], e["id"])):
            pre = "[机器抽取] " if e.get("origin") == "machine" else ""
            L.append(f"- {pre}{e['type']}:{e['name']} — {e['description'] or ''}")
    else:
        L.append("- 星图暂无与本原料相关的配伍/稳定性/工艺/法规边。")
    L += ["", "## 用过它的配方"]
    if used:
        for f in used:
            L.append(f"- {f['code']} · {fmt_zh(f['format'])} · {'、'.join(ben_zh(b) for b in split_csv(f['benefits']))}")
    else:
        L.append("- 库内示例配方暂无。")
    sources = [{"table": "ingredients", "key": ing["slug"]},
               {"table": "inci_catalog", "no": [c["no"] for c in nmpa + stsc]},
               {"table": "kg_edges", "id": sorted(e["id"] for e in edges)},
               {"table": "formulas", "code": [f["code"] for f in used]}]
    L += ["", "## 来源", "```json", json.dumps(sources, ensure_ascii=False), "```", "", "①有出处 · 脚本编译"]
    links = sorted({f"format/{f['format']}" for f in used})
    return dict(slug=f"ingredient/{ing['slug']}", kind="ingredient", title=f"{ing['name_zh']}({inci})",
                body_md="\n".join(L), links_json=json.dumps(links, ensure_ascii=False),
                sources_json=json.dumps(sources, ensure_ascii=False), compiled_by="script", tier="①")


def actives(f):
    try:
        v = json.loads(f.get("actives_json") or "[]")
        return v if isinstance(v, list) else []
    except Exception:
        return []


# ---------- 7.2 剂型页 ----------
def format_page(fmt, rows, data):
    by_key = {inci_key(i["inci"]): i for i in data["ingredients"]}
    n = len(rows)
    cats = Counter(r["category"] for r in rows)
    regs = Counter(r["reg_class"] or "未填" for r in rows)
    bens = Counter(b for r in rows for b in split_csv(r["benefits"]))
    acts = Counter()
    for r in rows:
        for a in actives(r):
            acts[(a.get("name") or "", a.get("inci") or "")] += 1

    def dist(col):
        c = Counter(str(r[col]) if r[col] not in (None, "") else "未填" for r in rows)
        return "、".join(f"{k}({v})" for k, v in c.most_common(8))

    L = [f"# 剂型:{fmt_zh(fmt)}({fmt})", "", "## 概况",
         f"- 库内示例配方:{n} 条",
         f"- 品类分布:{'、'.join(f'{cat_zh(k)}({v})' for k, v in cats.most_common())}",
         f"- 监管分类:{'、'.join(f'{k}({v},{round(100 * v / n)}%)' for k, v in regs.most_common())}", "",
         "## 常见功效"]
    L += [f"- {ben_zh(b)}({c})" for b, c in bens.most_common(10)] or ["- —"]
    L += ["", "## 常用活性物"]
    links = []
    for (name, inci), c in acts.most_common(15):
        ing = by_key.get(inci_key(inci))
        if ing:
            links.append(f"ingredient/{ing['slug']}")
            L.append(f"- [{name}({inci})](ingredient/{ing['slug']})({c})")
        else:
            L.append(f"- {name}({inci})({c})")
    if not acts:
        L.append("- —")
    L += ["", "## 典型工艺参数",
          f"- pH:{dist('ph')}", f"- 防腐体系:{dist('preservative')}", f"- 粘度:{dist('viscosity')}",
          f"- 灌装温度:{dist('fill_temp')}", f"- 货架期(月):{dist('shelf_life_m')}", "",
          "## 库内配方", "- " + "、".join(r["code"] for r in rows[:30]),
          "", "## 来源", "```json", json.dumps([{"table": "formulas", "count": n}], ensure_ascii=False), "```", "",
          "①有出处 · 脚本编译"]
    return dict(slug=f"format/{fmt}", kind="format", title=f"剂型:{fmt_zh(fmt)}({fmt})", body_md="\n".join(L),
                links_json=json.dumps(sorted(set(links)), ensure_ascii=False),
                sources_json=json.dumps([{"table": "formulas", "count": n}], ensure_ascii=False),
                compiled_by="script", tier="①")


# ---------- 7.3 可选模型综述 ----------
def add_summary(page):
    provs = fleet()
    if not provs:
        print("  [模型] 舰队为空(providers 无可用 key)")
        return page
    sysmsg = ("你是帛卉化妆品工厂的配方维基编辑。只依据给出的维基正文写一段不超过 300 字的中文综述,"
              "不引入正文没有的数字、目录序号或法规结论;不确定的写「存疑」。" + TIER_LINES)
    txt, pid, err = chat(provs, [{"role": "system", "content": sysmsg},
                                 {"role": "user", "content": page["body_md"][:6000]}], max_tokens=800, want_json=False)
    if not txt:
        print(f"  [模型] 失败:{err}")
        return page
    body = page["body_md"].replace("\n①有出处 · 脚本编译", "")
    page["body_md"] = body + "\n\n## 综述(模型,②经验推演)\n" + txt.strip()[:600] + "\n\n①有出处 · 脚本编译;综述段 ② 由模型 " + pid + " 生成"
    page["compiled_by"] = f"provider:{pid}"
    page["tier"] = "②"
    print(f"  [模型] {pid} 综述 {len(txt)} 字")
    return page


# ---------- 写库 ----------
COLS = ["slug", "kind", "title", "body_md", "links_json", "sources_json", "compiled_by", "tier"]
UPD = ("body_md=excluded.body_md, title=excluded.title, links_json=excluded.links_json, sources_json=excluded.sources_json, "
       "compiled_by=excluded.compiled_by, tier=excluded.tier, version=wiki_pages.version+1, updated_at=datetime('now')")


def write(pages):
    stmts, cur, size = [], [], 0
    for p in pages:
        v = "(" + ", ".join(q(p[c]) for c in COLS) + ")"
        nb = len(v.encode("utf-8"))
        if cur and (len(cur) >= PAGES_PER_STMT or size + nb > STMT_BYTES):
            stmts.append(cur)
            cur, size = [], 0
        cur.append(v)
        size += nb
    if cur:
        stmts.append(cur)
    sql = "".join(f"INSERT INTO wiki_pages ({', '.join(COLS)}) VALUES\n" + ",\n".join(s) + f"\nON CONFLICT(slug) DO UPDATE SET {UPD};\n"
                  for s in stmts)
    f = os.path.join(HERE, "_wiki-build.sql")
    io.open(f, "w", encoding="utf-8", newline="\n").write(sql)
    print(f"写库:{len(pages)} 页 / {len(stmts)} 条语句 / {len(sql) // 1024} KB")
    n = d1_exec(f)
    print(f"  d1_exec → {n} 行(UPSERT 一页可能记 1 或 2)")
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--kind", choices=["ingredient", "format"])
    ap.add_argument("--limit", type=int)
    ap.add_argument("--slug")
    ap.add_argument("--model", action="store_true")
    ap.add_argument("--cached", action="store_true", help="复用 tools/_wiki-fetch.json,不重新拉库")
    a = ap.parse_args()
    kind = a.kind or ("format" if (a.slug or "").startswith("format/") else None)

    data = None
    if a.cached and os.path.exists(CACHE):
        data = json.load(io.open(CACHE, encoding="utf-8"))
        # --kind format 那次拉取把 catalog / 星图写成 [],拿它编原料页会把「目录状态」「星图注意事项」整段编成「未命中」,UPSERT 后 version+1 盖掉好页
        if kind != "format" and not data.get("catalog"):
            print(f"缓存 {CACHE} 是 format 版(无目录 / 星图),编原料页不能用 —— 忽略缓存重新拉取")
            data = None
        else:
            print(f"复用缓存 {CACHE}(ingredients {len(data['ingredients'])} / formulas {len(data['formulas'])} / catalog {len(data['catalog'])})")
    if data is None:
        data = fetch(kind)
        io.open(CACHE, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False))

    pages = []
    if kind in (None, "ingredient"):
        pages += [ingredient_page(i, data) for i in sorted(data["ingredients"], key=lambda r: r["slug"])]
    if kind in (None, "format"):
        groups = {}
        for f in data["formulas"]:
            groups.setdefault(f["format"] or "unknown", []).append(f)
        pages += [format_page(k, sorted(v, key=lambda r: r["code"]), data) for k, v in sorted(groups.items())]
    if a.slug:
        pages = [p for p in pages if p["slug"] == a.slug]
    if a.limit:
        pages = pages[:a.limit]

    for p in pages:
        print(f"  {p['slug']:<48} {len(p['body_md']):>6} 字  {p['title']}")
    print(f"共 {len(pages)} 页:ingredient {sum(p['kind'] == 'ingredient' for p in pages)} / format {sum(p['kind'] == 'format' for p in pages)}"
          f" · 缺译剂型:{sorted({p['slug'].split('/')[1] for p in pages if p['kind'] == 'format' and '(待译)' in p['title']}) or '无'}")
    if a.model:
        pages = [add_summary(p) for p in pages]
    if not a.apply:
        print("体检完成(未写库)。--apply 写库")
        return
    if write(pages) == 0:
        sys.exit(1)   # 灌库失败要让 && 链停下,别让后面的步骤当没事继续
    print(d1("SELECT kind, COUNT(*) n FROM wiki_pages GROUP BY kind"))


if __name__ == "__main__":
    main()

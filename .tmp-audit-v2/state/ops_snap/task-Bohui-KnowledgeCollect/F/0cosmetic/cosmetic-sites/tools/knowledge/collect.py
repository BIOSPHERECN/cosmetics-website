"""帛卉行业知识库 · 公开信息收集(事实层入口)

只收合法公开来源(监管机构公告、行业协会、行业媒体 RSS),单进程、逐条、请求间歇。
每条:去重 → 取正文(RSS 描述太短才去读原页,先查 robots.txt)→ 本机网关免费国产模型写中文摘要
+「对客户意味着什么」一句话 → 数字核验(摘要里的每个数字必须能在原文里找到,找不到就标 needs_review)。

数据不进仓:默认落 F:/0cosmetic/助手交付/22-知识库与专家思维/data/(--out 可改)。
网关 token 运行时读 ~/.bohui-gateway/TOKEN.txt,不写进任何文件。
不注册计划任务、不写库、不发送任何东西。

用法:
  python collect.py                 # 每个来源取最新 6 条
  python collect.py --per 3 --only fr-fda,uk-psa
  python collect.py --selftest      # 不联网,只跑核验逻辑的断言
"""
import argparse, datetime, hashlib, html, io, json, os, re, sys, time, urllib.parse, urllib.robotparser
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("BOHUI_PROXY", "http://127.0.0.1:7890")   # 直连优先,失败才走代理(_bohui.http 的逻辑)

OUT = "F:/0cosmetic/助手交付/22-知识库与专家思维/data"
GW = "http://127.0.0.1:8788/v1/chat/completions"
TOPICS = ["法规政策", "召回与安全", "成分原料", "功效宣称", "包材包装", "可持续与ESG", "市场趋势",
          "渠道与平台", "企业动态", "科研进展", "防晒", "其他"]
MARKETS = ["美国", "欧盟", "英国", "中国", "东南亚", "日本", "韩国", "中东", "拉美", "加拿大", "澳新", "全球"]
BEAUTY = r"cosmetic|beauty|skin|hair|fragrance|perfume|makeup|make-up|sunscreen|spf|ingredient|formul|packag|personal care|lip|nail|deodor|serum|cream|talc|mocra"

# 来源清单:kind=rss/atom/fr(Federal Register API);level=证据等级 ①官方 ②机构/媒体 ③厂商自述(媒体里的新品稿由模型在摘要里写「据该公司称」)
SOURCES = [
    {"id": "fr-fda", "org": "美国联邦公报(FDA 相关)", "type": "监管", "level": "①", "kind": "fr", "filter": True,
     "url": "https://www.federalregister.gov/api/v1/documents.json?conditions[term]=cosmetic"
            "&conditions[agencies][]=food-and-drug-administration&order=newest&per_page=20"},
    {"id": "uk-psa", "org": "英国政府 产品安全警示与召回(化妆品类)", "type": "监管", "level": "①", "kind": "atom",
     "url": "https://www.gov.uk/product-safety-alerts-reports-recalls.atom?product_category[]=cosmetics"},
    {"id": "uk-opss", "org": "英国产品安全与标准办公室(OPSS)", "type": "监管", "level": "①", "kind": "atom", "filter": True,
     "url": "https://www.gov.uk/search/all.atom?keywords=cosmetic&organisations[]=office-for-product-safety-and-standards&order=updated-newest"},
    {"id": "cosm-eu", "org": "Cosmetics Europe(欧洲化妆品协会)", "type": "协会", "level": "②", "kind": "rss",
     "url": "https://cosmeticseurope.eu/news-events/feed/"},
    {"id": "cbiz", "org": "Cosmetics Business", "type": "媒体", "level": "②", "kind": "rss",
     "url": "https://www.cosmeticsbusiness.com/rss"},
    {"id": "pcm", "org": "Personal Care Magazine(原料商动态为主)", "type": "媒体/原料商", "level": "②", "kind": "rss",
     "url": "https://www.personalcaremagazine.com/rss"},
    {"id": "pbn", "org": "Premium Beauty News", "type": "媒体", "level": "②", "kind": "rss",
     "url": "https://www.premiumbeautynews.com/spip.php?page=backend&lang=en"},
    {"id": "gcn", "org": "Global Cosmetics News", "type": "媒体", "level": "②", "kind": "rss",
     "url": "https://www.globalcosmeticsnews.com/feed/"},
    {"id": "wwd", "org": "WWD Beauty Industry", "type": "媒体", "level": "②", "kind": "rss", "filter": True,
     "url": "https://wwd.com/beauty-industry-news/feed/"},
    {"id": "glossy", "org": "Glossy(美妆商业)", "type": "媒体", "level": "②", "kind": "rss", "filter": True,
     "url": "https://www.glossy.co/feed/"},
]

SYSTEM = ("你是帛卉化妆品(广州的规模化化妆品代工厂)的行业情报编辑。只能依据给你的原文写,"
          "不得加入原文没有的事实、数字、公司名;数字必须原样照搬原文(不换算单位、不四舍五入)。"
          "用自己的话概括,不要逐句翻译原文。成分名、法规编号保留英文原名(INCI),不要音译,确有通用中文名的放括号里。企业自己宣布的新品/功效,要写明「据该公司称」。"
          "「对客户意味着什么」写给跨境卖家和品牌方看,只讲他们该注意/可利用什么;"
          "不得出现价格、报价、交期、起订量承诺,不得提任何集团名。只输出一个 JSON 对象。")

PROMPT = """原文来源:{org}
原文标题:{title}
发布日期:{date}
原文正文(可能截断):
{text}

输出 JSON(键名固定):
{{"relevance": 相关度 0–3 取整数(0=与化妆品个护无关,如服装、时装、保健品、药品;1=只是顺带提到美妆;2=美妆行业动态,对跨境卖家有参考;3=直接影响化妆品的法规、安全、原料、配方、包材或渠道),
 "title_zh": "中文标题,不超过 30 字",
 "summary_zh": "中文摘要 80–150 字",
 "meaning": "对跨境卖家/品牌方意味着什么,一句话,不超过 60 字",
 "topics": 从 {topics} 里选 1–3 个,
 "markets": 从 {markets} 里选,原文没说地区就选 ["全球"]}}"""


def http(*a, **k):
    from _bohui import http as h   # 懒加载:--selftest 不需要 .env
    return h(*a, **k)


def canon(url):
    """去掉跟踪参数与锚点,作为去重键。"""
    p = urllib.parse.urlsplit(url.strip())
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query) if not k.lower().startswith(("utm_", "fbclid", "gclid"))]
    return urllib.parse.urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/"), urllib.parse.urlencode(q), ""))


def key(url):
    return hashlib.sha1(canon(url).encode()).hexdigest()[:16]


def strip_html(s):
    s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def nums(s):
    """抽出数字(含小数、千分位、百分号),用于核验。年份也算数字,一样要在原文里出现。"""
    return [m.replace(",", "") for m in re.findall(r"\d[\d,]*(?:\.\d+)?%?", s or "") if re.search(r"\d", m)]


def _n(n):
    n = n.rstrip("%")
    return n if "." in n else (n.lstrip("0") or "0")      # 「09」与「9」算同一个数


def date_nums(s):
    """RSS 日期是「Tue, 23 Sep 2026」,摘要会写「9 月」—— 把月份数字也放进原文比对集。"""
    import email.utils
    try:
        d = email.utils.parsedate_to_datetime(s)
        return f"{d.year} {d.month} {d.day}"
    except Exception:
        return ""


def unverified(out_text, src_text):
    """摘要里出现、但原文(标题+正文+日期)里找不到的数字。空列表 = 通过。"""
    src = {_n(n) for n in nums(src_text)}
    return sorted({n for n in nums(out_text) if _n(n) not in src})


def parse_feed(src, raw):
    """返回 [{title, url, date, desc}]。"""
    if src["kind"] == "fr":
        return [{"title": d.get("title", ""), "url": d.get("html_url", ""), "date": d.get("publication_date", ""),
                 "desc": " ".join(filter(None, [d.get("type", ""), d.get("abstract") or ""]))}
                for d in json.loads(raw).get("results", [])]
    root = ET.fromstring(raw)
    out = []
    for it in (e for e in root.iter() if e.tag.split("}")[-1] in ("item", "entry")):
        f = {}
        for c in it:
            t = c.tag.split("}")[-1]
            if t == "link" and c.get("href"):
                f.setdefault("url", c.get("href"))
            elif t in ("title", "link", "pubDate", "updated", "published", "description", "summary", "encoded", "date"):
                f.setdefault(t, "".join(c.itertext()).strip())
        out.append({"title": strip_html(f.get("title", "")), "url": f.get("url") or f.get("link", ""),
                    "date": f.get("pubDate") or f.get("published") or f.get("updated") or f.get("date", ""),
                    "desc": strip_html(f.get("encoded") or f.get("description") or f.get("summary") or "")})
    return out


_robots = {}


def allowed(url):
    host = "{0.scheme}://{0.netloc}".format(urllib.parse.urlsplit(url))
    if host not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            rp.parse(http(host + "/robots.txt", timeout=20, retries=1).decode("utf-8", "replace").splitlines())
        except Exception as e:
            rp.parse([] if "HTTP 404" in str(e) else ["User-agent: *", "Disallow: /"])   # 404 = 未限制;403/挑战页/断连 = 当作不许读
        _robots[host] = rp
    return _robots[host].can_fetch("*", url)


def body(url):
    """读原页正文。gov.uk 走官方内容 API(JSON),其余取 <p> 段落。读不到返回空串,不抛错。"""
    try:
        if "www.gov.uk/" in url:
            d = json.loads(http(url.replace("www.gov.uk/", "www.gov.uk/api/content/", 1), timeout=25, retries=2))
            det = d.get("details", {})
            return strip_html(" ".join([d.get("description", ""), det.get("body", ""),
                                        json.dumps(det.get("metadata", {}), ensure_ascii=False)]))
        if not allowed(url):
            return ""
        raw = http(url, timeout=25, retries=2).decode("utf-8", "replace")
        paras = [strip_html(p) for p in re.findall(r"(?is)<p[^>]*>(.*?)</p>", raw)]
        return " ".join(p for p in paras if len(p) > 40)
    except Exception as e:
        print(f"    正文读取失败:{str(e)[:90]}")
        return ""


def ask(org, title, date, text):
    token = open(os.path.expanduser("~/.bohui-gateway/TOKEN.txt"), encoding="utf-8").read().strip()
    req = {"model": "bohui-chat", "temperature": 0.2, "max_tokens": 1500,
           "chat_template_kwargs": {"enable_thinking": False},
           "messages": [{"role": "system", "content": SYSTEM},
                        {"role": "user", "content": PROMPT.format(org=org, title=title, date=date, text=text[:3500],
                                                                  topics=TOPICS, markets=MARKETS)}]}
    raw = http(GW, data=json.dumps(req).encode(), timeout=150, retries=2,
               headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    d = json.loads(raw)
    content = d["choices"][0]["message"].get("content") or ""
    m = re.search(r"\{.*\}", content, re.S)
    if not m:
        raise RuntimeError("模型没返回 JSON:" + content[:120])
    return json.loads(m.group(0)), d.get("model", "")


FORBID = re.compile(r"起订|MOQ|交期|报价|价格|SueAI|集团", re.I)


def run(per, only, out):
    os.makedirs(out, exist_ok=True)
    items_path = os.path.join(out, "items.jsonl")
    seen = set()
    if os.path.exists(items_path):
        for line in io.open(items_path, encoding="utf-8"):
            try:
                r = json.loads(line); seen.add(r["id"]); seen.add(r.get("title_key", ""))
            except Exception:
                pass
    status, new = {}, []
    for src in SOURCES:
        if only and src["id"] not in only:
            continue
        print(f"[{src['id']}] {src['org']}")
        try:
            entries = parse_feed(src, http(src["url"], timeout=30, retries=2))
        except Exception as e:
            status[src["id"]] = {"ok": False, "err": str(e)[:200]}
            print(f"  来源失败:{str(e)[:120]}")
            continue
        got = 0
        for e in entries:
            if got >= per:
                break
            if not e["url"] or not e["title"]:
                continue
            k, tk = key(e["url"]), "t:" + re.sub(r"\W+", "", e["title"].lower())[:80]
            if k in seen or tk in seen:
                continue
            probe = (e["title"] + " " + e["desc"]).replace("Food, Drug, and Cosmetic Act", "")
            if src.get("filter") and not re.search(BEAUTY, probe, re.I):
                continue
            seen.update((k, tk))
            enough = 200 if src["kind"] == "fr" else 600          # 联邦公报的官方摘要本身就够写;媒体 RSS 描述太短要读原页
            text = e["desc"] if len(e["desc"]) >= enough else (e["desc"] + " " + body(e["url"])).strip()
            time.sleep(1.5)
            rec = {"id": k, "title_key": tk, "source": src["id"], "org": src["org"], "source_type": src["type"],
                   "level": src["level"], "url": e["url"], "src_title": e["title"], "published": e["date"],
                   "collected_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), "text_len": len(text)}
            if len(text) < 120:
                rec.update(relevant=False, skip="正文太短,不摘要")
            else:
                try:
                    j, model = ask(src["org"], e["title"], e["date"], text)
                    rec.update(model=model, relevance=int(j.get("relevance") or 0), relevant=int(j.get("relevance") or 0) >= 2, title_zh=j.get("title_zh", ""),
                               summary_zh=j.get("summary_zh", ""), meaning=j.get("meaning", ""),
                               topics=[t for t in j.get("topics", []) if t in TOPICS] or ["其他"],
                               markets=[m for m in j.get("markets", []) if m in MARKETS] or ["全球"])
                    bad = unverified(rec["summary_zh"] + " " + rec["meaning"], e["title"] + " " + e["date"] + " " + date_nums(e["date"]) + " " + text)
                    rec["num_check"] = "通过" if not bad else "未核实:" + ",".join(bad)
                    rec["needs_review"] = bool(bad) or bool(FORBID.search(rec["meaning"]))
                except Exception as ex:
                    print(f"  ! 摘要失败,下次重试:{str(ex)[:100]}")
                    seen.discard(k); seen.discard(tk)
                    continue                         # 不落盘 = 下一批会重试
            with io.open(items_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            new.append(rec)
            got += 1
            print(f"  + {rec.get('title_zh') or e['title'][:60]}  [{rec.get('num_check', rec.get('skip', rec.get('error', '')))}]")
        status[src["id"]] = {"ok": True, "entries": len(entries), "new": got}
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    with io.open(os.path.join(out, f"sources-status-{stamp}.json"), "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=1)
    digest(new, os.path.join(out, f"批次-{stamp}.md"))
    ok = [r for r in new if r.get("relevant")]
    print(f"本批新增 {len(new)} 条,相关 {len(ok)} 条,待人审 {sum(1 for r in ok if r.get('needs_review'))} 条")


def digest(recs, path):
    """人读版:按主题分组,每条带出处。"""
    ok = [r for r in recs if r.get("relevant")]
    lines = [f"# 行业信息批次 {os.path.basename(path)[3:-3]}\n",
             f"新增 {len(recs)} 条,与化妆品相关 {len(ok)} 条。证据等级:①官方原文 ②机构/媒体报道(企业新品稿按厂商自述看待)。"
             "「数字核验:未核实」的条目在人审前不得对外使用;成分中文名由模型给出,对外前以 INCI 英文名核对。\n"]
    for t in TOPICS:
        grp = [r for r in ok if r["topics"][0] == t]
        if not grp:
            continue
        lines.append(f"\n## {t}({len(grp)})\n")
        for r in grp:
            lines.append(f"### {r['title_zh']}\n\n{r['summary_zh']}\n\n- **对客户意味着什么**:{r['meaning']}\n"
                         f"- 市场:{'、'.join(r['markets'])} · 证据:{r['level']} {r['source_type']} · 数字核验:{r['num_check']}"
                         f"{' · **待人审**' if r['needs_review'] else ''}\n"
                         f"- 出处:{r['org']}《{r['src_title']}》{r['published'][:16]} <{r['url']}>\n")
    io.open(path, "w", encoding="utf-8").write("\n".join(lines))


def selftest():
    assert unverified("召回 3 款,含 0.5% 苯甲醇", "3 products recalled, 0.5% benzyl alcohol") == []
    assert unverified("涉及 12,000 件", "about 12000 units") == []
    assert unverified("增长 30%", "grew fast") == ["30%"]
    assert unverified("2026 年 9 月 23 日发布", "Tue, 23 Sep 2026 " + date_nums("Tue, 23 Sep 2026 10:00:00 +0000")) == []
    assert canon("https://A.com/x/?utm_source=rss&id=2#top") == "https://a.com/x?id=2"
    assert parse_feed({"kind": "rss"}, b"<rss><channel><item><title>T</title><link>https://a.com/1</link>"
                                       b"<description>&lt;p&gt;Hi&lt;/p&gt;</description></item></channel></rss>")[0]["desc"] == "Hi"
    print("selftest ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--per", type=int, default=6)
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    selftest() if a.selftest else run(a.per, set(filter(None, a.only.split(","))), a.out)

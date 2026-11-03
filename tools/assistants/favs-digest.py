"""头条收藏研判(创始人 2026-09-18 13:2x:「我登录了今日头条,你是不是可以直接查看我的收藏,那我就不要转发给你了」)。
输入:收藏列表 JSON(由我在 Chrome 里读出:[{h,t}]),台账 F:/0cosmetic/助手交付/8-问答素材/头条收藏台账.md 记已研判的 url。
对每条新条目:抓文章正文(境内直连)→ 找 GitHub 仓库 → 模型(Agnes 免费)写「机制一句话 / 对帛卉的落地 / 对应模块 / 优先级」→ 追加台账。
用法:python tools/assistants/favs-digest.py favs.json [--limit N]"""
import io, os, re, sys, json, html, time, urllib.request, datetime as dt
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import chat, fleet
LEDGER = "F:/0cosmetic/助手交付/8-问答素材/头条收藏台账.md"
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 12
favs = json.load(io.open(sys.argv[1], encoding="utf-8"))
done = set(re.findall(r"<!-- url:(\S+) -->", io.open(LEDGER, encoding="utf-8").read())) if os.path.exists(LEDGER) else set()
UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"}
def fetch(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r: body = r.read().decode("utf-8", "replace")
    except Exception as e: return "", []
    gh = sorted(set(re.findall(r"github\.com/[\w\-]+/[\w\-.]+", body)))
    tm = re.search(r"<title>(.*?)</title>", body, re.S); fetch.last_title = html.unescape(tm.group(1)).replace(" - 今日头条", "").strip()[:80] if tm else ""
    txt = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"<script.*?</script>|<style.*?</style>", "", body, flags=re.S))))
    return txt[:6000], gh
allp = fleet(); PROVS = [p for p in allp if p["id"].startswith("agnes-30flash")] + [p for p in allp if p["id"].startswith("sensenova")]
SYS = "你是帛卉(BIOSPHERE,广州化妆品代工厂;已有 Cloudflare 上的官网+后台、配方实验室、41+14 位角色专家会诊、原料/成分/爆款资源库、AI 获客流水线、帛卉AI 电脑端、WorkBuddy 等助手)的技术顾问。读一篇创始人收藏的文章,只输出 JSON:{\"project\":\"项目名或无\",\"repo\":\"github 仓库或空\",\"mechanism\":\"它的核心机制一句话(≤40字)\",\"use\":\"对帛卉的落地建议(≤80字,写清对应我们哪个模块、要改什么)\",\"priority\":\"高|中|低\",\"skip_reason\":\"若与帛卉无关写原因,否则空\"}。不编造仓库名;文章没写仓库就留空。"
out = []; n = 0
for f in favs:
    u, t = f["h"], f["t"]
    if u in done or n >= LIMIT: continue
    if "/video/" in u and t and not re.search(r"GitHub|开源|AI|模型|工具", t): 
        done.add(u); out.append(f"- <!-- url:{u} --> {dt.date.today()} · {t[:60]} · 跳过(非技术视频)"); continue
    txt, gh = fetch(u); n += 1
    if not t: t = getattr(fetch, "last_title", "") or u   # 收藏列表只拿到 id 时,标题从文章页 <title> 补
    msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": f"标题:{t}\n候选仓库:{gh}\n正文:{txt[:4500]}"}]
    r, who, err = chat(PROVS, msgs, max_tokens=600, temperature=0.2, want_json=True)
    if not isinstance(r, dict): r = {"project": "?", "repo": "", "mechanism": "解析失败", "use": (err or "")[:80], "priority": "低", "skip_reason": ""}
    line = f"- <!-- url:{u} --> **{dt.date.today()} · {t[:70]}**\n  - 项目:{r.get('project')} {('`' + r.get('repo') + '`') if r.get('repo') else ''} · 优先级 {r.get('priority')}\n  - 机制:{r.get('mechanism')}\n  - 帛卉落地:{r.get('use')}{('  · 跳过:' + r['skip_reason']) if r.get('skip_reason') else ''}\n  - 链接:{u}"
    out.append(line); print(line, flush=True); time.sleep(1)
if out:
    io.open(LEDGER, "a", encoding="utf-8").write(("" if os.path.exists(LEDGER) else "# 头条收藏台账(自动研判,我复核后再纳入规划)\n\n") + "\n".join(out) + "\n")
print(f"新研判 {n} 条,台账 {LEDGER}")

"""WorkBuddy 市场调研 → 平台「全球市场」页(2026-09-21 04:4x)。创始人:「注意他的交付,自主导入平台」。
读 助手交付/15-东南亚市场/*-美妆市场调研.md(七问结构)+ *-TOP单品.csv + 六国对比总表.md → market_research(0109)。
MD 用 python-markdown 转 HTML(tables 扩展);TOP 单品存 JSON;每份记来源条数与「待核」字样次数,页面上诚实标注。
用法:python tools/platform/import-markets.py [--dir F:/0cosmetic/助手交付/15-东南亚市场] [--apply]。不带 --apply 只打印。"""
import io, os, re, sys, csv, json, glob, subprocess, datetime as dt
import markdown
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from _net import cf_env
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
D = sys.argv[sys.argv.index('--dir') + 1] if '--dir' in sys.argv else 'F:/0cosmetic/助手交付/15-东南亚市场'
APPLY = '--apply' in sys.argv
CODES = {'印尼': ('id', 'Indonesia', '🇮🇩'), '马来西亚': ('my', 'Malaysia', '🇲🇾'), '泰国': ('th', 'Thailand', '🇹🇭'), '越南': ('vn', 'Vietnam', '🇻🇳'), '菲律宾': ('ph', 'Philippines', '🇵🇭'), '新加坡': ('sg', 'Singapore', '🇸🇬'),
         '阿联酋': ('ae', 'UAE', '🇦🇪'), '沙特': ('sa', 'Saudi Arabia', '🇸🇦'), '美国': ('us', 'United States', '🇺🇸'), '英国': ('gb', 'United Kingdom', '🇬🇧'), '印度': ('in', 'India', '🇮🇳'), '六国对比': ('sea', 'Southeast Asia · six markets', '🌏')}
q = lambda s: "'" + str(s if s is not None else '').replace("'", "''") + "'"
rows = []
for f in sorted(glob.glob(os.path.join(D, '*.md'))):
    name = os.path.basename(f)
    if name.startswith('_'): continue
    key = name.split('-')[0].replace('总表.md', '')
    if key not in CODES: print('跳过(无编码)', name); continue
    code, en, flag = CODES[key]
    md = io.open(f, encoding='utf-8').read()
    md = re.sub(r'^.*(?:F:\\|助手交付).*$', '', md, flags=re.M)   # 09-21:WorkBuddy 把本机交付路径写进了报告头,公开页不能带
    # python-markdown 的表格要求前面有空行;WorkBuddy 的 MD 常把表格紧贴在加粗行后 → 补空行。裸 URL 不是 markdown 链接 → 转成 <a>
    lines = md.split('\n'); fixed = []
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith('|') and i > 0 and lines[i - 1].strip() and not lines[i - 1].lstrip().startswith('|'): fixed.append('')
        fixed.append(ln)
    html = markdown.markdown('\n'.join(fixed), extensions=['tables', 'fenced_code', 'sane_lists'])
    html = re.sub(r'<a href="(http[^"]+)"', r'<a href="\1" rel="nofollow noopener" target="_blank"', html)
    html = re.sub(r'(?<![="\'>/])(https?://[^\s<)\]（）]+)', lambda m: f'<a href="{m.group(1)}" rel="nofollow noopener" target="_blank">{m.group(1)[:80]}{"…" if len(m.group(1)) > 80 else ""}</a>', html)
    title = re.search(r'^#\s*(.+)$', md, re.M); title = title.group(1).strip() if title else name
    n_src = len(re.findall(r'https?://', md)); n_check = len(re.findall(r'待核', md))
    top = []
    cf = os.path.join(D, f'{key}-TOP单品.csv')
    if os.path.exists(cf):
        with io.open(cf, encoding='utf-8-sig', newline='') as fh:
            for r in csv.DictReader(fh): top.append({k: (v if isinstance(v, str) else ' '.join(v or [])).strip() for k, v in r.items() if k})
    # 摘要:第一个「市场规模」表后的第一段说明,取不到就取正文前 160 字
    body = re.sub(r'^>.*$', '', md, flags=re.M); body = re.sub(r'^#.*$', '', body, flags=re.M); body = re.sub(r'\|.*\|', '', body); body = re.sub(r'\s+', ' ', body).strip()
    summary = body[:160]
    rows.append(dict(code=code, key=key, name_zh=key if key != '六国对比' else '东南亚六国对比', name_en=en, flag=flag, title=title, html=html, top=top, n_src=n_src, n_check=n_check, summary=summary, src=name))
    print(f'{code:>3} {key} · {len(md)} 字 · 来源 {n_src} · 待核 {n_check} · TOP {len(top)}')
if not APPLY: print('(--apply 才写库)'); sys.exit(0)
sql = ''.join(f"INSERT INTO market_research (code, name_zh, name_en, flag, title, html, top_json, n_sources, n_pending, summary, source_file) VALUES ({q(r['code'])},{q(r['name_zh'])},{q(r['name_en'])},{q(r['flag'])},{q(r['title'])},{q(r['html'])},{q(json.dumps(r['top'], ensure_ascii=False))},{r['n_src']},{r['n_check']},{q(r['summary'])},{q(r['src'])}) ON CONFLICT(code) DO UPDATE SET name_zh=excluded.name_zh, name_en=excluded.name_en, flag=excluded.flag, title=excluded.title, html=excluded.html, top_json=excluded.top_json, n_sources=excluded.n_sources, n_pending=excluded.n_pending, summary=excluded.summary, source_file=excluded.source_file, updated_at=datetime('now');\n" for r in rows)
p = os.path.join(ROOT, 'tools', 'platform', '_markets.sql'); io.open(p, 'w', encoding='utf-8', newline='\n').write(sql)
web = os.path.join(ROOT, 'apps', 'web'); dist = sorted(x for x in os.listdir(web) if x.startswith('dist_'))[-1]
r = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'bohui-cms-v2', '--remote', '-c', 'wrangler.copy.json', '--yes', '--file', p], cwd=os.path.join(web, dist, 'server'), env=cf_env(), shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
print('写入:', 'rows_written' in (r.stdout + r.stderr), (r.stdout + r.stderr)[-200:].replace('\n', ' ') if 'rows_written' not in (r.stdout + r.stderr) else len(rows))

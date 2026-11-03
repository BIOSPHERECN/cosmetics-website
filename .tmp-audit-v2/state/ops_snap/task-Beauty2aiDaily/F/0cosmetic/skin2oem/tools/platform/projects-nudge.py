"""项目催办(平台 2026-09-21 06:4x,daily.cmd 每天 06:10 跟着跑)。能力网络 v1 §五 SLA:平台完整方案 3 个工作日;客户沉默提醒。
规则:active 项目 updated_at 超过 3 天没动 → 写一条内部事件「N 天未更新,请客户经理跟进」(同一天只写一次);阶段=1 且超过 3 天 → 额外提示「方案未出」。
只写事件不改阶段;客户看不到(visible=0)。以后接通知渠道(邮件 / 群)再推。"""
import os, sys, json, subprocess, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from _net import cf_env
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
web = os.path.join(ROOT, 'apps', 'web'); dist = sorted(x for x in os.listdir(web) if x.startswith('dist_'))[-1]; CWD = os.path.join(web, dist, 'server')
def d1(sql, file=False):
    args = ['npx', 'wrangler', 'd1', 'execute', 'bohui-cms-v2', '--remote', '-c', 'wrangler.copy.json', '--yes', '--json']
    if file:
        p = os.path.join(ROOT, 'tools', 'platform', '_nudge.sql'); open(p, 'w', encoding='utf-8', newline='\n').write(sql); args += ['--file', p]
    else: args += ['--command', sql]
    r = subprocess.run(args, cwd=CWD, env=cf_env(), shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300)
    out = r.stdout[r.stdout.find('['):]
    try: return json.loads(out)[0]['results']
    except Exception: print('D1 错', (r.stdout + r.stderr)[-200:]); return []
today = dt.date.today().isoformat()
rows = d1("SELECT p.id, p.title, p.stage, p.owner, CAST(julianday('now') - julianday(p.updated_at) AS INTEGER) idle FROM projects p WHERE p.site_id='skin2oem' AND p.status='active' AND julianday('now') - julianday(p.updated_at) >= 3 AND NOT EXISTS (SELECT 1 FROM project_events e WHERE e.project_id = p.id AND e.kind = 'nudge' AND date(e.at) = date('now'))")
if not rows: print('无需催办'); sys.exit(0)
q = lambda s: "'" + str(s if s is not None else '').replace("'", "''") + "'"
sql = ''
for r in rows:
    msg = f"{r['idle']} 天未更新,请客户经理跟进" + (";阶段仍在「机会」,完整方案还没给客户(SLA 3 个工作日)" if int(r['stage'] or 1) <= 1 else '') + (f";负责人 {r['owner']}" if r.get('owner') else ';尚未指派负责人')
    sql += f"INSERT INTO project_events (project_id, kind, text, by_who, visible) VALUES ({int(r['id'])}, 'nudge', {q(msg)}, 'system', 0);\n"
d1(sql, file=True)
print(f'催办 {len(rows)} 个项目:', [(r['id'], r['idle']) for r in rows])

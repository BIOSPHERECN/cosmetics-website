// 红队用的假 wrangler(只在 cache/tmp/redteam-* 临时副本里用,不联网、不部署):
//   node fakewr.cjs <夹具 state 目录> <Worker> deploy -c <配置> --message <文字>
// 和真 wrangler 一样:配置里有 build.command 就先用 shell 跑它(cwd = 当前目录),退出码非 0 就中止;过了才往夹具部署列表记一条并打印 Version ID。
const fs = require('fs'), cp = require('child_process'), crypto = require('crypto')
const [state, worker, cmd, ...rest] = process.argv.slice(2)
const fx = `${state}/fixture_deployments_${worker}.json`
if (cmd === 'deploy') {
  let cfg = 'wrangler.json', msg = ''
  for (let i = 0; i < rest.length; i++) { if (rest[i] === '-c') cfg = rest[++i]; else if (rest[i] === '--message') msg = rest[++i] }
  const c = JSON.parse(fs.readFileSync(cfg, 'utf-8'))
  if (c.build && c.build.command) {
    console.log('[custom build] Running: ' + c.build.command)
    const r = cp.spawnSync(c.build.command, { shell: true, stdio: 'inherit' })
    if (r.status !== 0) { console.log('X [ERROR] Running custom build `' + c.build.command + '` failed.'); process.exit(1) }
  }
  const v = crypto.randomUUID()
  const ds = fs.existsSync(fx) ? JSON.parse(fs.readFileSync(fx, 'utf-8')) : []
  ds.unshift({ id: crypto.randomUUID(), created_on: new Date().toISOString(), source: 'wrangler', author_email: 'redteam@local',
               versions: [{ version_id: v, percentage: 100 }], annotations: { 'workers/message': msg, 'workers/triggered_by': 'upload' } })
  fs.writeFileSync(fx, JSON.stringify(ds))
  console.log(`Uploaded ${worker} (fake)`)
  console.log('Current Version ID: ' + v)
} else {
  console.log('fake wrangler: ' + [cmd, ...rest].join(' '))
}

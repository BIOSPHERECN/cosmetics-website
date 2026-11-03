#!/usr/bin/env bash
# 公司站(bohui-web)唯一上线入口:四道闸(Semgrep/费用/Laya/审核)全过才部署,结果记 F:/0cosmetic/助手交付/上线闸门日志.md
# 用法(v2.1,审核部 ENABLED 后):bash tools/ship.sh --note "说明" | --dry-run | --status | --urgent … | --breakglass "理由" | --rollback[=<版本>] --reason "…"(详见 tools-review/audit_v2/ship_lib.sh 开头)
# v1 用法(ENABLED 不在时):bash tools/ship.sh [--dry-run] [--reviewed=<审核报告>] [--note="说明,降读改动带【降读】"] [--base=<提交>]
# 部署步骤照 QUEUE.md:构建 → dist/server 里 source 公司 .env → wrangler deploy -c wrangler.json
REPO=F:/0cosmetic/cosmetic-sites; SITE=公司站; WORKER=bohui-web; BASELINE=5b98667
SCOPE=(apps packages)
deploy() (
  set -e; cd "$REPO"
  if curl -s -m 6 -o /dev/null https://api.cloudflare.com/client/v4/; then unset HTTPS_PROXY HTTP_PROXY; else export HTTPS_PROXY=http://127.0.0.1:7890; fi
  npm run build
  cd apps/web/dist/server
  set -a; . "$REPO/.env"; set +a
  npx wrangler deploy -c wrangler.json
)
AV2=F:/0cosmetic/tools-review/audit_v2   # 审核部 v2.1:ENABLED 在 → v2(审核单 + 三家共判,从已批准副本执行);不在 → v1 四道闸(gate.sh 留档)
if [ -f "$AV2/ENABLED" ]; then source "$AV2/cache/gate_approved/audit_v2/ship_lib.sh" "$@"; else source F:/0cosmetic/tools-review/gate.sh "$@"; fi

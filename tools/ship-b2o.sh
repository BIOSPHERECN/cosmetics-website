#!/usr/bin/env bash
# beauty2oem.com(Worker beauty2oem-web)唯一上线入口:和 tools/ship.sh 同一套四道闸(Semgrep / 费用 / Laya / 审核),
# 部署换成「构建 → tools/b2o-split/mkconfig.py 生成 wrangler.b2o.json → 公司 .env → wrangler deploy -c」。施工图见 助手交付/beauty2oem-拆站-施工图.md。
# 用法:bash tools/ship-b2o.sh [--dry-run] [--reviewed=<审核报告>] [--note="说明"]
#   切换当晚第一次带域名上线:B2O_LIVE=1 bash tools/ship-b2o.sh ...(mkconfig --live 要求 migrate.py verify 24 小时内通过)
#   切换成功后把 apps/web/wrangler.b2o.jsonc 里 env.live 的 routes / triggers 提到顶层,以后不再需要 B2O_LIVE。
# 和 ship.sh 共用 apps/web/dist:两个不能同时跑(先构建的那个会被后一个的 clean-build 删掉产物)。
REPO=F:/0cosmetic/cosmetic-sites; SITE=beauty2oem; WORKER=beauty2oem-web; BASELINE=5b98667
SCOPE=(apps packages)
deploy() (
  set -e; cd "$REPO"
  # 铁令:别的构建在跑就不动。不查进程表(本机 WMI 常卡死),看产物目录两分钟内有没有被写过
  if [ -n "$(find apps/web/dist apps/web/.astro -maxdepth 2 -newermt '-120 seconds' 2>/dev/null | head -1)" ]; then
    echo "apps/web/dist 或 .astro 两分钟内被写过,可能有别的构建在跑,等它结束再上线"; exit 1
  fi
  if curl -s -m 6 -o /dev/null https://api.cloudflare.com/client/v4/; then unset HTTPS_PROXY HTTP_PROXY; else export HTTPS_PROXY=http://127.0.0.1:7890; fi
  npm run build
  python tools/b2o-split/mkconfig.py ${B2O_LIVE:+--live}
  CFG=apps/web/dist/server/wrangler.b2o.json          # 校验的和传给 -c 的是同一个文件
  if grep -qE 'ea5b0da4|f5010e65|"bohui-web"|a461419944d4422cb81e374a391632ce' "$CFG"; then
    echo "拒绝部署:$CFG 里出现公司库 / 平台库 / 公司 Worker 名 / 公司 SESSION"; exit 1
  fi
  cd "$(dirname "$CFG")"
  set -a; . "$REPO/.env"; set +a
  npx wrangler deploy -c "./$(basename "$CFG")"
)
AV2=F:/0cosmetic/tools-review/audit_v2   # 审核部 v2.1:ENABLED 在 → v2(审核单 + 三家共判,从已批准副本执行);不在 → v1 四道闸(gate.sh 留档)
if [ -f "$AV2/ENABLED" ]; then source "$AV2/cache/gate_approved/audit_v2/ship_lib.sh" "$@"; else source F:/0cosmetic/tools-review/gate.sh "$@"; fi

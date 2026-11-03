# 审核部 v2.1 · ship_ops.sh(只从已批准副本执行;hook 白名单入口之一)
#   bash …/cache/gate_approved/audit_v2/ship_ops.sh task <任务名> --note "…"          定时脚本改动审核(§7.2)
#   bash …/ship_ops.sh script <路径> --note "…"                                        单个脚本
#   bash …/ship_ops.sh register <任务名> --xml <定义.xml> [--files …] [--note "…"]     新增/修改计划任务(审过才注册)
#   bash …/ship_ops.sh prod --worker <名> --note "…" -- <原命令…>                      生产配置变更(secret/远程迁移/d1 写/kv 写/r2 delete)
#   bash …/ship_ops.sh gate --note "…" [--data]                                        闸门自身改动(红队 + 至少 L2 审核单)
#   bash …/ship_ops.sh worker <名> [--note "…"|--dry-run|--status|--rollback …|--breakglass "…"]   其他 Worker 上线(mail/gateway/news-cron/skin2oem 副本)
set -u
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && (pwd -W 2>/dev/null || pwd))"
PY=F:/0cosmetic/_venv/review/Scripts/python.exe
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
case "${1-}" in
  worker) shift; WORKER="${1:?ship_ops.sh worker <名>}"; shift; source "$LIB/ship_lib.sh" "$@";;
  task|script|register|prod|gate) exec "$PY" "$LIB/ops.py" "$@";;
  *) sed -n '2,8p' "$LIB/ship_ops.sh"; exit 64;;
esac

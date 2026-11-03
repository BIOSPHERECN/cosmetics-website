# 审核部 v2.1 · 红队入口(ship_ops.sh gate 批准闸门前自动跑;也可手动跑)。在 audit_v2/cache/tmp/redteam-<时间>/ 下建临时副本仓,不碰真仓。
# 用法:bash redteam/run.sh [--keep]    全过退出 0;结果写 audit_v2/logs/redteam-<时间>.json
exec F:/0cosmetic/_venv/review/Scripts/python.exe "$(cd "$(dirname "${BASH_SOURCE[0]}")" && (pwd -W 2>/dev/null || pwd))/run.py" "$@"

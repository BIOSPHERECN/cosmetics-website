# 审核部 v2.1 · 上线流程(各站 ship.sh 设好 WORKER 后 source 本文件;v1 的 gate.sh 原样留档)
# 本文件只从已批准副本 cache/gate_approved/audit_v2/ 执行(急-8)。设计见 tools-review/audit_v2/设计-v2.1.md §2.9、§3、§4.1、§5.3。
#   bash tools/ship.sh --note "说明"                     常规上线:审 → 签单 → 构建 → 部署 → 存版 → 冒烟(失败按规则自动回退)
#   bash tools/ship.sh --dry-run --note "说明"           只审不部署(审核单照签,24 小时内真上线直接用)
#   bash tools/ship.sh --status                          看当前树、审核单、还差什么
#   bash tools/ship.sh --urgent --patch <补丁> --incident <事故id> --note "【急修】现象+影响+改了什么"
#   bash <ship.sh 绝对路径> --breakglass "理由"          闸门坏了、线上正在出事的最后手段(理由去空白 ≥6 字,记账、推送、24 小时追审)
#   bash tools/ship.sh --rollback[=<VersionID>] --reason "…"   一键回退到上一条审过的版本(或指定版本)
# 退出码:0 已上线/dry-run 过;1 拦;2 待审(照打印的那行跑 review-ticket 工作流,再跑同一条);3 存疑;4 闸门出错;64 参数错。
set -u
: "${WORKER:?ship.sh 要先设 WORKER}"
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && (pwd -W 2>/dev/null || pwd))"
AV2=F:/0cosmetic/tools-review/audit_v2
case "$LIB" in */cache/tmp/*) AV2="$LIB";; F:/0cosmetic/tools-review/*|f:/0cosmetic/tools-review/*) ;; *) AV2="$LIB";; esac   # 红队临时副本用自己的运行时目录
PY=F:/0cosmetic/_venv/review/Scripts/python.exe
PYS=C:/Users/Administrator/AppData/Local/Programs/Python/Python312/python.exe
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8 LC_ALL=C.UTF-8 SEMGREP_ENABLE_VERSION_CHECK=0 SEMGREP_SEND_METRICS=off
unset BOHUI_BREAKGLASS BOHUI_SHIP_NONCE BOHUI_DEPLOY_MESSAGE
for v in $(env | grep -oE '^GIT_[A-Za-z_]+' || true); do unset "$v"; done
T() { "$PY" "$LIB/ticket.py" "$@"; }
C() { "$PY" -c "import json,sys;w=json.load(open(sys.argv[1],encoding='utf-8'))['workers'][sys.argv[2]];v=w.get(sys.argv[3],sys.argv[4] if len(sys.argv)>4 else '');print(v if isinstance(v,str) else json.dumps(v))" "$LIB/sites.json" "$WORKER" "$@"; }
note_red() { "$PY" "$LIB/ops.py" notify --title "$1" --body "$2" >/dev/null 2>&1 || true; }

NOTE=""; DRY=0; STATUS=0; URGENT=0; PATCH=""; INCIDENT=""; BG=""; BGSET=0; RB=0; RBTO=""; REASON=""
while [ $# -gt 0 ]; do case "$1" in
  --note) NOTE="${2-}"; shift;; --note=*) NOTE="${1#*=}";;
  --dry-run) DRY=1;; --status) STATUS=1;;
  --urgent) URGENT=1;; --patch) PATCH="${2-}"; shift;; --incident) INCIDENT="${2-}"; shift;;
  --breakglass) BG="${2-}"; BGSET=1; shift;; --breakglass=*) BG="${1#*=}"; BGSET=1;;
  --rollback) RB=1;; --rollback=*) RB=1; RBTO="${1#*=}";;
  --reason) REASON="${2-}"; shift;; --reason=*) REASON="${1#*=}";;
  --reviewed=*|--base=*|--baseline=*) echo "v1 参数 ${1%%=*} 在 v2 已作废:审核靠审核单(tickets/),基准固定为 refs/ship/$WORKER"; exit 64;;
  *) echo "未知参数:$1"; exit 64;; esac; shift; done

REPO=$(C repo); KIND=$(C kind); ACCOUNT=$(C account); WR=$(C wrangler_cmd "npx wrangler")
LOGMD=F:/0cosmetic/助手交付/上线闸门日志.md; [ "$AV2" = "$LIB" ] && LOGMD="$AV2/logs/上线闸门日志.md"
human() { mkdir -p "$(dirname "$LOGMD")"; { echo; echo "## $(date '+%F %T') · v2.1 · $WORKER · $1"; echo "- 说明: $(printf '%s' "$NOTE$BG$REASON" | head -1 | cut -c1-120)"; [ -n "${2-}" ] && echo "- $2"; } >> "$LOGMD"; }
netenv() { [ "$ACCOUNT" = company ] || [ "$ACCOUNT" = platform ] || return 0     # 红队夹具账号不联网
           if curl -s -m 6 -o /dev/null https://api.cloudflare.com/client/v4/; then unset HTTPS_PROXY HTTP_PROXY; else export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890; fi
           if [ "$ACCOUNT" = company ]; then set -a; . "$REPO/.env"; set +a; else unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; fi; }

[ $STATUS = 1 ] && { T status --worker "$WORKER"; exit $?; }

# ---- 一键回退(不需要审核单:目标版本当时审过;记台账、改 refs/ship、作废被回退的树、冒烟、开单)
if [ $RB = 1 ]; then
  [ -z "$REASON" ] && { echo "回退要写 --reason \"…\""; exit 64; }
  T rollback --worker "$WORKER" ${RBTO:+--to "$RBTO"} --reason "$REASON" || exit 1
  "$PY" "$LIB/smoke.py" --worker "$WORKER" --mode deploy; human "回退" "smoke exit $?"; exit 0
fi

LOCK="$AV2/state/ship.lock"; mkdir -p "$AV2/state"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then rm -rf "$LOCK"; mkdir "$LOCK"; else echo "另一次上线正在进行($LOCK,30 分钟后自动失效)"; exit 1; fi
fi
WT=""; trap 'rm -rf "$LOCK"; [ -n "$WT" ] && git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1' EXIT
echo "$WORKER $$ $(date '+%F %T')" > "$LOCK/owner.txt"

VER=""; MSG=""; DLOG="$AV2/logs/deploy-$WORKER-$(date +%Y%m%d-%H%M%S).log"; mkdir -p "$AV2/logs"

# ---- 构建 + 部署(三种 Worker:astro 产物部署 / 平台 deploy.sh / 其他 Worker 的部署命令)
build_and_deploy() {   # $1 = 构建目录(仓库根或急修 worktree);$2 = 部署 message 前缀
  local ROOT="$1" BASEMSG="$2" DIST CFG
  case "$KIND" in
    astro)
      DIST=$(C dist); CFG=$(C config wrangler.json)
      BUILD=$(C build); [ "${B2O_LIVE:-}" = 1 ] && BUILD=$(C build_live "$BUILD")
      ( cd "$ROOT" && eval "$BUILD" ) || { echo "构建失败"; return 1; }
      if [ -n "${BOHUI_SHIP_NONCE:-}" ]; then MSG=$(T seal --worker "$WORKER" --dist "$ROOT/$DIST") || { echo "构建后封存失败(见上)"; return 1; }
      else MSG="$BASEMSG"; fi
      ( cd "$ROOT/$DIST" && netenv && eval "$WR deploy -c \"$CFG\" --message \"$MSG\"" ) 2>&1 | tee "$DLOG"; return ${PIPESTATUS[0]};;
    script)
      export BOHUI_DEPLOY_MESSAGE="$BASEMSG"
      bash "$ROOT/$(C deploy_script)" 2>&1 | tee "$DLOG"; return ${PIPESTATUS[0]};;
    cmd)
      ( cd "$ROOT" && netenv && eval "$(C deploy_cmd)" ) 2>&1 | tee "$DLOG"; return ${PIPESTATUS[0]};;
    *) echo "sites.json 里 $WORKER 的 kind=$KIND 不认识"; return 1;;
  esac
}
grab_ver() {   # $1 = 部署前线上版本(cmd 类 Worker 的部署脚本不一定打印 Version ID,就查一次线上)
  VER=$(grep -aoE 'Version ID: *[0-9a-f-]{36}' "$DLOG" 2>/dev/null | tail -1 | grep -oE '[0-9a-f-]{36}')
  local M2; M2=$(grep -aoE '^RT-[^ ]+ t:[0-9a-f]{12} dist:[0-9a-f]{12} gate:[0-9a-f]{12}' "$DLOG" 2>/dev/null | tail -1); [ -n "$M2" ] && MSG="$M2"
  if [ -z "$VER" ] && [ "$KIND" = cmd ]; then local L; L=$(T live --worker "$WORKER" 2>/dev/null | tail -1); [ -n "$L" ] && [ "$L" != "${1-}" ] && VER="$L"; fi
}

# ---- 破窗(§3.2):硬规则照查;记账 + 推送 + 开单;部署照样进 ship.jsonl;不自动回退
if [ $BGSET = 1 ]; then
  BGT=$(printf '%s' "$BG" | tr -d '[:space:]')
  [ ${#BGT} -ge 6 ] || { echo "破窗理由去掉空白后至少 6 个字"; exit 64; }
  N=$("$PYS" -I -S "$LIB/bg_log.py" --count "$WORKER" 2>/dev/null || echo 0)
  [ "${N:-0}" -ge 2 ] && { echo "拒绝:$WORKER 24 小时内第 3 次破窗(第 2 次已加「需创始人」)"; note_red "$WORKER 第 3 次破窗被拒" "$BG"; exit 1; }
  "$PY" "$LIB/gate1.py" --repo "$REPO" --worker "$WORKER" --mode ship; G=$?
  [ $G = 3 ] && { echo "拒绝:第一关硬规则(S1/S2/R1–R4/C5)不过,破窗也不放"; exit 1; }
  export BOHUI_BREAKGLASS="$BG"
  "$PYS" -I -S "$LIB/bg_log.py" --layer ship --worker "$WORKER" --from-env || printf '{"ts":"%s","layer":"ship","worker":"%s","len_unchecked":true}\n' "$(date -Iseconds)" "$WORKER" >> "$AV2/ledger/breakglass.jsonl"
  note_red "[破窗] $WORKER 破窗上线$([ "${N:-0}" -ge 1 ] && echo '(24 小时内第 2 次,需创始人)')" "理由:$BG;24 小时内追审(ticket.py followup --worker $WORKER)"
  PREV=$(T live --worker "$WORKER" 2>/dev/null | tail -1)
  build_and_deploy "$REPO" "BREAKGLASS $(printf '%s' "$BGT" | cut -c1-24) gate:$("$PY" -c "import sys;sys.path.insert(0,sys.argv[1]);import lib;print(lib.gate_hash()[7:19])" "$LIB")"; DC=$?; grab_ver "$PREV"
  if [ $DC != 0 ] || [ -z "$VER" ]; then T record --worker "$WORKER" --action breakglass --status fail --note "$BG" --reason "$BG" >/dev/null; human "破窗部署失败" "exit $DC"; exit 1; fi
  T record --worker "$WORKER" --action breakglass --version "$VER" --prev-live "$PREV" --note "$BG" --reason "$BG" --message "$MSG"
  "$PY" "$LIB/smoke.py" --worker "$WORKER" --mode deploy --no-rollback; S=$?
  human "破窗上线" "版本 $VER · 冒烟 exit $S · 24 小时内追审"; exit 0
fi

# ---- 0 闸门自检:执行中的必须是批准过的闸门(工作副本有改动只报黄)
T selfcheck || { echo "拒绝:执行中的闸门不在批准清单(改闸门走 ship_ops.sh gate;线上出事走 --breakglass)"; exit 1; }

# ---- 急修(§3.1):在 refs/ship 上开干净 worktree,打补丁,在这棵树上审、建、部
BUILDROOT="$REPO"; RA=()
if [ $URGENT = 1 ]; then
  [ -f "$PATCH" ] || { echo "急修要 --patch <补丁文件>"; exit 64; }
  [ -n "$INCIDENT" ] || { echo "急修要 --incident <事故id>"; exit 64; }
  WT="$AV2/cache/urgent/$WORKER-$(date +%m%d%H%M%S)"; mkdir -p "$(dirname "$WT")"
  git -C "$REPO" -c core.hooksPath=NUL worktree add --detach "$WT" "refs/ship/$WORKER" >/dev/null || { echo "开急修 worktree 失败"; exit 1; }
  git -C "$WT" -c core.hooksPath=NUL apply "$PATCH" || { echo "补丁打不上"; exit 1; }
  INST=$(C install "pnpm install --offline --frozen-lockfile"); [ -n "$INST" ] && { ( cd "$WT" && eval "$INST" ) || { echo "急修 worktree 装依赖失败 → 改走 --breakglass"; exit 1; }; }
  BUILDROOT="$WT"; RA=(--repo "$WT" --urgent --patch "$PATCH" --incident "$INCIDENT")
fi

# ---- 1–5 算树 → 第一关 → 费用灯 → 定级 → 审核单(没有就出草稿 + 机审,打印工作流后退出 2)
T prepare --worker "$WORKER" --note "$NOTE" "${RA[@]}"; RC=$?
case $RC in 0) ;; 2) human "待审"; exit 2;; 1|3) human "$([ $RC = 1 ] && echo 拦 || echo 存疑)"; exit $RC;; *) exit 4;; esac
[ $DRY = 1 ] && { echo "== dry-run 通过:审核单已签,24 小时内真上线直接用"; human "dry-run 通过"; exit 0; }

VRA=(); [ $URGENT = 1 ] && VRA=(--repo "$WT")
T verify --worker "$WORKER" --stage ship "${VRA[@]}"; VC=$?; [ $VC = 0 ] || exit $VC
PREV=$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8')).get('version') or '')" "$AV2/state/live_$WORKER.json" 2>/dev/null)
"$PY" "$LIB/smoke.py" --worker "$WORKER" --mode baseline >/dev/null 2>&1
BOHUI_SHIP_NONCE=$(T nonce --worker "$WORKER" "${VRA[@]}" | tail -1) || exit 1; export BOHUI_SHIP_NONCE
TK=$("$PY" -c "import json,sys;n=json.load(open(sys.argv[1],encoding='utf-8'));t=json.load(open(n['ticket'],encoding='utf-8'));print(t['id']+' t:'+t['content_sha256'][:12])" "$AV2/state/ship_nonce.json")
GH=$("$PY" -c "import sys;sys.path.insert(0,sys.argv[1]);import lib;print(lib.gate_hash()[7:19])" "$LIB")

# ---- 6–8 构建(astro 集成里第一关再跑一遍,命中缓存)→ 构建后树仍等于审核单 + 产物封存 → 部署(wrangler 自定义构建步骤再验一次)
build_and_deploy "$BUILDROOT" "$TK gate:$GH"; DC=$?; grab_ver "$PREV"
ACT=deploy; [ $URGENT = 1 ] && ACT=urgent
if [ $DC != 0 ] || [ -z "$VER" ]; then
  T record --worker "$WORKER" --action $ACT --status fail --note "$NOTE" >/dev/null; human "部署失败" "exit $DC,日志 $DLOG"
  note_red "$WORKER 部署失败" "exit $DC;日志 $DLOG"; exit 1
fi

# ---- 9 台账 + 本地快照 refs/ship/<worker> → 破缓存冒烟 → 关键页 5xx 自动回退(急修/破窗只开单)
T record --worker "$WORKER" --action $ACT --version "$VER" --prev-live "$PREV" --note "$NOTE" --message "$MSG" ${INCIDENT:+--incident "$INCIDENT"}
[ $URGENT = 1 ] && echo "急修补丁在 worktree 上线了;请主线把 $PATCH 合回主工作区。"
SR=(); [ $URGENT = 1 ] && SR=(--no-rollback)
"$PY" "$LIB/smoke.py" --worker "$WORKER" --mode deploy "${SR[@]}"; S=$?
case $S in
  0) T smoke --worker "$WORKER" --version "$VER" --smoke ok >/dev/null; human "已上线" "版本 $VER · 冒烟 ok";;
  5) if [ $URGENT = 1 ] || [ -z "$PREV" ]; then note_red "$WORKER 上线后关键页失败(未自动回退)" "版本 $VER";
     else echo "== 关键页失败 → 自动回退到 $PREV"; T rollback --worker "$WORKER" --to "$PREV" --reason "冒烟失败自动回退(版本 $VER)" --auto; fi
     T smoke --worker "$WORKER" --version "$VER" --smoke rolled_back >/dev/null; human "冒烟失败" "版本 $VER · 已处理";;
  *) T smoke --worker "$WORKER" --version "$VER" --smoke fail >/dev/null; note_red "$WORKER 上线后冒烟有失败项" "版本 $VER · smoke exit $S"; human "已上线(冒烟有失败项)" "版本 $VER";;
esac
exit 0

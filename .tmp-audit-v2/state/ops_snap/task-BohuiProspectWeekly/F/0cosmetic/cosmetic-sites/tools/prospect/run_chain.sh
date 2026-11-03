#!/bin/bash
# 免费获客流水线整链:助手交付入库 → 榜单挖品牌(按 seeds 文件) → 核官网 → 背调评分写信 → 装进 D1。日志 data/prospect/_chain.log
# 09-24 铁令④ / 拍板默认 #20:整链不访问搜索引擎、不抓 Amazon 榜单 —— from_market.py 移出周链;resolve.py 只用库内 website 与人工粘贴;
#   seeds 里的搜索结果页 / Amazon 榜单 URL 一律跳过(STOP)。旧版存档:助手交付/AI获客/停用代码-20260924/run_chain.sh.txt
# 演练:DRY_RUN=1 bash tools/prospect/run_chain.sh —— 不挪文件、不抓网页、不写库;列出将抓/跳过的榜单 URL,并干跑 resolve
cd "$(dirname "$0")/../.." || exit 1
export PYTHONUTF8=1
SEEDS=${1:-data/prospect/seeds.txt}   # 常备榜单清单;新市场就往里加一行「市场<TAB>URL」
STOP='amazon\.|/search|[?&](q|query)=|google\.|bing\.|yahoo\.|brave\.|duckduckgo|similarweb|importyeti'
if [ -n "$DRY_RUN" ]; then
  echo "DRY 将抓的榜单 URL:"; [ -f "$SEEDS" ] && cut -f2 "$SEEDS" | grep -viE "$STOP"
  echo "DRY 跳过的停用源:"; [ -f "$SEEDS" ] && cut -f2 "$SEEDS" | grep -iE "$STOP"
  python -u tools/prospect/resolve.py --limit 400 --dry-run
  echo "CHAIN DRY DONE $(date '+%F %H:%M')"; exit 0
fi
python -u tools/prospect/ingest_inbox.py
if [ -f "$SEEDS" ]; then
  for m in $(cut -f1 "$SEEDS" | sort -u); do
    urls=$(grep "^$m	" "$SEEDS" | cut -f2 | grep -viE "$STOP")
    [ -n "$urls" ] && python -u tools/prospect/mine_lists.py --market "$m" $urls 2>&1 | grep -v "^\["
  done
fi
python -u tools/prospect/resolve.py --limit 400 2>&1 | grep "→\|解析"
python -u tools/prospect/enrich.py --limit 400 2>&1 | grep "→\|skip\|fail\|完成"
python -u tools/prospect/load.py
echo "CHAIN DONE $(date '+%F %H:%M')"

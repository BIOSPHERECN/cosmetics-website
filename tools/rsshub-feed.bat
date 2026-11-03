@echo off
rem Network route is probed on every run by tools\pick-proxy.cmd (direct first), never hard-coded. ASCII only.
cd /d F:\0cosmetic\cosmetic-sites
set NODE_USE_ENV_PROXY=1
set LOG=F:\0cosmetic\cosmetic-sites\node_modules\.cache\news-hub-run.log
call F:\0cosmetic\cosmetic-sites\tools\pick-proxy.cmd https://biosphere-ai.com/ https://www.cbndata.com/ >> %LOG% 2>&1
node tools\rsshub-feed.mjs >> %LOG% 2>&1

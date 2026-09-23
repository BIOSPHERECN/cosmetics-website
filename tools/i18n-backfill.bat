@echo off
cd /d F:\0cosmetic\cosmetic-sites
set NODE_USE_ENV_PROXY=1
set HTTP_PROXY=http://127.0.0.1:1082
set HTTPS_PROXY=http://127.0.0.1:1082
node tools\translate-backfill.mjs >> F:\0cosmetic\cosmetic-sites\node_modules\.cache\i18n-backfill-run.log 2>&1

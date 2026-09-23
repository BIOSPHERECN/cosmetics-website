@echo off
rem Daily collection chain (task BohuiCollectDaily 05:40): packaging images from Made-in-China, bestseller INCI lists from Amazon, 1688 packaging by factory.
rem Keep this file ASCII-only (cmd reads .bat as ANSI; UTF-8 comments broke market/daily.bat on 2026-09-16).
cd /d F:\0cosmetic\cosmetic-sites
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /r "^CLOUDFLARE_" .env`) do set "%%a=%%b"
set PYTHONUTF8=1
if not exist data\collect mkdir data\collect
echo ==== %date% %time% start >> data\collect\daily.log
rem IndexNow first (2026-09-18): push new + changed (lastmod 7d) sitemap URLs to Bing/Yandex/Seznam, ping Google sitemap, write pulse indexnow for /bohui/growth/
python tools\geo\indexnow.py --submit >> data\collect\daily.log 2>&1
python tools\pack-scrape-mic.py --cap 20 >> data\collect\daily.log 2>&1
python tools\market\inci_harvest.py --n 40 >> data\collect\daily.log 2>&1
rem 1688 by factory list (data\pack1688\factories.csv) through the 360 browser session; needs 360 started by the launcher bat in F:\0cosmetic (port 9222); skips itself when 360 is not up
python tools\pack-scrape-1688.py --specs 60 --cap 80 >> data\collect\daily.log 2>&1
rem Bohui gateway: refresh keys + prompt templates from D1 (gateway hot-reloads), then push call logs (~/.bohui-gateway/logs/*.jsonl) into D1 ai_runs; idempotent by input_hash (2026-09-18)
python tools\gateway\sync-config.py >> data\collect\daily.log 2>&1
python tools\gateway\logs-to-d1.py >> data\collect\daily.log 2>&1
echo ==== %date% %time% end >> data\collect\daily.log

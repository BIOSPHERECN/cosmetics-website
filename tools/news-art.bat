@echo off
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "CRON_KEY=" F:\0cosmetic\cosmetic-sites\.env`) do set CK=%%b
curl -s -X POST "https://biosphere-ai.com/api/cron/news-art/" -H "x-cron-key: %CK%" -H "Origin: https://biosphere-ai.com" -H "Content-Type: application/json" --max-time 280 >> F:\0cosmetic\cosmetic-sites\node_modules\.cache\news-art.log 2>&1
echo. >> F:\0cosmetic\cosmetic-sites\node_modules\.cache\news-art.log

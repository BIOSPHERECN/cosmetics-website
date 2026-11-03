@echo off
cd /d F:\0cosmetic\cosmetic-sites
python tools\packjob-worker.py >> F:\0cosmetic\cosmetic-sites\node_modules\.cache\packjob-run.log 2>&1

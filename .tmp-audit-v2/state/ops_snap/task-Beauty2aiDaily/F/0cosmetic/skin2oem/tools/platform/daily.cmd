@echo off
chcp 65001 >nul
rem Beauty2AI daily: opps engine, sync summaries, import WorkBuddy deliverables (task Beauty2aiDaily 06:10)
cd /d F:\0cosmetic\skin2oem
set PYTHONIOENCODING=utf-8
python tools\platform\opps-daily.py >> data\opps-daily.log 2>&1
python tools\platform\sync-summaries.py >> data\sync-summaries.log 2>&1
python tools\platform\projects-nudge.py >> data\projects-nudge.log 2>&1
python tools\platform\import-markets.py --apply >> data\import-markets.log 2>&1
if exist "F:\0cosmetic\助手交付\16-工厂库\factories_gz_交付.csv" python tools\platform\import-factories.py "F:\0cosmetic\助手交付\16-工厂库\factories_gz_交付.csv" --apply >> data\import-factories.log 2>&1
python tools\platform\counts-refresh.py >> data\counts-refresh.log 2>&1
python tools\platform\rank-refresh.py >> data\rank-refresh.log 2>&1
python tools\platform\market-stats.py >> data\market-stats.log 2>&1

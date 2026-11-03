@echo off
chcp 65001 >nul
rem Retry the finish steps that failed at 10:39 right after the import, then the approved morning steps.
cd /d F:\0cosmetic\skin2oem
set PYTHONIOENCODING=utf-8
echo [%date% %time%] chain2 start >> tools\platform\_chain2.log
python tools\platform\ingredient-freq.py --todo-only >> tools\platform\_chain2.log 2>&1
python tools\platform\obf-ingredients-load.py --freq >> tools\platform\_chain2.log 2>&1
python tools\platform\counts-refresh.py >> tools\platform\_chain2.log 2>&1
python tools\platform\morning_run.py --go >> tools\platform\_chain2.log 2>&1
echo [%date% %time%] chain2 end >> tools\platform\_chain2.log

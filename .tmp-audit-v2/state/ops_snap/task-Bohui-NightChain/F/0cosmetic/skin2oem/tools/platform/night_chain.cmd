@echo off
chcp 65001 >nul
rem Chain after the stalled import: resume load, night finish steps, i18n eval, kick cloud workers.
rem Registered as scheduled task Bohui-NightChain so it survives Claude session changes.
cd /d F:\0cosmetic\skin2oem
set PYTHONIOENCODING=utf-8
echo [%date% %time%] chain start >> tools\platform\_chain.log
python tools\platform\obf-ingredients-load.py >> tools\platform\_chain.log 2>&1
python tools\platform\finish_night.py >> tools\platform\_chain.log 2>&1
python tools\platform\i18n_eval.py 400 >> tools\platform\_chain.log 2>&1
python tools\platform\kick-workers.py >> tools\platform\_chain.log 2>&1
echo [%date% %time%] chain end >> tools\platform\_chain.log

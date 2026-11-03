@echo off
chcp 65001 >nul
rem Semantic judge of BEAUTY2AI translations by SenseNova GLM-5.2 via local gateway. Waits for night chain.
cd /d F:\0cosmetic\skin2oem
set PYTHONIOENCODING=utf-8
python tools\platform\i18n_judge.py 10 >> tools\platform\_judge.log 2>&1

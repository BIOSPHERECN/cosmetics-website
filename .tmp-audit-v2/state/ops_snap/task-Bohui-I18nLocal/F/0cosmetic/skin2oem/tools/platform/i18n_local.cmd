@echo off
chcp 65001 >nul
rem BEAUTY2AI page translation, local worker (cloud Actions blocked by GitHub billing since 09-23 00:38).
rem Scheduled task Bohui-I18nLocal, hourly, 50 min budget. Laggard languages get 3x batches. See i18n_local.py.
cd /d F:\0cosmetic\skin2oem
set PYTHONIOENCODING=utf-8
python -u tools\platform\i18n_local.py 3300 >> tools\platform\_i18n_local.log 2>&1

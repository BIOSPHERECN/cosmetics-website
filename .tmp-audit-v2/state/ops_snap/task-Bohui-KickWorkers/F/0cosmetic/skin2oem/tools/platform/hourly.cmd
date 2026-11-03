@echo off
chcp 65001 >nul
rem Worker health check + fallback kicker (task Bohui-KickWorkers, hourly at :38). ASCII only.
rem 2026-09-24: judges each worker by its LAST SUCCESS, not by whether it ran; any problem is logged as a line
rem tagged with the Chinese word for "abnormal". Cloud = w8848/bohui-automation (4 light workers), local = heavy.log
rem and _i18n_local.log. No global "gh auth switch" any more. Details in kick-workers.py.
cd /d F:\0cosmetic\skin2oem
set PYTHONIOENCODING=utf-8
python tools\platform\kick-workers.py >> data\kick-workers.log 2>&1

@echo off
rem Heavy cloud workers moved to this machine (2026-09-23, zero-paid rule: no GitHub paid minutes).
rem Scheduled task Bohui-HeavyLocal, hourly. One worker per run, idle priority, 4 cores, global lock. See heavy.py.
cd /d F:\0cosmetic\bohui-automation
set PYTHONIOENCODING=utf-8
if not exist local\logs mkdir local\logs
python -u local\heavy.py >> local\logs\heavy.task.log 2>&1

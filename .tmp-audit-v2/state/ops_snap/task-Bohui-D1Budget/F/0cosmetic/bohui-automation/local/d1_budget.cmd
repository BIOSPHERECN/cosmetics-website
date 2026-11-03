@echo off
rem D1 read budget watchdog (task Bohui-D1Budget, hourly at :10). ASCII only. See d1_budget.py.
cd /d F:\0cosmetic\bohui-automation
set PYTHONIOENCODING=utf-8
if not exist local\logs mkdir local\logs
python -u local\d1_budget.py >> local\logs\d1_budget.task.log 2>&1

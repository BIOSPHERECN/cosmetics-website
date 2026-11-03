@echo off
rem Beauty2AI packaging render worker (task Beauty2aiPackJob, every 2 min). ASCII only. Wrapped by run-hidden.vbs so no console window.
cd /d F:\0cosmetic\skin2oem
python tools\platform\packjob-worker.py >> node_modules\.cache\packjob-beauty2ai.task.log 2>&1

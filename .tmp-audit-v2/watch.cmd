@echo off
rem Audit v2.1 hourly watch (task Bohui-AuditWatch, minute 47 every hour, via run-hidden.vbs). ASCII only.
rem Low priority, single core (CPU heat rule). Runs the APPROVED copy of watch.py (cache\gate_approved).
cd /d F:\0cosmetic\tools-review\audit_v2
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
if not exist logs mkdir logs
start "" /b /low /wait /affinity 1 F:\0cosmetic\_venv\review\Scripts\python.exe -u F:\0cosmetic\tools-review\audit_v2\cache\gate_approved\audit_v2\watch.py >> logs\watch.log 2>&1

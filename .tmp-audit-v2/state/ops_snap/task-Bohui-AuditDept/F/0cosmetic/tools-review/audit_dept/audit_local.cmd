@echo off
rem Audit dept local daily run (task Bohui-AuditDept, 08:37 Beijing, via run-hidden.vbs). ASCII only.
rem Low priority, single core (CPU heat rule). See local_audit.py.
cd /d F:\0cosmetic\tools-review\audit_dept
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
if not exist logs mkdir logs
start "" /b /low /wait /affinity 1 F:\0cosmetic\_venv\review\Scripts\python.exe -u local_audit.py >> logs\audit_local.log 2>&1

@echo off
set PYTHONIOENCODING=utf-8
cd /d F:\0cosmetic\cosmetic-sites
start "" /b /low /wait python tools\knowledge\ledger-sync.py >> tools\_ledger_sync.log 2>&1

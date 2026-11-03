@echo off
rem Monthly regulatory changes digest + llms.txt citable facts (task Bohui-RegDigest, 1st of month 07:17). ASCII only.
cd /d F:\0cosmetic\cosmetic-sites
echo ==== %date% %time% >> tools\_reg-digest.log
"C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe" tools\reg-digest.py >> tools\_reg-digest.log 2>&1

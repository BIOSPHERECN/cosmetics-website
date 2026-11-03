@echo off
rem Weekly prospect chain (Mon 07:00, task BohuiProspectWeekly): ingest assistants -> mine lists -> resolve (DB/manual websites only, no search engines) -> enrich -> load. ASCII-only file.
rem 2026-09-24: from_market (Amazon lists) and search-engine lookups removed from the chain; see run_chain.sh header.
cd /d F:\0cosmetic\cosmetic-sites
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /r "^CLOUDFLARE_" .env`) do set "%%a=%%b"
"C:\Program Files\Git\bin\bash.exe" tools/prospect/run_chain.sh >> data\prospect\weekly.log 2>&1

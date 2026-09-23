@echo off
rem Night mass pass (task BohuiPackNight 01:00): shop lists for candidate factories through the 360 browser session (port 9222), list-only, auto-qualify shops.
cd /d F:\0cosmetic\cosmetic-sites
set PYTHONUTF8=1
python tools\pack-scrape-1688.py --auto --shops --list-only --pages 40 --cap 60 --gap 100 >> data\collect\pack1688-night.log 2>&1

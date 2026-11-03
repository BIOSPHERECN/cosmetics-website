@echo off
cd /d F:\0cosmetic\cosmetic-sites
python tools\crawl_cn_news.py >> F:\0cosmetic\cosmetic-sites\node_modules\.cache\news-cn-run.log 2>&1

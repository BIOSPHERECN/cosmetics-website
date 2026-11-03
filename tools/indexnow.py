#!/usr/bin/env python3
"""已迁到 tools/geo/indexnow.py(2026-09-18:加 lastmod 近 7 天重推、三端点分别记返回码、写 pulse 给后台「获客进展」)。这里只转发。"""
import os, runpy, sys
sys.argv[0] = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geo", "indexnow.py")
runpy.run_path(sys.argv[0], run_name="__main__")

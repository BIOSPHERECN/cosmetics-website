#!/usr/bin/env python3
"""爆款监控日报(Marvis 形态)入库 —— 创始人 2026-09-11 12:1x:「希望每日用 marvis 做的这种形态去展示,可以分国家分地区,是以报告的方法」。
来源:F:/0cosmetic/素材收件箱/跨境美妆爆款监控日报/MARVIS报告/爆款化妆品监控日报-YYYY-MM-DD*.md(同一天多个版本取最大的那份)。
按 `## ` / `### ` 切成节存 trend_report_sections(date, ord, level, heading, body_md),前台按节渲染、区域标题做目录;
不切的话 750KB 一份进不了 d1_exec 的 600KB 分片。图片链接原样保留,前台渲染时不出图(Amazon 外链不能热链)。
    python tools/trend-reports-load.py --apply
"""
import glob, io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402
SRC = r"F:\0cosmetic\素材收件箱\跨境美妆爆款监控日报\MARVIS报告"
HERE = os.path.dirname(os.path.abspath(__file__))
q = lambda v: "NULL" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"  # noqa: E731


def main():
    apply = "--apply" in sys.argv
    best = {}
    for f in glob.glob(os.path.join(SRC, "爆款化妆品监控日报-*.md")):
        m = re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(f))
        if m and (m.group(1) not in best or os.path.getsize(f) > os.path.getsize(best[m.group(1)])):
            best[m.group(1)] = f
    print("日报", len(best), "天:", sorted(best)[0], "→", sorted(best)[-1])
    if apply:
        d1("CREATE TABLE IF NOT EXISTS trend_reports (date TEXT PRIMARY KEY, title TEXT, sections INTEGER, bytes INTEGER, source TEXT)")
        d1("CREATE TABLE IF NOT EXISTS trend_report_sections (date TEXT, ord INTEGER, level INTEGER, heading TEXT, body_md TEXT, PRIMARY KEY (date, ord))")
    total = 0
    for date in sorted(best):
        txt = io.open(best[date], encoding="utf-8", errors="replace").read().replace("\r\n", "\n")
        title = next((l[2:].strip() for l in txt.split("\n") if l.startswith("# ")), f"爆款化妆品监控日报 {date}")
        parts = re.split(r"\n(?=##{1,2} )", "\n" + txt)
        secs = []
        for p in parts:
            p = p.strip("\n")
            if not p or p.startswith("# "):
                continue
            m = re.match(r"(##{1,2}) (.+)", p)
            if not m:
                continue
            body = p[m.end():].strip("\n")
            secs.append((len(m.group(1)), m.group(2).strip(), body))
        print(f"  {date}: {len(txt):,} 字节 · {len(secs)} 节 · {os.path.basename(best[date])}")
        if not apply:
            continue
        lines = [f"DELETE FROM trend_report_sections WHERE date = {q(date)};",
                 f"INSERT INTO trend_reports (date, title, sections, bytes, source) VALUES ({q(date)}, {q(title[:200])}, {len(secs)}, {len(txt)}, {q(os.path.basename(best[date]))}) ON CONFLICT(date) DO UPDATE SET title = excluded.title, sections = excluded.sections, bytes = excluded.bytes, source = excluded.source;"]
        for i, (lv, h, b) in enumerate(secs):
            lines.append(f"INSERT INTO trend_report_sections (date, ord, level, heading, body_md) VALUES ({q(date)}, {i}, {lv}, {q(h[:200])}, {q(b[:150000])});")
        part, buf, k = 0, [], 0
        for ln in lines:
            if sum(len(z) for z in buf) + len(ln) > 550_000 and buf:
                part += 1; f = os.path.join(HERE, f"_tr-{date}-{part}.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n"); k += d1_exec(f); os.remove(f); buf = []
            buf.append(ln)
        if buf:
            part += 1; f = os.path.join(HERE, f"_tr-{date}-{part}.sql"); io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(buf) + "\n"); k += d1_exec(f); os.remove(f)
        total += k
    if apply:
        print("写入", total, "行 · 日报", d1("SELECT COUNT(*) n FROM trend_reports")[0]["n"], "天 · 节", d1("SELECT COUNT(*) n FROM trend_report_sections")[0]["n"])


if __name__ == "__main__":
    main()

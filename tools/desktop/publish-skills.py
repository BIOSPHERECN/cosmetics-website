#!/usr/bin/env python3
"""帛卉AI 电脑端·技能发布脚本。

把本机的 bohui-* 技能目录整理成客户端能自动更新的格式:
  <out>/skills/skills.json          清单(名称/版本/哈希/更新时间/频道/描述/文件列表)
  <out>/skills/<name>/<文件...>      客户端按清单逐文件下载(带 sha256 校验)
  <out>/skills/<name>.zip           给人下载/邮件传的整包

用法:
  python tools/desktop/publish-skills.py                       # 源=默认位置,输出到交付目录 updates/
  python tools/desktop/publish-skills.py --src C:/x/skills --out D:/srv/bohui-ai/updates

版本号 = 目录内容哈希前 8 位(内容不变版本就不变);频道读 SKILL.md 开头的 channel: 字段,
可选值 required(公司必装)/ 部门中文名(市场部 / 销售部 / 技术研发部 / 采购部 / 财务部 / 管理层,客户端 eligible() 拿 profile.dept 原样比对)/ optional(可选),缺省 required。
专家改了 SKILL.md 之后跑一次,再把 updates/ 目录整个拷到服务器即可。
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SRCS = [
    Path.home() / ".dsh" / "skills",
    Path("F:/0cosmetic/.claude/skills"),
    Path.home() / ".config" / "opencode" / "skills",
]
DEFAULT_OUT = Path("F:/0cosmetic/助手交付/7-帛卉电脑端/updates")
CHANNELS = {"required", "optional", "市场部", "销售部", "技术研发部", "采购部", "财务部", "管理层"}
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def frontmatter(text: str) -> dict:
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    out = {}
    if not m:
        return out
    for line in m.group(1).splitlines():
        mm = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if mm:
            v = mm.group(2).strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            out[mm.group(1)] = v
    return out


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def skill_files(src: Path):
    for p in sorted(src.rglob("*")):
        if p.is_file() and p.name != ".bohui.json":
            yield p


def dir_hash(src: Path) -> str:
    """与客户端 hashSkillDir 同一算法:相对路径 + \0 + 内容 + \0,按路径排序。"""
    h = hashlib.sha256()
    for p in skill_files(src):
        rel = p.relative_to(src).as_posix()
        h.update((rel + "\0").encode("utf-8"))
        h.update(p.read_bytes())
        h.update(b"\0")
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="技能源目录(含 bohui-*/SKILL.md)")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="输出的 updates 目录")
    args = ap.parse_args()

    src = Path(args.src) if args.src else next((p for p in DEFAULT_SRCS if p.exists()), None)
    if not src or not src.exists():
        print("找不到技能源目录,请用 --src 指定", file=sys.stderr)
        return 2
    out = Path(args.out) / "skills"
    out.mkdir(parents=True, exist_ok=True)

    entries = []
    for d in sorted(src.iterdir()):
        if not d.is_dir() or not d.name.startswith("bohui-") or not (d / "SKILL.md").exists():
            continue
        fm = frontmatter((d / "SKILL.md").read_text(encoding="utf-8", errors="replace"))
        name = fm.get("name") or d.name
        if not NAME_RE.match(name):
            print(f"跳过 {d.name}:name 不合规({name})", file=sys.stderr)
            continue
        if not fm.get("description"):
            print(f"跳过 {d.name}:缺 description", file=sys.stderr)
            continue
        channel = fm.get("channel", "required")
        if channel not in CHANNELS:
            print(f"{d.name}:channel={channel} 不认识,按 optional 处理", file=sys.stderr)
            channel = "optional"
        digest = dir_hash(d)
        updated = max(p.stat().st_mtime for p in skill_files(d))
        dest = out / name
        if dest.exists():
            shutil.rmtree(dest)
        files = []
        for p in skill_files(d):
            rel = p.relative_to(d).as_posix()
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, target)
            files.append({"path": rel, "sha256": sha256_bytes(p.read_bytes()), "size": p.stat().st_size})
        with zipfile.ZipFile(out / f"{name}.zip", "w", zipfile.ZIP_DEFLATED) as zf:
            for p in skill_files(d):
                zf.write(p, f"{name}/{p.relative_to(d).as_posix()}")
        entries.append({
            "name": name,
            "version": digest[:8],
            "sha256": digest,
            "updatedAt": datetime.fromtimestamp(updated, tz=timezone.utc).isoformat(timespec="seconds"),
            "channel": channel,
            "description": fm["description"],
            "files": files,
        })

    manifest = {"updatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"), "skills": entries}
    (out / "skills.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    by_channel = {}
    for e in entries:
        by_channel[e["channel"]] = by_channel.get(e["channel"], 0) + 1
    print(f"源:{src}\n输出:{out}\n技能:{len(entries)} 个 {by_channel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

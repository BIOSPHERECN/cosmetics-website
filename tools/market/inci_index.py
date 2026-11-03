"""成分—产品关系表 market_product_inci 灌数(GPT 设计包 product_ingredients 落到现有 D1,任务 I,2026-09-18)。
依据:原料页 instr 子串匹配 PEG-8 会命中 PEG-80;切分口径与 apps/web/src/lib/decoder.ts 的 splitInci + factKey 逐字一致。
用法:python tools/market/inci_index.py [--only-missing | --repair] [--dry-run]   幂等(INSERT OR IGNORE)。
--only-missing 只灌一行都没有的产品(计划任务用);--repair 另补行数不够的半截产品(整表计数,手动跑);--dry-run 只打印数。"""
import atexit, io, json, os, re, shutil, subprocess, sys, tempfile, time
from collections import Counter
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from _bohui import d1, _wenv
ONLY_MISSING = "--only-missing" in sys.argv
REPAIR = "--repair" in sys.argv

# decoder.ts splitInci:(?<!\d)[,;,;、] 切 → 去括号 → 空白压一格 → trim;factKey:去括号 → 大写 → 压空白 → 去首尾空白/句点
PAREN = re.compile(r"[（(][^）)]*[）)]")
# 09-22 P 线实测:位号逗号后带空格时(`Aqua, 1, 2-Hexanediol`)上面的 lookahead 失效,切出 `1`/`3-DIOL`
# 这类碎片(全库 667 个碎片键、10,385 次出现,`1` 一个键就 freq 1362)。不改正则 —— P 线消融过,
# `·•‧∙・`、换行、` - ` 逐个加进分隔符,与 OBF 一致率全降。改成切完接回去:
# 后一段 `2-` 开头 + 前一段结尾数字串 ≤2 位 = 同一个名字;`CI 17200, 12-Hydroxystearic` 不误接(17200 是 5 位)。
# 与 apps/web/src/lib/decoder.ts joinLocants() 同一套口径,改一处要同步另一处。
_LOCANT_HEAD = re.compile(r"^\d{1,2}\s*[-–－]")
_LOCANT_TAIL = re.compile(r"(?:^|\D)\d{1,2}$")


def join_locants(parts):
    out = []
    for p in parts:
        if out and _LOCANT_HEAD.match(p) and _LOCANT_TAIL.search(out[-1]):
            out[-1] = out[-1] + "," + p
        else:
            out.append(p)
    return out


def split_inci(s):
    return join_locants([x for x in (re.sub(r"\s+", " ", PAREN.sub(" ", p)).strip() for p in re.split(r"[;，；、]|(?<!\d),|,(?!\d{1,2}(?:\s*[-–－]|\s+[A-Za-z]))", s or "")) if x])
# 09-22 P 线查出的口径漂移:这里少了脏字符那一段,`Limonene†` 出 `LIMONENE†`,
# 与 _pd1.fact_key / decoder.ts factKey 对不上,`market_product_inci` 就挂不到 `ingredient_facts`。
# 脏字符表与 _pd1.py `_DIRTY` 逐字一致(* „ † ‡ + \ 孤括号 与不可见字符)。
# 09-22 U 线实测：不可见字符要**删除**，不能换成空格 —— `Potassium Jo­jobate`（软连字符 U+00AD）
# 被换成空格后裂成 `JO JOBATE`，又是一个碎键。可见脏字符换空格才对，它们本来就在分隔位置上。
# 顺序：先删不可见，再把可见的换空格。
_INVIS = re.compile(r"[\u2060\u00ad\ufeff\u200b\u200c\u200d\ufffc]")
_DIRTY = re.compile(r"[*„†‡+\()\[\]{}]")


# 09-24 W0续:原文自带控制字符(0x02/0x1a 是被替换掉的连字符)会直接进键;口径同 inci_ctrl_fix.clean():
# 0x02/0x1a → '-',其余不可见控制字符删除(\t\n\r 与 0x1c-0x1f 属 \s,下面压成空格)。
_CTRL = re.compile(r"[\x00-\x08\x0e-\x1b\x7f]")


def fact_key(name):
    s = _DIRTY.sub(" ", _INVIS.sub("", _CTRL.sub("", re.sub(r"[\x02\x1a]", "-", PAREN.sub(" ", name))).upper()))
    s = re.sub(r"^[\s.]+|[\s.]+$", "", re.sub(r"\s+", " ", s))
    return re.sub(r"(\d)\s*,\s*(?=\d)", r"\1,", s)  # 09-22:位号逗号两侧压掉空白,`1, 2-HEXANEDIOL` 与既有 `1,2-HEXANEDIOL` 才是同一个键(与 decoder.ts factKey 同步)

q = lambda s: "'" + str(s).replace("'", "''") + "'"


# 09-24 W0续:旧写法 80 分钟只写 1 万行。原因三个:① OFFSET 分页 150 行一页,读产品就要 983 次 wrangler(每次 ~5 秒);
# ② 每 400 行一次 --file 导入;③ 计划任务 Bohui-FollowWorkBuddy 每 30 分钟也起一个本脚本,两进程抢同名 _mpi_{i}.sql、互撞导入锁(7500)。
# 现在:keyset 分页 2000 行一页;每条 INSERT 80 行、每文件 500 条(4 万行)且按产品边界切;单实例锁;只在第一批前和失败后探活。
STMT, FILE_STMTS = 80, 500
LOCK = os.path.join(ROOT, "tools", "_inci_index.lock")   # 超 90 分钟没刷新视为死锁
STATE = os.path.join(ROOT, "tools", "_inci_index.state")
TODAY = time.strftime("%Y-%m-%d", time.gmtime())


def pages(sql_at, key, size):
    """keyset 分页:sql_at(last) 返回 `... AND key > last ORDER BY key LIMIT size`。d1() 失败也返回 [],空页重试 3 次才当结尾。"""
    out, last = [], 0
    while True:
        for _ in range(3):
            part = d1(sql_at(last))
            if part: break
            time.sleep(15)
        out += part
        if len(part) < size: return out
        last = part[-1][key]


def probe():
    for _ in range(5):
        r = d1("SELECT COUNT(*) AS n FROM ingredient_facts")
        if r:
            if not 5000 <= r[0]["n"] <= 7000: raise SystemExit(f"库不对(ingredient_facts={r[0]['n']}),停")
            return
        time.sleep(30)
    raise SystemExit("探活 5 次失败,停")


def put(path):
    """灌一个文件。7500/导入冲突歇 90 秒,Not currently importing 歇 30 秒;连败 3 次停(INSERT OR IGNORE,重灌无害)。"""
    for n in range(1, 4):
        try:
            p = subprocess.run(["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--file", path],
                               capture_output=True, text=True, encoding="utf-8", errors="replace",
                               cwd=ROOT, env=_wenv(), shell=(os.name == "nt"), timeout=900)
            out = (p.stdout or "") + (p.stderr or "")
        except subprocess.TimeoutExpired:
            out = "wrangler timed out (900s)"
        if re.search(r'"rows_written":\s*\d+', out): return
        tail = re.sub(r"\x1b\[[0-9;]*m", "", out).strip()[-160:]
        print(f"  [失败 {n}/3] {tail}", flush=True)
        if n == 3: raise SystemExit("连败 3 次,停")
        time.sleep(30 if "Not currently importing" in out else 90)
        probe()


def keys(inci):
    seen, rows = set(), []   # 同款重复键只留首次:PK(product_id, seq) 不会冲突,但共现统计要去重
    for seq, name in enumerate(split_inci(inci), 1):
        k = fact_key(name)
        if k and k not in seen: seen.add(k); rows.append((seq, k))
    return rows


def main():
    dry = "--dry-run" in sys.argv
    if not dry:
        try: os.mkdir(LOCK)
        except FileExistsError:
            if time.time() - os.path.getmtime(LOCK) < 5400: print("另一个 inci_index 在跑,跳过"); return
        atexit.register(shutil.rmtree, LOCK, True)
    base = "SELECT id, inci FROM market_products WHERE length(inci) > 30"
    floor, top = 0, 0
    if ONLY_MISSING:   # 只挑一行都没有的产品:NOT EXISTS 走主键,整轮约读 30 万行(计划任务每 30 分钟跑)
        base += " AND NOT EXISTS (SELECT 1 FROM market_product_inci m WHERE m.product_id = market_products.id)"
        # 09-24 D2:整轮 29.6 万行,查空时 pages() 还重试 3 遍 ≈ 89 万行/轮 × 48 轮/天。新品 id 自增:
        # 当天(UTC)第一轮全扫,之后只扫上一轮开跑时的 MAX(id) 之后的新品;状态记本机 _inci_index.state。
        st = {}
        try: st = json.load(io.open(STATE, encoding="utf-8"))
        except (OSError, ValueError): pass
        if st.get("day") == TODAY and not REPAIR: floor = int(st.get("max") or 0)
        m = d1("SELECT MAX(id) m FROM market_products")
        top = int((m[0]["m"] if m else 0) or 0)
        if floor: base += f" AND id > {floor}"
    have = {}
    if REPAIR:   # 半截产品:历史上 439 次灌库失败被跳过、进程被杀在文件中间。整表按产品计数,约读 300 万行,别放进计划任务
        have = {r["p"]: r["n"] for r in pages(lambda l: f"SELECT product_id AS p, COUNT(*) AS n FROM market_product_inci WHERE product_id > {l} GROUP BY product_id ORDER BY product_id LIMIT 5000", "p", 5000)}
    prods = pages(lambda l: f"{base} AND id > {l} ORDER BY id LIMIT 2000", "id", 2000)
    todo = [(p["id"], r) for p in prods for r in [keys(p["inci"])] if len(r) > have.get(p["id"], 0)]
    total = sum(len(r) for _, r in todo)
    print(f"products {len(prods)} have {len(have)} todo {len(todo)} (补半截 {sum(1 for i, _ in todo if i in have)}) rows {total}" + (f" · 增量 id>{floor}" if floor else ""), flush=True)
    done_state = lambda: top and not dry and io.open(STATE, "w", encoding="utf-8").write(json.dumps({"day": TODAY, "max": top}))
    if dry or not todo: done_state(); return
    files, cur = [], []
    for pid, rows in todo:   # 按产品边界切文件:中途停下不会留半截产品
        if cur and len(cur) + len(rows) > STMT * FILE_STMTS: files.append(cur); cur = []
        cur += [(pid, s, k) for s, k in rows]
    files.append(cur)
    probe()
    path, done = os.path.join(tempfile.gettempdir(), f"_mpi_{os.getpid()}.sql"), 0
    for i, f in enumerate(files, 1):
        with io.open(path, "w", encoding="utf-8") as fh:
            for j in range(0, len(f), STMT):
                fh.write("INSERT OR IGNORE INTO market_product_inci(product_id, seq, inci_key) VALUES " +
                         ",".join(f"({a},{b},{q(c)})" for a, b, c in f[j:j + STMT]) + ";\n")
        put(path)
        done += len(f)
        if not dry: os.utime(LOCK)
        print(f"  {i}/{len(files)} 文件 {done}/{total} 行 {time.strftime('%H:%M:%S')}", flush=True)   # 心跳
        if i < len(files): time.sleep(10)
    os.remove(path)
    done_state()
    print(f"本轮写入 {done} 行", flush=True)   # 09-24 D2:原来末尾 COUNT(*) 全表(数百万行读),每轮有新品就跑一次

if __name__ == "__main__":
    # 自检:与 decoder.ts 同口径
    # 注意:decoder.ts 的 (?<!\d) 让「PEG-8, 1,2-Hexanediol」不在 8 后切,这是线上口径,照搬不修
    assert split_inci("Water (Aqua), Glycerin;Cetyl Alcohol, 1,2-Hexanediol、Niacinamide.") == ["Water", "Glycerin", "Cetyl Alcohol", "1,2-Hexanediol", "Niacinamide."]
    assert fact_key("Niacinamide.") == "NIACINAMIDE" and fact_key("Water/Aqua/Eau") == "WATER/AQUA/EAU" and fact_key("Sodium  Hyaluronate (1%)") == "SODIUM HYALURONATE"
    assert fact_key("1, 2-Hexanediol") == "1,2-HEXANEDIOL" and fact_key("2,3-Butanediol") == "2,3-BUTANEDIOL"   # 09-24 W0:此处曾因写文件把 \1 转成 0x01,丢位号数字
    assert fact_key("Sodium C14\x1a16 Olefin Sulfonate\x01") == "SODIUM C14-16 OLEFIN SULFONATE" and fact_key("Aqua\tGlycerin") == "AQUA GLYCERIN"   # 09-24 W0续:控制字符不进键
    main()

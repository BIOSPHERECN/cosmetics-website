#!/usr/bin/env python3
"""BEAUTY2OEM 首批 10 张机会卡冻结校验(06-v2 §七 第一期验收「卡」一行 + §4.3)。

只读核对(默认):
  ① b2o_predictions 已冻结 = 10、review_status 全是 approved;② is_public=1 的 0 行;
  ③ 按冻结原文重算 frozen_hash,逐行与库里一致(公式见 HASH_KEYS,09-24 由库内 10 行反推核实);
  ④ 每行在 b2o_ledger 有一条 kind=judgment,payload.frozen_hash 与行一致;⑤ 冻结 / 公开 / 账本只追加触发器都在。
--probe:另做「改不动」实测 —— 对已冻结行 SET frozen_at=NULL、DELETE,对账本 UPDATE,三条都应被触发器拒绝(被拒 = 0 行写入)。
  这三条是写语句,照规矩先拿公司库锁 _LOCK_D1_COMPANY。
读量:10 行 predictions + 10 行 ledger(走 idx_ledger_entity)+ sqlite_master 约 360 行 ≈ 400 行/次;不是定时任务。
用法:python tools/b2o-cards-verify.py [--probe]    退出码:0 全过;1 有项不过(或查询失败)。
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _bohui import d1, _wenv, ROOT  # noqa: E402

HASH_KEYS = ["title", "fact", "pro", "con", "ruling", "uncertainty", "invalidation", "action", "verdict",
             "card_id", "made_at", "stage", "evidence_json"]
TRIGGERS = ["b2o_pred_frozen_upd", "b2o_pred_frozen_upd2", "b2o_pred_frozen_del", "b2o_pred_public_ins",
            "b2o_pred_public_upd", "b2o_ledger_no_update", "b2o_ledger_no_delete"]
LOCK = "F:/0cosmetic/skin2oem/tools/platform/_LOCK_D1_COMPANY"


def frozen_hash(r):
    return hashlib.sha256(json.dumps({k: r[k] for k in HASH_KEYS}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def refused(sql, want):
    """跑一条应被触发器拒绝的写语句;输出里有 want 才算拒绝成功"""
    p = subprocess.run(["npx", "wrangler", "d1", "execute", "bohui-cms-v2", "--remote", "--json", "--command", sql],
                       capture_output=True, text=True, encoding="utf-8", errors="replace",
                       cwd=ROOT, env=_wenv(), shell=(os.name == "nt"), timeout=180)
    return want in re.sub(r"\x1b\[[0-9;]*m", "", (p.stdout or "") + (p.stderr or ""))


def main():
    fails = []
    ok = lambda cond, msg: print(("  过  " if cond else "  不过 ") + msg) or (cond or fails.append(msg))

    rows = d1("SELECT * FROM b2o_predictions WHERE frozen_at IS NOT NULL ORDER BY id")
    ok(len(rows) == 10, f"① 已冻结 {len(rows)} 行(应 10)")
    ok(all(r["review_status"] == "approved" for r in rows), "① 已冻结行 review_status 全是 approved")
    pub = d1("SELECT COUNT(*) n FROM b2o_predictions WHERE is_public=1")
    ok(bool(pub) and pub[0]["n"] == 0, f"② is_public=1 的 {pub[0]['n'] if pub else '?'} 行(应 0)")
    bad = [r["id"] for r in rows if frozen_hash(r) != r["frozen_hash"]]
    ok(rows and not bad, f"③ 重算 frozen_hash 一致 {len(rows) - len(bad)}/{len(rows)}" + (f",不一致 id={bad}" if bad else ""))
    led = d1("SELECT entity_id, payload_json FROM b2o_ledger WHERE entity_type='b2o_predictions' AND kind='judgment'")
    lh = {str(x["entity_id"]): json.loads(x["payload_json"]).get("frozen_hash") for x in led}
    miss = [r["id"] for r in rows if lh.get(str(r["id"])) != r["frozen_hash"]]
    ok(rows and not miss, f"④ 账本 judgment 与行哈希一致 {len(rows) - len(miss)}/{len(rows)}" + (f",缺或不符 id={miss}" if miss else ""))
    have = {x["name"] for x in d1("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'b2o_%'")}
    lack = [t for t in TRIGGERS if t not in have]
    ok(not lack, "⑤ 触发器齐全" + (f",缺 {lack}" if lack else ""))

    # 前五项有不过(尤其缺触发器)就不做写入实测:触发器不在时这几条写语句会真的解冻 / 删行
    if "--probe" in sys.argv and rows and not fails:
        for _ in range(10):   # 最多等 10 分钟
            try:
                os.mkdir(LOCK); break
            except FileExistsError:
                print("  锁被占,60 秒后重试"); time.sleep(60)
        else:
            ok(False, "⑥ 拿不到 _LOCK_D1_COMPANY,没做写入实测"); return fails
        try:
            with open(f"{LOCK}/owner.txt", "w", encoding="utf-8") as f:
                f.write(f"C1 b2o-cards-verify --probe {time.strftime('%F %T')}\n")
            pid = rows[0]["id"]
            ok(refused(f"UPDATE b2o_predictions SET frozen_at=NULL WHERE id={pid}", "prediction frozen"), "⑥ 已冻结行改 frozen_at 被拒")
            ok(refused(f"DELETE FROM b2o_predictions WHERE id={pid}", "prediction frozen"), "⑥ 已冻结行 DELETE 被拒")
            ok(refused("UPDATE b2o_ledger SET kind=kind WHERE id=(SELECT MIN(id) FROM b2o_ledger)", "append-only"), "⑥ 账本 UPDATE 被拒")
        finally:
            for f in os.listdir(LOCK):
                os.remove(f"{LOCK}/{f}")
            os.rmdir(LOCK)
    return fails


if __name__ == "__main__":
    f = main()
    print("结论:" + ("全部通过" if not f else f"{len(f)} 项不过"))
    sys.exit(1 if f else 0)

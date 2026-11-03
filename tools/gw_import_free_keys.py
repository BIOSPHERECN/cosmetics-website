"""09-26: import the shared free-pool upstream keys into gw_keys as status='paused' (no live effect until activated).

Keys are read at runtime from the single master file F:\\0-down\\脚本\\_FREEKEY.py (never copied, never committed)
and written with a parameterized D1 query, so values only travel in the HTTPS request body: no temp file, no argv,
no stdout. Output is key labels, accounts and row counts only. Run only via ship_ops prod after review:
    python tools/gw_import_free_keys.py            # dry run: prints what would be inserted (labels only)
    python tools/gw_import_free_keys.py --apply
"""
import json, re, sys, urllib.request

sys.path.insert(0, r'F:\0-down\脚本')
from _FREEKEY import GROQ_KEYS, KILO_KEYS, OR_KEYS  # noqa: E402

DB = 'ea5b0da4-7f96-48bf-8fca-dc7193a9596d'          # company bohui-cms-v2 (bohui-gateway reads gw_keys here)
PLAN = [('GROQ', 'api.groq.com', 10, GROQ_KEYS), ('OPENROUTER', 'openrouter.ai', 20, OR_KEYS), ('KILO', 'api.kilo.ai', 30, KILO_KEYS)]


def company_cred():
    env = open(r'F:/0cosmetic/cosmetic-sites/.env', encoding='utf-8').read()
    pick = lambda k: (re.search(rf'^[ \t]*{k}[ \t]*=[ \t]*"?([^"\r\n]+)"?', env, re.M) or [None, ''])[1].strip()
    return pick('CLOUDFLARE_ACCOUNT_ID'), pick('CLOUDFLARE_API_TOKEN')


def query(acc, tok, sql, params):
    body = json.dumps({'sql': sql, 'params': params}).encode()
    url = f'https://api.cloudflare.com/client/v4/accounts/{acc}/d1/database/{DB}/query'
    err = None
    for px in (None, 'http://127.0.0.1:7890', 'http://127.0.0.1:1082'):
        try:
            op = urllib.request.build_opener(urllib.request.ProxyHandler({'https': px} if px else {}))
            req = urllib.request.Request(url, body, {'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
            return json.loads(op.open(req, timeout=60).read())
        except Exception as e:  # network route fallback; never echo the request body
            err = type(e).__name__
    raise SystemExit(f'D1 query failed ({err})')


def rows():
    out = []
    for label, account, base_prio, keys in PLAN:
        for i, k in enumerate(keys, 1):
            k = str(k).strip()
            if not re.fullmatch(r'[\w.\-:]+', k):
                print(f'skip {label}#{i} (unexpected characters)'); continue
            out.append((f'{label}#{i}', account, base_prio + i - 1, k))
    return out


def main():
    plan = rows()
    for name, account, prio, _ in plan:
        print(f'{name} -> {account} (priority {prio}, paused)')
    if '--apply' not in sys.argv:
        print(f'dry run: {len(plan)} keys, nothing written'); return
    acc, tok = company_cred()
    if not acc or not tok:
        raise SystemExit('company .env lacks CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN')
    for name, account, prio, secret in plan:
        r = query(acc, tok, "INSERT OR IGNORE INTO gw_keys (project, account, secret, priority, status, note) "
                            "VALUES ('bohui', ?, ?, ?, 'paused', ?)", [account, secret, prio, f'free-pool 2026-09-26 {name}'])
        if not r.get('success'):
            raise SystemExit(f'insert failed for {name}')
    v = query(acc, tok, "SELECT account, status, COUNT(*) AS n FROM gw_keys WHERE note >= 'free-pool 2026-09-26' "
                        "AND note < 'free-pool 2026-09-27' GROUP BY account, status", [])
    print('verify:', json.dumps((v.get('result') or [{}])[0].get('results', []), ensure_ascii=False))


if __name__ == '__main__':
    main()

# 审核部 v2.1 · 破窗记账唯一写入口(急-6)。系统 Python -I -S 跑,只用标准库,不 import 本目录别的文件。
# breakglass.jsonl 不做链式校验,容忍坏行(闸门坏了的时候也得记得进去)。
# 用法:python -I -S bg_log.py --layer ship|astro|deploy.sh|build.command --worker <名> --from-env   理由取环境变量 BOHUI_BREAKGLASS
#       python -I -S bg_log.py --layer … --reason "理由"
#       python -I -S bg_log.py --count <Worker>      打印 24 小时内该 Worker 的破窗次数(只数 layer=ship)
# 退出码:0 记下了(理由去空白后 ≥6 个字符,急-5);5 理由不够长;其他 = 本脚本/python 自己坏了(调用方退化为「非空即算」)。
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__)).replace('\\', '/')
AV2 = 'F:/0cosmetic/tools-review/audit_v2' if HERE.lower().startswith('f:/0cosmetic/tools-review/') and '/cache/tmp/' not in HERE.lower() else HERE
LOG = AV2 + '/ledger/breakglass.jsonl'


def arg(name, default=''):
    a = sys.argv
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def main():
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).replace(microsecond=0)
    if '--count' in sys.argv:
        w, n = arg('--count'), 0
        try:
            for l in open(LOG, encoding='utf-8', errors='replace'):
                try:
                    r = json.loads(l)
                    if r.get('worker') == w and r.get('layer') == 'ship' and now - datetime.datetime.fromisoformat(r['ts']) < datetime.timedelta(hours=24):
                        n += 1
                except Exception:
                    continue
        except OSError:
            pass
        print(n)
        return 0
    reason = os.environ.get('BOHUI_BREAKGLASS', '') if '--from-env' in sys.argv else arg('--reason')
    n = len(''.join(reason.split()))
    rec = {'ts': now.isoformat(), 'layer': arg('--layer', '?'), 'worker': arg('--worker'), 'cwd': os.getcwd().replace('\\', '/'),
           'reason': ' '.join(reason.split())[:500], 'len': n, 'accepted': n >= 6}
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    return 0 if n >= 6 else 5


if __name__ == '__main__':
    sys.exit(main())

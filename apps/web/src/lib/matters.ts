/* 业务协同工作台的公共口径:事项状态机、类型、优先级、每个状态「该做什么」。页面与接口共用一份,改一处两边一起变。 */
export const STATUS: Record<string, [string, string, string]> = {   // 状态 → [中文, 胶囊色, 当前状态下该做什么]
  pending:   ['待确认', 'p-warn', '尽快与客户取得联系,确认需求详情'],
  following: ['跟进中', 'p-warn', '安排下一次跟进,记录客户反馈'],
  doing:     ['执行中', 'p-ok',   '跟进打样或生产进度,按时交付'],
  done:      ['已完成', 'p-ok',   '核对回款,开具发票'],
  paid:      ['已回款', 'p-ok',   '归档,评估复购'],
  lost:      ['已终止', 'p-bad',  '记录终止原因,三个月后回访'],
};
/** 主线顺序;lost 是旁路:非 paid 都能进,回来只能到 pending */
export const FLOW = ['pending', 'following', 'doing', 'done', 'paid'];
/** 状态机:只许前进一格、任意回退、或进出 lost */
export function canMove(from: string, to: string): boolean {
  if (from === to || !STATUS[to]) return false;
  if (to === 'lost') return from !== 'paid';
  if (from === 'lost') return to === 'pending';
  return FLOW.indexOf(to) === FLOW.indexOf(from) + 1 || FLOW.indexOf(to) < FLOW.indexOf(from);
}
export const KINDS = ['询盘', '打样', '报价', '订单', '售后', '合作', '其他'];
export const PRIORITY: Record<string, string> = { low: '低', normal: '普通', high: '高', urgent: '紧急' };
export const LOG_KINDS: Record<string, string> = { note: '备注', status: '状态', call: '电话', email: '邮件', meeting: '会议', sample: '寄样', quote: '报价', payment: '回款' };
export const INVOICE = ['未开', '已开', '部分'];
export const SOURCES = ['官网询盘', '展会', 'LinkedIn', '转介绍', 'AI 获客', '老客户', '海关数据', '其他'];
/** 金额显示:空就是「—」,绝不补 0 */
export const money = (n: unknown, cur?: string | null) => (n == null || n === '' ? '—' : `${Number(n).toLocaleString()} ${cur || 'USD'}`);

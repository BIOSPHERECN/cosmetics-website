/* CRM 的公共口径:机会阶段与赢率(对齐 WorkBuddy 原型 metadata.ts 的 opportunity),活动类型。页面与接口共用一份。 */
export const STAGES: Record<string, [string, number]> = {
  discover: ['需求确认', 10], design: ['方案设计', 25], sampling: ['打样', 40], quote: ['报价', 60], negotiate: ['谈判', 80], won: ['赢单', 100], lost: ['丢单', 0],
};
export const OPEN_STAGES = ['discover', 'design', 'sampling', 'quote', 'negotiate'];
export const KINDS: Record<string, string> = { note: '备注', call: '电话', email: '邮件', whatsapp: 'WhatsApp', meeting: '会议', sample: '寄样', quote: '报价', status: '状态', system: '系统' };
export const LOST_REASONS = ['价格', '交期', '起订量', '认证/合规', '无回复', '选了别家', '项目取消', '其它'];

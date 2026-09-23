/**
 * 检索语种提示 —— 站点是 18 语种,检索索引只有中文与英文。
 *
 * 由来(创始人 2026-09-10 11:2x:「搜索要注意多语言支持,要不然就限定中文和英文」)。
 *
 * 实情:库里的可检索字段就两套 —— 中文名(原料档案、古方、产区、包材说明)与
 * 英文/INCI 名(各国原料目录、CosIng)。日语、泰语、阿拉伯语的访客用母语搜,
 * 一条也匹配不到,而页面只会显示「没找到」—— 他会以为我们没有这个原料,
 * 然后关掉页面。这是最贵的一种沉默失败。
 *
 * 两条路选一条:① 把 18 语种的检索词都翻译一遍再查(要一次线上翻译调用,慢且花钱,
 * 而且译名与法规名对不上会更糟);② **老老实实说明索引只覆盖中英**,
 * 并把输入框的示例词给成英文。选 ②:客户少走一步弯路,比一个看起来能用其实搜不到的框强。
 *
 * 中英两种语言下不显示这条 —— 对他们不成立,写了是噪音。
 */
export function searchHint(lang: string): string {
  const l = String(lang || '').toLowerCase();
  if (l.startsWith('zh') || l === 'en') return '';
  return HINT[l] ?? HINT.en;
}

const HINT: Record<string, string> = {
  en: 'Search covers Chinese and English only — please use an English or INCI term.',
  jp: '検索インデックスは中国語と英語のみ対応しています。英語名または INCI 名でご検索ください。',
  kr: '검색 색인은 중국어와 영어만 지원합니다. 영문명 또는 INCI 명으로 검색해 주세요.',
  fr: 'La recherche ne couvre que le chinois et l’anglais — utilisez un terme anglais ou le nom INCI.',
  de: 'Die Suche deckt nur Chinesisch und Englisch ab — bitte einen englischen oder INCI-Namen verwenden.',
  ru: 'Поиск работает только на китайском и английском — используйте английское или INCI-название.',
  id: 'Pencarian hanya mencakup bahasa Mandarin dan Inggris — gunakan istilah Inggris atau nama INCI.',
  my: 'Carian hanya meliputi bahasa Cina dan Inggeris — sila guna istilah Inggeris atau nama INCI.',
  th: 'ระบบค้นหารองรับเฉพาะภาษาจีนและภาษาอังกฤษ กรุณาค้นด้วยคำภาษาอังกฤษหรือชื่อ INCI',
  vn: 'Tìm kiếm chỉ hỗ trợ tiếng Trung và tiếng Anh — vui lòng dùng từ khóa tiếng Anh hoặc tên INCI.',
  ph: 'Ang paghahanap ay para lamang sa Tsino at Ingles — gumamit ng terminong Ingles o pangalang INCI.',
  es: 'La búsqueda solo cubre chino e inglés: utilice un término en inglés o el nombre INCI.',
  pt: 'A pesquisa cobre apenas chinês e inglês — use um termo em inglês ou o nome INCI.',
  ar: 'يغطي البحث اللغتين الصينية والإنجليزية فقط — يُرجى استخدام مصطلح إنجليزي أو اسم INCI.',
  tr: 'Arama yalnızca Çince ve İngilizceyi kapsar — lütfen İngilizce bir terim veya INCI adı kullanın.',
  in: 'खोज केवल चीनी और अंग्रेज़ी में उपलब्ध है — कृपया अंग्रेज़ी शब्द या INCI नाम का उपयोग करें।',
};

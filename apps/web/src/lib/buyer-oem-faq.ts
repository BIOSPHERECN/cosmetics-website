/**
 * 英文首页与 /en/oem/ 的采购 FAQ。
 * 问句、答句与工单逐字一致，页面正文和 FAQPage 共用这一份。
 * 只给英文页用。没有现成译文，不给其它语种。
 */

export const BUYER_OEM_FAQ_HEADING = 'Questions buyers ask before an OEM inquiry';

export const BUYER_OEM_FAQ: { q: string; a: string }[] = [
  {
    q: 'Are you a private label cosmetics manufacturer in Guangzhou?',
    a: 'Yes. Guangzhou Bohui Cosmetics Co., Ltd. (founded 2012) runs all production from its Guangzhou plant; BIOSPHERE is its export brand.',
  },
  {
    q: 'Which factory certifications do you hold?',
    a: 'The plant holds GMPC, ISO 22716:2007, and HALAL only. FDA facility registration and EU CPNP are filing assistance, not factory certifications; registration is not approval, and no certificate is issued.',
  },
  {
    q: 'What is your MOQ?',
    a: 'MOQ is not a single published figure. It follows the format and filling line, whether the packaging is a stock shape or a new mould, and whether the formula changes; terms are issued per project in a written quotation.',
  },
  {
    q: 'How long does sampling take?',
    a: 'Samples usually ship in 5–14 days (existing bases at the short end, new formulations at the long end), confirmed in writing. This is a sampling indication, not a mass-production lead time.',
  },
  {
    q: 'What categories can you manufacture?',
    a: 'The Guangzhou plant manufactures skincare, colour cosmetics, oral care, kids skincare, body care, hair care, cleansing, sun care and fragrance. The factory has more than 13,000 formulations on file in total; that figure is plant-wide, not a count for each category.',
  },
  {
    q: 'How do I start an OEM or private-label project?',
    a: 'Send a brief with category, target market, first-order volume, and a reference product or INCI, via WhatsApp or the RFQ form. Commercial terms are quoted per project in writing.',
  },
];

export const BUYER_OEM_FAQ_LINKS: { href: string; label: string }[] = [
  { href: '/en/answers/', label: 'All buyer questions' },
  { href: '/en/answers/moq-lead-skincare/', label: 'Skincare MOQ and lead time' },
  { href: '/en/answers/how-to-audit-oem/', label: 'How to check a contract manufacturer' },
  { href: '/en/capabilities/', label: 'Plant certifications' },
  { href: '/en/rfq/', label: 'Send a project brief' },
];

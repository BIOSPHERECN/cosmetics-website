# WhatsApp sales ledger (template)

Use this sheet after a visitor opens WhatsApp from the public site. It is a sales follow-up log, not a substitute for the live click counts in Analytics Engine (`wa:click`).

Do not record the customer's phone number, WhatsApp chat body, email, or name in a shared copy of this file. Site click tracking also omits those fields.

Anonymous click records (when the site is live with this change) include:

- `source_path` — the page path, without query-string tokens
- `lang` — page language
- `placement` — button location (`home-hero`, `product-hero`, `oem-market`, `gcc-fair`, `mobile-bar`, `fab`, `footer`, or `link`)
- time of the click (Analytics Engine timestamp)
- country when Cloudflare provides it
- optional allowed source tag, never a token or personal identifier

| date (Asia/Shanghai) | source_path | lang | placement | market | product_or_category | owner | status | notes (no personal data) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |

Do not invent historical Saudi or other inquiry rows here. Fill a row only after a real conversation is opened or handed to sales.

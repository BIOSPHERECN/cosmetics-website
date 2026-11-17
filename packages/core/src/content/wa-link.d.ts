export function waDigits(raw: unknown): string;
export function safeSourcePath(raw?: string | null): string;
export function safePrefillSubject(raw?: string | null): string;
export function oemWaText(
  lang?: string,
  siteName?: string,
  extras?: { path?: string; product?: string; category?: string },
): string;
export function waMeHref(input?: {
  whatsapp?: string | null;
  lang?: string;
  siteName?: string;
  path?: string;
  product?: string;
  category?: string;
}): string;
export function waOrContact(input?: {
  whatsapp?: string | null;
  lang?: string;
  siteName?: string;
  path?: string;
  product?: string;
  category?: string;
}): string;

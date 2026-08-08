import { normalizeUrl } from "./url";

/**
 * 企業サイトの URL からロゴ（ファビコン）を引く。
 *
 * ロゴ配信サービスはどれも「企業名」ではなく「ドメイン」で引くため、
 * 企業サイトの URL を入力してもらってドメインを取り出す。
 * マイページURLは大半が就活サイト（マイナビ等）を指すので、ここには使えない。
 *
 * Clearbit の Logo API は停止済み、DuckDuckGo は日本企業の取りこぼしが多かったため、
 * 実測でカバー率が一番良かった Google のファビコンを使う。
 */

/** ロゴが見つからないとき Google が返す既定アイコンの一辺（px）。実データは 48px で返る */
export const LOGO_FALLBACK_SIZE = 16;

/** URL からホスト名を取り出す。www. は落とす */
export function domainFromUrl(raw: string | null | undefined): string | null {
  const url = normalizeUrl(raw);
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export function logoUrlFromDomain(domain: string | null, size = 128): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function logoUrlFromWebsite(website: string | null | undefined, size = 128): string | null {
  return logoUrlFromDomain(domainFromUrl(website), size);
}

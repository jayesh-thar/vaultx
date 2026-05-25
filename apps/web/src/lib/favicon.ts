/**
 * Returns Google's favicon service URL for a given site URL.
 * Free, no API key, covers 99% of websites.
 * Returns null if URL is invalid or empty.
 */
export function getFaviconUrl(url: string): string | null {
  if (!url) return null;
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const hostname = new URL(normalized).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}

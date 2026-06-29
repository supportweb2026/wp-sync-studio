// Rewrites <img src=...> URLs in HTML content using a URL map.
export function rewriteImageUrls(
  html: string,
  urlMap: Map<string, string>,
): string {
  if (urlMap.size === 0) return html;
  let out = html;
  for (const [from, to] of urlMap) {
    if (!from || from === to) continue;
    // simple global replace, escaped for regex
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), to);
  }
  return out;
}

export function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  const re = /<img[^>]*\s+src\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) urls.add(m[1]);
  return [...urls];
}

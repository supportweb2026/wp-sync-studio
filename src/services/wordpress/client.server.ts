// Server-only WordPress REST client with auth, retry, timeout and pagination.

export interface WpAuth {
  siteUrl: string;
  username: string;
  appPassword: string;
}

export interface WpRequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  expectJson?: boolean;
}

export interface WpResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

export class WpHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
  }
}

function authHeader(auth: WpAuth): string {
  const token = btoa(`${auth.username}:${auth.appPassword}`);
  return `Basic ${token}`;
}

function buildUrl(auth: WpAuth, path: string, query?: WpRequestOptions["query"]): string {
  const base = auth.siteUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? "" : "/"}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function wpRequest<T>(
  auth: WpAuth,
  path: string,
  options: WpRequestOptions = {},
): Promise<WpResponse<T>> {
  const url = buildUrl(auth, path, options.query);
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = options.retries ?? 2;

  const headers: Record<string, string> = {
    Authorization: authHeader(auth),
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text();
        if (res.status >= 500 && attempt < maxRetries) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        throw new WpHttpError(
          `WP ${method} ${path} -> ${res.status}`,
          res.status,
          text,
        );
      }
      let data: unknown = null;
      if (options.expectJson !== false) {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      }
      return { data: data as T, headers: res.headers, status: res.status };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (err instanceof WpHttpError) throw err;
      if (attempt < maxRetries) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("WP request failed");
}

export async function wpHead(
  auth: WpAuth,
  path: string,
  query?: WpRequestOptions["query"],
): Promise<Headers> {
  const url = buildUrl(auth, path, query);
  const res = await fetch(url, {
    method: "HEAD",
    headers: { Authorization: authHeader(auth) },
  });
  return res.headers;
}

export async function wpFetchAll<T>(
  auth: WpAuth,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  perPage = 100,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const res = await wpRequest<T[]>(auth, path, {
      query: { ...query, per_page: perPage, page },
    });
    if (!Array.isArray(res.data)) break;
    out.push(...res.data);
    const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "0");
    if (!totalPages || page >= totalPages) break;
    page += 1;
    if (page > 1000) break; // hard safety cap
  }
  return out;
}

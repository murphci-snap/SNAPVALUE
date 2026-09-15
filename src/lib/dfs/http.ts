const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const DK_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.draftkings.com",
  Referer: "https://www.draftkings.com/lobby#/NFL",
};

function headersFor(url: string, extra?: HeadersInit): Record<string, string> {
  const base: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": UA,
  };
  if (/draftkings\.com/i.test(url)) Object.assign(base, DK_HEADERS);
  if (extra) {
    const h = extra instanceof Headers ? Object.fromEntries(extra.entries()) : Array.isArray(extra) ? Object.fromEntries(extra) : extra;
    Object.assign(base, h);
  }
  return base;
}

export async function getJson<T>(url: string, init?: RequestInit, timeoutMs = 16000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: headersFor(url, init?.headers),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function getText(url: string, init?: RequestInit, timeoutMs = 14000): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "text/plain, text/csv, */*",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.text();
}

export async function getHtml(url: string, timeoutMs = 14000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.text();
}

export async function settled<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export async function poolMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  deadlineMs?: number,
): Promise<R[]> {
  const out: R[] = [];
  const queue = [...items];
  const start = Date.now();
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    while (queue.length) {
      if (deadlineMs && Date.now() - start > deadlineMs) return;
      const item = queue.shift();
      if (item === undefined) return;
      try {
        out.push(await fn(item));
      } catch {
        // skip failed unit
      }
    }
  });
  await Promise.all(workers);
  return out;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export async function getJson<T>(url: string, init?: RequestInit, timeoutMs = 16000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": UA,
      ...(init?.headers ?? {}),
    },
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

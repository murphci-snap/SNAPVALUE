import { readFileSync, writeFileSync } from "node:fs";
import type { SlateResponse } from "./types";

const PATH = "/tmp/snapvalue-slate.json";

type Hit = { at: number; value: SlateResponse };

export function readTmpCache(key: string, ttlMs: number): Hit | null {
  try {
    const store = JSON.parse(readFileSync(PATH, "utf8")) as Record<string, Hit>;
    const hit = store[key];
    if (hit?.value && Date.now() - hit.at < ttlMs) return hit;
  } catch {
    /* empty */
  }
  return null;
}

export function readLastGood(preferredId?: number): Hit | null {
  try {
    const store = JSON.parse(readFileSync(PATH, "utf8")) as Record<string, Hit>;
    let best: Hit | null = null;
    for (const [key, hit] of Object.entries(store)) {
      if (!hit?.value || !("ok" in hit.value) || !hit.value.ok) continue;
      if (preferredId != null && key.endsWith(`:${preferredId}`)) return hit;
      if (!best || hit.at > best.at) best = hit;
    }
    return best;
  } catch {
    return null;
  }
}

export function writeTmpCache(key: string, value: SlateResponse) {
  try {
    let store: Record<string, Hit> = {};
    try {
      store = JSON.parse(readFileSync(PATH, "utf8")) as Record<string, Hit>;
    } catch {
      store = {};
    }
    store[key] = { at: Date.now(), value };
    writeFileSync(PATH, JSON.stringify(store));
  } catch {
    /* empty */
  }
}

import { getJson, getText, settled } from "@/lib/dfs/http";
import { normalizeName } from "@/lib/utils";
import { UFC_HEADLINE, UFC_LIVE_KEYS } from "./constants";

export type UfcPullout = {
  names: string[];
  source: string;
  date: string;
  title: string;
  url?: string;
};

export type UfcCardTrust = {
  checkedAt: string;
  trustedSource: string;
  trustedDate: string;
  trustedTitle: string;
  scratched: UfcPullout[];
  scratchedKeys: string[];
  staleEventPage: string[];
  note: string;
};

type Item = { title: string; summary: string; date: string; source: string; url: string };

const ESPN_H = { Referer: "https://www.espn.com/mma/fightcenter", Origin: "https://www.espn.com" };

const EVENT_RE = /rosas|barcelos|fight night/i;
const PULL_RE =
  /scrapped|removed from|pulled out of|pull(?:ed|ing) out of|withdraws? from|withdrawn from|no longer competing|off the card|fight has been cancel+ed|bout (?:is |was )?(?:off|scrapped|cancel+ed)|withdraws? (?:again )?(?:from|ahead of)/i;
const SKIP_RE = /\bskit\b|\bparody\b|\bsimulation\b|picks are out|video out now|weigh-ins will|full card breakdown/i;
const TRUSTED_RE = /mma fighting|mmafighting|mma junkie|mmajunkie|espn|ufc\.com|mmaweekly|bloody elbow|sherdog|ufc official|@ufc\b|ufconparamount|ufc on paramount/i;

const NEWS_TTL_MS = 4 * 60 * 1000;
type NewsHit = { at: number; value: UfcCardTrust };
const g = globalThis as typeof globalThis & { __snapUfcNews?: NewsHit };

function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8230;/g, "...")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(raw: string): string {
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw.slice(0, 10);
  return new Date(t).toISOString().slice(0, 10);
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1] ?? "") : "";
}

function attrHref(xml: string): string {
  const m = xml.match(/<link[^>]+href="([^"]+)"/i) || xml.match(/<link>([^<]+)<\/link>/i);
  return m?.[1] ?? "";
}

function parseAtom(xml: string, source: string): Item[] {
  return xml.split(/<entry[\s>]/i).slice(1).map((chunk) => {
    const body = chunk.split("</entry>")[0] ?? chunk;
    return {
      title: tag(body, "title"),
      summary: tag(body, "summary") || tag(body, "content"),
      date: isoDate(tag(body, "published") || tag(body, "updated")),
      source,
      url: attrHref(body),
    };
  });
}

function parseRss(xml: string, fallbackSource: string): Item[] {
  return xml.split(/<item[\s>]/i).slice(1).map((chunk) => {
    const body = chunk.split("</item>")[0] ?? chunk;
    return {
      title: tag(body, "title"),
      summary: tag(body, "description"),
      date: isoDate(tag(body, "pubDate") || tag(body, "published")),
      source: tag(body, "source") || fallbackSource,
      url: tag(body, "link") || attrHref(body),
    };
  });
}

function namesIn(text: string, roster: string[]): string[] {
  const n = normalizeName(text);
  return roster.filter((key) => key.length >= 3 && n.includes(key));
}

function isPulloutItem(item: Item): boolean {
  const blob = `${item.title} ${item.summary}`;
  if (SKIP_RE.test(blob)) return false;
  if (!EVENT_RE.test(blob)) return false;
  return PULL_RE.test(blob);
}

function isTrusted(item: Item): boolean {
  return TRUSTED_RE.test(`${item.source} ${item.title} ${item.url}`);
}

async function espnNews(): Promise<Item[]> {
  const json = await getJson<{ articles?: { headline?: string; description?: string; published?: string; links?: { web?: { href?: string } } }[] }>(
    "https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc/news",
    { headers: ESPN_H },
    8000,
  );
  return (json.articles ?? []).map((a) => ({
    title: a.headline ?? "",
    summary: a.description ?? "",
    date: isoDate(a.published ?? ""),
    source: "ESPN",
    url: a.links?.web?.href ?? "",
  }));
}

function rosterKeys(): string[] {
  return UFC_LIVE_KEYS.filter((k) => k.length >= 5);
}

function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export async function loadUfcCardNews(): Promise<UfcCardTrust> {
  const hit = g.__snapUfcNews;
  if (hit && Date.now() - hit.at < NEWS_TTL_MS) return hit.value;

  const roster = rosterKeys();
  const queries = [
    "https://www.mmafighting.com/rss/current.xml",
    "https://news.google.com/rss/search?q=Rosas+Barcelos+(withdrawn+OR+scrapped+OR+%22pulled+out%22+OR+%22off+the+card%22+OR+cancelled)&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=%22Fight+Night%22+(Rosas+OR+Barcelos)+(@ufc+OR+site:x.com)+(out+OR+pulled+OR+withdrawn+OR+scrapped)&hl=en-US&gl=US&ceid=US:en",
  ];

  const [mmaf, g1, g2, espn] = await Promise.all([
    settled(getText(queries[0]!, {}, 8000).then((xml) => parseAtom(xml, "MMA Fighting"))),
    settled(getText(queries[1]!, {}, 8000).then((xml) => parseRss(xml, "Google News"))),
    settled(getText(queries[2]!, {}, 8000).then((xml) => parseRss(xml, "X via Google News"))),
    settled(espnNews()),
  ]);

  const items = [...(mmaf ?? []), ...(g1 ?? []), ...(g2 ?? []), ...(espn ?? [])];
  const found: UfcPullout[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!isPulloutItem(item) || !isTrusted(item)) continue;
    const hits = namesIn(item.title, roster);
    if (!hits.length) continue;
    if (!PULL_RE.test(item.title) && hits.length > 2) continue;
    const key = item.title.slice(0, 90).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      names: hits,
      source: item.source,
      date: item.date,
      title: item.title.slice(0, 180),
      url: item.url,
    });
  }

  const scratchedKeys = [...new Set(found.flatMap((f) => f.names))].filter((k) => roster.includes(k));
  const primary = found[0];
  const when = formatWhen(new Date().toISOString());
  const note = scratchedKeys.length
    ? `Card rechecked ${when}. Pulled from ${UFC_HEADLINE}: ${scratchedKeys.join(", ")}.${primary ? ` ${primary.source}: ${primary.title}` : ""}`
    : `Card rechecked ${when}. ${UFC_HEADLINE} is the live Fight Night. No pullouts on this card.`;

  const value: UfcCardTrust = {
    checkedAt: new Date().toISOString(),
    trustedSource: primary?.source ?? "ESPN",
    trustedDate: primary?.date ?? new Date().toISOString().slice(0, 10),
    trustedTitle: primary?.title ?? UFC_HEADLINE,
    scratched: found,
    scratchedKeys,
    staleEventPage: [],
    note,
  };
  g.__snapUfcNews = { at: Date.now(), value };
  return value;
}

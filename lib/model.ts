// Launchwatch model: one sealed DefiLlama snapshot in, one ranked board of pre-token
// protocols out. Every figure on the board is derived from the snapshot's own fields;
// no protocol is ever named or special-cased in this file.
//
// Classification (who may be ranked): a protocol that records no token (both gecko_id
// and symbol null) and is not a wrapped, staked or bridged product of one that trades:
// its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
// Restaked BTC or CEX, its name ends in no version marker, carries no whole word
// wrapped, staked or staking, and does not begin with an exchange's name. That is the
// watchlist's own exclusion logic with no TVL floor, so every watchlist slug is in the
// selection by construction (buildBoard asserts it).
//
// Implied value (what a launch would be worth if the record stayed as it is):
//   implied = TVL x category multiple x momentum factor x age factor
// - category multiple: the median market-cap/TVL of the snapshot's tokenised protocols
//   in the same category, shrunk toward the all-category median in log space with
//   weight SHRINK_K: multiple = exp((n x ln(median) + K x ln(global)) / (n + K)). A
//   geometric blend, because ratios multiply: a category with one wild peer (a token
//   worth hundreds of times its TVL) is pulled most of the way to the market figure,
//   while a category with many peers keeps its own.
// - momentum factor: 1 + 0.35 x clamp(change_7d, -50, +100) / 100, so a protocol whose
//   TVL grew 100% in a week is marked up 35% and one that halved is marked down 17.5%.
//   An unreported change_7d is neutral (factor 1).
// - age factor: 0.75 + 0.45 x months / (months + 18), rising with the months the
//   protocol has run with no token (listed_at to the snapshot's as_of): 0.75 at launch,
//   about 0.93 at a year, 1.05 at three years. A protocol with no listed_at is scored
//   at the median known age of the classified set, computed from the snapshot itself.

/** One protocol of the snapshot: exactly the ten fields the sealed input carries. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The snapshot document as the entry reads it. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** The valuation comps of one category: how many tokenised peers, and the multiple used. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  raw_median: number | null;
  multiple: number;
}

/** The model's stated constants, published to the dashboard so the page can show them. */
export const SHRINK_K = 6;
export const MOMENTUM_WEIGHT = 0.35;
export const MOMENTUM_FLOOR = -50;
export const MOMENTUM_CAP = 100;
export const AGE_FLOOR = 0.75;
export const AGE_RANGE = 0.45;
export const AGE_HALF_MONTHS = 18;

/** Why a snapshot cannot be scored. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** The snapshot out of a file's text, refused unless it carries the fields the model reads. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (!isRecord(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  if (typeof raw.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of)) {
    throw new SnapshotError('snapshot.json carries no as_of date');
  }
  if (typeof raw.source !== 'string') throw new SnapshotError('snapshot.json carries no source');
  if (typeof raw.floor_usd !== 'number' || !(raw.floor_usd > 0)) {
    throw new SnapshotError('snapshot.json carries no floor_usd');
  }
  if (!Array.isArray(raw.protocols)) throw new SnapshotError('snapshot.json carries no protocols array');
  if (!Array.isArray(raw.watchlist) || raw.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json carries no watchlist of slugs');
  }
  const protocols: Protocol[] = raw.protocols.map((v, i) => {
    if (!isRecord(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    if (typeof v.slug !== 'string' || typeof v.name !== 'string') {
      throw new SnapshotError(`protocol ${i} lacks a slug or a name`);
    }
    if (typeof v.tvl_usd !== 'number' || !Number.isFinite(v.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} lacks a TVL`);
    }
    return {
      slug: v.slug,
      name: v.name,
      category: strOrNull(v.category),
      chains: Array.isArray(v.chains) ? v.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: v.tvl_usd,
      change_7d: numOrNull(v.change_7d),
      mcap_usd: numOrNull(v.mcap_usd),
      listed_at: strOrNull(v.listed_at),
      gecko_id: strOrNull(v.gecko_id),
      symbol: strOrNull(v.symbol),
    };
  });
  return {
    as_of: raw.as_of,
    source: raw.source,
    floor_usd: raw.floor_usd,
    protocols,
    watchlist: raw.watchlist as string[],
  };
}

// ---------------------------------------------------------------- classification

/** Categories that are a wrapped, staked or bridged product of another protocol by kind. */
const PRODUCT_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A name ending in a version marker: a release of another protocol, not a launch of its own. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking anywhere in the name, any case. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name: the exchange's own product, not a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?=\s|$)/;

/** A protocol records no token when DefiLlama names neither a CoinGecko id nor a ticker for it. */
export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** A protocol already has a market value of its own when the snapshot records a market cap. */
export function isTokenised(p: Protocol): boolean {
  return p.mcap_usd !== null;
}

/** Whether the protocol is a wrapped, staked or bridged product of a token that already trades. */
export function isProductOfAnother(p: Protocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  return VERSIONED_NAME.test(p.name) || PRODUCT_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name);
}

/** The radar's selection: records no token, and is not a product of one that trades. */
export function isClassified(p: Protocol): boolean {
  return recordsNoToken(p) && !isProductOfAnother(p);
}

// ---------------------------------------------------------------- the value model

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A ratio floored for the log blend: a peer worth nothing still bounds the blend. */
const LOG_FLOOR = 1e-6;

/** The whole market's comp set: every tokenised protocol with a usable TVL. */
export interface CompSet {
  global_peers: number;
  global_median: number;
  by_category: Map<string, CategoryMultiple>;
}

/**
 * The category multiples of a snapshot: for each category, the median market-cap/TVL of
 * its tokenised protocols, shrunk toward the all-category median by peer count. A
 * category with no tokenised peer uses the global median outright.
 */
export function categoryMultiples(snapshot: Snapshot): CompSet {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (!isTokenised(p) || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd! / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? '';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const globalMedian = all.length > 0 ? median(all) : 0;
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of ratiosByCategory) {
    const raw = median(ratios);
    byCategory.set(category, {
      category,
      peers: ratios.length,
      raw_median: round4(raw),
      multiple: round4(
        Math.exp(
          (ratios.length * Math.log(Math.max(raw, LOG_FLOOR)) + SHRINK_K * Math.log(Math.max(globalMedian, LOG_FLOOR))) /
            (ratios.length + SHRINK_K),
        ),
      ),
    });
  }
  return { global_peers: all.length, global_median: round4(globalMedian), by_category: byCategory };
}

/** The multiple a protocol is valued at: its category's, or the global median when it has no peers. */
export function multipleFor(comps: CompSet, category: string | null): CategoryMultiple {
  const found = comps.by_category.get(category ?? '');
  if (found !== undefined) return found;
  return { category: category ?? '', peers: 0, raw_median: null, multiple: comps.global_median };
}

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 30.4375;

/** Whole months from listed_at to as_of; null when the snapshot gives no listing date. */
export function monthsTokenless(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS / DAYS_PER_MONTH));
}

/** The momentum factor of a seven-day TVL change in per cent; unreported is neutral. */
export function momentumFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  const clamped = Math.min(MOMENTUM_CAP, Math.max(MOMENTUM_FLOOR, change7d));
  return 1 + MOMENTUM_WEIGHT * (clamped / 100);
}

/** The age factor of a protocol that has run `months` with no token. */
export function ageFactor(months: number): number {
  return AGE_FLOOR + AGE_RANGE * (months / (months + AGE_HALF_MONTHS));
}

/** One protocol scored: its implied value and every input that produced it. */
export interface Scored {
  protocol: Protocol;
  months: number | null;
  months_used: number;
  multiple: number;
  peers: number;
  momentum: number;
  age: number;
  implied: number;
}

function score(p: Protocol, asOf: string, comps: CompSet, defaultMonths: number): Scored {
  const months = monthsTokenless(asOf, p.listed_at);
  const monthsUsed = months ?? defaultMonths;
  const comp = multipleFor(comps, p.category);
  const momentum = momentumFactor(p.change_7d);
  const age = ageFactor(monthsUsed);
  const implied = Math.max(1, Math.round(p.tvl_usd * comp.multiple * momentum * age));
  return { protocol: p, months, months_used: monthsUsed, multiple: comp.multiple, peers: comp.peers, momentum, age, implied };
}

/** The median known age, in months, of the classified set: the age an unlisted date is scored at. */
export function defaultMonthsFor(snapshot: Snapshot): number {
  const known: number[] = [];
  for (const p of snapshot.protocols) {
    if (!isClassified(p)) continue;
    const m = monthsTokenless(snapshot.as_of, p.listed_at);
    if (m !== null) known.push(m);
  }
  return known.length > 0 ? Math.round(median(known)) : 12;
}

// ---------------------------------------------------------------- the board

/** The farm-plan inputs of one row, computed from the protocol's own record. */
export interface PlanParams {
  capital_usd: number;
  gas_usd: number;
  hold_weeks: number;
  sessions_per_week: number;
}

/** One row of board.json: the protocol, the model's inputs, its value and its farm plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  months_tokenless: number | null;
  category_multiple: number;
  category_peers: number;
  momentum_factor: number;
  age_factor: number;
  implied_value_usd: number;
  on_watchlist: boolean;
  plan: PlanParams;
  farm_steps: string[];
}

const bySlugAsc = (a: Protocol, b: Protocol): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/**
 * The ranked board: every classified protocol, strongest implied value first. Ranks are
 * exactly 1..N and implied values strictly fall along them: a tie is broken by TVL, then
 * by slug, and the lower row of an exact tie is stepped down a dollar so the order the
 * ranks claim is the order the values show.
 */
export function buildBoard(
  snapshot: Snapshot,
  planParams: (p: Protocol, monthsUsed: number) => PlanParams,
  farmSteps: (p: Protocol, monthsUsed: number, plan: PlanParams) => string[],
): BoardRow[] {
  const comps = categoryMultiples(snapshot);
  const defaultMonths = defaultMonthsFor(snapshot);
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter(isClassified)
    .map((p) => score(p, snapshot.as_of, comps, defaultMonths));
  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.protocol.tvl_usd - a.protocol.tvl_usd ||
      bySlugAsc(a.protocol, b.protocol),
  );
  const rows: BoardRow[] = [];
  let previous = Number.POSITIVE_INFINITY;
  for (const s of scored) {
    let value = s.implied;
    if (value >= previous) value = previous - 1;
    if (value < 1) value = 1;
    previous = value;
    const plan = planParams(s.protocol, s.months_used);
    rows.push({
      rank: rows.length + 1,
      slug: s.protocol.slug,
      name: s.protocol.name,
      category: s.protocol.category,
      chains: s.protocol.chains,
      tvl_usd: s.protocol.tvl_usd,
      change_7d: s.protocol.change_7d,
      listed_at: s.protocol.listed_at,
      months_tokenless: s.months,
      category_multiple: s.multiple,
      category_peers: s.peers,
      momentum_factor: round4(s.momentum),
      age_factor: round4(s.age),
      implied_value_usd: value,
      on_watchlist: watch.has(s.protocol.slug),
      plan,
      farm_steps: farmSteps(s.protocol, s.months_used, plan),
    });
  }
  return rows;
}

/** Why a board is not one the gate takes, or null: coverage, ranks, order, values, farm steps. */
export function validateBoard(rows: BoardRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `the board holds ${rows.length} rows, outside 100..4000`;
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.slug)) return `slug ${r.slug} appears twice`;
    seen.add(r.slug);
  }
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of rows) if (!known.has(r.slug)) return `slug ${r.slug} is not in the snapshot`;
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `watchlist slug ${slug} is missing`;
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `rank ${i + 1} is held by ${byRank[i]!.slug} with rank ${byRank[i]!.rank}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `rank ${i + 1} (${byRank[i]!.slug}) is worth more than rank ${i}`;
    }
    const v = byRank[i]!.implied_value_usd;
    if (!Number.isSafeInteger(v) || v <= 0 || v > 100_000_000_000_000) return `${byRank[i]!.slug} has implied value ${v}`;
    const steps = byRank[i]!.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${byRank[i]!.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${byRank[i]!.slug} has a farm step of ${t.length} trimmed characters`;
    }
    if (byRank[i]!.name.trim().length === 0) return `${byRank[i]!.slug} has an empty name`;
  }
  if (rows.length >= 2 && rows.every((r) => r.implied_value_usd === rows[0]!.implied_value_usd)) {
    return 'every row shares one implied value: the board ranks nothing';
  }
  return null;
}

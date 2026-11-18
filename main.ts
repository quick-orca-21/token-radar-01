// Launchwatch: a token launch radar (Node 22, standard library only, no build step).
//
// Reads the sealed snapshot at /input/snapshot.json (or --input <file|dir>), ranks every
// protocol that records no token by the implied value of the launch it has not had yet
// (lib/model.ts), gives each a farm plan (lib/plans.ts), and writes the hand-in to the
// output directory: board.json, dashboard/ (the page, plus the data.js this program
// generates into it), screenshots/ and dossier.json, the summary the judge reads,
// written with the vendored make.fun library. The page is static and offline: it reads
// only the data.js beside it.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  categoryMultiples,
  defaultMonthsFor,
  isClassified,
  isTokenised,
  recordsNoToken,
  validateBoard,
  buildBoard,
  parseSnapshot,
  type BoardRow,
  type Snapshot,
} from './lib/model.ts';
import { farmStepsFor, planParamsFor } from './lib/plans.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

/** The value of --name among the arguments, or the fallback when it is absent. */
function argument(name: string, fallback: string): string {
  const flag = `--${name}`;
  const at = process.argv.indexOf(flag);
  if (at !== -1 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`${flag}=`));
  return joined === undefined ? fallback : joined.slice(flag.length + 1);
}

const inputArg = argument('input', '/input');
const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(`launchwatch: no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const outDir = argument('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot: Snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const rows: BoardRow[] = buildBoard(snapshot, planParamsFor, farmStepsFor);
const problem = validateBoard(rows, snapshot);
if (problem !== null) {
  process.stderr.write(`launchwatch: the model built a board the gate refuses: ${problem}\n`);
  process.exit(1);
}

// The dashboard's data: the board in compact rows (the legend lives in dashboard/app.js),
// the counts the methodology strip states, and the multiple of every board category.
function dashboardData(snap: Snapshot, board: BoardRow[]): unknown {
  const comps = categoryMultiples(snap);
  const onBoard = new Set(board.map((r) => r.category ?? ''));
  const multiples: [string, number, number][] = [];
  for (const cat of [...onBoard].sort()) {
    const c = comps.by_category.get(cat);
    multiples.push([cat === '' ? 'Uncategorised' : cat, c?.peers ?? 0, c?.multiple ?? comps.global_median]);
  }
  return {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    counts: {
      tracked: snap.protocols.length,
      with_token: snap.protocols.filter((p) => !recordsNoToken(p)).length,
      comps: comps.global_peers,
      classified: snap.protocols.filter(isClassified).length,
      board: board.length,
      watchlist: snap.watchlist.length,
    },
    global_multiple: comps.global_median,
    default_months: defaultMonthsFor(snap),
    multiples,
    rows: board.map((r) => [
      r.rank,
      r.slug,
      r.name,
      r.category,
      r.chains.slice(0, 6),
      r.chains.length,
      r.tvl_usd,
      r.change_7d,
      r.months_tokenless,
      r.category_multiple,
      r.implied_value_usd,
      r.on_watchlist ? 1 : 0,
      r.plan.capital_usd,
      r.plan.gas_usd,
      r.plan.hold_weeks,
      r.plan.sessions_per_week,
    ]),
  };
}

/** Copy a directory tree's regular files into `to`, skipping dot-names; returns the file count. */
function copyTree(from: string, to: string): number {
  if (!existsSync(from)) return 0;
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    const dst = join(to, name);
    const st = statSync(src);
    if (st.isDirectory()) count += copyTree(src, dst);
    else if (st.isFile()) {
      copyFileSync(src, dst);
      count++;
    }
  }
  return count;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows })}\n`);
const dashFiles = copyTree(join(root, 'dashboard'), join(outDir, 'dashboard'));
writeFileSync(join(outDir, 'dashboard', 'data.js'), `window.LAUNCHWATCH=${JSON.stringify(dashboardData(snapshot, rows))};\n`);
const shots = copyTree(join(root, 'screenshots'), join(outDir, 'screenshots'));
if (shots < 3) {
  process.stderr.write(`launchwatch: screenshots/ holds ${shots} image(s): the hand-in needs 3 or 4 (the board, a detail view, a filtered view); dossier.json not written\n`);
  process.exit(1);
}

// The dossier is written last: the scorer rebuilds it from this output and compares bytes.
const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));

const early = rows.filter((r) => !r.on_watchlist).length;
process.stdout.write(
  `launchwatch: ${snapshot.protocols.length} protocols read, ${rows.length} pre-token ranked (${snapshot.watchlist.length} watchlist, ${early} more below and above the floor)\n` +
    `launchwatch: wrote board.json, dashboard/ (${dashFiles + 1} files incl. data.js), screenshots/ (${shots}), dossier.json under ${outDir}\n`,
);

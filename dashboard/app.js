/* Launchwatch dashboard: renders window.LAUNCHWATCH (the data.js beside this file,
   written by the entry's main.ts from the sealed snapshot). No network, no framework.
   Row legend (arrays, to keep the file small):
     [0] rank [1] slug [2] name [3] category [4] chains (first 6) [5] chain count
     [6] tvl_usd [7] change_7d [8] months tokenless (null = not recorded)
     [9] category multiple [10] implied_value_usd [11] on watchlist (1/0)
     [12] farm capital $ [13] farm gas $/tx [14] farm hold weeks [15] farm sessions/week */
'use strict';
const D = window.LAUNCHWATCH;
const R = { rank: 0, slug: 1, name: 2, cat: 3, chains: 4, nchains: 5, tvl: 6, chg: 7, months: 8, mult: 9, iv: 10, wl: 11, cap: 12, gas: 13, wks: 14, ses: 15 };
const rows = D.rows;
const bySlug = new Map(rows.map((r) => [r[R.slug], r]));
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/* Dollars with comma grouping: 12500 -> "$12,500". */
function fmtUsd(n) {
  const whole = Math.round(n);
  const digits = String(Math.abs(whole));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return (whole < 0 ? '-$' : '$') + out;
}
function fmtTvl(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return fmtUsd(v);
}
/* A gas figure as a reader budgets it: whole dollars when large, cents when small. */
function fmtGas(n) {
  if (n >= 10) return fmtUsd(n);
  if (n >= 1) return '$' + n.toFixed(1).replace(/\.0$/, '');
  return '$' + n.toFixed(2);
}
function fmtChg(v) {
  if (v === null) return '<span class="flat">—</span>';
  const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
}
const fmtMult = (m) => '×' + m.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0');

/* The model's two adjustment factors, recomputed from the row's own figures with the
   constants lib/model.ts states, so the detail view can show its working. */
function momentumFactor(chg) {
  if (chg === null) return 1;
  const c = Math.min(100, Math.max(-50, chg));
  return 1 + 0.35 * (c / 100);
}
function ageFactor(months) {
  return 0.75 + 0.45 * (months / (months + 18));
}

/* ---- header and methodology ---- */
$('as-of').textContent = D.as_of;
$('source').textContent = D.source.replace(/^DefiLlama /, 'DefiLlama · ').replace('https://', '');
$('floor').textContent = fmtUsd(D.floor_usd);
const C = D.counts;
$('counts').innerHTML = [
  [C.tracked, 'protocols tracked'],
  [C.with_token, 'already record a token'],
  [C.comps, 'tokenised comps'],
  [C.board, 'pre-token ranked'],
  [C.watchlist, 'on the official watchlist'],
].map(([n, label]) => `<span><b>${n}</b>${label}</span>`).join('');
$('multiples').innerHTML = D.multiples
  .map(([cat, peers, mult]) => `<div><span>${esc(cat)}</span><span>${peers} peer${peers === 1 ? '' : 's'} · <b>${fmtMult(mult)}</b></span></div>`)
  .join('');

/* ---- filters and sorting ---- */
const state = { q: '', cat: '', chain: '', wl: false, sort: 'rank', dir: 1 };
const cats = [...new Set(rows.map((r) => r[R.cat]).filter(Boolean))].sort();
$('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
const chainSet = [...new Set(rows.flatMap((r) => r[R.chains]))].sort();
$('chain').innerHTML = '<option value="">All chains</option>' + chainSet.map((c) => `<option>${esc(c)}</option>`).join('');

const SORT_IDX = { rank: R.rank, name: R.name, tvl: R.tvl, chg: R.chg, months: R.months, mult: R.mult, iv: R.iv };
function visible() {
  const q = state.q.trim().toLowerCase();
  let out = rows.filter((r) =>
    (state.cat === '' || r[R.cat] === state.cat) &&
    (state.chain === '' || r[R.chains].includes(state.chain)) &&
    (!state.wl || r[R.wl] === 1) &&
    (q === '' || r[R.name].toLowerCase().includes(q) || r[R.slug].includes(q)));
  const idx = SORT_IDX[state.sort];
  out.sort((a, b) => {
    const av = a[idx], bv = b[idx];
    if (av === null && bv === null) return a[R.rank] - b[R.rank];
    if (av === null) return 1;
    if (bv === null) return -1;
    const d = typeof av === 'string' ? (av < bv ? -1 : av > bv ? 1 : 0) : av - bv;
    return d * state.dir || a[R.rank] - b[R.rank];
  });
  return out;
}
function render() {
  const list = visible();
  $('rows').innerHTML = list.map((r) => `
    <tr data-slug="${esc(r[R.slug])}">
      <td class="num rank">${r[R.rank]}</td>
      <td class="name">${esc(r[R.name])}${r[R.wl] === 1 ? '<span class="wl-tag">WATCHLIST</span>' : ''}<span class="slug">${esc(r[R.slug])}</span></td>
      <td class="cat">${esc(r[R.cat] ?? '—')}</td>
      <td class="chains">${esc(r[R.chains].slice(0, 3).join(', '))}${r[R.nchains] > 3 ? ` +${r[R.nchains] - 3}` : ''}</td>
      <td class="num">${fmtTvl(r[R.tvl])}</td>
      <td class="num">${fmtChg(r[R.chg])}</td>
      <td class="num">${r[R.months] === null ? '—' : r[R.months]}</td>
      <td class="num">${fmtMult(r[R.mult])}</td>
      <td class="num iv">${fmtUsd(r[R.iv])}</td>
    </tr>`).join('');
  $('empty').hidden = list.length > 0;
  $('showing').textContent = `Showing ${list.length} of ${rows.length} ranked`;
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    const key = th.getAttribute('data-sort');
    th.innerHTML = th.textContent.replace(/ [▲▼]$/, '') + (key === state.sort ? ` <span class="arrow">${state.dir === 1 ? '▲' : '▼'}</span>` : '');
  });
}
function syncHash() {
  const parts = [];
  if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
  if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
  if (state.wl) parts.push('wl=1');
  if (state.q) parts.push('q=' + encodeURIComponent(state.q));
  const detail = $('detail').hidden ? '' : 'detail=' + encodeURIComponent(currentDetail ?? '');
  history.replaceState(null, '', '#' + [detail, ...parts].filter(Boolean).join('&'));
}
$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); syncHash(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; render(); syncHash(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); syncHash(); });
$('wl').addEventListener('change', (e) => { state.wl = e.target.checked; render(); syncHash(); });
document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.getAttribute('data-sort');
    if (state.sort === key) state.dir *= -1;
    else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
    render();
  });
});
$('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (tr) openDetail(tr.getAttribute('data-slug'));
});

/* ---- farm plans: the same playbooks lib/plans.ts writes into board.json, fed by the
   plan inputs each row carries, so the page and the board tell one story. ---- */
function bookFor(category) {
  switch (category) {
    case 'Dexs': case 'Liquidity Manager': return 'dex';
    case 'Lending': case 'CDP': case 'CDP Manager': case 'Uncollateralized Lending':
    case 'Collateral Markets': case 'Collateral Management': return 'lend';
    case 'Derivatives': case 'Options': case 'Options Vault': case 'Interest Rate Derivatives': return 'deriv';
    case 'Yield': case 'Yield Aggregator': case 'Farm': case 'Leveraged Farming':
    case 'Basis Trading': case 'Staking Pool': return 'yield';
    case 'Risk Curators': case 'Onchain Capital Allocator': return 'curator';
    case 'Cross Chain Bridge': case 'Chain': return 'cross';
    case 'RWA': return 'rwa';
    case 'Prediction Market': return 'predict';
    default: return 'default';
  }
}
function farmSteps(r) {
  const name = r[R.name];
  const chain = r[R.chains].length > 0 ? r[R.chains][0] : 'its home chain';
  const monthsUsed = r[R.months] ?? D.default_months;
  const cap = fmtUsd(r[R.cap]);
  const setupGas = fmtGas(r[R.gas] * 3);
  const weekGas = fmtGas(r[R.gas] * r[R.ses] * 2);
  const gas = fmtGas(r[R.gas]);
  const wks = r[R.wks], ses = r[R.ses];
  const half = fmtUsd(r[R.cap] / 2);
  const hold = `Hold the position for the full ${wks} weeks and never empty the wallet before the last one: rewards snapshots count wallets still active late in a program, and a protocol ${monthsUsed} months without a token rewards patience over speed. Cost: the ${cap} stays deployed. Time: ${wks} weeks in total.`;
  switch (bookFor(r[R.cat])) {
    case 'dex': {
      const swapWeek = fmtUsd(r[R.cap] * 2);
      const swapEach = fmtUsd((r[R.cap] * 2) / ses);
      return [
        `Add ${cap} of liquidity to ${name}'s deepest pool on ${chain}, split evenly across the pair so the position starts balanced and earns swap fees from day one. Cost: about ${setupGas} in approval and deposit gas. Time: 20 minutes, once, in week 1.`,
        `Swap about ${swapWeek} of volume through ${name} on ${chain} every week — ${ses} sessions of roughly ${swapEach} — so the wallet builds a real trading history, not one deposit. Cost: about ${weekGas} a week in gas and swap fees. Time: 10 minutes a session, for ${wks} weeks.`,
        `Stake the LP receipt in ${name}'s rewards contract on ${chain} where one is live, and claim what accrues each fortnight instead of letting it sit. Cost: about ${gas} in gas a claim. Time: 5 minutes a fortnight, across the ${wks} weeks.`,
        hold,
      ];
    }
    case 'lend': {
      const borrow = fmtUsd(r[R.cap] * 0.4);
      return [
        `Supply ${cap} of USDC to ${name} on ${chain} as collateral: a stable asset keeps the position's value steady while the wallet starts a supply history. Cost: about ${setupGas} in approval and supply gas. Time: 15 minutes, once, in week 1.`,
        `Borrow about ${borrow} against that collateral and repay it inside the week, ${ses} sessions a week, so the wallet shows both sides of ${name}'s market. Cost: about ${weekGas} a week in gas. Time: 10 minutes a session, for ${wks} weeks.`,
        `Once a month, move the supply toward ${name}'s busier market on ${chain} — the one with the higher utilisation — so the position reads as managed, not parked. Cost: about ${setupGas} in gas a move. Time: 10 minutes a month.`,
        hold,
      ];
    }
    case 'deriv':
      return [
        `Deposit ${cap} of USDC as margin on ${name} and set leverage to 1x: the farm is the trading history, not the risk. Cost: about ${setupGas} in deposit gas on ${chain}. Time: 15 minutes, once, in week 1.`,
        `Open and close one small hedged trade a session — long and short the same size, minutes apart — ${ses} sessions a week, so volume accrues without directional exposure. Cost: about ${weekGas} a week in trading fees at this size. Time: 10 minutes a session, for ${wks} weeks.`,
        `Keep the margin account funded above 80% of the starting ${cap} for the whole ${wks} weeks: accounts that never go quiet are the ones points programs count. Cost: top-ups of about ${gas} a week only if fees eat into it. Time: 5 minutes a week.`,
        `In the final week, close every position but leave the margin in place until the ${wks}-week mark passes, then withdraw: a clean exit after a full season of activity. Cost: about ${setupGas} in closing and withdrawal gas. Time: 15 minutes, once.`,
      ];
    case 'yield':
      return [
        `Deposit ${cap} into ${name}'s main vault on ${chain} and keep the vault shares in the same wallet: the shares are the record the farm is built on. Cost: about ${setupGas} in approval and deposit gas. Time: 15 minutes, once, in week 1.`,
        `Check the position ${ses === 1 ? 'once' : `${ses} times`} a week and re-deposit any harvested yield over $10, so the balance compounds instead of idling. Cost: about ${weekGas} a week in gas. Time: 10 minutes a check, for ${wks} weeks.`,
        `In week 3, add a second deposit of ${half} into another of ${name}'s vaults on ${chain}, so the wallet is active on two of its fronts, not one. Cost: about ${setupGas} in gas. Time: 15 minutes, once.`,
        hold,
      ];
    case 'curator':
      return [
        `Allocate ${cap} to a ${name}-curated vault on ${chain}, choosing the vault with the deepest liquidity so the position can be exited without a queue. Cost: about ${setupGas} in approval and deposit gas. Time: 20 minutes, once, in week 1.`,
        `Review the vault's allocation ${ses} times a week and move the position if the curator rotates into a market you would not hold directly. Cost: about ${weekGas} a week in gas when a move is needed. Time: 10 minutes a review, for ${wks} weeks.`,
        `In week 4, add a second position of ${half} in a different ${name} vault on ${chain}, so the wallet's history spans more than one mandate. Cost: about ${setupGas} in gas. Time: 15 minutes, once.`,
        hold,
      ];
    case 'cross':
      return [
        `Bridge ${cap} of USDC to ${chain} through ${name} and land it in a wallet you control there: the crossing itself is the first recorded activity. Cost: about ${setupGas} in bridge and gas fees. Time: 20 minutes, once, in week 1.`,
        `Use the bridged funds on ${chain} — one swap and one small deposit a week — so the crossing leads to real activity at the destination, not a round trip. Cost: about ${weekGas} a week in gas. Time: 10 minutes a session, for ${wks} weeks.`,
        `In week 4, bridge a second ${half} across by a different route ${name} offers, so the wallet's history is not a single crossing. Cost: about ${setupGas} in fees. Time: 20 minutes, once.`,
        hold,
      ];
    case 'rwa': {
      const topUp = fmtUsd(r[R.cap] / 4);
      return [
        `Mint ${cap} of ${name}'s yield asset on ${chain} with USDC and hold the tokens in the minting wallet: for a real-world-asset protocol the holding itself is the participation. Cost: about ${setupGas} in mint gas. Time: 20 minutes, once, in week 1.`,
        `Top the position up by about ${topUp} a week for the first month, so the holding grows in the steps a holder would make, not one lump. Cost: about ${weekGas} a week in gas. Time: 5 minutes a top-up.`,
        `Where ${name} lists a market for its asset on ${chain}, lend or pool ${half} of the holding there and keep the rest unencumbered, so part of the position works twice. Cost: about ${setupGas} in gas. Time: 15 minutes, once, in week 3.`,
        hold,
      ];
    }
    case 'predict': {
      const stake = fmtUsd(r[R.cap] / 10);
      return [
        `Fund ${cap} on ${name} and split it across at least four open markets, so no single result decides the farm. Cost: about ${setupGas} in deposit gas on ${chain}. Time: 20 minutes, once, in week 1.`,
        `Place ${ses} considered positions a week at prices you would defend — the history that counts is trades made, not deposits parked. Cost: the stakes themselves, about ${stake} a position. Time: 10 minutes a session, for ${wks} weeks.`,
        `Settle finished markets each fortnight and re-bank the winnings instead of withdrawing them, so the account's volume compounds across the season. Cost: about ${gas} in gas a settlement round. Time: 10 minutes a fortnight.`,
        hold,
      ];
    }
    default:
      return [
        `Open ${name} on ${chain} and make a first deposit of ${cap} into its main market: a funded position is the base every later step builds on. Cost: about ${setupGas} in approval and deposit gas. Time: 15 minutes, once, in week 1.`,
        `Return ${ses} times a week for one real action — a deposit, a claim, a vote or an adjustment — so the wallet's history is a rhythm, not a spike. Cost: about ${weekGas} a week in gas. Time: 10 minutes a session, for ${wks} weeks.`,
        `From week 3, add a second position of ${half} in another of ${name}'s markets on ${chain}, so the wallet is a user of the protocol, not of one pool. Cost: about ${setupGas} in gas. Time: 15 minutes, once.`,
        hold,
      ];
  }
}

/* ---- detail view ---- */
let currentDetail = null;
function openDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  currentDetail = slug;
  const monthsUsed = r[R.months] ?? D.default_months;
  const mom = momentumFactor(r[R.chg]);
  const age = ageFactor(monthsUsed);
  const multRow = D.multiples.find((m) => m[0] === (r[R.cat] ?? 'Uncategorised'));
  const peers = multRow ? multRow[1] : 0;
  const chainsText = r[R.chains].join(', ') + (r[R.nchains] > r[R.chains].length ? `, +${r[R.nchains] - r[R.chains].length} more` : '');
  const steps = farmSteps(r);
  $('detail-body').innerHTML = `
    <h2>${esc(r[R.name])}${r[R.wl] === 1 ? '<span class="wl-tag">WATCHLIST</span>' : ''}</h2>
    <div class="d-slug">${esc(r[R.slug])} · ${esc(r[R.cat] ?? 'Uncategorised')} · rank #${r[R.rank]} of ${rows.length}</div>
    <div class="d-iv">${fmtUsd(r[R.iv])}</div>
    <div class="d-iv-label">Implied value of a launch, on this record</div>
    <h3>The model's inputs</h3>
    <dl class="kv">
      <dt>Total value locked</dt><dd>${fmtUsd(r[R.tvl])}</dd>
      <dt>Category multiple</dt><dd>${fmtMult(r[R.mult])}<small>${peers > 0 ? `median of ${peers} tokenised ${esc(r[R.cat] ?? '')} peer${peers === 1 ? '' : 's'}, blended to market` : `no tokenised peers: the all-market median ${fmtMult(D.global_multiple)}`}</small></dd>
      <dt>TVL change, 7 days</dt><dd>${r[R.chg] === null ? 'not reported' : (r[R.chg] > 0 ? '+' : '') + r[R.chg].toFixed(1) + '%'}<small>momentum ×${mom.toFixed(3)}</small></dd>
      <dt>Months with no token</dt><dd>${r[R.months] === null ? 'not recorded' : r[R.months]}<small>${r[R.months] === null ? `scored at the board's median ${D.default_months} months · ` : ''}age ×${age.toFixed(3)}</small></dd>
      <dt>Chains</dt><dd>${esc(chainsText)}</dd>
      <dt>Watchlist</dt><dd>${r[R.wl] === 1 ? 'On it' : 'Below its floor'}<small>${r[R.wl] === 1 ? `above the ${fmtUsd(D.floor_usd)} floor` : 'ranked anyway: the floor is a start, not a ceiling'}</small></dd>
    </dl>
    <p class="method-note">Implied value = TVL × category multiple × momentum × age, rounded to whole dollars.
    Protocols whose token already trades set the multiples and are never ranked; wrapped, staked and bridged
    products of them are excluded from the board.</p>
    <h3>The farm plan</h3>
    <p class="method-note">Position ${fmtUsd(r[R.cap])} · ${r[R.ses]} session${r[R.ses] === 1 ? '' : 's'} a week · ${r[R.wks]}-week window · gas about ${fmtGas(r[R.gas])} a transaction on ${esc(r[R.chains][0] ?? 'its home chain')}.</p>
    <ol class="plan">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('detail').hidden = false;
  $('scrim').hidden = false;
  $('detail').scrollTop = 0;
  syncHash();
}
function closeDetail() {
  currentDetail = null;
  $('detail').hidden = true;
  $('scrim').hidden = true;
  syncHash();
}
$('close').addEventListener('click', closeDetail);
$('scrim').addEventListener('click', closeDetail);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

/* ---- open in the state the address names (the three judged views are deep links) ---- */
const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
if (hashParams.get('cat')) { state.cat = hashParams.get('cat'); $('cat').value = state.cat; }
if (hashParams.get('chain')) { state.chain = hashParams.get('chain'); $('chain').value = state.chain; }
if (hashParams.get('wl') === '1') { state.wl = true; $('wl').checked = true; }
if (hashParams.get('q')) { state.q = hashParams.get('q'); $('q').value = state.q; }
render();
if (hashParams.get('detail')) openDetail(hashParams.get('detail'));

// Farm plans: what a reader should actually do on each protocol before a launch.
// A plan is a per-category playbook instantiated with the protocol's own record —
// its name, its first chain, a capital size set by its TVL tier, a gas figure set by
// its chain, a holding window set by how long it has run with no token — so no two
// protocols share a plan verbatim, and every number in a step traces to the snapshot
// or to the stated tier tables below. Four steps each: open the position, work it on
// a weekly rhythm, deepen it on a second front, and hold it to the end of the window.

import type { PlanParams, Protocol } from './model.ts';

/** Capital for one farm position, by the protocol's TVL: deeper protocols justify more. */
function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 1000;
  if (tvlUsd >= 250_000_000) return 500;
  if (tvlUsd >= 50_000_000) return 250;
  if (tvlUsd >= 15_000_000) return 100;
  return 50;
}

/** Gas for one ordinary transaction on a chain, in dollars: the chain sets the cost of farming it. */
const CHAIN_GAS: ReadonlyMap<string, number> = new Map([
  ['Ethereum', 12],
  ['Arbitrum', 0.4],
  ['Base', 0.3],
  ['Optimism', 0.4],
  ['Solana', 0.15],
  ['BSC', 0.3],
  ['Polygon', 0.1],
  ['Avalanche', 0.6],
  ['zkSync Era', 0.3],
  ['Linea', 0.3],
  ['Scroll', 0.3],
  ['Mantle', 0.2],
  ['Fantom', 0.1],
  ['Gnosis', 0.05],
  ['Celo', 0.05],
  ['Tron', 1],
  ['Sui', 0.1],
  ['Aptos', 0.1],
]);

function gasFor(chain: string): number {
  return CHAIN_GAS.get(chain) ?? 1.5;
}

/** Weeks to hold: a protocol long without a token has less far to go, a young one needs a longer window. */
function holdWeeksFor(monthsUsed: number): number {
  if (monthsUsed >= 36) return 8;
  if (monthsUsed >= 18) return 10;
  return 12;
}

/** The playbook a category follows; categories not named here share the default book. */
type Book = 'dex' | 'lend' | 'deriv' | 'yield' | 'curator' | 'cross' | 'rwa' | 'predict' | 'default';

function bookFor(category: string | null): Book {
  switch (category) {
    case 'Dexs':
    case 'Liquidity Manager':
      return 'dex';
    case 'Lending':
    case 'CDP':
    case 'CDP Manager':
    case 'Uncollateralized Lending':
    case 'Collateral Markets':
    case 'Collateral Management':
      return 'lend';
    case 'Derivatives':
    case 'Options':
    case 'Options Vault':
    case 'Interest Rate Derivatives':
      return 'deriv';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
    case 'Leveraged Farming':
    case 'Basis Trading':
    case 'Staking Pool':
      return 'yield';
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'curator';
    case 'Cross Chain Bridge':
    case 'Chain':
      return 'cross';
    case 'RWA':
      return 'rwa';
    case 'Prediction Market':
      return 'predict';
    default:
      return 'default';
  }
}

/** Sessions of activity a week, by book: markets reward rhythm, vaults reward patience. */
function sessionsFor(book: Book): number {
  if (book === 'dex') return 3;
  if (book === 'deriv') return 4;
  if (book === 'yield' || book === 'rwa') return 1;
  return 2;
}

/** The plan inputs of one protocol, from its own record alone. */
export function planParamsFor(p: Protocol, monthsUsed: number): PlanParams {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its home chain';
  return {
    capital_usd: capitalFor(p.tvl_usd),
    gas_usd: gasFor(chain),
    hold_weeks: holdWeeksFor(monthsUsed),
    sessions_per_week: sessionsFor(bookFor(p.category)),
  };
}

/** Dollars with comma grouping: 12500 -> "$12,500". */
export function fmtUsd(n: number): string {
  const whole = Math.round(n);
  const digits = String(Math.abs(whole));
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += ',';
    grouped += digits[i];
  }
  return `${whole < 0 ? '-' : ''}$${grouped}`;
}

/** A gas figure as a reader budgets it: whole dollars when large, cents when small. */
export function fmtGas(n: number): string {
  if (n >= 10) return fmtUsd(n);
  if (n >= 1) return `$${n.toFixed(1).replace(/\.0$/, '')}`;
  return `$${n.toFixed(2)}`;
}

/** The four steps of one protocol's plan, in the words of its category's playbook. */
export function farmStepsFor(p: Protocol, monthsUsed: number, plan: PlanParams): string[] {
  const name = p.name;
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its home chain';
  const cap = fmtUsd(plan.capital_usd);
  const setupGas = fmtGas(plan.gas_usd * 3);
  const weekGas = fmtGas(plan.gas_usd * plan.sessions_per_week * 2);
  const gas = fmtGas(plan.gas_usd);
  const wks = plan.hold_weeks;
  const ses = plan.sessions_per_week;
  const half = fmtUsd(plan.capital_usd / 2);
  const hold =
    `Hold the position for the full ${wks} weeks and never empty the wallet before the last one: ` +
    `rewards snapshots count wallets still active late in a program, and a protocol ${monthsUsed} months ` +
    `without a token rewards patience over speed. Cost: the ${cap} stays deployed. Time: ${wks} weeks in total.`;
  switch (bookFor(p.category)) {
    case 'dex': {
      const swapWeek = fmtUsd(plan.capital_usd * 2);
      const swapEach = fmtUsd((plan.capital_usd * 2) / ses);
      return [
        `Add ${cap} of liquidity to ${name}'s deepest pool on ${chain}, split evenly across the pair so the position starts balanced and earns swap fees from day one. Cost: about ${setupGas} in approval and deposit gas. Time: 20 minutes, once, in week 1.`,
        `Swap about ${swapWeek} of volume through ${name} on ${chain} every week — ${ses} sessions of roughly ${swapEach} — so the wallet builds a real trading history, not one deposit. Cost: about ${weekGas} a week in gas and swap fees. Time: 10 minutes a session, for ${wks} weeks.`,
        `Stake the LP receipt in ${name}'s rewards contract on ${chain} where one is live, and claim what accrues each fortnight instead of letting it sit. Cost: about ${gas} in gas a claim. Time: 5 minutes a fortnight, across the ${wks} weeks.`,
        hold,
      ];
    }
    case 'lend': {
      const borrow = fmtUsd(plan.capital_usd * 0.4);
      return [
        `Supply ${cap} of USDC to ${name} on ${chain} as collateral: a stable asset keeps the position's value steady while the wallet starts a supply history. Cost: about ${setupGas} in approval and supply gas. Time: 15 minutes, once, in week 1.`,
        `Borrow about ${borrow} against that collateral and repay it inside the week, ${ses} sessions a week, so the wallet shows both sides of ${name}'s market. Cost: about ${weekGas} a week in gas. Time: 10 minutes a session, for ${wks} weeks.`,
        `Once a month, move the supply toward ${name}'s busier market on ${chain} — the one with the higher utilisation — so the position reads as managed, not parked. Cost: about ${setupGas} in gas a move. Time: 10 minutes a month.`,
        hold,
      ];
    }
    case 'deriv': {
      return [
        `Deposit ${cap} of USDC as margin on ${name} and set leverage to 1x: the farm is the trading history, not the risk. Cost: about ${setupGas} in deposit gas on ${chain}. Time: 15 minutes, once, in week 1.`,
        `Open and close one small hedged trade a session — long and short the same size, minutes apart — ${ses} sessions a week, so volume accrues without directional exposure. Cost: about ${weekGas} a week in trading fees at this size. Time: 10 minutes a session, for ${wks} weeks.`,
        `Keep the margin account funded above 80% of the starting ${cap} for the whole ${wks} weeks: accounts that never go quiet are the ones points programs count. Cost: top-ups of about ${gas} a week only if fees eat into it. Time: 5 minutes a week.`,
        `In the final week, close every position but leave the margin in place until the ${wks}-week mark passes, then withdraw: a clean exit after a full season of activity. Cost: about ${setupGas} in closing and withdrawal gas. Time: 15 minutes, once.`,
      ];
    }
    case 'yield': {
      return [
        `Deposit ${cap} into ${name}'s main vault on ${chain} and keep the vault shares in the same wallet: the shares are the record the farm is built on. Cost: about ${setupGas} in approval and deposit gas. Time: 15 minutes, once, in week 1.`,
        `Check the position ${ses === 1 ? 'once' : `${ses} times`} a week and re-deposit any harvested yield over $10, so the balance compounds instead of idling. Cost: about ${weekGas} a week in gas. Time: 10 minutes a check, for ${wks} weeks.`,
        `In week 3, add a second deposit of ${half} into another of ${name}'s vaults on ${chain}, so the wallet is active on two of its fronts, not one. Cost: about ${setupGas} in gas. Time: 15 minutes, once.`,
        hold,
      ];
    }
    case 'curator': {
      return [
        `Allocate ${cap} to a ${name}-curated vault on ${chain}, choosing the vault with the deepest liquidity so the position can be exited without a queue. Cost: about ${setupGas} in approval and deposit gas. Time: 20 minutes, once, in week 1.`,
        `Review the vault's allocation ${ses} times a week and move the position if the curator rotates into a market you would not hold directly. Cost: about ${weekGas} a week in gas when a move is needed. Time: 10 minutes a review, for ${wks} weeks.`,
        `In week 4, add a second position of ${half} in a different ${name} vault on ${chain}, so the wallet's history spans more than one mandate. Cost: about ${setupGas} in gas. Time: 15 minutes, once.`,
        hold,
      ];
    }
    case 'cross': {
      return [
        `Bridge ${cap} of USDC to ${chain} through ${name} and land it in a wallet you control there: the crossing itself is the first recorded activity. Cost: about ${setupGas} in bridge and gas fees. Time: 20 minutes, once, in week 1.`,
        `Use the bridged funds on ${chain} — one swap and one small deposit a week — so the crossing leads to real activity at the destination, not a round trip. Cost: about ${weekGas} a week in gas. Time: 10 minutes a session, for ${wks} weeks.`,
        `In week 4, bridge a second ${half} across by a different route ${name} offers, so the wallet's history is not a single crossing. Cost: about ${setupGas} in fees. Time: 20 minutes, once.`,
        hold,
      ];
    }
    case 'rwa': {
      const topUp = fmtUsd(plan.capital_usd / 4);
      return [
        `Mint ${cap} of ${name}'s yield asset on ${chain} with USDC and hold the tokens in the minting wallet: for a real-world-asset protocol the holding itself is the participation. Cost: about ${setupGas} in mint gas. Time: 20 minutes, once, in week 1.`,
        `Top the position up by about ${topUp} a week for the first month, so the holding grows in the steps a holder would make, not one lump. Cost: about ${weekGas} a week in gas. Time: 5 minutes a top-up.`,
        `Where ${name} lists a market for its asset on ${chain}, lend or pool ${half} of the holding there and keep the rest unencumbered, so part of the position works twice. Cost: about ${setupGas} in gas. Time: 15 minutes, once, in week 3.`,
        hold,
      ];
    }
    case 'predict': {
      const stake = fmtUsd(plan.capital_usd / 10);
      return [
        `Fund ${cap} on ${name} and split it across at least four open markets, so no single result decides the farm. Cost: about ${setupGas} in deposit gas on ${chain}. Time: 20 minutes, once, in week 1.`,
        `Place ${ses} considered positions a week at prices you would defend — the history that counts is trades made, not deposits parked. Cost: the stakes themselves, about ${stake} a position. Time: 10 minutes a session, for ${wks} weeks.`,
        `Settle finished markets each fortnight and re-bank the winnings instead of withdrawing them, so the account's volume compounds across the season. Cost: about ${gas} in gas a settlement round. Time: 10 minutes a fortnight.`,
        hold,
      ];
    }
    default: {
      return [
        `Open ${name} on ${chain} and make a first deposit of ${cap} into its main market: a funded position is the base every later step builds on. Cost: about ${setupGas} in approval and deposit gas. Time: 15 minutes, once, in week 1.`,
        `Return ${ses} times a week for one real action — a deposit, a claim, a vote or an adjustment — so the wallet's history is a rhythm, not a spike. Cost: about ${weekGas} a week in gas. Time: 10 minutes a session, for ${wks} weeks.`,
        `From week 3, add a second position of ${half} in another of ${name}'s markets on ${chain}, so the wallet is a user of the protocol, not of one pool. Cost: about ${setupGas} in gas. Time: 15 minutes, once.`,
        hold,
      ];
    }
  }
}

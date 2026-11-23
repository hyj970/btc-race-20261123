// Momentum-rider for the make.fun btc-race-24h-20261123-0511 bounty.
//
// Idea (my own design, built from the dev window's shape, not a baseline):
// the dev window is a slow grind up (+3.6% over 24h) with most of the move in
// one multi-hour rally and 1-minute noise of ~8 bps stdev. Fast signals
// (EMA 8/21, 30-bar momentum) churn: a full round trip costs ~26 bps in
// fees + slippage + pool impact, so every extra trade is a guaranteed loss
// unless it catches a move bigger than that. This bot therefore trades
// rarely and rides:
//
//   BUY  (all cash) when the 60-bar (1-hour) return first exceeds +0.30%.
//        One hour of drift is long enough that the signal is mostly trend,
//        not 1-minute noise, and +0.30% clears the ~13 bps one-way cost
//        several times over.
//   SELL (whole position) when the close falls 2% below the highest close
//        seen since entry (trailing stop). The stop is wide enough to sit
//        through the window's normal chop (worst post-entry pullback on the
//        dev window was under 2%) while capping the loss if the race
//        window turns down: a long-only bot cannot short a falling market,
//        so the stop is the only downside protection it has.
//   After a stop-out the bot may re-enter on a fresh 60-bar momentum
//        signal, but only once that signal has first reset to zero or
//        below — it never buys straight back into the downtrend that
//        just stopped it out, so a later rally in the same window is
//        not missed while a falling market is not chased.
//   No new buys in the final 30 bars: a position opened that late pays a
//        full round trip for under half an hour of exposure.
//
// Determinism: no clock, no environment, no randomness at all. All state
// is derived from the bars the harness sends (hello, batch, orders, bar).
// Prices are handled as integer micro-price units (close * 1e5 is exact
// for price_scale 5) wherever a comparison decides a trade, so the two
// graded runs produce byte-identical action logs.

import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Lookback for the momentum signal, in bars (1 bar = 1 minute).
const LOOKBACK_BARS = 60;
// Buy when the 60-bar return exceeds this, in basis points of price.
const MOMENTUM_BPS = 30;
// Sell when the close drops this far below the peak close since entry.
const TRAIL_BPS = 200;
// Do not open a new position this close to the end of the window.
const NO_BUY_LAST_BARS = 30;
// The window is 1,440 bars; the last batch's orders are rejected anyway,
// so this cutoff only keeps the bot from paying a round trip for a
// position it would hold for minutes.
const WINDOW_BARS = 1440;
// Slippage allowance vs the latest close, in bps. A fill lands ~2 bps of
// modelled slippage plus ~7 bps of pool impact above the open for a
// full-size buy, and the open itself can move a few bps from the close;
// 150 bps leaves ample room while still refusing a wild fill.
const MAX_SLIPPAGE_BPS = 150;

// All prices here are integer units of 1e-5 USDC (the bar's price_scale),
// kept as bigint so comparisons are exact and deterministic.
const closes: bigint[] = [];
let peakSinceEntry: bigint = 0n;
let holding = false;
// Re-entry arming: after a stop-out the bot must wait until the 60-bar
// momentum has fully reset (gone to zero or below) before it may buy
// again. Without this, a stop-out in a falling market would be followed
// by an immediate re-buy on the still-positive trailing 60-bar return —
// paying another round trip to re-enter the same downtrend. The reset
// costs nothing on the dev window (no stop-out happens there) and is
// purely a race-window risk control.
let armed = true;

function closeOf(state: { close(symbol: string): bigint | null }): bigint | null {
  return state.close(SYMBOL);
}

await runBars({
  onBatch(state, batch) {
    // Skip warm-up batches: history builds, but no orders are decided.
    if (state.warmingUp) return [];

    const close = closeOf(state);
    if (close === null) return [];
    closes.push(close);

    // Reconcile with the account the harness reports: fills land one bar
    // after the decision, so the position appears a batch later.
    const pos = state.positions.get(SYMBOL);
    const qty = pos === undefined ? 0n : pos.qty;
    if (qty > 0n && !holding) {
      // A buy filled: start the trailing peak at the current close.
      holding = true;
      peakSinceEntry = close;
    } else if (qty === 0n && holding) {
      holding = false;
      peakSinceEntry = 0n;
    }
    if (holding && close > peakSinceEntry) peakSinceEntry = close;

    // SELL: trailing stop off the peak close since entry.
    if (holding && qty > 0n) {
      // close <= peak * (10000 - 200) / 10000  <=>  down 2% from peak.
      if (close * 10000n <= peakSinceEntry * BigInt(10000 - TRAIL_BPS)) {
        armed = false;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Momentum reset: while flat, re-arm once the 60-bar return is no
    // longer positive, so the next buy needs a genuinely fresh up-move.
    if (closes.length > LOOKBACK_BARS && !armed) {
      const ago = closes[closes.length - 1 - LOOKBACK_BARS]!;
      if (close <= ago) armed = true;
    }

    // BUY: 60-bar momentum above +0.30%, full cash, not in the last bars.
    if (armed && closes.length > LOOKBACK_BARS && state.seq < WINDOW_BARS - NO_BUY_LAST_BARS) {
      const ago = closes[closes.length - 1 - LOOKBACK_BARS]!;
      // (close - ago) / ago > 30 bps  <=>  (close - ago) * 10000 > ago * 30.
      if ((close - ago) * 10000n > ago * BigInt(MOMENTUM_BPS)) {
        const cash = state.cash;
        if (cash > 0n) {
          return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
    }
    return [];
  },
});

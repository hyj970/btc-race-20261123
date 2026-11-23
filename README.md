# btc-race-20261123

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/hyj970/btc-race-20261123/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/hyj970/btc-race-20261123/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Build a bot that trades Coinbase Wrapped BTC (cbBTC) on 1-minute on-chain prices with $1,000 of paper money, so nothing is traded for real, for the highest net PnL on the 24 hours that start 15 minutes after the deadline: entries close 6 hours after the opening, the bots that made money on the dev window race live over those 24 hours, and $50 goes to the 10 highest net PnLs, 1st place to the highest, $12 for 1st; the house bots race but never take a place.

## Strategy

Momentum-rider, built from the dev window's shape. The dev window grinds up +3.6% over 24 hours with most of the move in one multi-hour rally, while 1-minute noise is ~8 bps — and a full round trip costs ~26 bps in fees, slippage and pool impact. Fast signals churn themselves to death, so this bot trades rarely and rides:

- **Buy** (all cash) when the 60-bar (1-hour) return first exceeds +0.30%.
- **Sell** (whole position) when the close falls 2% below the highest close since entry (trailing stop) — the only downside protection a long-only bot has.
- **Re-entry** only after the 60-bar momentum has first reset to zero or below, so it never buys straight back into the downtrend that just stopped it out.
- **No new buys** in the final 30 bars.

Local dev-window grade (kit `grade-local`, process driver): **net PnL +$32.24, 1 trade, max drawdown 1.98%**, two runs byte-identical. No clock, no environment, no randomness — every decision is derived from the bars the harness sends.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` (NDJSON on stdin/stdout: hello, one batch per minute bar, done). Grade it on the dev window with the kit:

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process --worktree
```

`vendor/makefun-bars.ts` is the kit's SDK shim, copied byte-for-byte (allowed by the kit, excluded from authorship). Everything else is original code written for this bounty.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4j4xc18h&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>

# Stellar Tip Jar + Live Leaderboard — Design (Yellow Belt MVP)

**Date:** 2026-06-25
**Program:** Stellar Journey to Mastery — Level 2 (🟡 Yellow Belt)
**Location:** `C:\Users\Monster\Desktop\stellar-tip-jar`
**Repo:** New, separate, public GitHub repo (`stellar-tip-jar`)

---

## 1. Purpose

A single-page dApp where anyone connects a Stellar wallet (via StellarWalletsKit),
sends a "tip" (amount + short message) recorded on a deployed **Soroban** smart
contract, and watches a **live leaderboard** and **activity feed** update in real time
from on-chain events. Runs entirely on **Testnet**. Covers all mandatory Yellow Belt
requirements.

**Contract model:** the contract is an **on-chain donation ledger** — it records each
tip (donor, amount, message), keeps running totals per donor, and emits a `tip` event.
It does **not** custody or transfer real XLM in the MVP (the amount is a recorded value,
not a transferred balance). Real value transfer is explicitly out of scope.

---

## 2. Scope

### 🔴 Mandatory (Level 2 requirements)
1. **Multi-wallet** connect/select/disconnect via **StellarWalletsKit** (Freighter, xBull,
   Albedo, Lobstr, etc. in one modal).
2. **Soroban contract deployed to Testnet** (written in Rust, real contract ID).
3. **Call the contract from the frontend** — `donate(donor, amount, message)` (write).
4. **Read from the contract** — `get_leaderboard()` / `get_total()` (read).
5. **Event listening + state synchronization** — fetch `tip` events via Soroban RPC
   `getEvents` and live-update the feed + leaderboard.
6. **Transaction status visible** — pending / success / fail states clearly shown.
7. **≥3 error types handled** — wallet rejected · invalid/insufficient amount · empty/too-long
   message (plus RPC/tx failure).
8. **Delivery** — public repo + README (setup + **contract address** + **tx hash of a
   contract call** + wallet-options & leaderboard screenshots) + ≥2 meaningful commits.

### 🟡 Included enhancements
- **Tx hash → Stellar Expert** explorer link (verifies the contract call on-chain).
- **Toast notifications** (success / error).
- **Friendbot "Get Test XLM"** button (to fund fees when the connected account is empty).
- Live **activity feed** (UI surface of the event-listening requirement).
- Vercel **live demo** + auto-deploy on push (Level 2 lists live demo as optional).

### ⚪ Out of scope (later)
Real XLM custody/transfer (token/SAC, withdraw), multiple jars / create-your-own-jar,
per-tip NFT/badge, message moderation/profanity filter, backend/DB, persistent history
page, analytics, i18n, theming, QR codes, WebSocket push (not available on Soroban —
polling suffices).

---

## 3. Soroban Contract (Rust)

Single contract holding state.

- `donate(donor: Address, amount: i128, message: String)`
  - Requires `donor` auth.
  - Validates `amount > 0` and `1 ≤ message.len() ≤ 140`; panics with a clear error otherwise.
  - Increments the donor's running total and the global tip counter.
  - Stores the donor's total; appends/updates leaderboard data.
  - Emits a **`tip` event** carrying `(donor, amount, message)`.
- `get_leaderboard() -> Vec<(Address, i128)>` — donor → total (read).
- `get_total() -> i128` — sum of all tips (read).
- `get_tip_count() -> u32` — number of tips (read).

Contract has unit tests (Rust `#[test]`) covering: a successful donation updates totals
and emits an event; `amount <= 0` is rejected; an over-length message is rejected;
multiple donations from the same donor accumulate.

---

## 4. Architecture (frontend-only, Next.js App Router)

```
contracts/
  tip-jar/                # Rust Soroban contract + tests + build artifacts
src/
  app/
    layout.tsx            # root layout + Toaster
    page.tsx              # WalletBar + DonateForm + Leaderboard + ActivityFeed
  components/
    WalletBar.tsx         # StellarWalletsKit: connect/select/disconnect, address, Friendbot
    DonateForm.tsx        # amount + message + Donate, validation, TxStatusBadge
    Leaderboard.tsx       # live ranking (contract read)
    ActivityFeed.tsx      # live tip-event stream
    TxStatusBadge.tsx     # pending/success/fail + Explorer link
  lib/
    wallet.ts             # StellarWalletsKit wrapper (init, connect, sign, disconnect)
    contract.ts           # build/invoke donate; read leaderboard/total/count
    events.ts             # Soroban RPC getEvents polling → new tip events
    friendbot.ts          # fund account on Testnet
    format.ts             # address truncation, amount/stroop formatting, explorer URL
    config.ts             # RPC URL, network passphrase, contract ID, explorer base
  store.ts                # zustand: wallet, txStatus, leaderboard, feed
tests/
  format.test.ts          # pure helper tests (Vitest)
```

**Single-responsibility layers:** `lib/*` holds wallet/contract/RPC logic (no UI);
`components/*` is presentation; `store.ts` is shared state. Pure helpers in `format.ts`
are unit-tested; wallet/RPC/contract code is verified by manual E2E on Testnet.

---

## 5. Data Flow

1. **Connect** → StellarWalletsKit modal → chosen wallet → `publicKey` into store.
2. **Donate** → `contract.donate()` builds the invoke tx → sign via wallet kit → submit to
   Soroban RPC → `txStatus`: building → pending → success/fail, with tx hash + Explorer link.
3. **Real-time** → `events.ts` polls `getEvents` (~every 5s) for new `tip` events → prepend to
   feed + refresh leaderboard via `get_leaderboard()`. On first load, backfill recent events.

---

## 6. Error Handling (≥3 types)

| Condition | Behavior |
|---|---|
| No wallet / connection rejected | Toast (error) + retry |
| Invalid/insufficient amount (≤0, or fee exceeds balance) | Button disabled + warning |
| Empty / too-long message (>140) | Inline red warning, submit blocked |
| Contract/RPC error or tx fail | TxStatus "fail" + summarized raw error (toast) |

Every error reaches the user as a readable string (never `[object Object]`).

---

## 7. Dependencies & Network

- `@creit.tech/stellar-wallets-kit` (multi-wallet), `@stellar/stellar-sdk` (Soroban RPC +
  contract client), `next`, `react`, `tailwindcss` v4, `zustand`, `sonner`.
- Toolchain: Rust (rustup) + `wasm32v1-none` (or `wasm32-unknown-unknown`) target +
  `stellar-cli` for build & deploy. Installed during implementation (currently absent).
- Network: **Testnet** — Soroban RPC `https://soroban-testnet.stellar.org`,
  passphrase `Test SDF Network ; September 2015`, Friendbot `https://friendbot.stellar.org`,
  Explorer `https://stellar.expert/explorer/testnet`.

---

## 8. Testing & Delivery

- **Contract:** Rust unit tests (`cargo test`) for donate/validation/accumulation/event.
- **Frontend:** Vitest for pure helpers (`format.ts`); wallet/RPC/contract verified by
  manual E2E on Testnet (connect → donate → see leaderboard/feed update → tx hash on Explorer).
- Public GitHub repo, English `README.md` (description, setup/run, **deployed contract
  address**, **tx hash of a contract call** verifiable on Stellar Explorer, screenshots:
  wallet options modal, leaderboard, activity feed, tx status).
- Vercel deploy + live link in README. ≥2 meaningful commits (one per task naturally).

---

## 9. Mandatory → Acceptance Criteria (summary)

- [ ] Multi-wallet connect/select/disconnect works via StellarWalletsKit.
- [ ] Contract deployed to Testnet; real contract ID recorded.
- [ ] `donate` called from the frontend; write succeeds.
- [ ] `get_leaderboard()` / `get_total()` read and displayed.
- [ ] `tip` events polled and feed + leaderboard update live.
- [ ] Transaction status (pending/success/fail) is visible, with tx hash + Explorer link.
- [ ] At least 3 error types handled and surfaced to the user.
- [ ] Public repo + README (contract address + tx hash + screenshots) + ≥2 commits + Vercel deploy.

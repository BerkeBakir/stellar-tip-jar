# Stellar Tip Jar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Testnet dApp where users connect any Stellar wallet (StellarWalletsKit), send a tip (amount + message) recorded on a deployed Soroban contract, and watch a live leaderboard + activity feed update from on-chain events.

**Architecture:** A Rust Soroban contract acts as an on-chain donation ledger (`donate` write; `get_leaderboard`/`get_total`/`get_tip_count` reads; emits a `tip` event). A Next.js App Router frontend invokes it via `@stellar/stellar-sdk` Soroban RPC, signs with StellarWalletsKit, and polls `getEvents` for real-time updates. State lives in Zustand. Pure helpers are unit-tested with Vitest; wallet/RPC/contract code is verified by manual E2E on Testnet.

**Tech Stack:** Rust + `soroban-sdk` + `stellar-cli`; Next.js 16 + TypeScript + Tailwind v4; `@stellar/stellar-sdk` (Soroban RPC); `@creit.tech/stellar-wallets-kit`; Zustand; sonner; Vitest.

## Global Constraints

- Network is **Testnet only**: Soroban RPC `https://soroban-testnet.stellar.org`, passphrase `Test SDF Network ; September 2015`, Friendbot `https://friendbot.stellar.org`, Explorer base `https://stellar.expert/explorer/testnet`.
- Contract is an **on-chain ledger** — it records `(donor, amount, message)`, keeps per-donor totals, emits a `tip` event. It does **not** custody or transfer real XLM.
- Message length must be validated `1..=140` characters in BOTH the contract and the UI.
- `amount` is an `i128` and must be `> 0` in BOTH the contract and the UI.
- Every error surfaced to the user must be a readable string — never `[object Object]`.
- At least **3 error types** must be handled and surfaced: wallet rejected, invalid/insufficient amount, empty/too-long message (plus RPC/tx failure).
- Transaction status (pending / success / fail) must be visible, with the tx hash linking to Stellar Expert.
- **API-VERIFY RULE:** The exact TypeScript surface of `@stellar/stellar-sdk` (Soroban RPC `rpc.Server`, `Contract`, `nativeToScVal`, `scValToNative`, `getEvents`) and `@creit.tech/stellar-wallets-kit` may differ from the example code below across versions. Implementers MUST verify the installed package's exported names/signatures (check `node_modules/.../*.d.ts`) and adapt the code to match, preserving the documented behavior. Reviewers MUST verify such adaptations against the installed types rather than assuming the plan's example is exact.
- Commit after each task. Use clear, conventional messages.

---

### Task 1: Toolchain setup and funded Testnet identity

**Files:**
- Create: `contracts/.gitkeep`
- Create: `docs/DEPLOY_NOTES.md`

**Interfaces:**
- Produces: a working `stellar` CLI, a Rust wasm target, and a funded Testnet identity named `tipjar` whose address is recorded in `docs/DEPLOY_NOTES.md`. Later tasks deploy with `--source tipjar`.

- [ ] **Step 1: Install Rust (if absent)**

Run:
```bash
rustc --version || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustc --version
```
Expected: prints a `rustc 1.x` version.

- [ ] **Step 2: Add the wasm target**

Run:
```bash
rustup target add wasm32v1-none 2>/dev/null || rustup target add wasm32-unknown-unknown
rustup target list --installed | grep wasm32
```
Expected: a `wasm32...` target is listed. (Newer `stellar-cli` uses `wasm32v1-none`; older uses `wasm32-unknown-unknown`. Record which one is installed in `docs/DEPLOY_NOTES.md`.)

- [ ] **Step 3: Install stellar-cli**

Run:
```bash
cargo install --locked stellar-cli
stellar --version
```
Expected: prints a `stellar <version>` line. (If `cargo install` is slow or fails on Windows, fall back to the documented Windows installer/binary from the stellar-cli releases; record the method used in `docs/DEPLOY_NOTES.md`.)

- [ ] **Step 4: Create and fund a Testnet identity**

Run:
```bash
stellar keys generate tipjar --network testnet --fund
stellar keys address tipjar
```
Expected: prints a `G...` public key. The account is funded by Friendbot. If `--fund` fails, run `stellar keys fund tipjar --network testnet`.

- [ ] **Step 5: Record deploy notes and commit**

Create `docs/DEPLOY_NOTES.md` with the installed wasm target, the `stellar --version`, and the `tipjar` address (public `G...` key only — never the secret key). Create an empty `contracts/.gitkeep`.

```bash
git add contracts/.gitkeep docs/DEPLOY_NOTES.md
git commit -m "chore: set up Soroban toolchain and funded testnet identity"
```

---

### Task 2: Soroban contract (Rust) with unit tests

**Files:**
- Create: `contracts/tip-jar/Cargo.toml`
- Create: `contracts/tip-jar/src/lib.rs`
- Create: `contracts/tip-jar/src/test.rs`
- Modify: `.gitignore` (ensure `target` and `*.wasm` ignored — already added in spec commit; verify)

**Interfaces:**
- Produces (contract functions):
  - `donate(donor: Address, amount: i128, message: String)` — requires `donor` auth; validates `amount > 0` and `1 ≤ message.len() ≤ 140`; updates per-donor total, global total, count; emits event with topics `("tip", donor)` and data `(amount, message)`.
  - `get_leaderboard() -> Vec<(Address, i128)>`
  - `get_total() -> i128`
  - `get_tip_count() -> u32`

- [ ] **Step 1: Create `contracts/tip-jar/Cargo.toml`**

```toml
[package]
name = "tip-jar"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
soroban-sdk = "22"

[dev-dependencies]
soroban-sdk = { version = "22", features = ["testutils"] }

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
panic = "abort"
codegen-units = 1
lto = true
```

(API-VERIFY: confirm the latest `soroban-sdk` major with `cargo search soroban-sdk`; if it is not `22`, use the installed major and adjust any API differences below.)

- [ ] **Step 2: Write the failing tests `contracts/tip-jar/src/test.rs`**

```rust
#![cfg(test)]
use super::{TipJar, TipJarClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, TipJarClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TipJar, ());
    let client = TipJarClient::new(&env, &contract_id);
    (env, client)
}

#[test]
fn donate_updates_totals_and_count() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &100, &String::from_str(&env, "thanks!"));
    assert_eq!(client.get_total(), 100);
    assert_eq!(client.get_tip_count(), 1);
    let board = client.get_leaderboard();
    assert_eq!(board.len(), 1);
    assert_eq!(board.get(0).unwrap(), (donor.clone(), 100));
}

#[test]
fn same_donor_accumulates_without_duplicate_row() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &100, &String::from_str(&env, "one"));
    client.donate(&donor, &50, &String::from_str(&env, "two"));
    assert_eq!(client.get_total(), 150);
    assert_eq!(client.get_tip_count(), 2);
    let board = client.get_leaderboard();
    assert_eq!(board.len(), 1);
    assert_eq!(board.get(0).unwrap(), (donor, 150));
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn rejects_non_positive_amount() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &0, &String::from_str(&env, "nope"));
}

#[test]
#[should_panic(expected = "message length must be 1..=140")]
fn rejects_empty_message() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &10, &String::from_str(&env, ""));
}

#[test]
fn emits_tip_event() {
    let (env, client) = setup();
    let donor = Address::generate(&env);
    client.donate(&donor, &42, &String::from_str(&env, "hi"));
    let events = env.events().all();
    assert_eq!(events.len(), 1);
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd contracts/tip-jar && cargo test`
Expected: FAIL — `TipJar`/`TipJarClient` not found (lib not written yet).

- [ ] **Step 4: Write `contracts/tip-jar/src/lib.rs`**

```rust
#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

#[contracttype]
pub enum DataKey {
    Total,
    Count,
    Donors,
    DonorTotal(Address),
}

#[contract]
pub struct TipJar;

#[contractimpl]
impl TipJar {
    /// Record a tip: validate, update totals, emit a `tip` event.
    pub fn donate(env: Env, donor: Address, amount: i128, message: String) {
        donor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }
        let len = message.len();
        if len == 0 || len > 140 {
            panic!("message length must be 1..=140");
        }

        let storage = env.storage().persistent();

        // Per-donor running total; track distinct donors on first tip.
        let donor_key = DataKey::DonorTotal(donor.clone());
        let prev: i128 = storage.get(&donor_key).unwrap_or(0);
        if prev == 0 {
            let mut donors: Vec<Address> =
                storage.get(&DataKey::Donors).unwrap_or(Vec::new(&env));
            donors.push_back(donor.clone());
            storage.set(&DataKey::Donors, &donors);
        }
        storage.set(&donor_key, &(prev + amount));

        // Global total + count.
        let total: i128 = storage.get(&DataKey::Total).unwrap_or(0);
        storage.set(&DataKey::Total, &(total + amount));
        let count: u32 = storage.get(&DataKey::Count).unwrap_or(0);
        storage.set(&DataKey::Count, &(count + 1));

        // Event: topics ("tip", donor), data (amount, message).
        env.events()
            .publish((symbol_short!("tip"), donor.clone()), (amount, message));
    }

    pub fn get_leaderboard(env: Env) -> Vec<(Address, i128)> {
        let storage = env.storage().persistent();
        let donors: Vec<Address> = storage.get(&DataKey::Donors).unwrap_or(Vec::new(&env));
        let mut out: Vec<(Address, i128)> = Vec::new(&env);
        for d in donors.iter() {
            let t: i128 = storage.get(&DataKey::DonorTotal(d.clone())).unwrap_or(0);
            out.push_back((d, t));
        }
        out
    }

    pub fn get_total(env: Env) -> i128 {
        env.storage().persistent().get(&DataKey::Total).unwrap_or(0)
    }

    pub fn get_tip_count(env: Env) -> u32 {
        env.storage().persistent().get(&DataKey::Count).unwrap_or(0)
    }
}

mod test;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd contracts/tip-jar && cargo test`
Expected: PASS — 5 tests pass. (If the `env.register(TipJar, ())` signature differs in the installed `soroban-sdk` major, use the version's documented registration call, e.g. `env.register_contract(None, TipJar)`, and update `setup()`.)

- [ ] **Step 6: Commit**

```bash
git add contracts/tip-jar/Cargo.toml contracts/tip-jar/src/lib.rs contracts/tip-jar/src/test.rs
git commit -m "feat(contract): tip jar ledger with donate/read/event + tests"
```

---

### Task 3: Build and deploy the contract to Testnet

**Files:**
- Modify: `docs/DEPLOY_NOTES.md` (append contract ID + deploy tx hash)

**Interfaces:**
- Consumes: funded `tipjar` identity (Task 1); built contract (Task 2).
- Produces: a deployed **contract ID** (`C...`) recorded in `docs/DEPLOY_NOTES.md`. Task 5's `config.ts` will use this exact ID.

- [ ] **Step 1: Build the wasm**

Run:
```bash
cd contracts/tip-jar
stellar contract build
ls target/wasm32*/release/tip_jar.wasm
```
Expected: a `tip_jar.wasm` file exists under `target/wasm32v1-none/release/` (or `wasm32-unknown-unknown`).

- [ ] **Step 2: (Optional) Optimize**

Run:
```bash
stellar contract optimize --wasm target/wasm32*/release/tip_jar.wasm || true
```
Expected: an optimized `*.optimized.wasm` may be produced; if the command is unavailable, proceed with the unoptimized wasm.

- [ ] **Step 3: Deploy to Testnet**

Run (use the optimized wasm if present, else the plain one):
```bash
stellar contract deploy \
  --wasm target/wasm32*/release/tip_jar.wasm \
  --source tipjar \
  --network testnet
```
Expected: prints a contract ID starting with `C...`.

- [ ] **Step 4: Smoke-test the deployed contract**

Run (replace `<CID>` with the deployed ID and `<G...>` with `stellar keys address tipjar`):
```bash
stellar contract invoke --id <CID> --source tipjar --network testnet -- get_total
stellar contract invoke --id <CID> --source tipjar --network testnet -- \
  donate --donor <G...> --amount 100 --message "first tip"
stellar contract invoke --id <CID> --source tipjar --network testnet -- get_leaderboard
```
Expected: `get_total` returns `0`, the donate invocation returns successfully (prints a tx hash), `get_leaderboard` returns one `[address, 100]` entry.

- [ ] **Step 5: Record and commit**

Append to `docs/DEPLOY_NOTES.md`: the contract ID, the `tipjar` G-address, the deploy/invoke tx hashes, and the Explorer URL `https://stellar.expert/explorer/testnet/contract/<CID>`.

```bash
git add docs/DEPLOY_NOTES.md
git commit -m "chore: deploy tip jar contract to testnet and record contract id"
```

---

### Task 4: Next.js scaffold, dependencies, and config

**Files:**
- Create: project scaffold via `create-next-app` (in repo root, alongside existing `contracts/` and `docs/`)
- Create: `src/lib/config.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `src/lib/config.ts` exporting `NETWORK_PASSPHRASE`, `RPC_URL`, `FRIENDBOT_URL`, `EXPLORER_BASE_URL`, `EXPLORER_TX_URL`, `CONTRACT_ID`.

- [ ] **Step 1: Scaffold Next.js into the existing repo**

Run (the repo already contains `contracts/`, `docs/`, `.git`, `.gitignore`; `create-next-app` tolerates `docs/` but may object to other dirs — if it refuses, temporarily move `contracts/` out, scaffold, then move it back):
```bash
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --use-npm
```
Expected: Next.js app created. Verify `src/app/page.tsx` exists.

- [ ] **Step 2: Install runtime dependencies**

Run:
```bash
npm install @stellar/stellar-sdk @creit.tech/stellar-wallets-kit zustand sonner
npm install -D vitest
```
Expected: installs succeed.

- [ ] **Step 3: Add the test script and a vitest config**

In `package.json` `scripts`, add: `"test": "vitest run"`.

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
});
```

- [ ] **Step 4: Create `src/lib/config.ts`**

Replace `__CONTRACT_ID__` with the deployed ID from `docs/DEPLOY_NOTES.md`:
```ts
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const EXPLORER_BASE_URL = 'https://stellar.expert/explorer/testnet';
export const CONTRACT_ID = '__CONTRACT_ID__';

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE_URL}/tx/${hash}`;
}
```

- [ ] **Step 5: Verify build and commit**

Run: `npm run build`
Expected: build succeeds.

```bash
git add -A
git commit -m "chore: scaffold Next.js app, deps, and testnet config"
```

---

### Task 5: Pure helpers (`format.ts`) with Vitest

**Files:**
- Create: `src/lib/format.ts`
- Test: `tests/format.test.ts`

**Interfaces:**
- Produces:
  - `truncateAddress(addr: string): string` — `GABCD…WXYZ` (first 5 + last 4) for length > 12, else the input unchanged.
  - `formatAmount(amount: bigint | number): string` — integer-stroop amount to a human string with thousands separators (no decimals; the contract stores raw `i128` units).
  - `isValidMessage(msg: string): boolean` — `true` iff trimmed length is `1..=140`.
  - `isValidAmount(value: string): boolean` — `true` iff it parses to an integer `> 0`.

- [ ] **Step 1: Write the failing tests `tests/format.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { truncateAddress, formatAmount, isValidMessage, isValidAmount } from '@/lib/format';

describe('truncateAddress', () => {
  it('truncates long addresses', () => {
    expect(truncateAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe('GABCD…WXYZ');
  });
  it('leaves short strings unchanged', () => {
    expect(truncateAddress('GABC')).toBe('GABC');
  });
});

describe('formatAmount', () => {
  it('adds thousands separators', () => {
    expect(formatAmount(1234567n)).toBe('1,234,567');
  });
  it('handles zero', () => {
    expect(formatAmount(0n)).toBe('0');
  });
});

describe('isValidMessage', () => {
  it('rejects empty', () => expect(isValidMessage('   ')).toBe(false));
  it('accepts normal', () => expect(isValidMessage('thanks')).toBe(true));
  it('rejects > 140', () => expect(isValidMessage('a'.repeat(141))).toBe(false));
  it('accepts exactly 140', () => expect(isValidMessage('a'.repeat(140))).toBe(true));
});

describe('isValidAmount', () => {
  it('accepts positive integer', () => expect(isValidAmount('100')).toBe(true));
  it('rejects zero', () => expect(isValidAmount('0')).toBe(false));
  it('rejects negative', () => expect(isValidAmount('-5')).toBe(false));
  it('rejects non-numeric', () => expect(isValidAmount('abc')).toBe(false));
  it('rejects empty', () => expect(isValidAmount('')).toBe(false));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — module `@/lib/format` not found.

- [ ] **Step 3: Write `src/lib/format.ts`**

```ts
export function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

export function formatAmount(amount: bigint | number): string {
  const n = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(amount));
  return n.toLocaleString('en-US');
}

export function isValidMessage(msg: string): boolean {
  const len = msg.trim().length;
  return len >= 1 && len <= 140;
}

export function isValidAmount(value: string): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  try {
    return BigInt(value.trim()) > 0n;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS — all format tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts tests/format.test.ts vitest.config.ts
git commit -m "feat: pure formatting/validation helpers with tests"
```

---

### Task 6: Wallet wrapper (`wallet.ts`) — StellarWalletsKit

**Files:**
- Create: `src/lib/wallet.ts`

**Interfaces:**
- Consumes: `NETWORK_PASSPHRASE` (config).
- Produces:
  - `getKit(): StellarWalletsKit` — lazily-constructed singleton.
  - `openWalletModal(): Promise<string>` — opens the wallet-selection modal, sets the chosen wallet, returns the connected public key. Throws `Error` with a readable message if the user closes/rejects.
  - `disconnect(): Promise<void>` — clears the selected wallet.
  - `signXdr(xdr: string, publicKey: string): Promise<string>` — signs and returns signed XDR. Throws readable `Error` on rejection.

- [ ] **Step 1: Write `src/lib/wallet.ts`**

(API-VERIFY: confirm exports of `@creit.tech/stellar-wallets-kit` in `node_modules/@creit.tech/stellar-wallets-kit/build/*.d.ts`. The names below match the current major: `StellarWalletsKit`, `WalletNetwork`, `allowAllModules`, `XBULL_ID`. The kit's `signTransaction` returns `{ signedTxXdr }`. Adapt if the installed version differs.)

```ts
'use client';

import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  XBULL_ID,
} from '@creit.tech/stellar-wallets-kit';
import { NETWORK_PASSPHRASE } from './config';

let kit: StellarWalletsKit | null = null;

export function getKit(): StellarWalletsKit {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: XBULL_ID,
      modules: allowAllModules(),
    });
  }
  return kit;
}

export async function openWalletModal(): Promise<string> {
  const k = getKit();
  return new Promise<string>((resolve, reject) => {
    k.openModal({
      onWalletSelected: async (option) => {
        try {
          k.setWallet(option.id);
          const { address } = await k.getAddress();
          resolve(address);
        } catch (err) {
          reject(
            new Error(err instanceof Error ? err.message : 'Failed to read wallet address.')
          );
        }
      },
      onClosed: () => reject(new Error('Wallet selection was cancelled.')),
    });
  });
}

export async function disconnect(): Promise<void> {
  const k = getKit();
  if (typeof (k as unknown as { disconnect?: () => Promise<void> }).disconnect === 'function') {
    await (k as unknown as { disconnect: () => Promise<void> }).disconnect();
  }
}

export async function signXdr(xdr: string, publicKey: string): Promise<string> {
  const k = getKit();
  try {
    const { signedTxXdr } = await k.signTransaction(xdr, {
      address: publicKey,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    return signedTxXdr;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Transaction signing was rejected.'
    );
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: build succeeds (the module is imported by later tasks; for now confirm no type errors by temporarily importing it in a scratch file is unnecessary — `tsc` via `next build` will check once it is referenced. If unreferenced, run `npx tsc --noEmit`).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/wallet.ts
git commit -m "feat: StellarWalletsKit multi-wallet wrapper"
```

---

### Task 7: Contract client (`contract.ts`) — invoke + read

**Files:**
- Create: `src/lib/contract.ts`

**Interfaces:**
- Consumes: `RPC_URL`, `NETWORK_PASSPHRASE`, `CONTRACT_ID` (config); `signXdr` (Task 6).
- Produces:
  - `type LeaderboardEntry = { address: string; total: bigint }`
  - `donate(publicKey: string, amount: bigint, message: string): Promise<string>` — simulate → sign → send → poll; returns the **tx hash** on success; throws readable `Error` on failure.
  - `getLeaderboard(): Promise<LeaderboardEntry[]>` — simulate-only read, sorted desc by total.
  - `getTotal(): Promise<bigint>` and `getTipCount(): Promise<number>` — simulate-only reads.

- [ ] **Step 1: Write `src/lib/contract.ts`**

(API-VERIFY: confirm the Soroban RPC surface of the installed `@stellar/stellar-sdk`. Current major exposes `rpc.Server`, `Contract`, `TransactionBuilder`, `nativeToScVal`, `scValToNative`, `Address`, `Account`, `BASE_FEE`. `server.prepareTransaction(tx)` simulates+assembles; `server.sendTransaction(signed)` then `server.getTransaction(hash)` polls. Adapt names if the version differs, e.g. `SorobanRpc.Server`.)

```ts
import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  Address,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk';
import { RPC_URL, NETWORK_PASSPHRASE, CONTRACT_ID } from './config';
import { signXdr } from './wallet';

const server = new rpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);

export type LeaderboardEntry = { address: string; total: bigint };

/** Simulate a read-only call and return the native-decoded return value. */
async function simulateRead(method: string): Promise<unknown> {
  const account = await server.getAccount(CONTRACT_ID).catch(async () => {
    // Reads don't need a real source; use a throwaway funded-less account via a known key.
    // Fall back to building from the contract's own footprint using a generated source.
    throw new Error('read source unavailable');
  });
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  const retval = sim.result?.retval;
  if (!retval) throw new Error(`No return value from ${method}.`);
  return scValToNative(retval);
}
```

NOTE for implementer: reads via simulation still require a *source account* for the `TransactionBuilder`, but it does not need to be funded and is never signed/submitted. Using `CONTRACT_ID` as the source (above) will fail because a contract is not an account. **Replace the `simulateRead` source-account logic** with a deterministic throwaway keypair source built **without** a network fetch, e.g.:

```ts
import { Keypair, Account } from '@stellar/stellar-sdk';

function readSource(): Account {
  // A random keypair; sequence 0 is fine for simulation (never submitted).
  return new Account(Keypair.random().publicKey(), '0');
}
```

Then build with `new TransactionBuilder(readSource(), {...})`. Implement `simulateRead` using `readSource()` and keep the simulation/error/`scValToNative` handling shown above.

- [ ] **Step 2: Add the read functions**

Append to `src/lib/contract.ts`:
```ts
export async function getTotal(): Promise<bigint> {
  const v = (await simulateRead('get_total')) as bigint | number;
  return typeof v === 'bigint' ? v : BigInt(v ?? 0);
}

export async function getTipCount(): Promise<number> {
  const v = (await simulateRead('get_tip_count')) as number | bigint;
  return Number(v ?? 0);
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const raw = (await simulateRead('get_leaderboard')) as Array<[string, bigint | number]>;
  const entries = (raw ?? []).map(([address, total]) => ({
    address: String(address),
    total: typeof total === 'bigint' ? total : BigInt(total),
  }));
  entries.sort((a, b) => (a.total < b.total ? 1 : a.total > b.total ? -1 : 0));
  return entries;
}
```

(API-VERIFY: `scValToNative` decodes a `Vec<(Address, i128)>` to an array of `[string, bigint]` pairs in the current SDK. Confirm the decoded shape at runtime during Task 15 and adjust the mapping if Address decodes to an object.)

- [ ] **Step 3: Add the `donate` write**

Append to `src/lib/contract.ts`:
```ts
export async function donate(
  publicKey: string,
  amount: bigint,
  message: string
): Promise<string> {
  const account = await server.getAccount(publicKey);
  const op = contract.call(
    'donate',
    new Address(publicKey).toScVal(),
    nativeToScVal(amount, { type: 'i128' }),
    nativeToScVal(message, { type: 'string' })
  );
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  // Simulate + assemble (adds Soroban footprint & resource fees).
  const prepared = await server.prepareTransaction(built);

  // Sign via wallet kit.
  const signedXdr = await signXdr(prepared.toXDR(), publicKey);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  // Send and poll.
  const sent = await server.sendTransaction(signedTx);
  if (sent.status === 'ERROR') {
    throw new Error(`Submission failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
  }
  const hash = sent.hash;

  // Poll for final status.
  let getResp = await server.getTransaction(hash);
  const deadline = Date.now() + 30_000;
  while (getResp.status === 'NOT_FOUND' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    getResp = await server.getTransaction(hash);
  }
  if (getResp.status !== 'SUCCESS') {
    throw new Error(`Transaction ${hash} ended with status ${getResp.status}.`);
  }
  return hash;
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (If `rpc`, `nativeToScVal`, or `prepareTransaction` names differ, fix per the installed `.d.ts`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/contract.ts
git commit -m "feat: soroban contract client (donate write + leaderboard/total reads)"
```

---

### Task 8: Event polling (`events.ts`)

**Files:**
- Create: `src/lib/events.ts`

**Interfaces:**
- Consumes: `RPC_URL`, `CONTRACT_ID` (config).
- Produces:
  - `type TipEvent = { donor: string; amount: bigint; message: string; ledger: number; txHash: string }`
  - `fetchLatestLedger(): Promise<number>`
  - `getTipEvents(startLedger: number): Promise<{ events: TipEvent[]; latestLedger: number }>` — fetches `tip` events from `startLedger` to the tip of the ledger.

- [ ] **Step 1: Write `src/lib/events.ts`**

(API-VERIFY: confirm `server.getEvents({ startLedger, filters })` and `server.getLatestLedger()` in the installed SDK. Event `topic` is an array of `xdr.ScVal`; `scValToNative` decodes each. The first topic is the `"tip"` symbol, the second is the donor address; `event.value` decodes to `[amount, message]`.)

```ts
import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { RPC_URL, CONTRACT_ID } from './config';

const server = new rpc.Server(RPC_URL);

export type TipEvent = {
  donor: string;
  amount: bigint;
  message: string;
  ledger: number;
  txHash: string;
};

export async function fetchLatestLedger(): Promise<number> {
  const resp = await server.getLatestLedger();
  return resp.sequence;
}

export async function getTipEvents(
  startLedger: number
): Promise<{ events: TipEvent[]; latestLedger: number }> {
  const resp = await server.getEvents({
    startLedger,
    filters: [
      {
        type: 'contract',
        contractIds: [CONTRACT_ID],
        topics: [['*', '*']], // (tip symbol, donor) — match any two-topic event from this contract
      },
    ],
  });

  const events: TipEvent[] = [];
  for (const e of resp.events ?? []) {
    try {
      const topics = e.topic.map((t: xdr.ScVal) => scValToNative(t));
      const symbol = String(topics[0]);
      if (symbol !== 'tip') continue;
      const donor = String(topics[1]);
      const data = scValToNative(e.value) as [bigint | number, string];
      events.push({
        donor,
        amount: typeof data[0] === 'bigint' ? data[0] : BigInt(data[0]),
        message: String(data[1]),
        ledger: e.ledger,
        txHash: e.txHash ?? '',
      });
    } catch {
      // Skip any event we can't decode; never throw from the poller.
    }
  }
  return { events, latestLedger: resp.latestLedger };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (Adjust `e.topic`/`e.value`/`e.ledger`/`e.txHash` field names to match the installed `GetEventsResponse` type if different.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/events.ts
git commit -m "feat: soroban RPC tip-event polling"
```

---

### Task 9: Friendbot helper (`friendbot.ts`)

**Files:**
- Create: `src/lib/friendbot.ts`

**Interfaces:**
- Consumes: `FRIENDBOT_URL` (config).
- Produces: `fundAccount(publicKey: string): Promise<void>` — funds via Friendbot; throws readable `Error` on failure (treats "already funded" as success).

- [ ] **Step 1: Write `src/lib/friendbot.ts`**

```ts
import { FRIENDBOT_URL } from './config';

export async function fundAccount(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(publicKey)}`);
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  // Friendbot returns 400 if the account already exists — treat as success.
  if (res.status === 400 && body.includes('op_already_exists')) return;
  throw new Error(`Friendbot funding failed (${res.status}).`);
}
```

- [ ] **Step 2: Verify type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/lib/friendbot.ts
git commit -m "feat: friendbot funding helper"
```

---

### Task 10: Global store (`store.ts`)

**Files:**
- Create: `src/store.ts`

**Interfaces:**
- Consumes: `LeaderboardEntry` (Task 7), `TipEvent` (Task 8).
- Produces: `useAppStore` with:
  - state: `publicKey: string | null`, `connected: boolean`, `txStatus: TxStatus`, `lastTxHash: string | null`, `lastError: string | null`, `leaderboard: LeaderboardEntry[]`, `feed: TipEvent[]`.
  - `type TxStatus = 'idle' | 'pending' | 'success' | 'fail'`
  - actions: `setWallet(pk: string | null)`, `setTxStatus(s: TxStatus)`, `setTxResult(hash: string | null, error: string | null)`, `setLeaderboard(b: LeaderboardEntry[])`, `addFeedEvents(e: TipEvent[])`.

- [ ] **Step 1: Write `src/store.ts`**

```ts
import { create } from 'zustand';
import type { LeaderboardEntry } from '@/lib/contract';
import type { TipEvent } from '@/lib/events';

export type TxStatus = 'idle' | 'pending' | 'success' | 'fail';

type AppState = {
  publicKey: string | null;
  connected: boolean;
  txStatus: TxStatus;
  lastTxHash: string | null;
  lastError: string | null;
  leaderboard: LeaderboardEntry[];
  feed: TipEvent[];
  setWallet: (pk: string | null) => void;
  setTxStatus: (s: TxStatus) => void;
  setTxResult: (hash: string | null, error: string | null) => void;
  setLeaderboard: (b: LeaderboardEntry[]) => void;
  addFeedEvents: (e: TipEvent[]) => void;
};

export const useAppStore = create<AppState>((set) => ({
  publicKey: null,
  connected: false,
  txStatus: 'idle',
  lastTxHash: null,
  lastError: null,
  leaderboard: [],
  feed: [],
  setWallet: (pk) => set({ publicKey: pk, connected: pk !== null }),
  setTxStatus: (s) => set({ txStatus: s }),
  setTxResult: (hash, error) => set({ lastTxHash: hash, lastError: error }),
  setLeaderboard: (b) => set({ leaderboard: b }),
  addFeedEvents: (e) =>
    set((state) => {
      if (e.length === 0) return state;
      const seen = new Set(state.feed.map((x) => `${x.txHash}:${x.ledger}:${x.donor}`));
      const fresh = e.filter((x) => !seen.has(`${x.txHash}:${x.ledger}:${x.donor}`));
      if (fresh.length === 0) return state;
      // Newest first, cap at 50.
      return { feed: [...fresh.reverse(), ...state.feed].slice(0, 50) };
    }),
}));
```

- [ ] **Step 2: Verify type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/store.ts
git commit -m "feat: zustand store for wallet, tx status, leaderboard, feed"
```

---

### Task 11: WalletBar component

**Files:**
- Create: `src/components/WalletBar.tsx`

**Interfaces:**
- Consumes: `openWalletModal`, `disconnect` (Task 6); `fundAccount` (Task 9); `useAppStore` (Task 10); `truncateAddress` (Task 5); `toast` (sonner).
- Produces: `<WalletBar />` — connect/disconnect, shows truncated address, "Get Test XLM" button.

- [ ] **Step 1: Write `src/components/WalletBar.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { openWalletModal, disconnect } from '@/lib/wallet';
import { fundAccount } from '@/lib/friendbot';
import { useAppStore } from '@/store';
import { truncateAddress } from '@/lib/format';

export default function WalletBar() {
  const { publicKey, connected, setWallet } = useAppStore();
  const [funding, setFunding] = useState(false);

  async function handleConnect() {
    try {
      const pk = await openWalletModal();
      setWallet(pk);
      toast.success('Wallet connected.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect wallet.');
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
    } catch {
      // disconnect is best-effort; clear local state regardless.
    }
    setWallet(null);
  }

  async function handleFund() {
    if (!publicKey) return;
    setFunding(true);
    try {
      await fundAccount(publicKey);
      toast.success('Account funded with Test XLM.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Funding failed.');
    } finally {
      setFunding(false);
    }
  }

  if (!connected || !publicKey) {
    return (
      <div className="rounded-lg border p-4 flex items-center justify-between">
        <span className="text-sm opacity-70">Connect a wallet to send a tip.</span>
        <button onClick={handleConnect} className="rounded bg-white text-black px-4 py-2 font-medium">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 flex items-center justify-between gap-3">
      <span className="font-mono text-sm">{truncateAddress(publicKey)}</span>
      <div className="flex items-center gap-2">
        <button onClick={handleFund} disabled={funding} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          {funding ? 'Funding…' : 'Get Test XLM'}
        </button>
        <button onClick={handleDisconnect} className="rounded border px-3 py-1.5 text-sm">
          Disconnect
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/components/WalletBar.tsx
git commit -m "feat: WalletBar (multi-wallet connect/disconnect + friendbot)"
```

---

### Task 12: DonateForm + TxStatusBadge components

**Files:**
- Create: `src/components/TxStatusBadge.tsx`
- Create: `src/components/DonateForm.tsx`

**Interfaces:**
- Consumes: `donate` (Task 7); `useAppStore` (Task 10); `isValidAmount`, `isValidMessage` (Task 5); `explorerTxUrl` (config); `toast`.
- Produces: `<TxStatusBadge />` (renders pending/success/fail + Explorer link), `<DonateForm />` (amount + message + Donate, validation, disabled states).

- [ ] **Step 1: Write `src/components/TxStatusBadge.tsx`**

```tsx
'use client';

import { useAppStore } from '@/store';
import { explorerTxUrl } from '@/lib/config';

export default function TxStatusBadge() {
  const { txStatus, lastTxHash, lastError } = useAppStore();

  if (txStatus === 'idle') return null;

  if (txStatus === 'pending') {
    return <div className="rounded border border-yellow-600 p-3 text-sm">⏳ Transaction pending…</div>;
  }
  if (txStatus === 'fail') {
    return (
      <div className="rounded border border-red-600 p-3 text-sm text-red-400">
        ❌ {lastError ?? 'Transaction failed.'}
      </div>
    );
  }
  // success
  return (
    <div className="rounded border border-green-600 p-3 text-sm">
      ✅ Tip recorded!
      {lastTxHash && (
        <>
          <div className="font-mono break-all mt-1 opacity-80">{lastTxHash}</div>
          <a
            href={explorerTxUrl(lastTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline"
          >
            View on Stellar Expert
          </a>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/DonateForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { donate, getLeaderboard } from '@/lib/contract';
import { useAppStore } from '@/store';
import { isValidAmount, isValidMessage } from '@/lib/format';
import TxStatusBadge from './TxStatusBadge';

export default function DonateForm() {
  const { connected, publicKey, txStatus, setTxStatus, setTxResult, setLeaderboard } = useAppStore();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  const amountOk = isValidAmount(amount);
  const messageOk = isValidMessage(message);
  const inFlight = txStatus === 'pending';
  const canSubmit = connected && amountOk && messageOk && !inFlight;

  async function handleDonate() {
    if (!publicKey) return;
    setTxStatus('pending');
    setTxResult(null, null);
    try {
      const hash = await donate(publicKey, BigInt(amount.trim()), message.trim());
      setTxResult(hash, null);
      setTxStatus('success');
      toast.success('Tip sent!');
      setAmount('');
      setMessage('');
      try {
        setLeaderboard(await getLeaderboard());
      } catch {
        // leaderboard refreshes on the next poll; the tip already succeeded.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed.';
      setTxResult(null, msg);
      setTxStatus('fail');
      toast.error(msg);
    }
  }

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <label className="text-sm font-medium">Amount</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="numeric"
        placeholder="100"
        className="rounded border bg-transparent px-3 py-2"
      />
      {amount !== '' && !amountOk && (
        <span className="text-xs text-red-400">Enter a positive whole number.</span>
      )}

      <label className="text-sm font-medium">Message</label>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={140}
        placeholder="Thanks for the great work!"
        className="rounded border bg-transparent px-3 py-2"
      />
      <span className="text-xs opacity-60">{message.trim().length}/140</span>
      {message !== '' && !messageOk && (
        <span className="text-xs text-red-400">Message must be 1–140 characters.</span>
      )}

      <button
        onClick={handleDonate}
        disabled={!canSubmit}
        className="rounded bg-white text-black px-4 py-2 font-medium disabled:opacity-40"
      >
        {inFlight ? 'Sending…' : 'Donate'}
      </button>
      {!connected && <span className="text-xs opacity-60">Connect a wallet first.</span>}

      <TxStatusBadge />
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/components/TxStatusBadge.tsx src/components/DonateForm.tsx
git commit -m "feat: DonateForm + TxStatusBadge with validation and tx status"
```

---

### Task 13: Leaderboard + ActivityFeed components

**Files:**
- Create: `src/components/Leaderboard.tsx`
- Create: `src/components/ActivityFeed.tsx`

**Interfaces:**
- Consumes: `useAppStore` (Task 10); `truncateAddress`, `formatAmount` (Task 5).
- Produces: `<Leaderboard />` (renders `leaderboard` ranked), `<ActivityFeed />` (renders `feed` newest-first).

- [ ] **Step 1: Write `src/components/Leaderboard.tsx`**

```tsx
'use client';

import { useAppStore } from '@/store';
import { truncateAddress, formatAmount } from '@/lib/format';

export default function Leaderboard() {
  const leaderboard = useAppStore((s) => s.leaderboard);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="font-semibold mb-3">🏆 Leaderboard</h2>
      {leaderboard.length === 0 ? (
        <p className="text-sm opacity-60">No tips yet. Be the first!</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {leaderboard.map((entry, i) => (
            <li key={entry.address} className="flex items-center justify-between text-sm">
              <span className="font-mono">
                {i + 1}. {truncateAddress(entry.address)}
              </span>
              <span className="font-semibold">{formatAmount(entry.total)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/ActivityFeed.tsx`**

```tsx
'use client';

import { useAppStore } from '@/store';
import { truncateAddress, formatAmount } from '@/lib/format';

export default function ActivityFeed() {
  const feed = useAppStore((s) => s.feed);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="font-semibold mb-3">📡 Live activity</h2>
      {feed.length === 0 ? (
        <p className="text-sm opacity-60">Waiting for tips…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {feed.map((e) => (
            <li key={`${e.txHash}-${e.ledger}-${e.donor}`} className="text-sm border-b border-white/10 pb-2">
              <span className="font-mono">{truncateAddress(e.donor)}</span>{' '}
              tipped <span className="font-semibold">{formatAmount(e.amount)}</span>
              <div className="opacity-70">“{e.message}”</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/components/Leaderboard.tsx src/components/ActivityFeed.tsx
git commit -m "feat: Leaderboard + ActivityFeed live views"
```

---

### Task 14: Page wiring, polling hook, and Toaster

**Files:**
- Create: `src/components/PollProvider.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: all components (Tasks 11–13); `getTipEvents`, `fetchLatestLedger` (Task 8); `getLeaderboard` (Task 7); `useAppStore` (Task 10).
- Produces: a polling effect that, every 5s, fetches new `tip` events → `addFeedEvents` + refreshes `setLeaderboard`; a fully wired single page; `<Toaster />` mounted once.

- [ ] **Step 1: Write `src/components/PollProvider.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { getTipEvents, fetchLatestLedger } from '@/lib/events';
import { getLeaderboard } from '@/lib/contract';
import { useAppStore } from '@/store';

export default function PollProvider() {
  const addFeedEvents = useAppStore((s) => s.addFeedEvents);
  const setLeaderboard = useAppStore((s) => s.setLeaderboard);
  const cursor = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function tick() {
      try {
        if (cursor.current === null) {
          const latest = await fetchLatestLedger();
          // Backfill a small recent window so the feed isn't empty on load.
          cursor.current = Math.max(latest - 2000, 1);
        }
        const { events, latestLedger } = await getTipEvents(cursor.current);
        if (!active) return;
        if (events.length > 0) {
          addFeedEvents(events);
          setLeaderboard(await getLeaderboard());
        }
        cursor.current = latestLedger + 1;
      } catch {
        // Network blips are non-fatal; the next tick retries.
      }
    }

    tick();
    const id = setInterval(tick, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [addFeedEvents, setLeaderboard]);

  return null;
}
```

(API-VERIFY: `getEvents` may cap how far back `startLedger` can be relative to the current ledger; if the backfill window is rejected, reduce `2000` to a smaller value during Task 15.)

- [ ] **Step 2: Replace `src/app/page.tsx`**

```tsx
import WalletBar from '@/components/WalletBar';
import DonateForm from '@/components/DonateForm';
import Leaderboard from '@/components/Leaderboard';
import ActivityFeed from '@/components/ActivityFeed';
import PollProvider from '@/components/PollProvider';

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Stellar Tip Jar</h1>
        <p className="opacity-70 text-sm">
          Send a tip recorded on a Soroban contract and watch the leaderboard update live.
        </p>
      </header>
      <PollProvider />
      <WalletBar />
      <DonateForm />
      <div className="grid sm:grid-cols-2 gap-6">
        <Leaderboard />
        <ActivityFeed />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Add `<Toaster />` to `src/app/layout.tsx`**

Read the existing `layout.tsx` first; keep its fonts/`className`. Import and mount the Toaster once inside `<body>`, after `{children}`, and update the metadata title/description:
```tsx
import { Toaster } from 'sonner';
// ...
export const metadata = {
  title: 'Stellar Tip Jar',
  description: 'On-chain tip jar with a live leaderboard on Stellar Testnet.',
};
// ...inside <body>:
        {children}
        <Toaster />
```

- [ ] **Step 4: Verify build and commit**

Run: `npm run build`
Expected: build succeeds; the page renders the heading and all sections.
```bash
git add src/components/PollProvider.tsx src/app/page.tsx src/app/layout.tsx
git commit -m "feat: wire page, event polling, and toaster"
```

---

### Task 15: Manual E2E verification on Testnet + screenshots

**Files:**
- Create: `public/screenshots/wallet-options.png`
- Create: `public/screenshots/leaderboard.png`
- Create: `public/screenshots/activity-feed.png`
- Create: `public/screenshots/tx-status.png`

**Interfaces:**
- Consumes: the deployed contract (Task 3) and the full app (Tasks 4–14).
- Produces: four screenshots proving the required behaviors; confirmation that a real contract-call tx hash is verifiable on Stellar Expert.

- [ ] **Step 1: Run the app**

Run: `npm run dev`
Open `http://localhost:3000`.

- [ ] **Step 2: Connect a wallet**

Click **Connect Wallet** → the StellarWalletsKit modal lists multiple wallets. Choose one (e.g., Freighter on Testnet). Approve.
Capture **`public/screenshots/wallet-options.png`** showing the wallet-selection modal.

- [ ] **Step 3: Fund (if needed) and donate**

If the account is new, click **Get Test XLM**. Enter an amount (e.g., `100`) and a message, click **Donate**, sign in the wallet.
Verify the TxStatusBadge goes pending → success with a tx hash and a working "View on Stellar Expert" link.
Capture **`public/screenshots/tx-status.png`** (success state with hash + Explorer link).

- [ ] **Step 4: Verify live updates**

Confirm the **Leaderboard** shows your address with the donated total and the **Activity Feed** shows your message within ~5s.
Capture **`public/screenshots/leaderboard.png`** and **`public/screenshots/activity-feed.png`**.

- [ ] **Step 5: Verify error paths**

- Reject the signature in the wallet → expect a "fail" status + error toast.
- Enter amount `0` or a blank message → Donate stays disabled with inline warnings.
- Confirm each error is a readable string.

- [ ] **Step 6: Record the verifiable tx hash and commit**

Append the successful donate **tx hash** and its Explorer URL to `docs/DEPLOY_NOTES.md`.
```bash
git add public/screenshots docs/DEPLOY_NOTES.md
git commit -m "test: manual E2E on testnet + screenshots"
```

---

### Task 16: README, GitHub, and Vercel deploy

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything; the contract ID and tx hash from `docs/DEPLOY_NOTES.md`; the screenshots (Task 15).
- Produces: a public GitHub repo, a Vercel production deploy, and a README satisfying the Level 2 checklist.

- [ ] **Step 1: Write `README.md`**

Include: project description; the on-chain-ledger model note; features; tech stack; **Deployed contract address** (`C...`) with its Explorer link; **Transaction hash of a contract call** with its Explorer link; setup/run instructions (including `cd contracts/tip-jar && stellar contract build/deploy` and `npm run dev`); the four screenshots (wallet options, leaderboard, activity feed, tx status); and a "Live demo" link placeholder to fill after deploy.

- [ ] **Step 2: Commit, create the repo, and push**

```bash
git add README.md
git commit -m "docs: comprehensive README for tip jar"
# Create the public repo and push (use the configured GitHub credentials; do not embed tokens in the remote URL):
gh repo create stellar-tip-jar --public --source . --remote origin --push 2>/dev/null || \
  echo "If gh is unavailable, create the repo via the GitHub API and push master:main."
```
Expected: repo exists at `https://github.com/<user>/stellar-tip-jar` with the code on the default branch.

- [ ] **Step 3: Deploy to Vercel**

Run (root directory is the repo; Next.js auto-detected):
```bash
npx --yes vercel@latest --prod --yes
```
Expected: prints a production URL. (Provide `--scope` and a token non-interactively if required.)

- [ ] **Step 4: Add the live URL and push**

Update the README "Live demo" line with the Vercel URL.
```bash
git add README.md
git commit -m "docs: add live Vercel demo URL"
git push
```

- [ ] **Step 5: (Optional) Connect Vercel to GitHub for auto-deploy**

Link the Vercel project to the GitHub repo so pushes to the default branch auto-deploy.

---

## Self-Review

**1. Spec coverage:**
- Multi-wallet (StellarWalletsKit) → Tasks 6, 11. ✓
- Contract deployed to Testnet → Tasks 1–3. ✓
- Call contract from frontend (`donate`) → Tasks 7, 12. ✓
- Read contract (`get_leaderboard`/`get_total`) → Tasks 7, 13. ✓
- Event listening + state sync → Tasks 8, 14. ✓
- Transaction status visible → Tasks 10, 12 (TxStatusBadge). ✓
- ≥3 error types → Tasks 6/7/9 (wallet, amount, message, RPC/tx) surfaced in 11/12. ✓
- Tx hash → Explorer link → Task 12 + config. ✓
- Toasts → Tasks 11, 12. ✓
- Friendbot → Tasks 9, 11. ✓
- Public repo + README (contract address + tx hash + screenshots) + ≥2 commits → Tasks 15, 16 (16 total commits). ✓
- Vercel deploy → Task 16. ✓

**2. Placeholder scan:** `__CONTRACT_ID__` (Task 4) and `<CID>`/`<G...>` (Task 3) are intentional fill-from-deploy markers with explicit instructions, not vague placeholders. README "Live demo" placeholder is filled in Task 16 Step 4. No `TODO`/"add error handling" placeholders remain.

**3. Type consistency:** `LeaderboardEntry { address: string; total: bigint }` (Task 7) is consumed unchanged in store (Task 10) and components (Task 13). `TipEvent` fields (Task 8) match store dedupe keys (Task 10) and feed rendering (Task 13). `TxStatus` union (Task 10) matches usage in 12/14. `donate(publicKey, amount: bigint, message)` signature consistent across 7/12. `signXdr(xdr, publicKey)` consistent across 6/7.

**Note on TDD scope:** Pure logic (contract Rust + `format.ts`) is test-driven (Tasks 2, 5). Wallet/RPC/contract/event code depends on a live network and a browser wallet, so it is verified by manual E2E (Task 15) rather than unit tests — consistent with the spec's testing section.

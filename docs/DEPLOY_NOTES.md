# Deploy Notes — Stellar Tip Jar (Testnet)

## Toolchain
- Install method: winget (prebuilt binaries, no source compilation)
  - `Rustlang.Rustup` 1.29.0 → rustc/cargo 1.96.0
  - `Stellar.StellarCLI` 27.0.0
- Rust default toolchain: **stable-x86_64-pc-windows-gnu** (GNU chosen to avoid needing MSVC/Visual Studio build tools for host proc-macro linking).
- Installed wasm targets: `wasm32v1-none` and `wasm32-unknown-unknown`.
- `stellar` binary: `C:\Users\Monster\.cargo\bin\stellar.exe`

## Identity
- Alias: `tipjar` (network: Test SDF Network ; September 2015)
- Public address: `GD4PHBNQSGGPCPEZNVT5D3URN2LJVT7XZXKI7PZ37XYK723TFQGQHTLR`
- Funded via Friendbot.

## Contract
- Contract ID: `CALSKUBIYK5SMXU4WMQHRAMYRQLWUTVMF4FWIJC44SXTX5XCJPROQKTP`
- Deploy tx hash: `590ce828878b23e36d257db6ca923a6e9094fff29fdfdaf874ae6a7dc0fe2e5c`
- Explorer: https://stellar.expert/explorer/testnet/contract/CALSKUBIYK5SMXU4WMQHRAMYRQLWUTVMF4FWIJC44SXTX5XCJPROQKTP
- Smoke test: get_total 0->100, donate emitted tip event (topics [tip,donor], data [i128,string]), get_leaderboard returned [[G...,100]]
- Sample donate tx hash: _(filled after Task 15)_

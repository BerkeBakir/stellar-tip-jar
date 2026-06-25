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
- Contract ID: _(filled after Task 3 deploy)_
- Deploy tx hash: _(filled after Task 3)_
- Sample donate tx hash: _(filled after Task 15)_

'use client';

import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule, XBULL_ID } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { HanaModule } from '@creit.tech/stellar-wallets-kit/modules/hana';
import { NETWORK_PASSPHRASE } from './config';

let initialized = false;

/**
 * Lazily initializes the StellarWalletsKit singleton (the kit exposes a
 * static API in v2.4.0 — there is no instance to construct or return).
 */
export function getKit(): typeof StellarWalletsKit {
  if (!initialized) {
    StellarWalletsKit.init({
      // Networks enum values are the passphrases themselves, so this app's
      // configured passphrase is also a valid `Networks` value.
      network: NETWORK_PASSPHRASE as Networks,
      selectedWalletId: XBULL_ID,
      modules: [
        new FreighterModule(),
        new xBullModule(),
        new LobstrModule(),
        new AlbedoModule(),
        new HanaModule(),
      ],
    });
    initialized = true;
  }
  return StellarWalletsKit;
}

/**
 * Opens the wallet-selection modal, sets the chosen wallet, and resolves
 * with the connected public key. Rejects with a readable Error if the
 * user closes the modal or the wallet fails to return an address.
 */
export async function openWalletModal(): Promise<string> {
  const kit = getKit();
  try {
    const { address } = await kit.authModal();
    if (!address) {
      throw new Error('Wallet did not return an address.');
    }
    return address;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Wallet selection was cancelled.'
    );
  }
}

/**
 * Clears the selected wallet. Best-effort: never throws fatally even if
 * the underlying module has nothing to disconnect.
 */
export async function disconnect(): Promise<void> {
  try {
    const kit = getKit();
    await kit.disconnect();
  } catch {
    // Disconnect is best-effort; swallow errors so callers can always
    // treat the wallet as disconnected afterwards.
  }
}

/**
 * Signs the given transaction XDR with the currently selected wallet and
 * returns the signed XDR. Throws a readable Error on rejection/failure.
 */
export async function signXdr(xdr: string, publicKey: string): Promise<string> {
  const kit = getKit();
  try {
    const { signedTxXdr } = await kit.signTransaction(xdr, {
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

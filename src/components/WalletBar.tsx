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

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

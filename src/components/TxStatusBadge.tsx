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
  if (txStatus === 'success') {
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
  return <div className="rounded border p-3 text-sm opacity-80">Processing…</div>;
}

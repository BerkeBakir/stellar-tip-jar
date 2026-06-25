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
              <div className="opacity-70">"{e.message}"</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

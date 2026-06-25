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

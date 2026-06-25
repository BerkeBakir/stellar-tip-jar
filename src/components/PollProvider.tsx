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

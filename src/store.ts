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

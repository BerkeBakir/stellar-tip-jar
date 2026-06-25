import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { RPC_URL, CONTRACT_ID } from './config';

const server = new rpc.Server(RPC_URL);

export type TipEvent = {
  donor: string;
  amount: bigint;
  message: string;
  ledger: number;
  txHash: string;
};

export async function fetchLatestLedger(): Promise<number> {
  const resp = await server.getLatestLedger();
  return resp.sequence;
}

export async function getTipEvents(
  startLedger: number
): Promise<{ events: TipEvent[]; latestLedger: number }> {
  const resp = await server.getEvents({
    startLedger,
    filters: [
      {
        type: 'contract',
        contractIds: [CONTRACT_ID],
        topics: [['*', '*']], // (tip symbol, donor) — match any two-topic event from this contract
      },
    ],
  });

  const events: TipEvent[] = [];
  for (const e of resp.events ?? []) {
    try {
      const topics = e.topic.map((t: xdr.ScVal) => scValToNative(t));
      const symbol = String(topics[0]);
      if (symbol !== 'tip') continue;
      const donor = String(topics[1]);
      const data = scValToNative(e.value) as [bigint | number, string];
      events.push({
        donor,
        amount: typeof data[0] === 'bigint' ? data[0] : BigInt(data[0]),
        message: String(data[1]),
        ledger: e.ledger,
        txHash: e.txHash ?? '',
      });
    } catch {
      // Skip any event we can't decode; never throw from the poller.
    }
  }
  return { events, latestLedger: resp.latestLedger };
}

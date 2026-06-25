import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  Address,
  Keypair,
  Account,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { RPC_URL, NETWORK_PASSPHRASE, CONTRACT_ID } from './config';
import { signXdr } from './wallet';

const server = new rpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);

export type LeaderboardEntry = { address: string; total: bigint };

/**
 * Builds a throwaway, never-funded, never-submitted source account for
 * read-only simulations. A contract ID is not a valid transaction source,
 * and reads don't need a real funded account — simulation only needs
 * *some* valid-looking account to build the envelope around.
 */
function readSource(): Account {
  return new Account(Keypair.random().publicKey(), '0');
}

/** Simulate a read-only call and return the native-decoded return value. */
async function simulateRead(method: string): Promise<unknown> {
  try {
    const tx = new TransactionBuilder(readSource(), {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const retval = sim.result?.retval;
    if (!retval) {
      throw new Error(`No return value from ${method}.`);
    }
    return scValToNative(retval);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : `Failed to read ${method}.`
    );
  }
}

/** Best-effort extraction of a Stellar G-address from a decoded Address value. */
function addressToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = value as { toString?: () => string };
    if (typeof candidate.toString === 'function') {
      const str = candidate.toString();
      if (str && str !== '[object Object]') return str;
    }
  }
  return String(value);
}

/** Best-effort coercion of a decoded i128/u32 value to bigint. */
function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  return BigInt(0);
}

export async function getTotal(): Promise<bigint> {
  const v = await simulateRead('get_total');
  return toBigInt(v);
}

export async function getTipCount(): Promise<number> {
  const v = await simulateRead('get_tip_count');
  return Number(toBigInt(v));
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const raw = (await simulateRead('get_leaderboard')) as unknown[];
  const entries: LeaderboardEntry[] = (raw ?? []).map((pair) => {
    const [address, total] = pair as [unknown, unknown];
    return {
      address: addressToString(address),
      total: toBigInt(total),
    };
  });
  entries.sort((a, b) => (a.total < b.total ? 1 : a.total > b.total ? -1 : 0));
  return entries;
}

/**
 * Submits a donation: simulates + assembles the invocation, signs it with
 * the connected wallet, submits it, and polls for the final status.
 * Returns the transaction hash on success; throws a readable Error on
 * any failure (simulation, signing, submission, or on-chain failure).
 */
export async function donate(
  publicKey: string,
  amount: bigint,
  message: string
): Promise<string> {
  try {
    const account = await server.getAccount(publicKey);
    const op = contract.call(
      'donate',
      new Address(publicKey).toScVal(),
      nativeToScVal(amount, { type: 'i128' }),
      nativeToScVal(message, { type: 'string' })
    );
    const built = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(60)
      .build();

    // Simulate + assemble (adds Soroban footprint & resource fees).
    const prepared = await server.prepareTransaction(built);

    // Sign via the connected wallet.
    const signedXdr = await signXdr(prepared.toXDR(), publicKey);
    const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

    // Send and poll for the final status.
    const sent = await server.sendTransaction(signedTx);
    if (sent.status === 'ERROR') {
      throw new Error(
        `Submission failed: ${sent.errorResult ? sent.errorResult.toXDR('base64') : 'unknown error'}`
      );
    }
    const hash = sent.hash;

    let getResp = await server.getTransaction(hash);
    const deadline = Date.now() + 30_000;
    while (getResp.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getResp = await server.getTransaction(hash);
    }
    if (getResp.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`Transaction ${hash} ended with status ${getResp.status}.`);
    }
    return hash;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Failed to submit donation.'
    );
  }
}

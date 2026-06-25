export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const EXPLORER_BASE_URL = 'https://stellar.expert/explorer/testnet';
export const CONTRACT_ID = 'CALSKUBIYK5SMXU4WMQHRAMYRQLWUTVMF4FWIJC44SXTX5XCJPROQKTP';

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE_URL}/tx/${hash}`;
}

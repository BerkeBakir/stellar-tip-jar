export function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

export function formatAmount(amount: bigint | number): string {
  const n = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(amount));
  return n.toLocaleString('en-US');
}

export function isValidMessage(msg: string): boolean {
  const len = msg.trim().length;
  return len >= 1 && len <= 140;
}

export function isValidAmount(value: string): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  try {
    return BigInt(value.trim()) > 0n;
  } catch {
    return false;
  }
}

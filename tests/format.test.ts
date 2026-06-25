import { describe, it, expect } from 'vitest';
import { truncateAddress, formatAmount, isValidMessage, isValidAmount } from '@/lib/format';

describe('truncateAddress', () => {
  it('truncates long addresses', () => {
    expect(truncateAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe('GABCD…WXYZ');
  });
  it('leaves short strings unchanged', () => {
    expect(truncateAddress('GABC')).toBe('GABC');
  });
});

describe('formatAmount', () => {
  it('adds thousands separators', () => {
    expect(formatAmount(1234567n)).toBe('1,234,567');
  });
  it('handles zero', () => {
    expect(formatAmount(0n)).toBe('0');
  });
});

describe('isValidMessage', () => {
  it('rejects empty', () => expect(isValidMessage('   ')).toBe(false));
  it('accepts normal', () => expect(isValidMessage('thanks')).toBe(true));
  it('rejects > 140', () => expect(isValidMessage('a'.repeat(141))).toBe(false));
  it('accepts exactly 140', () => expect(isValidMessage('a'.repeat(140))).toBe(true));
});

describe('isValidAmount', () => {
  it('accepts positive integer', () => expect(isValidAmount('100')).toBe(true));
  it('rejects zero', () => expect(isValidAmount('0')).toBe(false));
  it('rejects negative', () => expect(isValidAmount('-5')).toBe(false));
  it('rejects non-numeric', () => expect(isValidAmount('abc')).toBe(false));
  it('rejects empty', () => expect(isValidAmount('')).toBe(false));
});

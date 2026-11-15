import { describe, expect, it } from 'vitest';
import {
  computePasscodeVerifier,
  computePassToken,
  generateCareCode,
  generateSafeId,
  generateSalt,
  getTodayDateKey,
  normalizeTimeHHMM,
  sanitizePayload,
  sha256Hex,
} from '../src/lib/careUtils';

describe('careUtils — security, sanitization, and formatting', () => {
  it('strips top-level and nested undefined fields while preserving valid values', () => {
    const input = {
      name: 'Lisinopril',
      dosage: '10 mg',
      optionalNote: undefined,
      tags: ['morning', undefined, 'heart'],
      meta: {
        prescriber: 'Dr. Lin',
        emptyField: undefined,
      },
      count: 0,
      archived: false,
      nullable: null,
    };

    const sanitized = sanitizePayload(input) as Record<string, unknown>;
    expect('optionalNote' in sanitized).toBe(false);
    expect(sanitized.tags).toEqual(['morning', 'heart']);
    expect(sanitized.meta).toEqual({ prescriber: 'Dr. Lin' });
    expect(sanitized.count).toBe(0);
    expect(sanitized.archived).toBe(false);
    expect(sanitized.nullable).toBeNull();
  });

  it('computes deterministic SHA-256 pass tokens regardless of Care Code casing/whitespace', async () => {
    const tokenA = await computePassToken(' kin-4f8a ', ' 482910 ');
    const tokenB = await computePassToken('KIN-4F8A', '482910');
    const tokenDifferent = await computePassToken('KIN-4F8A', '482911');

    expect(tokenA).toHaveLength(64);
    expect(tokenA).toBe(tokenB);
    expect(tokenA).not.toBe(tokenDifferent);
  });

  it('computes distinct passcode verifiers with different salts', async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const verifier1 = await computePasscodeVerifier(salt1, '123456');
    const verifier2 = await computePasscodeVerifier(salt2, '123456');

    expect(salt1).toHaveLength(16);
    expect(verifier1).toHaveLength(64);
    expect(verifier1).not.toBe(verifier2);
  });

  it('hashes raw input consistently with sha256Hex', async () => {
    const hash = await sha256Hex('kincare-test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates valid Care Codes and unique prefixed IDs', () => {
    const code = generateCareCode();
    expect(code).toMatch(/^KIN-[A-HJ-NP-Z2-9]{4}$/);

    const id1 = generateSafeId('med');
    const id2 = generateSafeId('med');
    expect(id1).toMatch(/^med_\d+_[a-f0-9]{12}$/);
    expect(id1).not.toBe(id2);
  });

  it('normalizes valid HH:MM times and falls back on malformed strings', () => {
    expect(normalizeTimeHHMM('8:05')).toBe('08:05');
    expect(normalizeTimeHHMM('21:30')).toBe('21:30');
    expect(normalizeTimeHHMM('25:99', '09:00')).toBe('09:00');
    expect(normalizeTimeHHMM('invalid')).toBe('08:00');
  });

  it('formats local date keys deterministically as YYYY-MM-DD', () => {
    const fixed = new Date(2026, 10, 5, 14, 20, 0); // Nov 5, 2026
    expect(getTodayDateKey(fixed)).toBe('2026-11-05');
  });
});

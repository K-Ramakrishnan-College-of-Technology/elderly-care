import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  escapeHtml,
  getSafeBody,
  isRecoverableGeminiError,
  isSmtpAuthError,
  resetSmtpAuthFailureCacheForTests,
} from '../server';

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  resetSmtpAuthFailureCacheForTests();
});

describe('Express API security & helper guarantees', () => {
  it('GET /api/health returns 200 and reports smtpConfigured safely', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; smtpConfigured: boolean; timestamp: string };
    expect(data.ok).toBe(true);
    expect(typeof data.smtpConfigured).toBe('boolean');
    expect(Date.parse(data.timestamp)).not.toBeNaN();
  });

  it('blocks unauthenticated access to all AI and reminder endpoints (401)', async () => {
    const protectedEndpoints = [
      '/api/ai/medication-insights',
      '/api/ai/parse-prescription',
      '/api/ai/appointment-brief',
      '/api/ai/daily-digest',
      '/api/reminders/dispatch',
    ];

    for (const endpoint of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/Authorization/i);
    }
  });

  it('rejects oversized or malformed Bearer tokens cleanly with 401', async () => {
    const hugeToken = 'x'.repeat(5000);
    const res = await fetch(`${baseUrl}/api/reminders/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hugeToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('escapes untrusted HTML payloads to prevent email XSS injection', () => {
    const malicious = `<script>alert("xss")</script> & 'quote'`;
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;quote&#39;');
  });

  it('normalizes missing, null, or array request bodies safely via getSafeBody', () => {
    expect(getSafeBody({ body: undefined } as Request)).toEqual({});
    expect(getSafeBody({ body: null } as Request)).toEqual({});
    expect(getSafeBody({ body: ['unexpected'] } as unknown as Request)).toEqual({});
    expect(getSafeBody({ body: { seniorName: 'Elena' } } as Request)).toEqual({
      seniorName: 'Elena',
    });
  });

  it('distinguishes recoverable Gemini errors from non-recoverable errors', () => {
    expect(isRecoverableGeminiError({ status: 503 })).toBe(true);
    expect(isRecoverableGeminiError({ status: 429 })).toBe(true);
    expect(isRecoverableGeminiError(new Error('404 NOT_FOUND model'))).toBe(true);
    expect(isRecoverableGeminiError(new Error('400 Bad Request'))).toBe(false);
    expect(isRecoverableGeminiError(new Error('535 Authentication failed'))).toBe(false);
  });

  it('detects SMTP 535 and EAUTH authentication errors for circuit breaking', () => {
    expect(
      isSmtpAuthError(new Error('Invalid login: 535 Authentication failed: Bad username / password'))
    ).toBe(true);
    expect(isSmtpAuthError({ code: 'EAUTH' })).toBe(true);
    expect(isSmtpAuthError({ responseCode: 535 })).toBe(true);
    expect(isSmtpAuthError(new Error('ETIMEDOUT socket hang up'))).toBe(false);
  });
});

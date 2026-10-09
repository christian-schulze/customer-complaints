import type { HarnessResponse } from './types.js';

export async function sendTurn(
  sessionId: string,
  message: string,
  config?: Record<string, unknown>,
): Promise<HarnessResponse> {
  const baseUrl = process.env.N8N_BASE_URL ?? 'http://localhost:5678';
  const secret = process.env.TEST_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('TEST_WEBHOOK_SECRET is not set (check .env)');
  }

  const res = await fetch(`${baseUrl}/webhook/test-harness`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      TEST_WEBHOOK_SECRET: secret,
    },
    body: JSON.stringify({ sessionId, message, ...(config ? { config } : {}) }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`harness request failed: HTTP ${res.status} - ${text}`);
  }

  let parsed: HarnessResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`harness returned non-JSON response: ${text}`);
  }
  return parsed;
}

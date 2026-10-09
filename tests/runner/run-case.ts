import { randomUUID } from 'node:crypto';
import { sendTurn } from './harness-client.js';
import type { CaseRunResult, ScriptedCase } from './types.js';

export async function runCase(testCase: ScriptedCase, runIndex: number): Promise<CaseRunResult> {
  const sessionId = `${testCase.id}__run${runIndex}__${randomUUID()}`;
  const transcript: CaseRunResult['transcript'] = [];
  let last: CaseRunResult['final'] = null;

  for (const message of testCase.turns) {
    const response = await sendTurn(sessionId, message, testCase.config);
    transcript.push({ message, response });
    last = response;
    if (response.done) break;
  }

  const ranOutOfTurns = !last?.done;

  return {
    testCase,
    sessionId,
    transcript,
    final: last,
    ranOutOfTurns,
  };
}

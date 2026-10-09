import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaseScore } from './types.js';
import { aggregate, type ConfusionMatrix, type Gate, type PerFieldAccuracy } from './score.js';

export type RecordedWrite = { id: string; referenceId: string; routes: string[] };

export type Report = {
  generatedAt: string;
  totalRuns: number;
  reviewedRuns: number;
  gate: Gate;
  perField: PerFieldAccuracy;
  confusionMatrix: ConfusionMatrix;
  perCasePassRate: Record<string, { runs: number; passed: number; passRate: number }>;
  cases: CaseScore[];
  recordedWrites: RecordedWrite[];
};

export function buildReport(scores: CaseScore[], allScores: CaseScore[]): Report {
  const { gate, perField, confusionMatrix } = aggregate(scores);

  const perCasePassRate: Report['perCasePassRate'] = {};
  for (const score of allScores) {
    perCasePassRate[score.id] ??= { runs: 0, passed: 0, passRate: 0 };
    perCasePassRate[score.id].runs += 1;
    if (score.pass) perCasePassRate[score.id].passed += 1;
  }
  for (const id of Object.keys(perCasePassRate)) {
    const entry = perCasePassRate[id];
    entry.passRate = entry.runs === 0 ? 0 : entry.passed / entry.runs;
  }

  const recordedWrites: RecordedWrite[] = allScores
    .filter((s) => s.referenceId && s.routes.length > 0)
    .map((s) => ({ id: s.id, referenceId: s.referenceId as string, routes: s.routes }));

  return {
    generatedAt: new Date().toISOString(),
    totalRuns: allScores.length,
    reviewedRuns: scores.length,
    gate,
    perField,
    confusionMatrix,
    perCasePassRate,
    cases: allScores,
    recordedWrites,
  };
}

function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push('# Test Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`**Result: ${report.gate.pass ? 'PASS' : 'FAIL'}**`);
  lines.push('');
  lines.push(`Overall accuracy (reviewed, in-scope runs): ${(report.gate.overallAccuracy * 100).toFixed(1)}%`);
  lines.push(`Reviewed runs scored: ${report.reviewedRuns} / Total runs executed: ${report.totalRuns}`);
  lines.push('');

  if (report.gate.reasons.length > 0) {
    lines.push('## Failure reasons');
    for (const reason of report.gate.reasons) lines.push(`- ${reason}`);
    lines.push('');
  }

  lines.push('## Per-field accuracy');
  lines.push('');
  lines.push('| Field | Passed | Total | Accuracy |');
  lines.push('|---|---|---|---|');
  for (const [field, stats] of Object.entries(report.perField)) {
    lines.push(`| ${field} | ${stats.passed} | ${stats.total} | ${(stats.accuracy * 100).toFixed(1)}% |`);
  }
  lines.push('');

  lines.push('## Confusion matrix (label)');
  lines.push('');
  const labels = Object.keys(report.confusionMatrix);
  lines.push(`| expected \\ actual | ${labels.join(' | ')} |`);
  lines.push(`|---|${labels.map(() => '---').join('|')}|`);
  for (const expected of labels) {
    const row = labels.map((actual) => (report.confusionMatrix as any)[expected][actual]);
    lines.push(`| ${expected} | ${row.join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Per-case pass rate');
  lines.push('');
  lines.push('| Case | Runs | Passed | Pass rate |');
  lines.push('|---|---|---|---|');
  for (const [id, stats] of Object.entries(report.perCasePassRate)) {
    lines.push(`| ${id} | ${stats.runs} | ${stats.passed} | ${(stats.passRate * 100).toFixed(0)}% |`);
  }
  lines.push('');

  const failing = report.cases.filter((c) => !c.pass);
  if (failing.length > 0) {
    lines.push('## Failing cases');
    lines.push('');
    for (const c of failing) {
      lines.push(`### ${c.id} - ${c.description}`);
      if (c.ranOutOfTurns) {
        lines.push('- Ran out of turns before `done: true`');
      } else {
        for (const [field, result] of Object.entries(c.fields)) {
          if (!result?.pass) {
            lines.push(`- **${field}**: expected \`${JSON.stringify(result?.expected)}\`, got \`${JSON.stringify(result?.actual)}\``);
          }
        }
      }
      lines.push('');
      lines.push('<details><summary>Transcript</summary>');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(c.transcript, null, 2));
      lines.push('```');
      lines.push('</details>');
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function printSummary(report: Report): void {
  console.log('');
  console.log(`Result: ${report.gate.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Overall accuracy: ${(report.gate.overallAccuracy * 100).toFixed(1)}% (${report.reviewedRuns} reviewed runs scored, ${report.totalRuns} total runs executed)`);
  if (report.gate.reasons.length > 0) {
    console.log('Reasons:');
    for (const reason of report.gate.reasons) console.log(`  - ${reason}`);
  }
  console.log('Per-field accuracy:');
  for (const [field, stats] of Object.entries(report.perField)) {
    console.log(`  ${field}: ${stats.passed}/${stats.total} (${(stats.accuracy * 100).toFixed(1)}%)`);
  }
  console.log('Confusion matrix (label):');
  for (const [expected, row] of Object.entries(report.confusionMatrix)) {
    console.log(`  expected=${expected}: ${JSON.stringify(row)}`);
  }
  const failing = report.cases.filter((c) => !c.pass);
  if (failing.length > 0) {
    console.log(`Failing cases (${failing.length}):`);
    for (const c of failing) console.log(`  - ${c.id}: ${c.ranOutOfTurns ? 'ran out of turns' : 'field mismatch'}`);
  }
  console.log('');
}

export async function writeReports(report: Report, reportsDir: string): Promise<{ jsonPath: string; mdPath: string }> {
  await mkdir(reportsDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(reportsDir, `report-${stamp}.json`);
  const mdPath = path.join(reportsDir, `report-${stamp}.md`);
  const latestJsonPath = path.join(reportsDir, 'latest.json');

  const json = JSON.stringify(report, null, 2);
  await writeFile(jsonPath, json, 'utf8');
  await writeFile(latestJsonPath, json, 'utf8');
  await writeFile(mdPath, renderMarkdown(report), 'utf8');

  return { jsonPath, mdPath };
}

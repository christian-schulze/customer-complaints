import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, PROJECT_ROOT } from './env.js';
import { parseArgs, selectCases } from './cli.js';
import { runCase } from './run-case.js';
import { scoreCase } from './score.js';
import { buildReport, printSummary, writeReports } from './report.js';
import type { ScriptedCase } from './types.js';

const CASES_DIR = path.join(PROJECT_ROOT, 'tests', 'cases', 'scripted');
const REPORTS_DIR = path.join(PROJECT_ROOT, 'tests', 'reports');

async function loadCases(): Promise<ScriptedCase[]> {
  let files: string[];
  try {
    files = await readdir(CASES_DIR);
  } catch {
    return [];
  }
  const cases: ScriptedCase[] = [];
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const content = await readFile(path.join(CASES_DIR, file), 'utf8');
    cases.push(JSON.parse(content));
  }
  return cases;
}

async function main(): Promise<void> {
  await loadEnv();

  const options = parseArgs(process.argv.slice(2));
  const allCases = await loadCases();
  const matched = selectCases(allCases, options);

  if (matched.length === 0) {
    console.error('No cases matched the given filters.');
    process.exitCode = 1;
    return;
  }

  const disabled = matched.filter((c) => c.disabled);
  const selected = matched.filter((c) => !c.disabled);

  for (const c of disabled) {
    console.log(`Skipping ${c.id}: disabled (${c.disabledReason ?? 'no reason given'})`);
  }

  if (selected.length === 0) {
    console.error('All matched cases are disabled - nothing to run.');
    process.exitCode = 1;
    return;
  }

  const allScores = [];
  for (const testCase of selected) {
    for (let run = 0; run < options.runs; run++) {
      console.log(`Running ${testCase.id} (run ${run + 1}/${options.runs})...`);
      const result = await runCase(testCase, run);
      allScores.push(scoreCase(result));
    }
  }

  const reviewedScores = allScores.filter((s) => {
    const testCase = selected.find((c) => c.id === s.id);
    return testCase?.reviewed === true;
  });

  const report = buildReport(reviewedScores, allScores);
  printSummary(report);
  const { jsonPath, mdPath } = await writeReports(report, REPORTS_DIR);
  console.log(`Report written to:\n  ${jsonPath}\n  ${mdPath}`);

  const unreviewedCount = allScores.length - reviewedScores.length;
  if (unreviewedCount > 0) {
    console.log(`(${unreviewedCount} run(s) excluded from scoring: not marked reviewed: true)`);
  }

  process.exitCode = report.gate.pass ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

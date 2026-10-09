import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, PROJECT_ROOT } from './env.js';
import type { Report } from './report.js';

const CLEANABLE_TABLES = new Set(['complaints_register', 'review_queue', 'not_legitimate_log']);

type DataTableSummary = { id: string; name: string };

async function apiFetch(apiKey: string, baseUrl: string, pathSuffix: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}/api/v1${pathSuffix}`, {
    ...init,
    headers: { ...init.headers, 'X-N8N-API-KEY': apiKey },
  });
  if (!res.ok) {
    throw new Error(`n8n API request failed: ${pathSuffix} -> HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function getTableIdsByName(apiKey: string, baseUrl: string): Promise<Map<string, string>> {
  const data = await apiFetch(apiKey, baseUrl, '/data-tables');
  const tables: DataTableSummary[] = (data as any).data ?? data;
  return new Map(tables.map((t) => [t.name, t.id]));
}

async function deleteByReferenceId(
  apiKey: string,
  baseUrl: string,
  tableId: string,
  referenceId: string,
): Promise<number> {
  const filter = JSON.stringify({
    type: 'and',
    filters: [{ columnName: 'referenceId', condition: 'eq', value: referenceId }],
  });
  const deleted = await apiFetch(
    apiKey,
    baseUrl,
    `/data-tables/${tableId}/rows/delete?filter=${encodeURIComponent(filter)}&returnData=true`,
    { method: 'DELETE' },
  );
  return Array.isArray(deleted) ? deleted.length : 0;
}

async function main(): Promise<void> {
  await loadEnv();

  const apiKey = process.env.N8N_API_KEY;
  const baseUrl = process.env.N8N_BASE_URL ?? 'http://localhost:5678';
  if (!apiKey) {
    throw new Error('N8N_API_KEY is not set (check .env)');
  }

  const reportPath = path.join(PROJECT_ROOT, 'tests', 'reports', 'latest.json');
  let report: Report;
  try {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    console.log('No tests/reports/latest.json found - nothing to clean up. Run `npm test` first.');
    return;
  }

  const tableIds = await getTableIdsByName(apiKey, baseUrl);
  let totalDeleted = 0;

  for (const write of report.recordedWrites) {
    for (const route of write.routes) {
      if (!CLEANABLE_TABLES.has(route)) continue;
      const tableId = tableIds.get(route);
      if (!tableId) {
        console.warn(`warning: table "${route}" not found on this n8n instance, skipping`);
        continue;
      }
      const count = await deleteByReferenceId(apiKey, baseUrl, tableId, write.referenceId);
      if (count > 0) {
        console.log(`deleted ${count} row(s) from ${route} (referenceId=${write.referenceId})`);
      }
      totalDeleted += count;
    }
  }

  console.log(`\nCleanup complete: ${totalDeleted} row(s) deleted from the last test run (${reportPath}).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

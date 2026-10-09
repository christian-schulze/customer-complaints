import type { ScriptedCase } from './types.js';

export type CliOptions = {
  tag?: string;
  case?: string;
  runs: number;
};

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { runs: 1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tag') {
      options.tag = argv[++i];
    } else if (arg === '--case') {
      options.case = argv[++i];
    } else if (arg === '--runs') {
      const value = Number.parseInt(argv[++i] ?? '', 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`invalid --runs value: ${argv[i]}`);
      }
      options.runs = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

export function selectCases(cases: ScriptedCase[], options: CliOptions): ScriptedCase[] {
  return cases.filter((c) => {
    if (options.case && c.id !== options.case) return false;
    if (options.tag && !c.tags.includes(options.tag)) return false;
    return true;
  });
}

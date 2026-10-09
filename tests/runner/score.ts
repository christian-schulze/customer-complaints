import type { CaseRunResult, CaseScore, ExpectedFields, FieldResult, Label } from './types.js';

function sameSet(expected: unknown, actual: unknown): boolean {
  if (!Array.isArray(expected) || !Array.isArray(actual)) return false;
  const e = [...expected].map(String).sort();
  const a = [...actual].map(String).sort();
  return e.length === a.length && e.every((v, i) => v === a[i]);
}

function normalize(value: unknown): unknown {
  return value === '' ? null : value;
}

function actualValue(key: keyof ExpectedFields, run: CaseRunResult): unknown {
  const result = run.final?.result;
  const routing = run.final?.routing;
  switch (key) {
    case 'label':
      return result ? normalize(result.label) : null;
    case 'unknownReason':
      return result ? normalize(result.unknownReason) : null;
    case 'escalate':
      return result ? result.escalate : null;
    case 'customerTone':
      return result ? normalize(result.customerTone) : null;
    case 'routes':
      return routing?.routes ?? [];
    case 'category':
      return routing ? normalize(routing.category) : null;
    case 'priority':
      return routing ? normalize(routing.priority) : null;
    default:
      return undefined;
  }
}

export function scoreCase(run: CaseRunResult): CaseScore {
  const { testCase, ranOutOfTurns, final } = run;

  if (ranOutOfTurns || !final) {
    return {
      id: testCase.id,
      description: testCase.description,
      tags: testCase.tags,
      pass: false,
      ranOutOfTurns: true,
      fields: {},
      transcript: run.transcript,
      referenceId: null,
      routes: [],
    };
  }

  const fields: CaseScore['fields'] = {};
  let allPass = true;

  for (const key of Object.keys(testCase.expected) as Array<keyof ExpectedFields>) {
    const expected = testCase.expected[key];
    const actual = actualValue(key, run);
    const pass = key === 'routes' ? sameSet(expected, actual) : expected === actual;
    const fieldResult: FieldResult = { expected, actual, pass };
    fields[key] = fieldResult;
    if (!pass) allPass = false;
  }

  return {
    id: testCase.id,
    description: testCase.description,
    tags: testCase.tags,
    pass: allPass,
    ranOutOfTurns: false,
    fields,
    transcript: run.transcript,
    referenceId: final.routing?.referenceId ?? final.result.referenceId ?? null,
    routes: final.routing?.routes ?? [],
  };
}

export type Gate = {
  pass: boolean;
  overallAccuracy: number;
  reasons: string[];
};

export type PerFieldAccuracy = Record<string, { total: number; passed: number; accuracy: number }>;

export type ConfusionMatrix = Record<Label, Record<Label, number>>;

export function aggregate(scores: CaseScore[]): {
  gate: Gate;
  perField: PerFieldAccuracy;
  confusionMatrix: ConfusionMatrix;
} {
  const inScope = scores;
  const passed = inScope.filter((s) => s.pass).length;
  const overallAccuracy = inScope.length === 0 ? 0 : passed / inScope.length;

  const perField: PerFieldAccuracy = {};
  for (const score of inScope) {
    for (const [key, field] of Object.entries(score.fields)) {
      perField[key] ??= { total: 0, passed: 0, accuracy: 0 };
      perField[key].total += 1;
      if (field?.pass) perField[key].passed += 1;
    }
  }
  for (const key of Object.keys(perField)) {
    perField[key].accuracy = perField[key].total === 0 ? 0 : perField[key].passed / perField[key].total;
  }

  const labels: Label[] = ['legitimate', 'not_legitimate', 'unknown'];
  const confusionMatrix: ConfusionMatrix = {
    legitimate: { legitimate: 0, not_legitimate: 0, unknown: 0 },
    not_legitimate: { legitimate: 0, not_legitimate: 0, unknown: 0 },
    unknown: { legitimate: 0, not_legitimate: 0, unknown: 0 },
  };
  for (const score of inScope) {
    const field = score.fields.label;
    if (!field) continue;
    const expected = field.expected as Label | undefined;
    const actual = field.actual as Label | undefined;
    if (expected && labels.includes(expected) && actual && labels.includes(actual)) {
      confusionMatrix[expected][actual] += 1;
    }
  }

  const reasons: string[] = [];

  if (inScope.length === 0) {
    reasons.push('no reviewed cases were scored - mark cases reviewed: true once approved');
  } else if (overallAccuracy < 0.9) {
    reasons.push(`overall accuracy ${(overallAccuracy * 100).toFixed(1)}% is below the 90% threshold`);
  }

  for (const score of inScope) {
    const labelField = score.fields.label;
    if (labelField && labelField.expected === 'legitimate' && labelField.actual === 'not_legitimate') {
      reasons.push(`case "${score.id}" misclassified a legitimate complaint as not_legitimate`);
    }
    const escalateField = score.fields.escalate;
    if (escalateField && escalateField.expected === true && escalateField.actual === false) {
      reasons.push(`case "${score.id}" missed an expected escalation`);
    }
  }

  return {
    gate: { pass: reasons.length === 0, overallAccuracy, reasons },
    perField,
    confusionMatrix,
  };
}

export type Label = 'legitimate' | 'not_legitimate' | 'unknown';
export type UnknownReason = 'insufficient_info' | 'ambiguous';
export type CustomerTone = 'angry' | 'distressed' | 'confused' | 'neutral';

export type ExpectedFields = {
  label?: Label;
  unknownReason?: UnknownReason | null;
  escalate?: boolean;
  customerTone?: CustomerTone;
  routes?: string[];
  category?: string;
  priority?: string;
};

export type ScriptedCase = {
  id: string;
  description: string;
  turns: string[];
  config?: Record<string, unknown>;
  expected: ExpectedFields;
  tags: string[];
  reviewed: boolean;
  /** If true, the runner skips this case entirely (no HTTP calls). Use disabledReason to explain why. */
  disabled?: boolean;
  disabledReason?: string;
};

export type ClassifierResult = {
  referenceId: string;
  label: Label | '';
  unknownReason: UnknownReason | '';
  confidence: number;
  reasons: string[];
  summary: string;
  extracted: Record<string, unknown>;
  escalate: boolean;
  escalationReason: string;
  customerTone: CustomerTone | '';
  transcript: Array<{ role: string; content: string }>;
};

export type RoutingResult = {
  referenceId: string | null;
  routes: string[];
  category: string | null;
  priority: string | null;
};

export type HarnessResponse = {
  reply: string;
  done: boolean;
  result: ClassifierResult;
  routing?: RoutingResult;
};

export type TurnRecord = {
  message: string;
  response: HarnessResponse;
};

export type CaseRunResult = {
  testCase: ScriptedCase;
  sessionId: string;
  transcript: TurnRecord[];
  final: HarnessResponse | null;
  ranOutOfTurns: boolean;
};

export type FieldResult = {
  expected: unknown;
  actual: unknown;
  pass: boolean;
};

export type CaseScore = {
  id: string;
  description: string;
  tags: string[];
  pass: boolean;
  ranOutOfTurns: boolean;
  fields: Partial<Record<keyof ExpectedFields, FieldResult>>;
  transcript: TurnRecord[];
  referenceId: string | null;
  routes: string[];
};

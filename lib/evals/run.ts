// Shape of a stored quality-check run (shared by the API and the team view).

export interface StoredRun {
  runId: string;
  label: string;
  model: string;
  engine: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  passed: number;
  slices: { slice: string; label: string; kind: string; bar: string; passed: number; total: number }[];
  sets: Record<string, { passed: number; total: number }>;
  medianLatencyMs: number;
  costPer100: number | null;
  fallbacks: number;
  failures: { id: string; set: string; slice: string; question: string; failures: string[]; route: string }[];
}

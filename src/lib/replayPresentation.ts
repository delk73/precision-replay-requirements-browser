export type ReplayPresentationBucket = { key: string; label: string; match: (id: string) => boolean };

export const VALIDATION_HLR_IDS: ReadonlySet<string> = new Set([
  'HLR-REPLAY-RUN-002',
  'HLR-REPLAY-RUN-007',
  'HLR-REPLAY-RUN-008',
]);

export const ENVELOPE_OPERATION_HLR_IDS: ReadonlySet<string> = new Set([
  'HLR-REPLAY-OPS-004',
  'HLR-REPLAY-OPS-005',
]);

export const INITIAL_MATH_EXECUTION_HLR_PATTERN = /^HLR-REPLAY-EXEC-00[1-6]$/;

// Presentation-only sidebar grouping. These rules must not affect status, trace,
// evidence, comparison, audit, or parsed requirement truth.
export const REPLAY_STORY_BUCKETS: ReplayPresentationBucket[] = [
  { key: 'system', label: 'System', match: (id) => id.startsWith('HLR-REPLAY-SYS-') },
  { key: 'schema', label: 'Schema', match: (id) => id.startsWith('HLR-REPLAY-SCHEMA-') },
  {
    key: 'canonical-input',
    label: 'Canonical Input Boundary',
    match: (id) => id.startsWith('HLR-REPLAY-ORIGIN-'),
  },
  {
    key: 'run',
    label: 'Retained Run',
    match: (id) => id.startsWith('HLR-REPLAY-RUN-') && !VALIDATION_HLR_IDS.has(id),
  },
  {
    key: 'validation',
    label: 'Validation',
    match: (id) => VALIDATION_HLR_IDS.has(id),
  },
  {
    key: 'execution-record',
    label: 'Execution Record',
    match: (id) => id.startsWith('HLR-REPLAY-EXEC-') && !INITIAL_MATH_EXECUTION_HLR_PATTERN.test(id),
  },
  { key: 'trace', label: 'Trace', match: (id) => id.startsWith('HLR-REPLAY-TRACE-') },
  { key: 'comparison', label: 'Comparison', match: (id) => id.startsWith('HLR-REPLAY-COMP-') },
  { key: 'profile', label: 'Target Profile', match: (id) => id.startsWith('HLR-REPLAY-TPROF-') },
  { key: 'timing', label: 'Timing', match: (id) => id.startsWith('HLR-REPLAY-TIME-') },
  { key: 'evaluation', label: 'Evaluation', match: (id) => id.startsWith('HLR-REPLAY-EVAL-') },
  {
    key: 'operations',
    label: 'Operations',
    match: (id) => id.startsWith('HLR-REPLAY-OPS-') && !ENVELOPE_OPERATION_HLR_IDS.has(id),
  },
  { key: 'envelope', label: 'Envelope', match: (id) => ENVELOPE_OPERATION_HLR_IDS.has(id) },
  { key: 'target', label: 'Target Agreement', match: (id) => id.startsWith('HLR-REPLAY-TGT-') },
];

export const REPLAY_PLUMBING_BUCKETS: ReplayPresentationBucket[] = [
  { key: 'parse', label: 'Parse', match: (id) => id.startsWith('HLR-REPLAY-PARSE-') },
  { key: 'projection', label: 'Projection', match: (id) => id.startsWith('HLR-REPLAY-PROJ-') },
  { key: 'checker', label: 'Checker', match: (id) => id.startsWith('HLR-REPLAY-CHECK-') },
  { key: 'initial-math', label: 'Initial Math Execution', match: (id) => INITIAL_MATH_EXECUTION_HLR_PATTERN.test(id) },
];

export const REPLAY_PRESENTATION_PROFILE = {
  storySectionLabel: 'Replay Story',
  plumbingSectionLabel: 'Existing Replay Plumbing',
  storyBuckets: REPLAY_STORY_BUCKETS,
  plumbingBuckets: REPLAY_PLUMBING_BUCKETS,
} as const;

export function replayStoryBucketForHlrId(id: string): ReplayPresentationBucket | undefined {
  return REPLAY_STORY_BUCKETS.find((bucket) => bucket.match(id));
}

export function replayPlumbingBucketForHlrId(id: string): ReplayPresentationBucket | undefined {
  return REPLAY_PLUMBING_BUCKETS.find((bucket) => bucket.match(id));
}

export function replayPresentationBucketForHlrId(id: string): ReplayPresentationBucket | undefined {
  return replayStoryBucketForHlrId(id) ?? replayPlumbingBucketForHlrId(id);
}

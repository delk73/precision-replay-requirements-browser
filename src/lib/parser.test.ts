import assert from 'node:assert/strict';
import { buildNeighborhoodGraph } from './graph';
import { normalizeStatus, parseMatrix, parseRepoSources, RawSourceFile } from './parser';
import { strongestStatus } from './status';
import { NormalizedStatus, RepoValidation, SourceFileStatus } from '../types';

const requiredFiles = [
  'docs/normative/HLR_math.md',
  'docs/normative/HLR_replay.md',
  'docs/normative/HLR_target_io.md',
  'docs/normative/HLR_witness.md',
  'docs/design/LLR_math.md',
  'docs/design/LLR_replay.md',
  'docs/design/LLR_target_io.md',
  'docs/design/LLR_witness.md',
  'docs/normative/traceability_matrix.md',
];

function statusFor(path: string, loaded = true): SourceFileStatus {
  return { path, required: true, loaded, reason: loaded ? undefined : 'not found' };
}

const validation: RepoValidation = { ok: true, repoPath: 'precision-replay', warnings: [], errors: [] };
const snapshotValidation: RepoValidation = {
  ok: true,
  repoPath: 'temp/precision-replay',
  sourceMode: 'github_snapshot',
  repoUrl: 'https://github.com/delk73/precision-replay.git',
  ref: 'main',
  resolvedSha: 'abc123',
  warnings: [],
  errors: [],
};

const files: RawSourceFile[] = [
  {
    path: 'docs/normative/HLR_math.md',
    required: true,
    content: '### HLR-MATH-001\nMath requirement.',
  },
  {
    path: 'docs/normative/HLR_replay.md',
    required: true,
    content: '### HLR-REPLAY-001\nReplay requirement.',
  },
  {
    path: 'docs/normative/HLR_target_io.md',
    required: true,
    content: '### HLR-TARGET-IO-001\nTarget IO requirement.\n\nReference: HLR-TARGET-IO-001',
  },
  {
    path: 'docs/normative/HLR_witness.md',
    required: true,
    content: '### HLR-WITNESS-001\nWitness requirement.',
  },
  {
    path: 'docs/design/LLR_math.md',
    required: true,
    content: '### LLR-MATH-001\nMath design.\nTraces-to: HLR-MATH-001',
  },
  {
    path: 'docs/design/LLR_replay.md',
    required: true,
    content: '### LLR-REPLAY-001\nReplay design.\nTraces-to: HLR-REPLAY-001',
  },
  {
    path: 'docs/design/LLR_target_io.md',
    required: true,
    content: [
      '### LLR-TARGET-IO-001',
      'Target IO design.',
      'Traces-to: HLR-TARGET-IO-001',
      '',
      '### LLR-RUNNER-WITNESS-001',
      'Runner witness design.',
      'Traces-to: HLR-WITNESS-001',
    ].join('\n'),
  },
  {
    path: 'docs/design/LLR_witness.md',
    required: true,
    content: '### LLR-WITNESS-001\nWitness design.\nTraces-to: HLR-WITNESS-001',
  },
  {
    path: 'docs/normative/traceability_matrix.md',
    required: true,
    content: [
      '| Requirement | LLR | Status | Evidence |',
      '| --- | --- | --- | --- |',
      '| HLR-TARGET-IO-001 | LLR-TARGET-IO-001 | Implemented | `src/target_io.rs` |',
      '| HLR-MATH-001 | LLR-TARGET-IO-001 | Implemented | `src/mismatch.rs` |',
      '| HLR-NOT-DEFINED-001 | LLR-REFERENCE-ONLY-001 | Pending | |',
    ].join('\n'),
  },
  {
    path: 'docs/verification/evidence.md',
    required: false,
    content: 'Verification mentions HLR-REFERENCE-ONLY-002 and `tests/target_io_test.rs`.',
  },
];

const sourceFiles = [
  ...requiredFiles.map((path) => statusFor(path)),
  { path: 'docs/verification/evidence.md', required: false, loaded: true },
];

const results = parseRepoSources({ validation, sourceFiles, files });
const snapshotResults = parseRepoSources({ validation: snapshotValidation, sourceFiles, files });

assert.ok(results.hlrs.some((hlr) => hlr.id === 'HLR-TARGET-IO-001' && hlr.sourceFile === 'docs/normative/HLR_target_io.md'));
assert.ok(results.llrs.some((llr) => llr.id === 'LLR-TARGET-IO-001' && llr.sourceFile === 'docs/design/LLR_target_io.md'));
assert.ok(results.llrs.some((llr) => llr.id === 'LLR-RUNNER-WITNESS-001' && llr.sourceFile === 'docs/design/LLR_target_io.md'));

for (const domain of ['math', 'replay', 'target_io', 'witness']) {
  assert.ok(results.sourceFiles.some((file) => file.loaded && file.path.toLowerCase().includes(domain)), `${domain} source should be loaded`);
}

assert.equal(results.audits.filter((audit) => audit.category === 'Duplicate Definition').length, 0);
assert.ok(results.audits.some((audit) => audit.category === 'Matrix Row HLR/LLR Mismatch'));
assert.ok(results.missingIds.some((missing) => missing.id === 'HLR-NOT-DEFINED-001' && missing.state === 'referenced_only'));
assert.ok(results.missingIds.some((missing) => missing.id === 'LLR-REFERENCE-ONLY-001' && missing.state === 'referenced_only'));
assert.equal(snapshotResults.validation.sourceMode, 'github_snapshot');
assert.equal(snapshotResults.validation.resolvedSha, 'abc123');

const missingSourceResults = parseRepoSources({
  validation,
  sourceFiles: sourceFiles.map((file) => file.path === 'docs/normative/HLR_witness.md' ? { ...file, loaded: false, reason: 'not found' } : file),
  files: files.filter((file) => file.path !== 'docs/normative/HLR_witness.md'),
});
assert.ok(missingSourceResults.missingIds.some((missing) => missing.id === 'HLR-WITNESS-001' && missing.state === 'source_not_loaded'));

const noExpectedSources = parseRepoSources({
  validation,
  sourceFiles: sourceFiles.filter((file) => !file.path.includes('/HLR_')),
  files: files.filter((file) => !file.path.includes('/HLR_')),
});
assert.ok(noExpectedSources.missingIds.some((missing) => missing.id === 'HLR-TARGET-IO-001' && missing.state === 'missing_from_repo'));

const statusExamples: Array<[string, NormalizedStatus]> = [
  ['Maps the fixed-point storage structure...', 'implemented'],
  ['Defines the fractional scaling constant...', 'implemented'],
  ['Establishes the current binary interoperability surface...', 'implemented'],
  ['HLR-defined / LLR, implementation, and verification pending.', 'pending'],
  ['Implementation and verification are pending.', 'pending'],
  ['Black-box covers the checked-in Rust replay checker command boundary for successful witness output.', 'tested'],
  ['Neutral traceability text with no stronger status language.', 'traced'],
  ['', 'unknown'],
  ['Evidence-boundary row: this does not claim full coverage and excludes runtime proof.', 'boundary_only'],
];

statusExamples.forEach(([text, expected]) => {
  assert.equal(normalizeStatus(text, { rowExists: expected === 'traced' }), expected);
});

const statusMatrix = parseMatrix([
  '| HLR-MATH-REP-001 | LLR-MATH-REP-001 | Maps the fixed-point storage structure. |',
  '| HLR-MATH-REP-002 | LLR-MATH-REP-002 | Defines the fractional scaling constant. |',
  '| HLR-MATH-REP-003 | LLR-MATH-REP-003 | Establishes the current binary interoperability surface. |',
  '| HLR-REPLAY-RETAINED-RUN-001 | LLR-REPLAY-011 | Implementation and verification are pending. |',
  '| HLR-REPLAY-CHECK-002 | LLR-REPLAY-CHECK-008 | Black-box covers the checked-in Rust replay checker command boundary for successful witness output. | core/examples/replay_check.rs |',
  '| HLR-TRACE-NEUTRAL-001 | LLR-TRACE-NEUTRAL-001 | Neutral traceability text. |',
  '| HLR-BOUNDARY-001 | LLR-BOUNDARY-001 | Evidence-boundary row excludes broader behavior. |',
].join('\n'), 'docs/normative/traceability_matrix.md');

assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-MATH-REP-001'))?.normalizedStatus, 'implemented');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-MATH-REP-002'))?.normalizedStatus, 'implemented');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-MATH-REP-003'))?.normalizedStatus, 'implemented');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-REPLAY-RETAINED-RUN-001'))?.normalizedStatus, 'pending');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-REPLAY-CHECK-002'))?.normalizedStatus, 'tested');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-TRACE-NEUTRAL-001'))?.normalizedStatus, 'traced');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-BOUNDARY-001'))?.normalizedStatus, 'boundary_only');

const explicitStatusMatrix = parseMatrix([
  '| HLR-STATUS-PENDING-001 | LLR-STATUS-PENDING-001 | Status: pending. Implementation exists in prose but is not credited. |',
  '| HLR-STATUS-IMPLEMENTED-001 | LLR-STATUS-IMPLEMENTED-001 | Status: implemented. |',
  '| HLR-STATUS-TESTED-001 | LLR-STATUS-TESTED-001 | Status: tested. |',
  '| HLR-STATUS-PROOF-001 | LLR-STATUS-PROOF-001 | Status: proof_partial. |',
  '| HLR-STATUS-BOUNDARY-001 | LLR-STATUS-BOUNDARY-001 | Status: boundary_only. |',
  '| HLR-STATUS-TRACED-001 | LLR-STATUS-TRACED-001 | Status: traced. |',
  '| HLR-STATUS-UNKNOWN-001 | LLR-STATUS-UNKNOWN-001 | Status: unknown. Implementation and verification are pending. |',
].join('\n'), 'docs/normative/traceability_matrix.md');

const explicitStatusFor = (id: string) => explicitStatusMatrix.rows.find((row) => row.detectedHlrIds.includes(id));
assert.equal(explicitStatusFor('HLR-STATUS-PENDING-001')?.normalizedStatus, 'pending');
assert.equal(explicitStatusFor('HLR-STATUS-PENDING-001')?.statusSource, 'explicit');
assert.equal(explicitStatusFor('HLR-STATUS-PENDING-001')?.rawStatusText, 'pending');
assert.equal(explicitStatusFor('HLR-STATUS-IMPLEMENTED-001')?.normalizedStatus, 'implemented');
assert.equal(explicitStatusFor('HLR-STATUS-TESTED-001')?.normalizedStatus, 'tested');
assert.equal(explicitStatusFor('HLR-STATUS-PROOF-001')?.normalizedStatus, 'proof_partial');
assert.equal(explicitStatusFor('HLR-STATUS-BOUNDARY-001')?.normalizedStatus, 'boundary_only');
assert.equal(explicitStatusFor('HLR-STATUS-TRACED-001')?.normalizedStatus, 'traced');
assert.equal(explicitStatusFor('HLR-STATUS-UNKNOWN-001')?.normalizedStatus, 'pending');
assert.equal(explicitStatusFor('HLR-STATUS-UNKNOWN-001')?.statusSource, 'inferred');

const statusGraph = buildNeighborhoodGraph(
  'LLR-REPLAY-CHECK-008',
  'llr',
  [{ id: 'HLR-REPLAY-CHECK-002', kind: 'hlr', title: 'Checker Parse Stage', text: '', sourceFile: 'docs/normative/HLR_replay.md', sourceLine: 1, rawSnippet: '' }],
  [{ id: 'LLR-REPLAY-CHECK-008', kind: 'llr', title: 'Checked-In Entrypoint Stable Failure Diagnostics', text: '', sourceFile: 'docs/design/LLR_replay.md', sourceLine: 1, rawSnippet: '', tracedHlrIds: ['HLR-REPLAY-CHECK-002'] }],
  statusMatrix.rows,
  { includeLlrs: true, includeRows: true, includePaths: true, pendingOnly: false, implementedOnly: false },
);
assert.ok(statusGraph.leafNodes.some((node) => node.label === 'Evidence: core/examples/replay_check.rs'));
assert.ok(!statusGraph.leafNodes.some((node) => node.label.startsWith('Status:')));

const untracedResults = parseRepoSources({
  validation,
  sourceFiles: [statusFor('docs/normative/HLR_math.md'), statusFor('docs/normative/traceability_matrix.md')],
  files: [
    { path: 'docs/normative/HLR_math.md', required: true, content: '### HLR-NO-MATRIX-001\nNo matrix row.' },
    { path: 'docs/normative/traceability_matrix.md', required: true, content: '| Requirement | LLR | Status |\n| --- | --- | --- |' },
  ],
});
const untracedStatus = untracedResults.matrixRows.find((row) => row.detectedHlrIds.includes('HLR-NO-MATRIX-001'))?.normalizedStatus || 'untraced';
assert.equal(untracedStatus, 'untraced');

const inferredStatusResults = parseRepoSources({
  validation,
  sourceFiles: [statusFor('docs/normative/HLR_math.md'), statusFor('docs/design/LLR_math.md'), statusFor('docs/normative/traceability_matrix.md')],
  files: [
    { path: 'docs/normative/HLR_math.md', required: true, content: '### HLR-MISSING-STATUS-001\nLegacy row requirement.' },
    { path: 'docs/design/LLR_math.md', required: true, content: '### LLR-MISSING-STATUS-001\nLegacy row design.\nTraces-to: HLR-MISSING-STATUS-001' },
    { path: 'docs/normative/traceability_matrix.md', required: true, content: '| HLR-MISSING-STATUS-001 | LLR-MISSING-STATUS-001 | Implementation and verification are pending. |' },
  ],
});
assert.equal(inferredStatusResults.matrixRows[0]?.normalizedStatus, 'pending');
assert.equal(inferredStatusResults.matrixRows[0]?.statusSource, 'inferred');
assert.ok(inferredStatusResults.audits.some((audit) => audit.category === 'Matrix Row Missing Explicit Status' && audit.rowNumber === 1));

assert.equal(strongestStatus(['implemented', 'tested', 'pending']), 'tested');
assert.equal(strongestStatus(['implemented', 'boundary_only', 'traced']), 'implemented');
assert.equal(strongestStatus(['unknown', 'pending']), 'pending');
assert.equal(strongestStatus([]), 'untraced');

console.log('parser tests passed');

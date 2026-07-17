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
    content: '### HLR-MATH-CORE-001\nMath requirement.',
  },
  {
    path: 'docs/normative/HLR_replay.md',
    required: true,
    content: '### HLR-REPLAY-SYS-001\nReplay requirement.',
  },
  {
    path: 'docs/normative/HLR_target_io.md',
    required: true,
    content: '### HLR-TARGET-IO-001\nTarget IO requirement.\n\nReference: HLR-TARGET-IO-001',
  },
  {
    path: 'docs/normative/HLR_witness.md',
    required: true,
    content: '### HLR-WITNESS-ENV-001\nWitness requirement.',
  },
  {
    path: 'docs/design/LLR_math.md',
    required: true,
    content: '### LLR-MATH-CORE-001\nMath design.\nTraces-to: HLR-MATH-CORE-001',
  },
  {
    path: 'docs/design/LLR_replay.md',
    required: true,
    content: '### LLR-REPLAY-SYS-001\nReplay design.\nTraces-to: HLR-REPLAY-SYS-001',
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
      'Traces-to: HLR-WITNESS-ENV-001',
    ].join('\n'),
  },
  {
    path: 'docs/design/LLR_witness.md',
    required: true,
    content: '### LLR-WITNESS-ENV-001\nWitness design.\nTraces-to: HLR-WITNESS-ENV-001',
  },
  {
    path: 'docs/normative/traceability_matrix.md',
    required: true,
    content: [
      '| Requirement | LLR | Status | Evidence |',
      '| --- | --- | --- | --- |',
      '| HLR-TARGET-IO-001 | LLR-TARGET-IO-001 | Implemented | `src/target_io.rs` |',
      '| HLR-MATH-CORE-001 | LLR-TARGET-IO-001 | Implemented | `src/mismatch.rs` |',
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
assert.ok(missingSourceResults.missingIds.some((missing) => missing.id === 'HLR-WITNESS-ENV-001' && missing.state === 'source_not_loaded'));

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

const proseOnlyMatrix = parseMatrix(
  '| HLR-defined / LLR, implementation, and verification pending. |',
  'docs/normative/traceability_matrix.md',
);
assert.equal(proseOnlyMatrix.rows.length, 0);

const canonicalBoundaryMatrix = parseMatrix([
  '| Requirement | LLR | Status |',
  '| --- | --- | --- |',
  '| **HLR-REPLAY-OPS-001** / **LLR-REPLAY-EXEC-006** | Status: traced. |',
  '| HLR-MATH-OPS-002 / LLR-WITNESS-ENV-001 | Status: traced. |',
  '| HLR-REPLAY LLR-EXEC HLR-REPLAY-SYS | Status: traced. |',
  '| `HLR-REPLAY-UNKNOWN-999`, (**LLR-MATH-OPS-999**). | Status: traced. |',
  '| XHLR-REPLAY-OPS-001 HLR-REPLAY-OPS-001X | Status: traced. |',
].join('\n'), 'docs/normative/traceability_matrix.md');

assert.deepEqual(canonicalBoundaryMatrix.rows[0]?.detectedHlrIds, ['HLR-REPLAY-OPS-001']);
assert.deepEqual(canonicalBoundaryMatrix.rows[0]?.detectedLlrIds, ['LLR-REPLAY-EXEC-006']);
assert.deepEqual(canonicalBoundaryMatrix.rows[1]?.detectedHlrIds, ['HLR-MATH-OPS-002']);
assert.deepEqual(canonicalBoundaryMatrix.rows[1]?.detectedLlrIds, ['LLR-WITNESS-ENV-001']);
assert.equal(canonicalBoundaryMatrix.rows.some((row) => row.rawText.includes('HLR-REPLAY LLR-EXEC HLR-REPLAY-SYS')), false);
assert.deepEqual(canonicalBoundaryMatrix.rows[2]?.detectedHlrIds, ['HLR-REPLAY-UNKNOWN-999']);
assert.deepEqual(canonicalBoundaryMatrix.rows[2]?.detectedLlrIds, ['LLR-MATH-OPS-999']);
assert.equal(canonicalBoundaryMatrix.rows.some((row) => row.rawText.includes('XHLR-REPLAY-OPS-001')), false);

const unknownCanonicalResults = parseRepoSources({
  validation,
  sourceFiles: [statusFor('docs/normative/HLR_math.md'), statusFor('docs/normative/traceability_matrix.md')],
  files: [
    { path: 'docs/normative/HLR_math.md', required: true, content: '### HLR-MATH-OPS-002\nKnown math requirement.' },
    { path: 'docs/normative/traceability_matrix.md', required: true, content: '| HLR-REPLAY-UNKNOWN-999 | Status: traced. |' },
  ],
});
assert.ok(unknownCanonicalResults.audits.some((audit) => audit.category === 'Matrix ID Missing Definition' && audit.hlrId === 'HLR-REPLAY-UNKNOWN-999'));

const falseDefinedResults = parseRepoSources({
  validation,
  sourceFiles: [statusFor('docs/normative/HLR_math.md'), statusFor('docs/design/LLR_math.md'), statusFor('docs/normative/traceability_matrix.md')],
  files: [
    { path: 'docs/normative/HLR_math.md', required: true, content: '### HLR-MATH-OPS-002\nKnown math requirement.' },
    { path: 'docs/design/LLR_math.md', required: true, content: '### LLR-MATH-OPS-002\nKnown math design.\nTraces-to: HLR-MATH-OPS-002' },
    {
      path: 'docs/normative/traceability_matrix.md',
      required: true,
      content: [
        '| Requirement | LLR | Status |',
        '| --- | --- | --- |',
        '| HLR-MATH-OPS-002 | LLR-MATH-OPS-002 | Status: pending. HLR-defined / LLR-defined, implementation, and verification pending. |',
        '| HLR-MATH-OPS-002 | LLR-MATH-OPS-002 | Status: boundary_only. HLR-defined boundary. |',
        '| HLR-MATH-OPS-002 | LLR-MATH-OPS-002 | Status: pending. LLR-defined verification pending. |',
      ].join('\n'),
    },
  ],
});
assert.equal(falseDefinedResults.missingIds.some((missing) => missing.id === 'HLR-DEFINED' || missing.id === 'LLR-DEFINED'), false);
assert.equal(falseDefinedResults.audits.some((audit) => audit.hlrId === 'HLR-DEFINED' || audit.llrId === 'LLR-DEFINED'), false);

const statusMatrix = parseMatrix([
  '| HLR-MATH-REP-001 | LLR-MATH-REP-001 | Maps the fixed-point storage structure. |',
  '| HLR-MATH-REP-002 | LLR-MATH-REP-002 | Defines the fractional scaling constant. |',
  '| HLR-MATH-REP-003 | LLR-MATH-REP-003 | Establishes the current binary interoperability surface. |',
  '| HLR-REPLAY-RETAINED-RUN-001 | LLR-REPLAY-RETAINED-011 | Implementation and verification are pending. |',
  '| HLR-REPLAY-CHECK-002 | LLR-REPLAY-CHECK-008 | Black-box covers the checked-in Rust replay checker command boundary for successful witness output. | core/examples/replay_check.rs |',
  '| HLR-TRACE-NEUTRAL-001 | LLR-TRACE-NEUTRAL-001 | Neutral traceability text. |',
  '| HLR-BOUNDARY-CHECK-001 | LLR-BOUNDARY-CHECK-001 | Evidence-boundary row excludes broader behavior. |',
].join('\n'), 'docs/normative/traceability_matrix.md');

assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-MATH-REP-001'))?.normalizedStatus, 'implemented');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-MATH-REP-002'))?.normalizedStatus, 'implemented');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-MATH-REP-003'))?.normalizedStatus, 'implemented');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-REPLAY-RETAINED-RUN-001'))?.normalizedStatus, 'pending');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-REPLAY-CHECK-002'))?.normalizedStatus, 'tested');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-TRACE-NEUTRAL-001'))?.normalizedStatus, 'traced');
assert.equal(statusMatrix.rows.find((row) => row.detectedHlrIds.includes('HLR-BOUNDARY-CHECK-001'))?.normalizedStatus, 'boundary_only');

const groupedHeaderMatrix = parseMatrix([
  '| Requirement | LLR | Status | Evidence |',
  '| --- | --- | --- | --- |',
  '| Replay schema ownership requirements | HLR-SCHEMA-OWNER-001, HLR-SCHEMA-OWNER-002 | LLR-SCHEMA-PARSE-001, LLR-SCHEMA-PARSE-002, LLR-SCHEMA-SERIALIZE-001 | Status: traced. The implementation block is owned by the schema code component and retains grouped coverage. | `docs/design/schema.md` |',
].join('\n'), 'docs/normative/traceability_matrix.md');

assert.equal(groupedHeaderMatrix.rows.length, 1);
const groupedHeaderRow = groupedHeaderMatrix.rows[0];
assert.deepEqual(groupedHeaderRow?.detectedHlrIds, ['HLR-SCHEMA-OWNER-001', 'HLR-SCHEMA-OWNER-002']);
assert.deepEqual(groupedHeaderRow?.detectedLlrIds, ['LLR-SCHEMA-PARSE-001', 'LLR-SCHEMA-PARSE-002', 'LLR-SCHEMA-SERIALIZE-001']);
assert.equal(groupedHeaderRow?.normalizedStatus, 'traced');
assert.equal(groupedHeaderRow?.statusSource, 'explicit');
assert.deepEqual(groupedHeaderRow?.detectedPaths, ['docs/design/schema.md']);

const groupedAuditResults = parseRepoSources({
  validation,
  sourceFiles: [statusFor('docs/normative/HLR_math.md'), statusFor('docs/design/LLR_math.md'), statusFor('docs/normative/traceability_matrix.md')],
  files: [
    {
      path: 'docs/normative/HLR_math.md',
      required: true,
      content: [
        '### HLR-TEST-A-001',
        'Requirement A.',
        '### HLR-TEST-B-001',
        'Requirement B.',
        '### HLR-TEST-C-001',
        'Requirement C.',
      ].join('\n'),
    },
    {
      path: 'docs/design/LLR_math.md',
      required: true,
      content: [
        '### LLR-TEST-ONE-001',
        'Design 1.',
        'Traces-to: HLR-TEST-A-001',
        '### LLR-TEST-TWO-001',
        'Design 2.',
        'Traces-to: HLR-TEST-B-001',
        '### LLR-TEST-THREE-001',
        'Design 3.',
        'Traces-to: HLR-TEST-A-001, HLR-TEST-C-001',
        '### LLR-TEST-FOUR-001',
        'Design 4.',
        'Traces-to: HLR-TEST-C-001',
        '### LLR-TEST-NOTRACE-001',
        'Design with no trace declaration.',
      ].join('\n'),
    },
    {
      path: 'docs/normative/traceability_matrix.md',
      required: true,
      content: [
        '| Requirement | LLR | Status |',
        '| --- | --- | --- |',
        '| HLR-TEST-A-001, HLR-TEST-B-001 | LLR-TEST-ONE-001, LLR-TEST-TWO-001 | Status: traced. |',
        '| HLR-TEST-A-001, HLR-TEST-B-001 | LLR-TEST-THREE-001 | Status: traced. |',
        '| HLR-TEST-A-001, HLR-TEST-B-001 | LLR-TEST-FOUR-001 | Status: traced. |',
        '| HLR-TEST-A-001 | LLR-TEST-MISSING-001 | Status: traced. |',
        '| HLR-TEST-A-001 | LLR-TEST-NOTRACE-001 | Status: traced. |',
        '| HLR-TEST-A-001 | | Status: traced. |',
        '| | LLR-TEST-ONE-001 | Status: traced. |',
      ].join('\n'),
    },
  ],
});

const groupedMismatches = groupedAuditResults.audits.filter((audit) => audit.category === 'Matrix Row HLR/LLR Mismatch');
assert.deepEqual(groupedMismatches.map((audit) => `${audit.rowNumber}:${audit.llrId}`), ['3:LLR-TEST-FOUR-001']);
assert.match(groupedMismatches[0]?.message ?? '', /row HLR\(s\) HLR-TEST-A-001, HLR-TEST-B-001/);
assert.match(groupedMismatches[0]?.message ?? '', /declares Traces-to HLR\(s\) HLR-TEST-C-001/);
assert.ok(groupedAuditResults.audits.some((audit) => audit.category === 'Matrix ID Missing Definition' && audit.llrId === 'LLR-TEST-MISSING-001'));
assert.ok(!groupedMismatches.some((audit) => audit.llrId === 'LLR-TEST-MISSING-001'));
assert.ok(groupedAuditResults.audits.some((audit) => audit.category === 'Matrix Row LLR Missing Trace Declaration' && audit.llrId === 'LLR-TEST-NOTRACE-001'));
assert.ok(!groupedMismatches.some((audit) => audit.llrId === 'LLR-TEST-NOTRACE-001'));

const explicitStatusMatrix = parseMatrix([
  '| HLR-STATUS-PENDING-001 | LLR-STATUS-PENDING-001 | Status: pending. Implementation exists in prose but is not credited. |',
  '| HLR-STATUS-IMPLEMENTED-001 | LLR-STATUS-IMPLEMENTED-001 | Status: implemented. Retained checker verified and tested this path. |',
  '| HLR-STATUS-TESTED-001 | LLR-STATUS-TESTED-001 | Status: tested. Bounded Kani proof exists in related prose. |',
  '| HLR-STATUS-PROOF-001 | LLR-STATUS-PROOF-001 | Status: proof_partial. Executable test coverage is mentioned in prose. |',
  '| HLR-STATUS-BOUNDARY-001 | LLR-STATUS-BOUNDARY-001 | Status: boundary_only. |',
  '| HLR-STATUS-TRACED-001 | LLR-STATUS-TRACED-001 | Status: traced. |',
  '| HLR-STATUS-UNKNOWN-001 | LLR-STATUS-UNKNOWN-001 | Status: unknown. Implementation and verification are pending. |',
].join('\n'), 'docs/normative/traceability_matrix.md');

const explicitStatusFor = (id: string) => explicitStatusMatrix.rows.find((row) => row.detectedHlrIds.includes(id));
assert.equal(explicitStatusFor('HLR-STATUS-PENDING-001')?.normalizedStatus, 'pending');
assert.equal(explicitStatusFor('HLR-STATUS-PENDING-001')?.statusSource, 'explicit');
assert.equal(explicitStatusFor('HLR-STATUS-PENDING-001')?.rawStatusText, 'pending');
assert.equal(explicitStatusFor('HLR-STATUS-IMPLEMENTED-001')?.normalizedStatus, 'implemented');
assert.equal(explicitStatusFor('HLR-STATUS-IMPLEMENTED-001')?.rawStatusText, 'implemented');
assert.equal(explicitStatusFor('HLR-STATUS-TESTED-001')?.normalizedStatus, 'tested');
assert.equal(explicitStatusFor('HLR-STATUS-TESTED-001')?.rawStatusText, 'tested');
assert.equal(explicitStatusFor('HLR-STATUS-PROOF-001')?.normalizedStatus, 'proof_partial');
assert.equal(explicitStatusFor('HLR-STATUS-PROOF-001')?.rawStatusText, 'proof_partial');
assert.equal(explicitStatusFor('HLR-STATUS-BOUNDARY-001')?.normalizedStatus, 'boundary_only');
assert.equal(explicitStatusFor('HLR-STATUS-TRACED-001')?.normalizedStatus, 'traced');
assert.equal(explicitStatusFor('HLR-STATUS-UNKNOWN-001')?.normalizedStatus, 'pending');
assert.equal(explicitStatusFor('HLR-STATUS-UNKNOWN-001')?.statusSource, 'inferred');

const statusGraph = buildNeighborhoodGraph(
  'LLR-REPLAY-CHECK-008',
  'llr',
  [{ id: 'HLR-REPLAY-CHECK-002', kind: 'hlr', title: 'Checker Parse Stage', text: '', sourceFile: 'docs/normative/HLR_replay.md', sourceLine: 1, rawSnippet: '' }],
  [{ id: 'LLR-REPLAY-CHECK-008', kind: 'llr', title: 'Checked-In Entrypoint Stable Failure Diagnostics', text: '', sourceFile: 'docs/design/LLR_replay.md', sourceLine: 1, rawSnippet: '', tracedHlrIds: ['HLR-REPLAY-CHECK-002'], hasTraceDeclaration: true }],
  statusMatrix.rows,
  { includeLlrs: true, includeRows: true, includePaths: true, pendingOnly: false, evidenceBearingOnly: false },
);
assert.ok(statusGraph.leafNodes.some((node) => node.label === 'Evidence: core/examples/replay_check.rs'));
assert.ok(!statusGraph.leafNodes.some((node) => node.label.startsWith('Status:')));

const strongestStatusGraph = buildNeighborhoodGraph(
  'HLR-STATUS-SUMMARY-001',
  'hlr',
  [{ id: 'HLR-STATUS-SUMMARY-001', kind: 'hlr', title: 'Status Summary', text: '', sourceFile: 'docs/normative/HLR_status.md', sourceLine: 1, rawSnippet: '' }],
  [],
  parseMatrix([
    '| HLR-STATUS-SUMMARY-001 | | Status: implemented. |',
    '| HLR-STATUS-SUMMARY-001 | | Status: tested. |',
  ].join('\n'), 'docs/normative/traceability_matrix.md').rows,
  { includeLlrs: true, includeRows: true, includePaths: true, pendingOnly: false, evidenceBearingOnly: false },
);
assert.equal(strongestStatusGraph.hlrNodes.find((node) => node.id === 'HLR-STATUS-SUMMARY-001')?.status, 'tested');

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

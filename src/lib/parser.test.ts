import assert from 'node:assert/strict';
import { parseRepoSources, RawSourceFile } from './parser';
import { RepoValidation, SourceFileStatus } from '../types';

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

console.log('parser tests passed');

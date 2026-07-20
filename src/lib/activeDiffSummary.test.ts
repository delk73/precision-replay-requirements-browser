import assert from 'node:assert/strict';
import { buildActiveDiffSummary } from '../App';
import { ParseResults } from '../types';

const baseResults: ParseResults = {
  validation: { ok: true, repoPath: 'precision-replay', warnings: [], errors: [] },
  sourceFiles: [],
  hlrs: [
    { id: 'HLR-A-001', kind: 'hlr', title: 'A', text: '', sourceFile: 'docs/HLR.md', sourceLine: 1, rawSnippet: '' },
    { id: 'HLR-B-001', kind: 'hlr', title: 'B', text: '', sourceFile: 'docs/HLR.md', sourceLine: 2, rawSnippet: '' },
    { id: 'HLR-C-001', kind: 'hlr', title: 'C', text: '', sourceFile: 'docs/HLR.md', sourceLine: 3, rawSnippet: '' },
  ],
  llrs: [
    { id: 'LLR-A-001', kind: 'llr', title: 'A', text: '', sourceFile: 'docs/LLR.md', sourceLine: 1, rawSnippet: '', tracedHlrIds: ['HLR-A-001'], hasTraceDeclaration: true },
    { id: 'LLR-B-001', kind: 'llr', title: 'B', text: '', sourceFile: 'docs/LLR.md', sourceLine: 2, rawSnippet: '', tracedHlrIds: ['HLR-B-001'], hasTraceDeclaration: true },
  ],
  matrixRows: [
    { rowNumber: 1, rawText: '| HLR-A-001 | LLR-A-001 | Status: traced. |', detectedHlrIds: ['HLR-A-001'], detectedLlrIds: ['LLR-A-001'], detectedPaths: [], rawStatusText: 'traced', normalizedStatus: 'traced', statusSource: 'explicit', sourceFile: 'docs/matrix.md', sourceLine: 1 },
    { rowNumber: 2, rawText: '| HLR-B-001 | Status: pending. |', detectedHlrIds: ['HLR-B-001'], detectedLlrIds: [], detectedPaths: [], rawStatusText: 'pending', normalizedStatus: 'pending', statusSource: 'explicit', sourceFile: 'docs/matrix.md', sourceLine: 2 },
    { rowNumber: 3, rawText: '| HLR-C-001 | LLR-B-001 | Status: pending. |', detectedHlrIds: ['HLR-C-001'], detectedLlrIds: ['LLR-B-001'], detectedPaths: [], rawStatusText: 'pending', normalizedStatus: 'pending', statusSource: 'explicit', sourceFile: 'docs/matrix.md', sourceLine: 3 },
  ],
  evidencePaths: [],
  referencedOnly: [],
  missingIds: [],
  audits: [],
  workPackets: [],
};

assert.equal(buildActiveDiffSummary(baseResults, 'added'), null);

const comparisonResults: ParseResults = {
  ...baseResults,
  comparison: {
    baseRef: 'main',
    compareRef: 'docs/replay-system-contract',
    deltas: [
      { id: 'HLR-A-001', kind: 'hlr', change: 'added', message: 'Added HLR.' },
      { id: 'HLR-A-001', kind: 'hlr', change: 'status_changed', message: 'Status changed for the same HLR.' },
      { id: 'LLR-A-001', kind: 'llr', change: 'added', message: 'Added LLR.' },
      { id: 'LLR-A-001', kind: 'llr', change: 'status_changed', message: 'Status changed for the same LLR.' },
      { id: '1', kind: 'matrix_row', change: 'added', message: 'Added row.' },
      { id: 'HLR-B-001', kind: 'hlr', change: 'changed', message: 'Changed HLR.' },
      { id: '2', kind: 'matrix_row', change: 'status_changed', message: 'Status changed.' },
    ],
  },
};

assert.deepEqual(buildActiveDiffSummary(comparisonResults, 'all'), { hlrCount: 2, llrCount: 1, activeDeltaCount: 7, totalDeltaCount: 7 });
assert.deepEqual(buildActiveDiffSummary(comparisonResults, 'added'), { hlrCount: 1, llrCount: 1, activeDeltaCount: 3, totalDeltaCount: 7 });
assert.deepEqual(buildActiveDiffSummary(comparisonResults, 'changed'), { hlrCount: 1, llrCount: 0, activeDeltaCount: 1, totalDeltaCount: 7 });
assert.deepEqual(buildActiveDiffSummary(comparisonResults, 'status_changed'), { hlrCount: 1, llrCount: 1, activeDeltaCount: 3, totalDeltaCount: 7 });

console.log('active diff summary tests passed');

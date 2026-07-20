import assert from 'node:assert/strict';
import { HlrObject, LlrObject, MatrixRowObject } from '../types';
import { buildNeighborhoodGraph } from './graph';

const hlrs: HlrObject[] = [
  { id: 'HLR-TEST-A-001', kind: 'hlr', title: 'Requirement A', text: '', sourceFile: 'docs/normative/HLR_test.md', sourceLine: 1, rawSnippet: '' },
  { id: 'HLR-TEST-B-001', kind: 'hlr', title: 'Requirement B', text: '', sourceFile: 'docs/normative/HLR_test.md', sourceLine: 2, rawSnippet: '' },
];

const llrs: LlrObject[] = [
  { id: 'LLR-TEST-DIRECT-001', kind: 'llr', title: 'Direct LLR', text: '', sourceFile: 'docs/design/LLR_test.md', sourceLine: 1, rawSnippet: '', tracedHlrIds: ['HLR-TEST-A-001'], hasTraceDeclaration: true },
  { id: 'LLR-TEST-SAME-ROW-001', kind: 'llr', title: 'Same Row LLR', text: '', sourceFile: 'docs/design/LLR_test.md', sourceLine: 2, rawSnippet: '', tracedHlrIds: ['HLR-TEST-B-001'], hasTraceDeclaration: true },
];

const matrixRows: MatrixRowObject[] = [
  {
    rowNumber: 1,
    rawText: '| HLR-TEST-A-001, HLR-TEST-B-001 | LLR-TEST-DIRECT-001, LLR-TEST-SAME-ROW-001 | Status: traced. |',
    detectedHlrIds: ['HLR-TEST-A-001', 'HLR-TEST-B-001'],
    detectedLlrIds: ['LLR-TEST-DIRECT-001', 'LLR-TEST-SAME-ROW-001'],
    detectedPaths: [],
    rawStatusText: 'traced',
    normalizedStatus: 'traced',
    statusSource: 'explicit',
    sourceFile: 'docs/normative/traceability_matrix.md',
    sourceLine: 3,
  },
];

const hlrGraph = buildNeighborhoodGraph(
  'HLR-TEST-A-001',
  'hlr',
  hlrs,
  llrs,
  matrixRows,
  { includeLlrs: true, includeRows: true, includePaths: true, pendingOnly: false, evidenceBearingOnly: false },
);

assert.deepEqual(hlrGraph.llrNodes.map((node) => node.id), ['LLR-TEST-DIRECT-001']);
assert.ok(!hlrGraph.llrNodes.some((node) => node.id === 'LLR-TEST-SAME-ROW-001'));
assert.deepEqual(hlrGraph.rowNodes.map((node) => node.id), ['row-1']);

const llrGraph = buildNeighborhoodGraph(
  'LLR-TEST-DIRECT-001',
  'llr',
  hlrs,
  llrs,
  matrixRows,
  { includeLlrs: true, includeRows: true, includePaths: true, pendingOnly: false, evidenceBearingOnly: false },
);

assert.deepEqual(llrGraph.hlrNodes.map((node) => node.id), ['HLR-TEST-A-001']);
assert.ok(!llrGraph.hlrNodes.some((node) => node.id === 'HLR-TEST-B-001'));
assert.deepEqual(llrGraph.rowNodes.map((node) => node.id), ['row-1']);

console.log('graph tests passed');

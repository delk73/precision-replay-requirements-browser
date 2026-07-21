import assert from 'node:assert/strict';
import { linkedRequirementsFallbackText } from '../App';
import { HlrObject, LlrObject, MatrixRowObject } from '../types';

const decomposedHlr: HlrObject = {
  id: 'HLR-LINKED-DECOMP-001',
  kind: 'hlr',
  title: 'System decomposition',
  text: '',
  sourceFile: 'docs/normative/HLR_replay.md',
  sourceLine: 1,
  rawSnippet: '',
};

const linkedLlr: LlrObject = {
  id: 'LLR-LINKED-DECOMP-001',
  kind: 'llr',
  title: 'Downstream implementation',
  text: '',
  sourceFile: 'docs/design/LLR_replay.md',
  sourceLine: 1,
  rawSnippet: '',
  tracedHlrIds: ['HLR-LINKED-DECOMP-001'],
  hasTraceDeclaration: true,
};

const decomposedRows: MatrixRowObject[] = [{
  rowNumber: 1,
  rawText: '| HLR-LINKED-DECOMP-001 | Status: decomposed. |',
  detectedHlrIds: ['HLR-LINKED-DECOMP-001'],
  detectedLlrIds: [],
  detectedPaths: [],
  rawStatusText: 'decomposed',
  normalizedStatus: 'decomposed',
  statusSource: 'explicit',
  sourceFile: 'docs/normative/traceability_matrix.md',
  sourceLine: 3,
}];

assert.equal(
  linkedRequirementsFallbackText(decomposedHlr, decomposedRows),
  'No direct LLR; decomposed through requirement families.',
);

assert.equal(
  linkedRequirementsFallbackText(linkedLlr, decomposedRows),
  'No explicit trace link found.',
);

assert.equal(
  linkedRequirementsFallbackText(decomposedHlr, [{ ...decomposedRows[0], normalizedStatus: 'pending', rawStatusText: 'pending' }]),
  'No explicit trace link found.',
);

console.log('linked requirements presentation tests passed');

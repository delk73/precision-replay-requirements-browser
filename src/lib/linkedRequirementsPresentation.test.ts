import assert from 'node:assert/strict';
import {
  LLR_DECLARATION_LINKS_EXPLANATION,
  linkedRequirementsFallbackText,
  linkedRequirementsHeading,
  llrDeclarationLinksForRequirement,
} from '../App';
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

const linkedLlrOutsideActiveRow: LlrObject = {
  id: 'LLR-LINKED-OUTSIDE-ROW-001',
  kind: 'llr',
  title: 'Downstream environment implementation',
  text: '',
  sourceFile: 'docs/design/LLR_replay.md',
  sourceLine: 12,
  rawSnippet: '',
  tracedHlrIds: ['HLR-LINKED-DECOMP-001'],
  hasTraceDeclaration: true,
};

const unrelatedLlr: LlrObject = {
  id: 'LLR-LINKED-OTHER-001',
  kind: 'llr',
  title: 'Other implementation',
  text: '',
  sourceFile: 'docs/design/LLR_replay.md',
  sourceLine: 24,
  rawSnippet: '',
  tracedHlrIds: ['HLR-LINKED-OTHER-001'],
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

const alternateRows: MatrixRowObject[] = [{
  ...decomposedRows[0],
  rowNumber: 2,
  rawText: '| HLR-LINKED-DECOMP-001 | LLR-LINKED-DECOMP-001 | Status: traced. |',
  detectedLlrIds: ['LLR-LINKED-DECOMP-001'],
  normalizedStatus: 'traced',
  rawStatusText: 'traced',
}];

assert.equal(linkedRequirementsHeading(decomposedHlr), 'LLR Declaration Links');
assert.equal(linkedRequirementsHeading(linkedLlr), 'Parent HLRs');

assert.equal(
  LLR_DECLARATION_LINKS_EXPLANATION,
  'Derived from LLR Traces to declarations. Matrix rows separately show traceability and evidence paths.',
);
assert.match(LLR_DECLARATION_LINKS_EXPLANATION, /LLR Traces to declarations/);
assert.match(LLR_DECLARATION_LINKS_EXPLANATION, /Matrix rows separately show/);

const declarationLinks = llrDeclarationLinksForRequirement(
  [linkedLlr, linkedLlrOutsideActiveRow, unrelatedLlr],
  decomposedHlr.id,
  decomposedHlr.kind,
);
assert.deepEqual(
  declarationLinks.map((llr) => llr.id),
  ['LLR-LINKED-DECOMP-001', 'LLR-LINKED-OUTSIDE-ROW-001'],
);

const linksWithDifferentActiveRows = alternateRows.map(() => llrDeclarationLinksForRequirement(
  [linkedLlr, linkedLlrOutsideActiveRow, unrelatedLlr],
  decomposedHlr.id,
  decomposedHlr.kind,
).map((llr) => llr.id));
assert.deepEqual(linksWithDifferentActiveRows, [
  ['LLR-LINKED-DECOMP-001', 'LLR-LINKED-OUTSIDE-ROW-001'],
]);

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

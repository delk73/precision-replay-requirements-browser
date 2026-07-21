import assert from 'node:assert/strict';
import { countRequirementStatuses, summarizeDelta, summarizeRequirement } from '../App';
import { ComparisonDelta, HlrObject, LlrObject, MatrixRowObject } from '../types';

const hlrs: HlrObject[] = [
  { id: 'HLR-COMPARE-TRACE-001', kind: 'hlr', title: 'Trace Only', text: '', sourceFile: 'docs/normative/HLR_compare.md', sourceLine: 1, rawSnippet: '' },
  { id: 'HLR-COMPARE-IMPL-001', kind: 'hlr', title: 'Implemented', text: '', sourceFile: 'docs/normative/HLR_compare.md', sourceLine: 2, rawSnippet: '' },
  { id: 'HLR-COMPARE-DECOMP-001', kind: 'hlr', title: 'Decomposed', text: '', sourceFile: 'docs/normative/HLR_compare.md', sourceLine: 3, rawSnippet: '' },
];

const llrs: LlrObject[] = [];

const rows: MatrixRowObject[] = [
  {
    rowNumber: 1,
    rawText: '| HLR-COMPARE-TRACE-001 | Status: traced. |',
    detectedHlrIds: ['HLR-COMPARE-TRACE-001'],
    detectedLlrIds: [],
    detectedPaths: [],
    rawStatusText: 'traced',
    normalizedStatus: 'traced',
    statusSource: 'explicit',
    sourceFile: 'docs/normative/traceability_matrix.md',
    sourceLine: 3,
  },
  {
    rowNumber: 2,
    rawText: '| HLR-COMPARE-IMPL-001 | Status: implemented. |',
    detectedHlrIds: ['HLR-COMPARE-IMPL-001'],
    detectedLlrIds: [],
    detectedPaths: ['src/compare.rs'],
    rawStatusText: 'implemented',
    normalizedStatus: 'implemented',
    statusSource: 'explicit',
    sourceFile: 'docs/normative/traceability_matrix.md',
    sourceLine: 4,
  },
  {
    rowNumber: 3,
    rawText: '| HLR-COMPARE-DECOMP-001 | Status: decomposed. |',
    detectedHlrIds: ['HLR-COMPARE-DECOMP-001'],
    detectedLlrIds: [],
    detectedPaths: ['docs/design/replay_family.md'],
    rawStatusText: 'decomposed',
    normalizedStatus: 'decomposed',
    statusSource: 'explicit',
    sourceFile: 'docs/normative/traceability_matrix.md',
    sourceLine: 5,
  },
];

const tracedDelta: ComparisonDelta = {
  id: 'HLR-COMPARE-TRACE-001',
  kind: 'hlr',
  change: 'added',
  message: 'Added trace-only requirement.',
  status: 'traced',
};

const fallbackDelta: ComparisonDelta = {
  id: 'HLR-COMPARE-MISSING-001',
  kind: 'hlr',
  change: 'added',
  message: 'Requirement is not present in the loaded branch.',
  status: 'traced',
};

const tracedSummary = summarizeDelta(tracedDelta, hlrs, llrs, rows);
assert.equal(tracedSummary.traceStatus, 'traced');
assert.equal(tracedSummary.implementationStatus, 'pending');

const fallbackSummary = summarizeDelta(fallbackDelta, hlrs, llrs, rows);
assert.equal(fallbackSummary.traceStatus, 'unknown');
assert.equal(fallbackSummary.implementationStatus, 'unknown');

const unfilteredImplemented = summarizeRequirement(hlrs[1], rows);
const decomposedSummary = summarizeRequirement(hlrs[2], rows);
assert.equal(decomposedSummary.traceStatus, 'decomposed');
assert.equal(decomposedSummary.implementationStatus, 'pending');
assert.equal(decomposedSummary.evidenceCount, 0);

const filteredImplemented = summarizeDelta(
  { id: 'HLR-COMPARE-IMPL-001', kind: 'hlr', change: 'status_changed', message: 'Status changed.', status: 'traced' },
  hlrs,
  llrs,
  rows,
);
assert.deepEqual(
  { traceStatus: filteredImplemented.traceStatus, implementationStatus: filteredImplemented.implementationStatus },
  { traceStatus: unfilteredImplemented.traceStatus, implementationStatus: unfilteredImplemented.implementationStatus },
);

const summaries = [tracedSummary, fallbackSummary, filteredImplemented, decomposedSummary];
const counts = countRequirementStatuses(summaries);
assert.equal(counts.traceStatusCounts.traced, 2);
assert.equal(counts.traceStatusCounts.decomposed, 1);
assert.equal(counts.traceStatusCounts.unknown, 1);
assert.equal(counts.implementationStatusCounts.pending, 2);
assert.equal(counts.implementationStatusCounts.implemented, 1);
assert.equal(counts.implementationStatusCounts.unknown, 1);
const implementationStatusLabels = summaries.map((summary) => String(summary.implementationStatus));
assert.ok(!implementationStatusLabels.includes('traced'));
assert.ok(!implementationStatusLabels.includes('untraced'));

console.log('comparison summary tests passed');

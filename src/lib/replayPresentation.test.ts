import assert from 'node:assert/strict';
import { buildSidebarItems } from '../App';
import { replayPresentationBucketForHlrId } from './replayPresentation';

assert.equal(replayPresentationBucketForHlrId('HLR-REPLAY-RUN-002')?.label, 'Validation');
assert.equal(replayPresentationBucketForHlrId('HLR-REPLAY-RUN-001')?.label, 'Retained Run');
assert.equal(replayPresentationBucketForHlrId('HLR-REPLAY-EXEC-001')?.label, 'Initial Math Execution');
assert.equal(replayPresentationBucketForHlrId('HLR-REPLAY-EXEC-009')?.label, 'Execution Record');
assert.equal(replayPresentationBucketForHlrId('HLR-REPLAY-OPS-002')?.label, 'Operations');
assert.equal(replayPresentationBucketForHlrId('HLR-REPLAY-OPS-004')?.label, 'Envelope');
assert.equal(replayPresentationBucketForHlrId('HLR-REPLAY-UNKNOWN-999'), undefined);

const unknownReplayItems = buildSidebarItems([
  {
    id: 'HLR-REPLAY-UNKNOWN-999',
    kind: 'hlr',
    title: 'Unknown Replay Requirement',
    sourceFile: 'docs/normative/HLR_replay.md',
    sourceLine: 1,
    traceStatus: 'unknown',
    implementationStatus: 'unknown',
    evidenceCount: 0,
    hasSameRowSupportingRelation: false,
    diffType: undefined,
  },
]);

assert.ok(unknownReplayItems.some((item) => item.type === 'bucket' && item.label === 'Replay Other'));

console.log('replay presentation tests passed');

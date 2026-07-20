import assert from 'node:assert/strict';
import { replayPresentationBucketForHlrId } from './replayPresentation';

function bucketLabelFor(id: string): string {
  return replayPresentationBucketForHlrId(id)?.label ?? 'Replay Other';
}

assert.equal(bucketLabelFor('HLR-REPLAY-RUN-002'), 'Validation');
assert.equal(bucketLabelFor('HLR-REPLAY-RUN-001'), 'Retained Run');
assert.equal(bucketLabelFor('HLR-REPLAY-EXEC-001'), 'Initial Math Execution');
assert.equal(bucketLabelFor('HLR-REPLAY-EXEC-009'), 'Execution Record');
assert.equal(bucketLabelFor('HLR-REPLAY-OPS-004'), 'Envelope');
assert.equal(bucketLabelFor('HLR-REPLAY-UNKNOWN-999'), 'Replay Other');

console.log('replay presentation tests passed');

import assert from 'node:assert/strict';
import { MatrixRowTokenCategory, tokenizeMatrixRowText } from './matrixRowHighlighting';

function categoriesFor(text: string, tokenText: string): MatrixRowTokenCategory[] {
  return tokenizeMatrixRowText(text)
    .filter((token) => token.text === tokenText)
    .map((token) => token.category);
}

function categoryFor(text: string, tokenText: string): MatrixRowTokenCategory | undefined {
  return tokenizeMatrixRowText(text).find((token) => token.text === tokenText)?.category;
}

const sampleRow = '| 48 | HLR-REPLAY-EVAL-002 | LLR-REPLAY-018 | not credited | src/replay/checker.ts | existing checker output is not credited as the broader replay-evaluation model |';
const sampleTokens = tokenizeMatrixRowText(sampleRow);

assert.equal(sampleTokens.map((token) => token.text).join(''), sampleRow);
assert.equal(categoryFor(sampleRow, 'HLR-REPLAY-EVAL-002'), 'hlrId');
assert.equal(categoryFor(sampleRow, 'LLR-REPLAY-018'), 'llrId');
assert.equal(categoryFor(sampleRow, 'src/replay/checker.ts'), 'path');
assert.ok(categoriesFor(sampleRow, '|').every((category) => category === 'separator'));
assert.ok(!sampleTokens.some((token) => token.text === '/' && token.category === 'separator'));

const multilineRow = '| 1 | HLR-REPLAY-CHECK-001 |\n| LLR-REPLAY-CHECK-003 | tools/check_replay.py |';
const multilineTokens = tokenizeMatrixRowText(multilineRow);
assert.equal(multilineTokens.map((token) => token.text).join(''), multilineRow);
assert.ok(multilineTokens.some((token) => token.text.includes('\n')));
assert.equal(categoryFor(multilineRow, 'tools/check_replay.py'), 'path');

const backtickedPathRow = '| HLR-REPLAY-CHECK-001 | `tools/check_replay.py` |';
assert.equal(categoryFor(backtickedPathRow, '`tools/check_replay.py`'), 'path');
assert.equal(tokenizeMatrixRowText(backtickedPathRow).map((token) => token.text).join(''), backtickedPathRow);

const standaloneSlashRow = 'HLR-REPLAY-CHECK-001 / LLR-REPLAY-CHECK-003';
assert.equal(categoryFor(standaloneSlashRow, '/'), 'separator');

const lowercaseIds = 'hlr-replay-check-001 llr-replay-check-003';
assert.equal(tokenizeMatrixRowText(lowercaseIds).map((token) => token.text).join(''), lowercaseIds);
assert.ok(tokenizeMatrixRowText(lowercaseIds).every((token) => token.category === 'prose'));

const deterministicA = tokenizeMatrixRowText(sampleRow);
const deterministicB = tokenizeMatrixRowText(sampleRow);
assert.deepEqual(deterministicA, deterministicB);

console.log('matrix row highlighting tests passed');

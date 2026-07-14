import assert from 'node:assert/strict';
import { tokenizeRequirementText } from './textTinting';

function categoryFor(text: string) {
  return tokenizeRequirementText(text).find((token) => token.text === text)?.category;
}

const prose = 'Replay comparison shall compare the generated execution disposition\nagainst HLR-REPLAY-COMP-001 in docs/normative/HLR_replay.md for 50ms.';
const tokens = tokenizeRequirementText(prose);

assert.equal(tokens.map((token) => token.text).join(''), prose);
assert.ok(tokens.some((token) => token.text === '\n'));
assert.equal(categoryFor('HLR-REPLAY-COMP-001'), 'identifier');
assert.equal(categoryFor('docs/normative/HLR_replay.md'), 'identifier');
assert.equal(categoryFor('50ms'), 'numberOrUnit');
assert.equal(categoryFor('shall'), 'requirementVerb');
assert.equal(categoryFor('compare'), 'actionVerb');
assert.equal(categoryFor('Replay'), 'domainNoun');
assert.equal(categoryFor('comparison'), 'domainNoun');

const codeish = tokenizeRequirementText('Call `compare_trace()` before replay output.');
assert.equal(codeish.find((token) => token.text === '`compare_trace()`')?.category, 'identifier');
assert.equal(codeish.map((token) => token.text).join(''), 'Call `compare_trace()` before replay output.');

console.log('text tinting tests passed');

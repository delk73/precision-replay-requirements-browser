export type MatrixRowTokenCategory = 'path' | 'hlrId' | 'llrId' | 'separator' | 'prose';

export interface MatrixRowToken {
  text: string;
  category: MatrixRowTokenCategory;
}

const HLR_ID_PATTERN = /^HLR-[A-Z0-9]+(?:-[A-Z0-9]+)+-\d+/;
const LLR_ID_PATTERN = /^LLR-[A-Z0-9]+(?:-[A-Z0-9]+)+-\d+/;
const PATH_PATTERN = /^(?:(?:docs|src|tests|tools|proof|proofs|artifacts|verification)\/[\w./-]*[\w-])/;

function findBacktickEnd(text: string, start: number): number {
  const end = text.indexOf('`', start + 1);
  return end === -1 ? -1 : end + 1;
}

function canEndToken(text: string, end: number): boolean {
  const next = text[end];
  return next === undefined || !/[A-Za-z0-9-]/.test(next);
}

function readProse(text: string, start: number): MatrixRowToken {
  let end = start + 1;

  while (end < text.length) {
    const remaining = text.slice(end);
    if (
      text[end] === '`' ||
      text[end] === '|' ||
      (text[end] === '/' && /\s/.test(text[end - 1] ?? '') && /\s/.test(text[end + 1] ?? '')) ||
      HLR_ID_PATTERN.test(remaining) ||
      LLR_ID_PATTERN.test(remaining) ||
      PATH_PATTERN.test(remaining)
    ) {
      break;
    }
    end += 1;
  }

  return { text: text.slice(start, end), category: 'prose' };
}

export function tokenizeMatrixRowText(text: string): MatrixRowToken[] {
  const tokens: MatrixRowToken[] = [];
  let index = 0;

  while (index < text.length) {
    const remaining = text.slice(index);

    if (text[index] === '`') {
      const end = findBacktickEnd(text, index);
      if (end !== -1) {
        tokens.push({ text: text.slice(index, end), category: 'path' });
        index = end;
        continue;
      }
    }

    const hlrMatch = remaining.match(HLR_ID_PATTERN);
    if (hlrMatch && canEndToken(text, index + hlrMatch[0].length)) {
      tokens.push({ text: hlrMatch[0], category: 'hlrId' });
      index += hlrMatch[0].length;
      continue;
    }

    const llrMatch = remaining.match(LLR_ID_PATTERN);
    if (llrMatch && canEndToken(text, index + llrMatch[0].length)) {
      tokens.push({ text: llrMatch[0], category: 'llrId' });
      index += llrMatch[0].length;
      continue;
    }

    const pathMatch = remaining.match(PATH_PATTERN);
    if (pathMatch) {
      tokens.push({ text: pathMatch[0], category: 'path' });
      index += pathMatch[0].length;
      continue;
    }

    if (text[index] === '|') {
      tokens.push({ text: text[index], category: 'separator' });
      index += 1;
      continue;
    }

    if (text[index] === '/' && /\s/.test(text[index - 1] ?? '') && /\s/.test(text[index + 1] ?? '')) {
      tokens.push({ text: text[index], category: 'separator' });
      index += 1;
      continue;
    }

    const prose = readProse(text, index);
    tokens.push(prose);
    index += prose.text.length;
  }

  return tokens;
}

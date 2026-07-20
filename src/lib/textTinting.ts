export type TextTintCategory =
  | 'identifier'
  | 'numberOrUnit'
  | 'requirementVerb'
  | 'actionVerb'
  | 'domainNoun';

export interface TextTintToken {
  text: string;
  category?: TextTintCategory;
  className?: string;
}

interface TextTintRule {
  category: TextTintCategory;
  className: string;
  terms?: string[];
  patterns?: RegExp[];
}

export const TEXT_TINTING_RULES: TextTintRule[] = [
  {
    category: 'identifier',
    className: 'text-cyan-300/80',
    patterns: [
      /^(?:HLR|LLR)-[A-Z0-9-]+$/i,
      /^`[^`]+`$/,
      /^(?:docs|src|tests|tools|proofs?|artifacts|verification)\/[\w./-]+$/i,
      /^[A-Za-z_][\w.:-]*\([^)]*\)$/,
      /^[A-Za-z_][\w.-]*::[A-Za-z_][\w.-]*$/,
      /^[A-Za-z_][\w.-]*\.[A-Za-z0-9]+$/,
    ],
  },
  {
    category: 'numberOrUnit',
    className: 'text-sky-300/75',
    patterns: [/^\d+(?:\.\d+)?(?:%|ms|s|hz|khz|mhz|gb|mb|kb|bit|bits|byte|bytes)?$/i],
  },
  {
    category: 'requirementVerb',
    className: 'text-blue-200/85 font-medium',
    terms: ['shall', 'must', 'should', 'may'],
  },
  {
    category: 'actionVerb',
    className: 'text-indigo-200/75',
    terms: ['compare', 'retain', 'generate', 'verify', 'reject', 'parse', 'load', 'resolve', 'ingest', 'output', 'persist', 'prevent'],
  },
  {
    category: 'domainNoun',
    className: 'text-teal-200/70',
    terms: ['replay', 'trace', 'witness', 'schema', 'matrix', 'branch', 'reference', 'requirement', 'comparison'],
  },
];

const TOKEN_PATTERN =
  /(\s+|`[^`]*`|(?:HLR|LLR)-[A-Z0-9-]+|(?:docs|src|tests|tools|proofs?|artifacts|verification)\/[\w./-]+|\d+(?:\.\d+)?(?:%|ms|s|hz|khz|mhz|gb|mb|kb|bit|bits|byte|bytes)?|[A-Za-z_][\w.:-]*(?:\([^)]*\))?|[^\s])/gi;

export function tokenizeRequirementText(text: string): TextTintToken[] {
  const tokens = text.match(TOKEN_PATTERN) || [];
  return tokens.map((token) => {
    if (/^\s+$/.test(token)) return { text: token };

    const rule = TEXT_TINTING_RULES.find((candidate) => {
      if (candidate.patterns?.some((pattern) => pattern.test(token))) return true;
      return candidate.terms?.some((term) => term.toLowerCase() === token.toLowerCase()) || false;
    });

    return rule
      ? { text: token, category: rule.category, className: rule.className }
      : { text: token };
  });
}

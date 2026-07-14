import { 
  HlrObject, 
  LlrObject, 
  MatrixRowObject, 
  EvidencePathObject, 
  AuditItem, 
  NormalizedStatus, 
  ParseResults 
} from '../types';

// Helper to extract IDs matching a pattern
export function extractIds(text: string, pattern: RegExp): string[] {
  const matches = text.match(new RegExp(pattern.source, 'gi'));
  if (!matches) return [];
  return Array.from(new Set(matches.map(id => id.toUpperCase())));
}

// Normalize status conservatively using exact requirements
export function normalizeStatus(rawStatusText: string): NormalizedStatus {
  const clean = rawStatusText.trim().toLowerCase();
  if (!clean) return 'unknown';

  if (clean === 'implemented' || clean === 'implemented and tested' || clean.includes('implemented')) {
    return 'implemented';
  }
  if (
    clean === 'verified' || 
    clean === 'verification passed' || 
    clean === 'retained proof' || 
    clean === 'retained check' || 
    clean === 'retained artifact pass' ||
    clean.includes('verification passed') ||
    clean.includes('retained proof') ||
    clean.includes('retained check') ||
    clean.includes('retained artifact pass')
  ) {
    return 'verified';
  }
  if (clean === 'pending' || clean.includes('pending')) {
    return 'pending';
  }
  if (
    clean === 'partial' || 
    clean === 'bounded' || 
    clean === 'limited' || 
    clean === 'initial-only' ||
    clean.includes('partial') ||
    clean.includes('bounded') ||
    clean.includes('limited') ||
    clean.includes('initial-only')
  ) {
    return 'partial';
  }
  if (
    clean === 'boundary' || 
    clean === 'not credited' || 
    clean === 'does not implement' || 
    clean === 'excludes' || 
    clean === 'remains separate' ||
    clean.includes('boundary') ||
    clean.includes('not credited') ||
    clean.includes('does not implement') ||
    clean.includes('excludes') ||
    clean.includes('remains separate')
  ) {
    return 'boundary';
  }

  return 'unknown';
}

// Guess the type of an evidence path
export function guessPathType(pathText: string): EvidencePathObject['typeGuess'] {
  const clean = pathText.toLowerCase().trim();
  if (clean.includes('test') || clean.includes('spec') || clean.endsWith('_test.py') || clean.endsWith('test.ts')) {
    return 'test';
  }
  if (clean.includes('proof') || clean.endsWith('.retained_proof')) {
    return 'proof';
  }
  if (clean.includes('artifact') || clean.includes('build') || clean.endsWith('.hex') || clean.endsWith('.bin')) {
    return 'artifact';
  }
  if (clean.includes('tool') || clean.includes('config')) {
    return 'tool';
  }
  if (
    clean.endsWith('.ts') || 
    clean.endsWith('.tsx') || 
    clean.endsWith('.py') || 
    clean.endsWith('.c') || 
    clean.endsWith('.cpp') || 
    clean.endsWith('.h') || 
    clean.endsWith('.go')
  ) {
    return 'code';
  }
  return 'unknown';
}

// Parsing HLR definitions from markdown
export function parseHlrs(rawMarkdown: string, filename: string): HlrObject[] {
  const lines = rawMarkdown.split('\n');
  const hlrs: HlrObject[] = [];
  let currentHlr: Partial<HlrObject> | null = null;
  let blockLines: string[] = [];

  const hlrHeadingRegex = /^###\s+(HLR-[A-Z0-9-]+):?(.*)$/i;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const match = line.match(hlrHeadingRegex);

    if (match) {
      // Save preceding HLR if existing
      if (currentHlr && currentHlr.id) {
        currentHlr.text = blockLines.join('\n').trim();
        currentHlr.rawSnippet = `### ${currentHlr.id}:\n` + currentHlr.text;
        hlrs.push(currentHlr as HlrObject);
      }

      const id = match[1].toUpperCase();
      const title = match[2].trim();

      currentHlr = {
        id,
        title: title || `Requirement ${id}`,
        text: '',
        sourceFile: filename,
        sourceLine: lineNum,
        rawSnippet: ''
      };
      blockLines = [];
    } else if (currentHlr) {
      blockLines.push(line);
    }
  });

  // Save the last HLR
  if (currentHlr && currentHlr.id) {
    currentHlr.text = blockLines.join('\n').trim();
    currentHlr.rawSnippet = `### ${currentHlr.id}:\n` + currentHlr.text;
    hlrs.push(currentHlr as HlrObject);
  }

  return hlrs;
}

// Parsing LLR definitions from markdown
export function parseLlrs(rawMarkdown: string, filename: string): LlrObject[] {
  const lines = rawMarkdown.split('\n');
  const llrs: LlrObject[] = [];
  let currentLlr: Partial<LlrObject> | null = null;
  let blockLines: string[] = [];

  const llrHeadingRegex = /^###\s+(LLR-[A-Z0-9-]+):?(.*)$/i;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const match = line.match(llrHeadingRegex);

    if (match) {
      if (currentLlr && currentLlr.id) {
        currentLlr.text = blockLines.join('\n').trim();
        currentLlr.rawSnippet = `### ${currentLlr.id}:\n` + currentLlr.text;
        // Parse Traces-to from block lines
        const tracesLine = blockLines.find(l => /traces[- ]to:/i.test(l));
        currentLlr.tracedHlrIds = tracesLine ? extractIds(tracesLine, /HLR-[A-Z0-9-]+/g) : [];
        llrs.push(currentLlr as LlrObject);
      }

      const id = match[1].toUpperCase();
      const title = match[2].trim();

      currentLlr = {
        id,
        title: title || `Requirement ${id}`,
        text: '',
        sourceFile: filename,
        sourceLine: lineNum,
        tracedHlrIds: [],
        rawSnippet: ''
      };
      blockLines = [];
    } else if (currentLlr) {
      blockLines.push(line);
    }
  });

  if (currentLlr && currentLlr.id) {
    currentLlr.text = blockLines.join('\n').trim();
    currentLlr.rawSnippet = `### ${currentLlr.id}:\n` + currentLlr.text;
    const tracesLine = blockLines.find(l => /traces[- ]to:/i.test(l));
    currentLlr.tracedHlrIds = tracesLine ? extractIds(tracesLine, /HLR-[A-Z0-9-]+/g) : [];
    llrs.push(currentLlr as LlrObject);
  }

  return llrs;
}

// Parsing traceability matrix
export function parseMatrix(rawText: string, filename: string): { rows: MatrixRowObject[], evidence: EvidencePathObject[] } {
  const lines = rawText.split('\n');
  const rows: MatrixRowObject[] = [];
  const evidence: EvidencePathObject[] = [];

  // Check if it's the markdown version of the traceability matrix
  const isMarkdownFormat = filename.endsWith('.md') || rawText.includes('## 1.') || rawText.includes('| Requirement |') || rawText.includes('Row-Class Policy') || rawText.includes('| Code Component');

  if (isMarkdownFormat) {
    let rowNumber = 1;

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('---') || trimmed.includes(':---')) {
        return;
      }

      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const parts = trimmed.split('|').map(p => p.trim());
        // Clean up empty outer elements from split
        if (parts[0] === '') parts.shift();
        if (parts[parts.length - 1] === '') parts.pop();

        // Check if this is a header row
        const isHeader = parts.some(p => p.toLowerCase().includes('requirement') || p.toLowerCase().includes('code component') || p.toLowerCase().includes('implementation block'));
        if (isHeader) {
          return; // Skip headers
        }

        const rowText = parts.join(' | ');
        const detectedHlrIds = extractIds(rowText, /HLR-[A-Z0-9-]+/g);
        const detectedLlrIds = extractIds(rowText, /LLR-[A-Z0-9-]+/g);

        // If no requirements are mentioned, it's not a traceability row
        if (detectedHlrIds.length === 0 && detectedLlrIds.length === 0) {
          return;
        }

        // Status determination
        let rawStatusText = 'implemented';
        let normalizedStatus: NormalizedStatus = 'implemented';

        // Search for status indicators in the row
        const statusString = rowText.toLowerCase();
        if (statusString.includes('remain pending') || statusString.includes('is pending') || statusString.includes('are pending') || statusString.includes('pending verification')) {
          rawStatusText = 'pending';
          normalizedStatus = 'pending';
        } else if (statusString.includes('retained artifact pass') || statusString.includes('validation passed') || statusString.includes('proof coverage') || statusString.includes('active kani coverage') || statusString.includes('verification passed') || statusString.includes('verified')) {
          rawStatusText = 'verified';
          normalizedStatus = 'verified';
        } else if (statusString.includes('partial') || statusString.includes('bounded') || statusString.includes('limited')) {
          rawStatusText = 'partial';
          normalizedStatus = 'partial';
        } else if (statusString.includes('boundary') || statusString.includes('excludes') || statusString.includes('remains separate')) {
          rawStatusText = 'boundary';
          normalizedStatus = 'boundary';
        } else if (statusString.includes('implemented') || statusString.includes('traced')) {
          rawStatusText = 'implemented';
          normalizedStatus = 'implemented';
        }

        // Path extraction: find any backticked paths or text resembling paths
        const detectedPaths: string[] = [];
        
        // 1. Find backticked file paths
        const backtickRegex = /`([^`]+)`/g;
        let match;
        while ((match = backtickRegex.exec(rowText)) !== null) {
          const path = match[1].trim();
          // Check if it looks like a path (has slash, dot, or matches typical project folders)
          if (
            path.includes('/') || 
            path.endsWith('.rs') || 
            path.endsWith('.py') || 
            path.endsWith('.md') || 
            path.endsWith('.toml') || 
            path.endsWith('.txt') ||
            path === 'I64F64' ||
            path.includes('test')
          ) {
            const cleanPath = path.replace(/<br>/g, '').trim();
            if (cleanPath && !detectedPaths.includes(cleanPath)) {
              detectedPaths.push(cleanPath);
            }
          }
        }

        // 2. Fallback: search for typical file patterns
        const pathPattern = /\b(core|bsp|runners|tools|tests|artifacts|verification|docs)\/[\w.-]+(?:\/[\w.-]+)*\b/g;
        while ((match = pathPattern.exec(rowText)) !== null) {
          const path = match[0].trim();
          if (!detectedPaths.includes(path)) {
            detectedPaths.push(path);
          }
        }

        rows.push({
          rowNumber,
          rawText: line,
          detectedHlrIds,
          detectedLlrIds,
          detectedPaths,
          rawStatusText,
          normalizedStatus,
          sourceLine: lineNum
        });

        detectedPaths.forEach(path => {
          evidence.push({
            pathText: path,
            rowSource: rowNumber,
            typeGuess: guessPathType(path)
          });
        });

        rowNumber++;
      }
    });

    return { rows, evidence };
  }

  // Legacy/fallback text parser
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    if (!line.trim() || line.startsWith('Row |') || line.startsWith('---')) {
      return; // Skip headers/empty
    }

    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 4) return; // Malformed row

    const rowNumStr = parts[0];
    const rowNumber = parseInt(rowNumStr, 10);
    if (isNaN(rowNumber)) return; // Not a valid row line

    const rawHlrCell = parts[1] || '';
    const rawLlrCell = parts[2] || '';
    const rawStatusText = parts[3] || '';
    const rawPathsCell = parts[4] || '';

    const detectedHlrIds = extractIds(rawHlrCell, /HLR-[A-Z0-9-]+/g);
    const detectedLlrIds = extractIds(rawLlrCell, /LLR-[A-Z0-9-]+/g);
    
    // Split paths by comma
    const detectedPaths = rawPathsCell
      ? rawPathsCell.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    const normalizedStatus = normalizeStatus(rawStatusText);

    rows.push({
      rowNumber,
      rawText: line,
      detectedHlrIds,
      detectedLlrIds,
      detectedPaths,
      rawStatusText,
      normalizedStatus,
      sourceLine: lineNum
    });

    detectedPaths.forEach(path => {
      evidence.push({
        pathText: path,
        rowSource: rowNumber,
        typeGuess: guessPathType(path)
      });
    });
  });

  return { rows, evidence };
}

// Perform Audit and return audit findings
export function auditRepository(
  hlrs: HlrObject[],
  llrs: LlrObject[],
  matrixRows: MatrixRowObject[],
  isBranchCompared: boolean = false, // branch comparison toggle
  comparedResults?: { hlrs: HlrObject[], matrixRows: MatrixRowObject[] }
): AuditItem[] {
  const audits: AuditItem[] = [];

  // Helper maps for O(1) lookup
  const hlrDefMap = new Map<string, HlrObject>();
  const llrDefMap = new Map<string, LlrObject>();

  // Check HLR duplicates
  const seenHlrIds = new Set<string>();
  hlrs.forEach(h => {
    if (seenHlrIds.has(h.id)) {
      audits.push({
        id: `dup-hlr-${h.id}`,
        severity: 'Error',
        message: `Duplicate HLR definition heading: '${h.id}' is defined multiple times in sources`,
        category: 'Duplicate Definition',
        hlrId: h.id
      });
    } else {
      seenHlrIds.add(h.id);
      hlrDefMap.set(h.id, h);
    }
  });

  // Check LLR duplicates
  const seenLlrIds = new Set<string>();
  llrs.forEach(l => {
    if (seenLlrIds.has(l.id)) {
      audits.push({
        id: `dup-llr-${l.id}`,
        severity: 'Error',
        message: `Duplicate LLR definition heading: '${l.id}' is defined multiple times in sources`,
        category: 'Duplicate Definition',
        llrId: l.id
      });
    } else {
      seenLlrIds.add(l.id);
      llrDefMap.set(l.id, l);
    }
  });

  // Check LLR traces to missing HLR definitions
  llrs.forEach(l => {
    l.tracedHlrIds.forEach(hlrId => {
      if (!hlrDefMap.has(hlrId)) {
        audits.push({
          id: `missing-hlr-trace-${l.id}-${hlrId}`,
          severity: 'Error',
          message: `LLR definition '${l.id}' traces to missing HLR definition: '${hlrId}'`,
          category: 'Missing Definition',
          llrId: l.id,
          hlrId
        });
      }
    });
  });

  // Tracking which HLRs/LLRs are in the matrix
  const matrixReferencedHlrs = new Set<string>();
  const matrixReferencedLlrs = new Set<string>();

  matrixRows.forEach(row => {
    // 1. Check matrix row references missing HLR definitions
    row.detectedHlrIds.forEach(hlrId => {
      matrixReferencedHlrs.add(hlrId);
      if (!hlrDefMap.has(hlrId)) {
        audits.push({
          id: `matrix-missing-hlr-${row.rowNumber}-${hlrId}`,
          severity: 'Error',
          message: `Traceability matrix row ${row.rowNumber} references missing HLR definition: '${hlrId}'`,
          category: 'Missing Definition',
          rowNumber: row.rowNumber,
          hlrId
        });
      }
    });

    // 2. Check matrix row references missing LLR definitions when row claims LLR mapping
    row.detectedLlrIds.forEach(llrId => {
      matrixReferencedLlrs.add(llrId);
      if (!llrDefMap.has(llrId)) {
        audits.push({
          id: `matrix-missing-llr-${row.rowNumber}-${llrId}`,
          severity: 'Error',
          message: `Traceability matrix row ${row.rowNumber} references missing LLR definition: '${llrId}'`,
          category: 'Missing Definition',
          rowNumber: row.rowNumber,
          llrId
        });
      }
    });

    // Warnings:
    // 3. Implemented row has no implementation/evidence path
    const isImplementedOrVerified = row.normalizedStatus === 'implemented' || row.normalizedStatus === 'verified';
    if (isImplementedOrVerified && row.detectedPaths.length === 0) {
      audits.push({
        id: `warn-empty-path-${row.rowNumber}`,
        severity: 'Warning',
        message: `Traceability matrix row ${row.rowNumber} is marked as '${row.rawStatusText}' but has no implementation or evidence paths`,
        category: 'Missing Evidence',
        rowNumber: row.rowNumber
      });
    }

    // 4. Pending row names implementation-looking code/evidence paths
    if (row.normalizedStatus === 'pending' && row.detectedPaths.length > 0) {
      const codeOrTestPaths = row.detectedPaths.filter(p => {
        const guess = guessPathType(p);
        return guess === 'code' || guess === 'test' || guess === 'proof';
      });
      if (codeOrTestPaths.length > 0) {
        audits.push({
          id: `warn-pending-with-code-${row.rowNumber}`,
          severity: 'Warning',
          message: `Traceability matrix row ${row.rowNumber} is marked as pending but references implementation files: '${codeOrTestPaths.join(', ')}'`,
          category: 'Code in Pending',
          rowNumber: row.rowNumber
        });
      }
    }
  });

  // 5. Check HLR defined but missing from matrix
  hlrs.forEach(h => {
    if (!matrixReferencedHlrs.has(h.id)) {
      audits.push({
        id: `missing-hlr-matrix-${h.id}`,
        severity: 'Error',
        message: `HLR definition '${h.id}' is defined in source but is missing from traceability matrix`,
        category: 'Missing Matrix Row',
        hlrId: h.id
      });
    }
  });

  // 6. Check LLR defined but missing from matrix
  llrs.forEach(l => {
    if (!matrixReferencedLlrs.has(l.id)) {
      audits.push({
        id: `missing-llr-matrix-${l.id}`,
        severity: 'Error',
        message: `LLR definition '${l.id}' is defined in source but is missing from traceability matrix`,
        category: 'Missing Matrix Row',
        llrId: l.id
      });
    }
  });

  // Warnings for branch comparison
  if (isBranchCompared && comparedResults) {
    const originalHlrMap = new Map(comparedResults.hlrs.map(h => [h.id, h]));
    const originalMatrixMap = new Map(comparedResults.matrixRows.map(r => [r.rowNumber, r]));

    // Check requirement text changed across compared branch
    hlrs.forEach(h => {
      const orig = originalHlrMap.get(h.id);
      if (orig && orig.text !== h.text) {
        audits.push({
          id: `warn-branch-text-${h.id}`,
          severity: 'Warning',
          message: `Requirement text for HLR '${h.id}' changed across compared branches`,
          category: 'Branch Delta',
          hlrId: h.id
        });
      }
    });

    // Check matrix status changed across compared branch
    matrixRows.forEach(row => {
      const orig = originalMatrixMap.get(row.rowNumber);
      if (orig && orig.rawStatusText !== row.rawStatusText) {
        audits.push({
          id: `warn-branch-status-${row.rowNumber}`,
          severity: 'Warning',
          message: `Matrix status for Row ${row.rowNumber} (HLR: ${row.detectedHlrIds.join(', ')}) changed from '${orig.rawStatusText}' to '${row.rawStatusText}' across branches`,
          category: 'Branch Delta',
          rowNumber: row.rowNumber
        });
      }
    });
  }

  return audits;
}

// Master parsing function for all files
export function parseAllFiles(
  hlrText: string,
  llrText: string,
  matrixText: string,
  isBranchCompared: boolean = false,
  comparedHlrText?: string,
  comparedMatrixText?: string
): ParseResults {
  const isLiveMarkdown = matrixText.includes('| Code Component') || matrixText.includes('Row-Class Policy') || matrixText.includes('| Requirement');
  const matrixFilename = isLiveMarkdown ? 'docs/normative/traceability_matrix.md' : 'src/fixtures/traceability_matrix.txt';
  const hlrFilename = isLiveMarkdown ? 'docs/normative/HLR_math.md' : 'src/fixtures/hlr_definitions.md';
  const llrFilename = isLiveMarkdown ? 'docs/design/LLR_math.md' : 'src/fixtures/llr_definitions.md';

  const hlrs = parseHlrs(hlrText, hlrFilename);
  const llrs = parseLlrs(llrText, llrFilename);
  const { rows: matrixRows, evidence: evidencePaths } = parseMatrix(matrixText, matrixFilename);

  let comparedResults: { hlrs: HlrObject[], matrixRows: MatrixRowObject[] } | undefined;

  if (isBranchCompared && comparedHlrText && comparedMatrixText) {
    const compHlrs = parseHlrs(comparedHlrText, hlrFilename);
    const { rows: compRows } = parseMatrix(comparedMatrixText, matrixFilename);
    comparedResults = { hlrs: compHlrs, matrixRows: compRows };
  }

  const audits = auditRepository(hlrs, llrs, matrixRows, isBranchCompared, comparedResults);

  return {
    hlrs,
    llrs,
    matrixRows,
    evidencePaths,
    audits
  };
}

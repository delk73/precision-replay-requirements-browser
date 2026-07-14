import {
  AuditItem,
  EvidencePathObject,
  HlrObject,
  LlrObject,
  MatrixRowObject,
  MissingId,
  MissingState,
  NormalizedStatus,
  ParseResults,
  ReferencedOnlyId,
  RepoValidation,
  SourceFileStatus,
  WorkPacket,
} from '../types';

export interface RawSourceFile {
  path: string;
  content: string;
  required: boolean;
}

export interface ParseInput {
  validation: RepoValidation;
  sourceFiles: SourceFileStatus[];
  files: RawSourceFile[];
}

const HLR_ID = /HLR-[A-Z0-9-]+/gi;
const LLR_ID = /LLR-[A-Z0-9-]+/gi;
const HLR_HEADING = /^(#{2,6})\s+(HLR-[A-Z0-9-]+):?\s*(.*)$/i;
const LLR_HEADING = /^(#{2,6})\s+(LLR-[A-Z0-9-]+):?\s*(.*)$/i;

export function extractIds(text: string, pattern: RegExp): string[] {
  const matches = text.match(new RegExp(pattern.source, 'gi'));
  if (!matches) return [];
  return Array.from(new Set(matches.map((id) => id.toUpperCase())));
}

export function normalizeStatus(rawStatusText: string, options: { rowExists?: boolean } = {}): NormalizedStatus {
  const clean = rawStatusText.trim().toLowerCase();
  if (!clean) return 'unknown';

  if (clean.includes('pending') || clean.includes('remain pending') || clean.includes('deferred')) {
    return 'pending';
  }

  if (
    clean.includes('tested') ||
    clean.includes('covers') ||
    clean.includes('black-box covers') ||
    clean.includes('pytest') ||
    clean.includes('cargo test') ||
    clean.includes('verified') ||
    clean.includes('verification passed') ||
    clean.includes('retained check') ||
    clean.includes('artifact pass')
  ) {
    return 'tested';
  }

  if (
    clean.includes('active partial proof') ||
    clean.includes('bounded') ||
    clean.includes('svcp') ||
    clean.includes('kani') ||
    clean.includes('partial') ||
    clean.includes('limited') ||
    clean.includes('initial-only')
  ) {
    return 'proof_partial';
  }

  if (
    clean.includes('evidence-boundary') ||
    clean.includes('boundary') ||
    clean.includes('does not claim') ||
    clean.includes('excludes') ||
    clean.includes('not credited') ||
    clean.includes('does not implement') ||
    clean.includes('remains separate')
  ) {
    return 'boundary_only';
  }

  if (
    clean.includes('implemented') ||
    clean.includes('implementation-traced') ||
    clean.includes('provides') ||
    clean.includes('defines') ||
    clean.includes('maps') ||
    clean.includes('establishes') ||
    clean.includes('traced')
  ) {
    return 'implemented';
  }

  return options.rowExists ? 'traced' : 'unknown';
}

export function guessPathType(pathText: string): EvidencePathObject['typeGuess'] {
  const clean = pathText.toLowerCase().trim();
  if (clean.includes('test') || clean.includes('spec') || clean.endsWith('_test.py') || clean.endsWith('test.ts')) return 'test';
  if (clean.includes('proof') || clean.includes('.retained_proof')) return 'proof';
  if (clean.includes('artifact') || clean.includes('build') || clean.endsWith('.hex') || clean.endsWith('.bin')) return 'artifact';
  if (clean.includes('tool') || clean.includes('config')) return 'tool';
  if (/\.(ts|tsx|py|rs|c|cpp|h|go|toml|md|json|yaml|yml)$/i.test(clean)) return 'code';
  return 'unknown';
}

function parseDefinitions(file: RawSourceFile, kind: 'hlr'): HlrObject[];
function parseDefinitions(file: RawSourceFile, kind: 'llr'): LlrObject[];
function parseDefinitions(file: RawSourceFile, kind: 'hlr' | 'llr'): Array<HlrObject | LlrObject> {
  const lines = file.content.split(/\r?\n/);
  const heading = kind === 'hlr' ? HLR_HEADING : LLR_HEADING;
  const results: Array<HlrObject | LlrObject> = [];
  let current:
    | {
        id: string;
        kind: 'hlr' | 'llr';
        title: string;
        sourceFile: string;
        sourceLine: number;
      }
    | null = null;
  let blockLines: string[] = [];

  const flush = () => {
    if (!current?.id) return;
    const text = blockLines.join('\n').trim();
    const rawSnippet = `${kind === 'hlr' ? 'HLR' : 'LLR'} ${current.id}\n${text}`.trim();
    if (kind === 'hlr') {
      results.push({ ...current, kind: 'hlr', text, rawSnippet });
    } else {
      const traces = blockLines
        .filter((line) => /traces[- ]to\s*:/i.test(line))
        .flatMap((line) => extractIds(line, HLR_ID));
      results.push({ ...current, kind: 'llr', text, rawSnippet, tracedHlrIds: Array.from(new Set(traces)) });
    }
  };

  lines.forEach((line, index) => {
    const match = line.match(heading);
    if (!match) {
      if (current) blockLines.push(line);
      return;
    }

    flush();
    const id = match[2].toUpperCase();
    current = {
      id,
      kind,
      title: match[3].trim() || id,
      sourceFile: file.path,
      sourceLine: index + 1,
    };
    blockLines = [];
  });

  flush();
  return results;
}

export function parseMatrix(rawText: string, filename: string): { rows: MatrixRowObject[]; evidence: EvidencePathObject[] } {
  const rows: MatrixRowObject[] = [];
  const evidence: EvidencePathObject[] = [];
  const lines = rawText.split(/\r?\n/);
  let rowNumber = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.includes(':---')) return;

    const cells = trimmed.split('|').map((part) => part.trim()).filter(Boolean);
    const lowerCells = cells.map((part) => part.toLowerCase());
    if (lowerCells.some((part) => part.includes('requirement') || part.includes('code component') || part.includes('implementation block'))) return;

    const rowText = cells.join(' | ');
    const detectedHlrIds = extractIds(rowText, HLR_ID);
    const detectedLlrIds = extractIds(rowText, LLR_ID);
    if (detectedHlrIds.length === 0 && detectedLlrIds.length === 0) return;

    const detectedPaths = extractPaths(rowText);
    const statusCell = cells.find((cell) => {
      const status = normalizeStatus(cell);
      return status !== 'unknown' && status !== 'traced';
    }) ?? '';
    const normalizedStatus = statusCell ? normalizeStatus(statusCell) : normalizeStatus(rowText, { rowExists: true });

    rows.push({
      rowNumber,
      rawText: line,
      detectedHlrIds,
      detectedLlrIds,
      detectedPaths,
      rawStatusText: statusCell || normalizedStatus,
      normalizedStatus,
      sourceFile: filename,
      sourceLine: index + 1,
    });

    detectedPaths.forEach((pathText) => {
      evidence.push({ pathText, rowSource: rowNumber, sourceFile: filename, typeGuess: guessPathType(pathText) });
    });
    rowNumber += 1;
  });

  return { rows, evidence };
}

function extractPaths(text: string): string[] {
  const paths = new Set<string>();
  const backtickRegex = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = backtickRegex.exec(text))) {
    const value = match[1].replace(/<br\s*\/?>/gi, ' ').trim();
    if (looksLikePath(value)) paths.add(value);
  }

  const pathPattern = /\b(?:src|core|bsp|runners|tools|tests|artifacts|verification|docs|proofs?)\/[\w./-]+\b/g;
  while ((match = pathPattern.exec(text))) {
    paths.add(match[0]);
  }
  return Array.from(paths);
}

function looksLikePath(value: string): boolean {
  return value.includes('/') || /\.(rs|ts|tsx|py|c|cpp|h|md|toml|json|yaml|yml|txt|bin|hex)$/i.test(value);
}

function referencesFromFiles(files: RawSourceFile[]): Map<string, Set<string>> {
  const references = new Map<string, Set<string>>();
  const add = (id: string, source: string) => {
    const upper = id.toUpperCase();
    if (!references.has(upper)) references.set(upper, new Set());
    references.get(upper)!.add(source);
  };

  files.forEach((file) => {
    extractIds(file.content, HLR_ID).forEach((id) => add(id, file.path));
    extractIds(file.content, LLR_ID).forEach((id) => add(id, file.path));
  });
  return references;
}

function classifyMissing(id: string, sources: string[], sourceFiles: SourceFileStatus[]): MissingState {
  const family = id.startsWith('HLR-') ? 'HLR' : 'LLR';
  const requiredForFamily = sourceFiles.filter((file) => file.required && file.path.includes(`/${family}_`));
  if (requiredForFamily.length === 0) return 'missing_from_repo';
  if (requiredForFamily.some((file) => !file.loaded)) return 'source_not_loaded';
  if (sources.length > 0) return 'referenced_only';
  return 'missing_from_repo';
}

export function parseRepoSources(input: ParseInput): ParseResults {
  const hlrFiles = input.files.filter((file) => /(^|\/)HLR_[^/]+\.md$/i.test(file.path));
  const llrFiles = input.files.filter((file) => /(^|\/)LLR_[^/]+\.md$/i.test(file.path));
  const matrixFile = input.files.find((file) => file.path === 'docs/normative/traceability_matrix.md');
  const verificationFiles = input.files.filter((file) => /^docs\/verification\/.*\.md$/i.test(file.path));

  const hlrs = hlrFiles.flatMap((file) => parseDefinitions(file, 'hlr'));
  const llrs = llrFiles.flatMap((file) => parseDefinitions(file, 'llr'));
  const { rows: matrixRows, evidence: matrixEvidence } = matrixFile
    ? parseMatrix(matrixFile.content, matrixFile.path)
    : { rows: [], evidence: [] };

  const verificationEvidence = verificationFiles.flatMap((file) =>
    extractPaths(file.content).map((pathText, index) => ({
      pathText,
      rowSource: -(index + 1),
      sourceFile: file.path,
      typeGuess: guessPathType(pathText),
    })),
  );

  const referencedOnly = buildReferencedOnly(input.files, hlrs, llrs);
  const missingIds = buildMissingIds(input.sourceFiles, hlrs, llrs, matrixRows, referencedOnly);
  const audits = auditRepository(input.sourceFiles, hlrs, llrs, matrixRows, missingIds);
  const workPackets = buildWorkPackets(hlrs, llrs, matrixRows, audits);

  return {
    validation: input.validation,
    sourceFiles: input.sourceFiles,
    hlrs,
    llrs,
    matrixRows,
    evidencePaths: [...matrixEvidence, ...verificationEvidence],
    referencedOnly,
    missingIds,
    audits,
    workPackets,
  };
}

function buildReferencedOnly(files: RawSourceFile[], hlrs: HlrObject[], llrs: LlrObject[]): ReferencedOnlyId[] {
  const defined = new Set([...hlrs.map((h) => h.id), ...llrs.map((l) => l.id)]);
  const references = referencesFromFiles(files);
  return Array.from(references.entries())
    .filter(([id]) => !defined.has(id))
    .map(([id, sources]) => ({ id, kind: id.startsWith('HLR-') ? 'hlr' : 'llr', sources: Array.from(sources).sort() }));
}

function buildMissingIds(
  sourceFiles: SourceFileStatus[],
  hlrs: HlrObject[],
  llrs: LlrObject[],
  matrixRows: MatrixRowObject[],
  referencedOnly: ReferencedOnlyId[],
): MissingId[] {
  const hlrDefMap = new Map(hlrs.map((h) => [h.id, h]));
  const llrDefMap = new Map(llrs.map((l) => [l.id, l]));
  const missing = new Map<string, MissingId>();
  const add = (id: string, kind: 'hlr' | 'llr', sources: string[]) => {
    const state = classifyMissing(id, sources, sourceFiles);
    missing.set(`${kind}:${id}`, { id, kind, state, sources: Array.from(new Set(sources)).sort() });
  };

  llrs.forEach((llr) => {
    llr.tracedHlrIds.forEach((id) => {
      if (!hlrDefMap.has(id)) add(id, 'hlr', [llr.sourceFile]);
    });
  });

  matrixRows.forEach((row) => {
    row.detectedHlrIds.forEach((id) => {
      if (!hlrDefMap.has(id)) add(id, 'hlr', [row.sourceFile]);
    });
    row.detectedLlrIds.forEach((id) => {
      if (!llrDefMap.has(id)) add(id, 'llr', [row.sourceFile]);
    });
  });

  referencedOnly.forEach((ref) => add(ref.id, ref.kind, ref.sources));
  return Array.from(missing.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function auditRepository(
  sourceFiles: SourceFileStatus[],
  hlrs: HlrObject[],
  llrs: LlrObject[],
  matrixRows: MatrixRowObject[],
  missingIds: MissingId[],
): AuditItem[] {
  const audits: AuditItem[] = [];
  const hlrDefMap = new Map<string, HlrObject>();
  const llrDefMap = new Map<string, LlrObject>();

  sourceFiles.filter((file) => file.required && !file.loaded).forEach((file) => {
    audits.push({
      id: `source-not-loaded-${file.path}`,
      severity: 'Error',
      category: 'Definition Source Not Loaded',
      sourceFile: file.path,
      message: `Required source file was not loaded: ${file.path}`,
      missingState: 'source_not_loaded',
    });
  });

  for (const h of hlrs) {
    if (hlrDefMap.has(h.id)) {
      audits.push({ id: `duplicate-hlr-${h.id}-${h.sourceFile}-${h.sourceLine}`, severity: 'Error', category: 'Duplicate Definition', hlrId: h.id, sourceFile: h.sourceFile, message: `Duplicate HLR definition: ${h.id}` });
    } else {
      hlrDefMap.set(h.id, h);
    }
  }

  for (const l of llrs) {
    if (llrDefMap.has(l.id)) {
      audits.push({ id: `duplicate-llr-${l.id}-${l.sourceFile}-${l.sourceLine}`, severity: 'Error', category: 'Duplicate Definition', llrId: l.id, sourceFile: l.sourceFile, message: `Duplicate LLR definition: ${l.id}` });
    } else {
      llrDefMap.set(l.id, l);
    }
  }

  missingIds.forEach((missing) => {
    audits.push({
      id: `missing-${missing.kind}-${missing.id}-${missing.state}`,
      severity: missing.state === 'source_not_loaded' ? 'Error' : 'Warning',
      category: missing.state === 'referenced_only' ? 'Unresolved Reference' : 'Missing Definition',
      hlrId: missing.kind === 'hlr' ? missing.id : undefined,
      llrId: missing.kind === 'llr' ? missing.id : undefined,
      missingState: missing.state,
      message: `${missing.id} is ${missing.state.replaceAll('_', ' ')}.`,
    });
  });

  llrs.forEach((llr) => {
    llr.tracedHlrIds.forEach((hlrId) => {
      if (!hlrDefMap.has(hlrId)) {
        audits.push({ id: `llr-traces-missing-hlr-${llr.id}-${hlrId}`, severity: 'Error', category: 'LLR Trace Missing HLR', llrId: llr.id, hlrId, sourceFile: llr.sourceFile, message: `${llr.id} traces to missing HLR ${hlrId}.` });
      }
    });
  });

  const matrixHlrs = new Set<string>();
  const matrixLlrs = new Set<string>();
  matrixRows.forEach((row) => {
    row.detectedHlrIds.forEach((id) => matrixHlrs.add(id));
    row.detectedLlrIds.forEach((id) => matrixLlrs.add(id));

    row.detectedHlrIds.forEach((hlrId) => {
      if (!hlrDefMap.has(hlrId)) {
        audits.push({ id: `matrix-hlr-missing-${row.rowNumber}-${hlrId}`, severity: 'Error', category: 'Matrix ID Missing Definition', rowNumber: row.rowNumber, hlrId, sourceFile: row.sourceFile, message: `Matrix row ${row.rowNumber} references missing HLR definition ${hlrId}.` });
      }
    });
    row.detectedLlrIds.forEach((llrId) => {
      const llr = llrDefMap.get(llrId);
      if (!llr) {
        audits.push({ id: `matrix-llr-missing-${row.rowNumber}-${llrId}`, severity: 'Error', category: 'Matrix ID Missing Definition', rowNumber: row.rowNumber, llrId, sourceFile: row.sourceFile, message: `Matrix row ${row.rowNumber} references missing LLR definition ${llrId}.` });
        return;
      }
      const missingHlrLinks = row.detectedHlrIds.filter((hlrId) => !llr.tracedHlrIds.includes(hlrId));
      if (row.detectedHlrIds.length > 0 && missingHlrLinks.length > 0) {
        audits.push({ id: `matrix-mismatch-${row.rowNumber}-${llrId}`, severity: 'Warning', category: 'Matrix Row HLR/LLR Mismatch', rowNumber: row.rowNumber, hlrId: missingHlrLinks[0], llrId, sourceFile: row.sourceFile, message: `Matrix row ${row.rowNumber} maps ${llrId} to HLR(s) not declared in its Traces-to line: ${missingHlrLinks.join(', ')}.` });
      }
    });
  });

  hlrs.forEach((hlr) => {
    if (!matrixHlrs.has(hlr.id)) {
      audits.push({ id: `hlr-missing-from-matrix-${hlr.id}`, severity: 'Warning', category: 'Definition Missing From Matrix', hlrId: hlr.id, sourceFile: hlr.sourceFile, message: `${hlr.id} is defined but missing from the traceability matrix.` });
    }
  });
  llrs.forEach((llr) => {
    if (!matrixLlrs.has(llr.id)) {
      audits.push({ id: `llr-missing-from-matrix-${llr.id}`, severity: 'Warning', category: 'Definition Missing From Matrix', llrId: llr.id, sourceFile: llr.sourceFile, message: `${llr.id} is defined but missing from the traceability matrix.` });
    }
  });

  return dedupeAudits(audits);
}

function dedupeAudits(audits: AuditItem[]): AuditItem[] {
  const seen = new Set<string>();
  return audits.filter((audit) => {
    if (seen.has(audit.id)) return false;
    seen.add(audit.id);
    return true;
  });
}

function buildWorkPackets(hlrs: HlrObject[], llrs: LlrObject[], matrixRows: MatrixRowObject[], audits: AuditItem[]): WorkPacket[] {
  const domains = new Map<string, WorkPacket>();
  const ensure = (domain: string): WorkPacket => {
    const id = domain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
    if (!domains.has(id)) domains.set(id, { id, label: labelDomain(domain), hlrIds: [], llrIds: [], rowNumbers: [], auditIds: [] });
    return domains.get(id)!;
  };

  hlrs.forEach((hlr) => ensure(domainFor(hlr.id, hlr.sourceFile)).hlrIds.push(hlr.id));
  llrs.forEach((llr) => ensure(domainFor(llr.id, llr.sourceFile)).llrIds.push(llr.id));
  matrixRows.forEach((row) => {
    const domain = domainFor(row.detectedHlrIds[0] || row.detectedLlrIds[0] || 'GENERAL', row.sourceFile);
    ensure(domain).rowNumbers.push(row.rowNumber);
  });
  audits.forEach((audit) => {
    const domain = domainFor(audit.hlrId || audit.llrId || audit.sourceFile || 'GENERAL', audit.sourceFile || '');
    ensure(domain).auditIds.push(audit.id);
  });

  return Array.from(domains.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function domainFor(idOrPath: string, sourceFile: string): string {
  const text = `${idOrPath} ${sourceFile}`.toLowerCase();
  if (text.includes('target-io') || text.includes('target_io')) return 'target IO';
  if (text.includes('witness')) return 'witness';
  if (text.includes('math')) return 'math';
  if (text.includes('replay')) return 'replay';
  if (text.includes('runner')) return 'runner';
  return 'general';
}

function labelDomain(domain: string): string {
  if (domain.toLowerCase() === 'target io') return 'Target IO';
  return domain.slice(0, 1).toUpperCase() + domain.slice(1);
}

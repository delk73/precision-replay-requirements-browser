export type NormalizedStatus =
  | 'implemented'
  | 'tested'
  | 'pending'
  | 'proof_partial'
  | 'boundary_only'
  | 'decomposed'
  | 'traced'
  | 'unknown'
  | 'untraced';

export type RequirementKind = 'hlr' | 'llr';

export type MissingState = 'missing_from_repo' | 'source_not_loaded' | 'referenced_only';

export interface SourceFileStatus {
  path: string;
  required: boolean;
  loaded: boolean;
  reason?: string;
}

export interface RepoValidation {
  ok: boolean;
  repoPath: string;
  sourceMode?: 'local' | 'github_snapshot';
  repoUrl?: string;
  ref?: string;
  resolvedSha?: string;
  warnings: string[];
  errors: string[];
}

export interface RequirementDefinition {
  id: string;
  kind: RequirementKind;
  title: string;
  text: string;
  sourceFile: string;
  sourceLine: number;
  rawSnippet: string;
}

export interface HlrObject extends RequirementDefinition {
  kind: 'hlr';
}

export interface LlrObject extends RequirementDefinition {
  kind: 'llr';
  tracedHlrIds: string[];
  hasTraceDeclaration: boolean;
}

export interface MatrixRowObject {
  rowNumber: number;
  rawText: string;
  detectedHlrIds: string[];
  detectedLlrIds: string[];
  detectedPaths: string[];
  rawStatusText: string;
  normalizedStatus: NormalizedStatus;
  statusSource: 'explicit' | 'inferred';
  sourceFile: string;
  sourceLine: number;
}

export interface EvidencePathObject {
  pathText: string;
  rowSource: number;
  sourceFile: string;
  typeGuess: 'code' | 'test' | 'proof' | 'artifact' | 'tool' | 'unknown';
}

export interface ReferencedOnlyId {
  id: string;
  kind: RequirementKind;
  sources: string[];
}

export interface MissingId {
  id: string;
  kind: RequirementKind;
  state: MissingState;
  sources: string[];
}

export interface AuditItem {
  id: string;
  severity: 'Error' | 'Warning' | 'Info';
  message: string;
  category: string;
  missingState?: MissingState;
  sourceFile?: string;
  rowNumber?: number;
  hlrId?: string;
  llrId?: string;
}

export interface WorkPacket {
  id: string;
  label: string;
  hlrIds: string[];
  llrIds: string[];
  rowNumbers: number[];
  auditIds: string[];
}

export interface ComparisonDelta {
  id: string;
  kind: RequirementKind | 'matrix_row';
  change: 'added' | 'removed' | 'changed' | 'status_changed';
  message: string;
  title?: string;
  sourceFile?: string;
  status?: NormalizedStatus;
  text?: string;
  sourceLine?: number;
  rawSnippet?: string;
}

export interface ComparisonSummary {
  baseRef: string;
  baseSha?: string;
  compareRef: string;
  compareSha?: string;
  deltas: ComparisonDelta[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'hlr' | 'llr' | 'matrix_row' | 'evidence_path' | 'status';
  status?: NormalizedStatus;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ParseResults {
  validation: RepoValidation;
  sourceFiles: SourceFileStatus[];
  hlrs: HlrObject[];
  llrs: LlrObject[];
  matrixRows: MatrixRowObject[];
  evidencePaths: EvidencePathObject[];
  referencedOnly: ReferencedOnlyId[];
  missingIds: MissingId[];
  audits: AuditItem[];
  workPackets: WorkPacket[];
  comparison?: ComparisonSummary;
}

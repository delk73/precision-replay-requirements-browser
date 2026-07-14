export type NormalizedStatus = 'implemented' | 'verified' | 'pending' | 'partial' | 'boundary' | 'unknown';

export interface HlrObject {
  id: string;
  title: string;
  text: string;
  sourceFile: string;
  sourceLine: number;
  rawSnippet: string;
}

export interface LlrObject {
  id: string;
  title: string;
  text: string;
  sourceFile: string;
  sourceLine: number;
  tracedHlrIds: string[];
  rawSnippet: string;
}

export interface MatrixRowObject {
  rowNumber: number;
  rawText: string;
  detectedHlrIds: string[];
  detectedLlrIds: string[];
  detectedPaths: string[];
  rawStatusText: string;
  normalizedStatus: NormalizedStatus;
  sourceLine: number;
}

export interface EvidencePathObject {
  pathText: string;
  rowSource: number; // reference to rowNumber
  typeGuess: 'code' | 'test' | 'proof' | 'artifact' | 'tool' | 'unknown';
}

export interface AuditItem {
  id: string;
  severity: 'Error' | 'Warning' | 'Info'; // Calm labels as requested
  message: string;
  category: string;
  rowNumber?: number;
  hlrId?: string;
  llrId?: string;
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
  hlrs: HlrObject[];
  llrs: LlrObject[];
  matrixRows: MatrixRowObject[];
  evidencePaths: EvidencePathObject[];
  audits: AuditItem[];
}

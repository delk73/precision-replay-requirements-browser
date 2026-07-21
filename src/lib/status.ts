import { MatrixRowObject, NormalizedStatus } from '../types';

export type DerivedTraceStatus = 'traced' | 'decomposed' | 'pending' | 'untraced' | 'unknown';
export type DerivedImplementationStatus = 'tested' | 'proof_partial' | 'implemented' | 'boundary_only' | 'pending' | 'unknown';

const STATUS_STRENGTH: Record<NormalizedStatus, number> = {
  tested: 8,
  proof_partial: 7,
  implemented: 6,
  boundary_only: 5,
  decomposed: 4,
  traced: 4,
  pending: 3,
  unknown: 2,
  untraced: 1,
};

export function strongestStatus(statuses: NormalizedStatus[]): NormalizedStatus {
  return statuses.reduce<NormalizedStatus>((strongest, status) => (
    STATUS_STRENGTH[status] > STATUS_STRENGTH[strongest] ? status : strongest
  ), 'untraced');
}

const TRACE_BEARING_STATUSES = new Set<NormalizedStatus>([
  'traced',
  'implemented',
  'tested',
  'proof_partial',
  'boundary_only',
]);

const IMPLEMENTATION_STATUS_ORDER: Exclude<DerivedImplementationStatus, 'unknown'>[] = [
  'tested',
  'proof_partial',
  'implemented',
  'boundary_only',
];

export function deriveTraceStatus(rows: MatrixRowObject[]): DerivedTraceStatus {
  if (rows.length === 0) return 'untraced';
  if (rows.some((row) => row.normalizedStatus === 'decomposed')) return 'decomposed';
  return rows.some((row) => TRACE_BEARING_STATUSES.has(row.normalizedStatus)) ? 'traced' : 'pending';
}

export function deriveImplementationStatus(rows: MatrixRowObject[]): DerivedImplementationStatus {
  const statuses = new Set(rows.map((row) => row.normalizedStatus));
  return IMPLEMENTATION_STATUS_ORDER.find((status) => statuses.has(status)) ?? 'pending';
}

import { NormalizedStatus } from '../types';

const STATUS_STRENGTH: Record<NormalizedStatus, number> = {
  tested: 8,
  proof_partial: 7,
  implemented: 6,
  boundary_only: 5,
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

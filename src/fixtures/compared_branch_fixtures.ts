// Fixture data representing the compared branch (e.g., 'retained-run-baseline')
// to demonstrate HLR text changes and Matrix status changes in the Audit/Comparison browser.

export const COMPARED_HLR_MD = `# High-Level Requirements (HLR) Definition Source - Baseline Branch

### HLR-REPLAY-ORIGIN-001:
The system shall establish a validated replay starting point from a captured, retained run state.

### HLR-REPLAY-ORIGIN-002:
The system shall ingest and parse direct saved math replay inputs for the mathematical core without ADC or signals conversion.

### HLR-REPLAY-ORIGIN-003:
The system shall align the mathematical core initial state with the saved state vectors.

### HLR-REPLAY-ORIGIN-004:
The system shall verify the checksum of the imported origin run-state block.

### HLR-REPLAY-ORIGIN-005:
The system shall reject mathematical replay initializations if any coordinate exceeds safety bounds.

### HLR-REPLAY-ORIGIN-006:
The system shall report origin initialization failure to the operators within 50ms.

### HLR-REPLAY-ORIGIN-007:
The system shall cache the last-retained origin block to accelerate sequential runs.

### HLR-REPLAY-ORIGIN-008:
The system shall validate origin timestamp alignment with external GPS telemetry logs.

### HLR-REPLAY-ORIGIN-009:
The system shall serialize the verified origin vector to local persistent storage.

### HLR-REPLAY-ORIGIN-010:
The system shall provide a baseline zero-state initialization fallback when a retained state is absent.

### HLR-REPLAY-PROJ-001:
The system shall project raw ADC counts into real physical variables using calibrated coefficient maps.

### HLR-REPLAY-PROJ-002:
The system shall apply a low-pass filter to raw-ADC-derived replay input to eliminate jitter.

### HLR-REPLAY-PROJ-003:
The system shall flag any ADC voltage values that drop below the operational threshold.

### HLR-REPLAY-PROJ-004:
The system shall sample the raw-ADC input stream at exactly 400Hz.

### HLR-REPLAY-PROJ-005:
The system shall map raw ADC channels directly to primary sensor projection metrics.

### HLR-REPLAY-PROJ-006:
The system shall compensate for temperature-induced drift in raw-ADC-derived inputs.
`;

export const COMPARED_MATRIX_TXT = `Row | HLR IDs | LLR IDs | Raw Status Text | Evidence Paths | Notes
1 | HLR-REPLAY-ORIGIN-001 | LLR-REPLAY-001 | pending | | Initial setup is pending review
2 | HLR-REPLAY-ORIGIN-002 | LLR-REPLAY-002 | Implemented and tested | src/replay/saved_math.ts, tests/math_test.py | Implemented and tested only for direct saved math replay input
3 | HLR-REPLAY-ORIGIN-003 | LLR-REPLAY-001 | Implemented | src/replay/vectors.ts | Origin boundary condition alignment verified
4 | HLR-REPLAY-ORIGIN-004 | LLR-REPLAY-003 | verified | src/replay/checksum.ts, proof/checksum.retained_proof | XOR checksum verify passed
5 | HLR-REPLAY-ORIGIN-005 | LLR-REPLAY-004 | Implemented and tested | src/replay/safety_bounds.ts | Coordinates bounds check
6 | HLR-REPLAY-ORIGIN-006 | | Implemented | src/replay/error_reporter.ts | Command error alert logs
7 | HLR-REPLAY-ORIGIN-007 | | verification passed | proofs/cache_proof.txt | Caching is verified
8 | HLR-REPLAY-ORIGIN-008 | | verified | src/replay/gps_sync.ts | Telemetry time check
9 | HLR-REPLAY-ORIGIN-009 | LLR-REPLAY-005 | Implemented | src/replay/serializer.ts | State vector serialization
10 | HLR-REPLAY-ORIGIN-010 | | Implemented | src/replay/fallback.ts | Zero-state fallback loader
11 | HLR-REPLAY-PROJ-001 | LLR-REPLAY-006 | pending | | Applies only to raw-ADC-derived replay input
12 | HLR-REPLAY-PROJ-002 | LLR-REPLAY-007 | pending | | Applies only to raw-ADC-derived replay input
13 | HLR-REPLAY-PROJ-003 | LLR-REPLAY-008 | Implemented and tested | src/replay/voltage_guard.ts | Applies only to raw-ADC-derived replay input
14 | HLR-REPLAY-PROJ-004 | LLR-REPLAY-009 | Implemented | src/replay/scheduler.ts | Applies only to raw-ADC-derived replay input
15 | HLR-REPLAY-PROJ-005 | LLR-REPLAY-006 | Implemented | src/replay/adc_map.ts | Applies only to raw-ADC-derived replay input
16 | HLR-REPLAY-PROJ-006 | LLR-REPLAY-010 | Implemented and tested | src/replay/temp_comp.ts | Applies only to raw-ADC-derived replay input
`;

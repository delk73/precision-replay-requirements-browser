// Source-backed raw text declarations representing the files
// This is used for type-safe and compilation-proof loading of source code in the UI.

export const HLR_SOURCE_MD = `# High-Level Requirements (HLR) Definition Source

### HLR-REPLAY-ORIGIN-001:
The system shall establish a validated replay starting point from a captured, retained run state.

### HLR-REPLAY-ORIGIN-002:
The system shall ingest and parse direct saved math replay inputs for the mathematical core without ADC translation.

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

### HLR-REPLAY-PROJ-007:
The system shall log raw ADC values before and after projection operations.

### HLR-REPLAY-PROJ-008:
The system shall execute projection transforms in constant time.

### HLR-REPLAY-PROJ-009:
The system shall verify projection coefficient integrity during hardware boot.

### HLR-REPLAY-PROJ-010:
The system shall fall back to default projection scales on map corruption.

### HLR-REPLAY-PROJ-011:
The system shall detect out-of-order raw ADC samples and discard them.

### HLR-REPLAY-PROJ-012:
The system shall track projection pipeline latencies and report averages.

### HLR-REPLAY-RETAINED-RUN-001:
The system shall allow operators to query the index of all available retained-run records.

### HLR-REPLAY-RETAINED-RUN-002:
The system shall mount and verify the retained-run storage volume on startup.

### HLR-REPLAY-RETAINED-RUN-003:
The system shall prevent rewriting of historical retained-run records during replay.

### HLR-REPLAY-RETAINED-RUN-004:
The system shall compute differential changes between successive retained runs.

### HLR-REPLAY-RETAINED-RUN-005:
The system shall flag corrupted partitions within the retained-run storage block.

### HLR-REPLAY-RETAINED-RUN-006:
The system shall copy selected retained-run blocks to diagnostic partitions.

### HLR-REPLAY-RETAINED-RUN-007:
The system shall enforce cryptographic verification of retained-run signatures.

### HLR-REPLAY-RETAINED-RUN-008:
The system shall format diagnostic outputs using the unified retained-run metadata schema.

### HLR-REPLAY-TRACE-001:
The system shall generate traceability records mapping runtime steps to historical ticks.

### HLR-REPLAY-TRACE-002:
The system shall output a continuous replay-trace stream during evaluation.

### HLR-REPLAY-TRACE-003:
The system shall persist trace metadata inside the output file header.

### HLR-REPLAY-TRACE-004:
The system shall resolve trace coordinate mismatches via interpolation.

### HLR-REPLAY-TRACE-005:
The system shall index runtime trace events for fast interactive lookup.

### HLR-REPLAY-TRACE-006:
The system shall compress tracing structures using standard run-length encoding.

### HLR-REPLAY-TRACE-007:
The system shall support trace exporting to structured YAML.

### HLR-REPLAY-TRACE-008:
The system shall cross-reference step traces against simulation limits.

### HLR-REPLAY-COMPARE-001:
The system shall compare replay state vectors against recorded baseline states.

### HLR-REPLAY-COMPARE-002:
The system shall output epsilon difference values for all matched steps.

### HLR-REPLAY-COMPARE-003:
The system shall generate a detailed divergence report when comparison delta bounds are breached.

### HLR-REPLAY-COMPARE-004:
The system shall support user-defined epsilon sensitivity profiles.

### HLR-REPLAY-COMPARE-005:
The system shall compare digital outputs alongside mathematical states.

### HLR-REPLAY-COMPARE-006:
The system shall ignore minor comparison variations within the telemetry noise floor.

### HLR-REPLAY-COMPARE-007:
The system shall synchronize comparison timelines using primary event markers.

### HLR-REPLAY-COMPARE-008:
The system shall summarize overall timeline agreement as a score percentage.

### HLR-REPLAY-EVAL-001:
The system shall evaluate replay execution logs against mathematical invariant criteria.

### HLR-REPLAY-EVAL-002:
The system shall host the broader replay-evaluation model separately from basic checker output.

### HLR-REPLAY-EVAL-003:
The system shall assert runtime safety boundaries across all evaluation runs.

### HLR-REPLAY-EVAL-004:
The system shall output standard-format evaluation status codes.

### HLR-REPLAY-EVAL-005:
The system shall maintain audit logs for all executed evaluation rules.

### HLR-REPLAY-EVAL-006:
The system shall accept custom validation rules via external XML schemas.

### HLR-REPLAY-EVAL-007:
The system shall report the subset of evaluation checks that were bypassed.

### HLR-REPLAY-EVAL-008:
The system shall calculate total execution energy consumption metrics.

### HLR-REPLAY-OPS-001:
The system shall accept start, pause, step, and terminate operations from operators.

### HLR-REPLAY-OPS-002:
The system shall reject operator commands that violate current state safety invariants.

### HLR-REPLAY-OPS-003:
The system shall log all command sources and user credentials.

### HLR-REPLAY-OPS-004:
The system shall support batch execution of multiple saved replay runs.

### HLR-REPLAY-OPS-005:
The system shall display real-time replay playback speed in frames per second.

### HLR-REPLAY-OPS-006:
The system shall limit operator control commands when in automated validation loops.

### HLR-REPLAY-OPS-007:
The system shall recover operator state after transient connection failures.

### HLR-REPLAY-OPS-008:
The system shall allow operators to hot-reload replay data streams without power cycling.

### HLR-REPLAY-ENV-001:
The system shall envelope replay-trace data with standard security signatures.

### HLR-REPLAY-ENV-002:
The system shall keep the raw ADC witness envelope separate from the replay-trace envelope.

### HLR-REPLAY-ENV-003:
The system shall structure replay envelope payloads as authenticated CBOR blocks.

### HLR-REPLAY-ENV-004:
The system shall include diagnostic sequence numbers inside the replay envelope header.

### HLR-REPLAY-ENV-005:
The system shall reject corrupted envelope blocks prior to parsing.

### HLR-REPLAY-ENV-006:
The system shall calculate real-time cryptographic overhead for envelope operations.

### HLR-REPLAY-ENV-007:
The system shall route envelope telemetry over isolated virtual serial lines.

### HLR-REPLAY-ENV-008:
The system shall sign envelopes using hardware-managed asymmetrical keys.

### HLR-REPLAY-AGREE-001:
The system shall calculate target agreement criteria using a weighted absolute error matrix.

### HLR-REPLAY-AGREE-002:
The system shall define target agreement bounds for each primary state parameter.

### HLR-REPLAY-AGREE-003:
The system shall signal target agreement achievement through standard output interfaces.

### HLR-REPLAY-AGREE-004:
The system shall handle target agreement calculations in high-precision float64 arithmetic.

### HLR-REPLAY-AGREE-005:
The system shall output a summary of target agreement metrics to the terminal interface.

### HLR-REPLAY-AGREE-006:
The system shall support adaptive target agreement relaxations under certified fault states.
`;

export const LLR_SOURCE_MD = `# Low-Level Requirements (LLR) Definition Source

### LLR-REPLAY-001:
The replay state controller shall initialize vectors in memory using values fetched from the saved file.
Traces-to: HLR-REPLAY-ORIGIN-001, HLR-REPLAY-ORIGIN-003

### LLR-REPLAY-002:
The mathematical core parser shall handle integer-to-float conversions for saved math replay files.
Traces-to: HLR-REPLAY-ORIGIN-002

### LLR-REPLAY-003:
The configuration checker shall perform a bitwise XOR checksum check on the state vector file header.
Traces-to: HLR-REPLAY-ORIGIN-004

### LLR-REPLAY-004:
The controller shall check safety limits for coordinate inputs and raise a state bounds error if breached.
Traces-to: HLR-REPLAY-ORIGIN-005

### LLR-REPLAY-005:
The state logger shall write origin initialization state data directly into the system trace buffer.
Traces-to: HLR-REPLAY-ORIGIN-009

### LLR-REPLAY-006:
The projection multiplier shall use scaling coefficient constant mapping for raw ADC voltage translation.
Traces-to: HLR-REPLAY-PROJ-001, HLR-REPLAY-PROJ-005

### LLR-REPLAY-007:
The projection pipeline shall include a digital low-pass filter with a 10Hz cutoff frequency.
Traces-to: HLR-REPLAY-PROJ-002

### LLR-REPLAY-008:
The ADC voltage guard shall raise an low-voltage interrupt if raw readings drop below 0.1V.
Traces-to: HLR-REPLAY-PROJ-003

### LLR-REPLAY-009:
The timing scheduler shall trigger ADC sampling routines using the high-resolution hardware clock at 400Hz.
Traces-to: HLR-REPLAY-PROJ-004

### LLR-REPLAY-010:
The temperature sensor reader shall compute offset corrections using the calibration lookup table.
Traces-to: HLR-REPLAY-PROJ-006

### LLR-REPLAY-011:
The record loader shall issue a partition index query and map records onto virtual volume blocks.
Traces-to: HLR-REPLAY-RETAINED-RUN-001, HLR-REPLAY-RETAINED-RUN-002

### LLR-REPLAY-012:
The write-protection controller shall intercept block-write requests and return an operation-denied code.
Traces-to: HLR-REPLAY-RETAINED-RUN-003

### LLR-REPLAY-013:
The trace generator shall map active step counts onto elapsed clock ticks.
Traces-to: HLR-REPLAY-TRACE-001

### LLR-REPLAY-014:
The telemetry stream encoder shall package tracing records in standard compressed frames.
Traces-to: HLR-REPLAY-TRACE-002, HLR-REPLAY-TRACE-006

### LLR-REPLAY-015:
The comparison difference calculator shall compute absolute difference scores for the three primary coordinates.
Traces-to: HLR-REPLAY-COMPARE-001, HLR-REPLAY-COMPARE-002

### LLR-REPLAY-016:
The warning manager shall trigger an operator alert if comparison divergence exceeds 5%.
Traces-to: HLR-REPLAY-COMPARE-003

### LLR-REPLAY-017:
The invariant evaluation module shall assert model validation checks against current operational vectors.
Traces-to: HLR-REPLAY-EVAL-001, HLR-REPLAY-EVAL-003

### LLR-REPLAY-018:
The checker wrapper shall process raw diagnostic logs independently of the broader evaluation model.
Traces-to: HLR-REPLAY-EVAL-002

### LLR-REPLAY-019:
The command supervisor shall route commands to the executive coordinator.
Traces-to: HLR-REPLAY-OPS-001, HLR-REPLAY-OPS-002

### LLR-REPLAY-020:
The command logger shall write command input events to the audit partition.
Traces-to: HLR-REPLAY-OPS-003

### LLR-REPLAY-021:
The trace envelope signer shall hash CBOR payloads and append the signature.
Traces-to: HLR-REPLAY-ENV-001, HLR-REPLAY-ENV-003

### LLR-REPLAY-022:
The ADC witness envelope dispatcher shall write raw ADC witness metadata into isolated streams.
Traces-to: HLR-REPLAY-ENV-002

### LLR-REPLAY-023:
The envelope filter shall check sequence numbers to prevent packet replay.
Traces-to: HLR-REPLAY-ENV-004, HLR-REPLAY-ENV-005

### LLR-REPLAY-024:
The float-math module shall perform target agreement estimations in 64-bit IEEE float.
Traces-to: HLR-REPLAY-AGREE-001, HLR-REPLAY-AGREE-004

### LLR-REPLAY-025:
The agreement visualizer shall write calculated metrics to the system console stream.
Traces-to: HLR-REPLAY-AGREE-005
`;

export const MATRIX_SOURCE_TXT = `Row | HLR IDs | LLR IDs | Raw Status Text | Evidence Paths | Notes
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
11 | HLR-REPLAY-PROJ-001 | LLR-REPLAY-006 | Implemented and tested | src/replay/adc_proj.ts | Applies only to raw-ADC-derived replay input
12 | HLR-REPLAY-PROJ-002 | LLR-REPLAY-007 | Implemented | src/replay/filter.ts | Applies only to raw-ADC-derived replay input
13 | HLR-REPLAY-PROJ-003 | LLR-REPLAY-008 | Implemented and tested | src/replay/voltage_guard.ts | Applies only to raw-ADC-derived replay input
14 | HLR-REPLAY-PROJ-004 | LLR-REPLAY-009 | Implemented | src/replay/scheduler.ts | Applies only to raw-ADC-derived replay input
15 | HLR-REPLAY-PROJ-005 | LLR-REPLAY-006 | Implemented | src/replay/adc_map.ts | Applies only to raw-ADC-derived replay input
16 | HLR-REPLAY-PROJ-006 | LLR-REPLAY-010 | Implemented and tested | src/replay/temp_comp.ts | Applies only to raw-ADC-derived replay input
17 | HLR-REPLAY-PROJ-007 | | Implemented | src/replay/adc_logger.ts | Projection log operations
18 | HLR-REPLAY-PROJ-008 | | verified | proofs/projection_time.txt | Constant time projection transform
19 | HLR-REPLAY-PROJ-009 | | Implemented | src/replay/boot_check.ts | Coefficient integrity check
20 | HLR-REPLAY-PROJ-010 | | Implemented | src/replay/map_fallback.ts | Default projection map fallback
21 | HLR-REPLAY-PROJ-011 | | verification passed | tests/adc_reorder_test.py | Discard out-of-order samples
22 | HLR-REPLAY-PROJ-012 | | Implemented | src/replay/latency_tracker.ts | Tracking latency scores
23 | HLR-REPLAY-RETAINED-RUN-001 | LLR-REPLAY-011 | pending | | Retained run operator index query
24 | HLR-REPLAY-RETAINED-RUN-002 | LLR-REPLAY-011 | pending | | Retained run storage mount and verification
25 | HLR-REPLAY-RETAINED-RUN-003 | LLR-REPLAY-012 | pending | | Historical logs write-protection enforcement
26 | HLR-REPLAY-RETAINED-RUN-004 | | pending | | Differential run comparison pending
27 | HLR-REPLAY-RETAINED-RUN-005 | | pending | | Partitions error flag mapping pending
28 | HLR-REPLAY-RETAINED-RUN-006 | | pending | | Copy selected block commands pending
29 | HLR-REPLAY-RETAINED-RUN-007 | | pending | | Cryptographic verification signature checks pending
30 | HLR-REPLAY-RETAINED-RUN-008 | | pending | | Unified run metadata schema formatting pending
31 | HLR-REPLAY-TRACE-001 | LLR-REPLAY-013 | pending | | Continuous step trace mapping pending
32 | HLR-REPLAY-TRACE-002 | LLR-REPLAY-014 | pending | | Trace stream evaluation output pending
33 | HLR-REPLAY-TRACE-003 | | pending | | Header trace metadata embedding pending
34 | HLR-REPLAY-TRACE-004 | | pending | | Trace coordinate interpolation checks pending
35 | HLR-REPLAY-TRACE-005 | | pending | | Trace fast coordinate index lookup pending
36 | HLR-REPLAY-TRACE-006 | LLR-REPLAY-014 | pending | | Run-length trace compression pending
37 | HLR-REPLAY-TRACE-007 | | pending | | Trace export to YAML pending
38 | HLR-REPLAY-TRACE-008 | | pending | | Limit cross-reference verification pending
39 | HLR-REPLAY-COMPARE-001 | LLR-REPLAY-015 | pending | | Replay state vector baseline comparison pending
40 | HLR-REPLAY-COMPARE-002 | LLR-REPLAY-015 | pending | | Epsilon discrepancy score calculator pending
41 | HLR-REPLAY-COMPARE-003 | LLR-REPLAY-016 | pending | | Divergence alert generation pending
42 | HLR-REPLAY-COMPARE-004 | | pending | | User-defined sensitivity profiles pending
43 | HLR-REPLAY-COMPARE-005 | | pending | | Digital outputs comparison checks pending
44 | HLR-REPLAY-COMPARE-006 | | pending | | Telemetry noise threshold settings pending
45 | HLR-REPLAY-COMPARE-007 | | pending | | Divergence baseline sync markers pending
46 | HLR-REPLAY-COMPARE-008 | | pending | | Overall score percentage summation pending
47 | HLR-REPLAY-EVAL-001 | LLR-REPLAY-017 | pending | | Invariant criteria evaluation pending
48 | HLR-REPLAY-EVAL-002 | LLR-REPLAY-018 | not credited | src/replay/checker.ts | existing checker output is not credited as the broader replay-evaluation model
49 | HLR-REPLAY-EVAL-003 | LLR-REPLAY-017 | pending | | Runtime safety checks pending
50 | HLR-REPLAY-EVAL-004 | | pending | | Evaluation status output logs pending
51 | HLR-REPLAY-EVAL-005 | | pending | | Evaluation audit database log entries pending
52 | HLR-REPLAY-EVAL-006 | | pending | | XML schema custom validation loader pending
53 | HLR-REPLAY-EVAL-007 | | pending | | Bypassed rule identification checks pending
54 | HLR-REPLAY-EVAL-008 | | pending | | Energy calculation logs pending
55 | HLR-REPLAY-OPS-001 | LLR-REPLAY-019 | pending | | Start, pause, resume command actions pending
56 | HLR-REPLAY-OPS-002 | LLR-REPLAY-019 | pending | | Active operator safety guard controls pending
57 | HLR-REPLAY-OPS-003 | LLR-REPLAY-020 | pending | | Input authority logging database pending
58 | HLR-REPLAY-OPS-004 | | pending | | Batch multi-run orchestration pending
59 | HLR-REPLAY-OPS-005 | | pending | | FPS frame playback dashboard visualization pending
60 | HLR-REPLAY-OPS-006 | | pending | | Automatic loop command lock limits pending
61 | HLR-REPLAY-OPS-007 | | pending | | operator socket context restore loops pending
62 | HLR-REPLAY-OPS-008 | | pending | | Hot-reload input data streams pending
63 | HLR-REPLAY-ENV-001 | LLR-REPLAY-021 | pending | | Envelope signing operations pending
64 | HLR-REPLAY-ENV-002 | LLR-REPLAY-022 | remains separate | src/replay/adc_envelope.ts | raw ADC witness envelope remains separate from replay-trace envelope
65 | HLR-REPLAY-ENV-003 | LLR-REPLAY-021 | pending | | CBOR packet envelope layout mapping pending
66 | HLR-REPLAY-ENV-004 | LLR-REPLAY-023 | pending | | Header metadata sequence checks pending
67 | HLR-REPLAY-ENV-005 | LLR-REPLAY-023 | pending | | Corrupted frame filter checks pending
68 | HLR-REPLAY-ENV-006 | | pending | | Cryptographic loop timing calculation pending
69 | HLR-REPLAY-ENV-007 | | pending | | Virtual isolated serial port links pending
70 | HLR-REPLAY-ENV-008 | | pending | | Hardware secure keys module handshake pending
71 | HLR-REPLAY-AGREE-001 | LLR-REPLAY-024 | pending | | Target agreement absolute calculation pending
72 | HLR-REPLAY-AGREE-002 | | pending | | Target coordinate bounds matrix definition pending
73 | HLR-REPLAY-AGREE-003 | | pending | | Achievement signaling interfaces pending
74 | HLR-REPLAY-AGREE-004 | LLR-REPLAY-024 | pending | | float64 high precision logic checks pending
75 | HLR-REPLAY-AGREE-005 | LLR-REPLAY-025 | pending | | agreement console printing summary pending
76 | HLR-REPLAY-AGREE-006 | | pending | | certified fault adaptive relaxation logic pending
`;

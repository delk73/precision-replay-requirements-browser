# Low-Level Requirements (LLR) Definition Source

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

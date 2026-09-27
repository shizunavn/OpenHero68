# Hall Stream: official multi-key calibration path

This build separates the two AULA firmware telemetry state machines instead of treating them as the same stream.

- **Distance** uses `CMD 0x98` (`98/00 -> 98/01 -> 98/02`). It is the read-only-ish distance diagnostic used for firmware-computed travel. On firmware 0323, practical passive multi-key cadence is uneven.
- **Multi-key** uses the official calibration lifecycle `CMD 0x94` (`94/00` start + 1 s keepalive, unsolicited `94/02`, `94/04` stop). A `94/02` report can contain multiple six-byte key records, so adjacent simultaneous keys do not need host round-robin scheduling.

Important: `0x94` is a real calibration mode. Hardware RE confirmed that completed keys can update firmware-stored Hall endpoints before `94/04` is sent. The UI therefore exposes it as an explicit **Multi-key** source instead of silently replacing the normal Distance stream.

For the Multi-key view, travel in millimetres is estimated from the calibration-range snapshot (`94/05`) captured before the session. The raw live data is the official `CUR_ADC` from `94/02`; the visual 0..3.5 mm mapping is derived on the host.

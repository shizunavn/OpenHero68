# Hall Stream round-robin multi-key fix

Firmware 0323 hardware captures show CMD 0x98/01 at about 21 Hz total and normally one 6-byte key record per packet. Sending multiple POS values in one SYNC does not create an independent 21 Hz stream for every key; one key can dominate while the others appear only opportunistically.

This build changes held-key streaming to a report-driven round-robin scheduler:

- one held key: target that key continuously (~21 Hz aggregate stream)
- two or more held keys: request exactly one held POS at a time and rotate after every received 0x98/01 frame
- HID writes are bounded by incoming telemetry cadence rather than a fast polling timer
- key-up still snaps the released key to 0 immediately and retargets the remaining chord

This cannot manufacture 21 Hz per key if the firmware only emits ~21 records/s total. For two held keys the intended result is roughly an even share instead of ~21 Hz for one key and ~1-2 Hz for the other.

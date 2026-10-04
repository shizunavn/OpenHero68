# Hall Stream multi-key + release UI fix

- Tracks normal keyboard keydown/keyup while Hall Stream is active.
- Re-sends 0x98/01 with the complete currently held chord (plus known-good POS56 anchor), so adjacent simultaneous keys such as M+N are explicitly requested instead of relying on opportunistic unrequested-key telemetry.
- Snaps released Hall rest noise (<= 0.08 mm while pressed=false) to 0.00 mm.
- keyup also resets the UI immediately and asks firmware for the remaining chord/rest state.
- Hall Stream labels now use the physical key label (`M`, `N`, `1`, etc.) instead of frontend IDs (`KeyM`, `KeyN`, `Digit1`).

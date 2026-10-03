import type { createTranslator } from './index'

type Translator = ReturnType<typeof createTranslator>

// Keep protocol diagnostics intact in state while translating their display.
export function translateHallError(message: string, tr: Translator): string {
  const sendTimeout = /^HERO68 send timed out \(command=(0x[\da-f]+), zone=(0x[\da-f]+)\)$/i.exec(message)
  if (sendTimeout) return tr('HERO68 send timed out (command={command}, zone={zone})', { command: sendTimeout[1], zone: sendTimeout[2] })
  const timeout = /^HERO68 read timed out \(command=(0x[\da-f]+), zone=(0x[\da-f]+)\)$/i.exec(message)
  if (timeout) return tr('HERO68 read timed out (command={command}, zone={zone})', { command: timeout[1], zone: timeout[2] })
  const stopped = /^Hall polling stopped: (.+)\. Close other keyboard apps or tabs, reconnect HERO68, then start again\.$/.exec(message)
  if (stopped) return tr('Hall polling stopped: {error}. Close other keyboard apps or tabs, reconnect HERO68, then start again.', { error: translateHallError(stopped[1], tr) })
  const multiKey = /^Firmware multi-key polling stopped: (.+)$/.exec(message)
  if (multiKey) return tr('Firmware multi-key polling stopped: {error}', { error: translateHallError(multiKey[1], tr) })
  const disconnected = /^HERO68 USB interface disconnected during Hall Stream \((.+)\)\.$/.exec(message)
  if (disconnected) return tr('HERO68 USB interface disconnected during Hall Stream ({stage}).', { stage: disconnected[1] })
  return tr(message)
}

export function normalizeHex(input: string) {
  const clean = input.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '').toUpperCase()
  if (clean.length % 2 !== 0) throw new Error('Hex input must contain complete bytes')
  return clean
}

export function hexToBytes(input: string): Uint8Array {
  const clean = normalizeHex(input)
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16)
  return bytes
}

export function bytesToHex(bytes: ArrayLike<number>, separator = ' ') {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0').toUpperCase()).join(separator)
}

export function u16be(value: number) {
  return new Uint8Array([(value >>> 8) & 0xff, value & 0xff])
}

export function u16le(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff])
}

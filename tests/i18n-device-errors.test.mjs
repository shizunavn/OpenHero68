import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

async function importSource(input) {
  const bundle = await rolldown({ input })
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false })
  await bundle.close()
  return import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'))
}
const [{ createTranslator }, { translateHallError }] = await Promise.all([
  importSource('src/i18n/index.tsx'), importSource('src/i18n/deviceErrors.ts'),
])
const timeout = 'HERO68 read timed out (command=0x98, zone=0x01)'
const fatal = `Hall polling stopped: ${timeout}. Close other keyboard apps or tabs, reconnect HERO68, then start again.`

test('Vietnamese Hall errors preserve command and zone while translating recovery instructions', () => {
  const localized = translateHallError(fatal, createTranslator('vi'))
  assert.match(localized, /^Đã dừng đọc dữ liệu Hall:/)
  assert.match(localized, /HERO68 không phản hồi kịp thời \(lệnh=0x98, vùng=0x01\)/)
  assert.match(localized, /kết nối lại HERO68 rồi bắt đầu lại/)
  assert.ok(!localized.includes('read timed out'))
  assert.ok(!localized.includes('{error}'))
})

test('English diagnostics and unknown errors remain intact', () => {
  assert.equal(translateHallError(fatal, createTranslator('en')), fatal)
  assert.equal(translateHallError('Unexpected HID report 0xab', createTranslator('vi')), 'Unexpected HID report 0xab')
})

test('Legacy timeout and USB disconnect diagnostics also translate', () => {
  const tr = createTranslator('vi')
  assert.match(translateHallError(`Firmware multi-key polling stopped: ${timeout}`, tr), /^Đã dừng đọc dữ liệu nhiều phím từ firmware:/)
  assert.equal(translateHallError('HERO68 USB interface disconnected during Hall Stream (polling).', tr), 'Kết nối USB của HERO68 bị ngắt khi đang chạy luồng Hall (polling).')
})

import type { LanguagePreference } from '../../i18n'
import { AppSelect } from './AppSelect'

const languages = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
] as const

export function LanguageSelect({ value, onChange, label }: {
  value: LanguagePreference
  onChange: (value: LanguagePreference) => void
  label: string
}) {
  return <AppSelect className="language-select" value={value} onChange={onChange} label={label} options={languages} />
}

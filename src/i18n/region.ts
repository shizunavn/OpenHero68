import type { Language, RegionGroup } from './index'

export type DetectedRegion = {
  region: RegionGroup
  country: string | null
  suggestedLanguage: Language
  source: 'cloudflare' | 'browser'
}

export function browserSuggestedLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en'
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  return languages.some(language => language?.toLowerCase().startsWith('vi')) ? 'vi' : 'en'
}

export async function detectRegion(): Promise<DetectedRegion> {
  try {
    const response = await fetch('/api/region', {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Region lookup failed (${response.status})`)
    const data = await response.json() as Partial<DetectedRegion>
    if ((data.region === 'VN' || data.region === 'OTHER') && (data.suggestedLanguage === 'vi' || data.suggestedLanguage === 'en')) {
      return {
        region: data.region,
        country: typeof data.country === 'string' ? data.country : null,
        suggestedLanguage: data.suggestedLanguage,
        source: 'cloudflare',
      }
    }
    throw new Error('Invalid region response')
  } catch {
    const suggestedLanguage = browserSuggestedLanguage()
    return {
      region: suggestedLanguage === 'vi' ? 'VN' : 'OTHER',
      country: null,
      suggestedLanguage,
      source: 'browser',
    }
  }
}

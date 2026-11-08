import en from '../i18n/en.json'
import zh from '../i18n/zh-CN.json'
import type { Locale } from './save'

export type Dictionary = Record<string, string>
const DICTIONARIES: Record<Locale, Dictionary> = { en, 'zh-CN': zh }

/** Keep language detection available to legacy consumers, while the game itself pins its approved copy to English. */
export function detectLocale(_languages: readonly string[] | undefined): Locale { return 'en' }
export function resolveLocale(_saved: Locale | '', _languages: readonly string[] | undefined): Locale { return 'en' }

export class I18n {
  locale: Locale
  private listeners = new Set<(locale: Locale) => void>()
  constructor(locale: Locale) { this.locale = locale; document.documentElement.lang = locale }
  t(key: string, vars: Record<string, string | number> = {}): string {
    const text = DICTIONARIES[this.locale][key] ?? DICTIONARIES.en[key] ?? key
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
  }
  set(locale: Locale): void {
    if (locale === this.locale) return
    this.locale = locale; document.documentElement.lang = locale
    for (const fn of this.listeners) fn(locale)
  }
  onChange(fn: (locale: Locale) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn) }
}

export const DICTIONARY_KEYS = { en: Object.keys(en), zh: Object.keys(zh) }

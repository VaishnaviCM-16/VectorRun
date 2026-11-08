import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import zh from '../src/i18n/zh-CN.json'
import { detectLocale, resolveLocale } from '../src/engine/i18n'

describe('VECTOR//RUN language choice', () => {
  it('pins supported game copy to the Blueprint-approved English language', () => {
    expect(detectLocale(['zh-CN', 'en'])).toBe('en')
    expect(detectLocale(['fr-FR'])).toBe('en')
    expect(resolveLocale('zh-CN', ['zh-CN'])).toBe('en')
    expect(resolveLocale('en', ['fr-FR'])).toBe('en')
    expect(resolveLocale('', undefined)).toBe('en')
  })

  it('keeps dictionary keys and placeholder shapes aligned', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const [key, value] of Object.entries(en)) expect(vars((zh as Record<string, string>)[key]), key).toEqual(vars(value))
  })
})

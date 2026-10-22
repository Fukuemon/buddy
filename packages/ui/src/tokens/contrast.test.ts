import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vite-plus/test'

const require = createRequire(import.meta.url)

/** CSS の `--名前: 値;` の宣言を読み、名前から値への表を作る。 */
const readCustomProperties = (path: string) =>
  new Map(
    [...readFileSync(path, 'utf8').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
      ([, name, value]) => [name, value.trim()] as const,
    ),
  )

const properties = new Map([
  ...readCustomProperties(require.resolve('@digital-go-jp/design-tokens/dist/tokens.css')),
  ...readCustomProperties(new URL('./semantic.css', import.meta.url).pathname),
])

/** 意味のトークンの名前（`primary` など）から、var() をたどって 6 桁の 16 進の色を返す。 */
const resolveColor = (token: string) => {
  let value = `var(--buddy-color-${token})`
  for (let depth = 0; depth < 10; depth += 1) {
    const reference = /^var\((--[\w-]+)\)$/.exec(value)
    if (reference === null) break
    const next = properties.get(reference[1])
    if (next === undefined) throw new Error(`${reference[1]} が定義されていない`)
    value = next
  }
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${token} の値 ${value} は 6 桁の 16 進の色でない`)
  return value
}

const relativeLuminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.2 のコントラスト比。 */
const contrastRatio = (foreground: string, background: string) => {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

const CATEGORICAL = Array.from({ length: 10 }, (_, index) => `categorical-${index + 1}`)

const TEXT_PAIRS: [foreground: string, background: string][] = [
  ...['surface', 'surface-canvas', 'surface-subtle', 'primary-surface'].flatMap((background) => [
    ['text', background] as [string, string],
    ['text-secondary', background] as [string, string],
  ]),
  ['primary', 'surface'],
  ['primary', 'surface-canvas'],
  ['primary', 'primary-surface'],
  ...['danger', 'warning', 'success'].flatMap((state) => [
    [state, 'surface'] as [string, string],
    [state, 'surface-canvas'] as [string, string],
    [state, `${state}-surface`] as [string, string],
    ['text', `${state}-surface`] as [string, string],
  ]),
  ['text-inverse', 'primary'],
  ...CATEGORICAL.map((background) => ['text-inverse', background] as [string, string]),
]

const NON_TEXT_PAIRS: [foreground: string, background: string][] = [
  ['border-field', 'surface'],
  ['border-field', 'surface-canvas'],
  ['border-field', 'surface-subtle'],
  ['border-field', 'primary-surface'],
  ['primary', 'surface'],
  ['primary', 'surface-canvas'],
  ['danger', 'surface'],
  ['focus-outline', 'surface'],
  ['focus-outline', 'surface-canvas'],
  ['focus-outline', 'focus-halo'],
]

describe('意味のトークンのコントラスト', () => {
  it.each(TEXT_PAIRS)('文字 %s は %s の上で 4.5:1 以上', (foreground, background) => {
    expect(
      contrastRatio(resolveColor(foreground), resolveColor(background)),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(NON_TEXT_PAIRS)('%s は %s の上で 3:1 以上', (foreground, background) => {
    expect(
      contrastRatio(resolveColor(foreground), resolveColor(background)),
    ).toBeGreaterThanOrEqual(3)
  })

  it('比の計算は WCAG の式に合う（白と黒は 21:1）', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })
})

import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

const FONT = '16px Test Sans'
const LINE_HEIGHT = 19

type LayoutModule = typeof import('./layout.ts')
type MeasurementModule = typeof import('./measurement.ts')

let prepare: LayoutModule['prepare']
let prepareWithSegments: LayoutModule['prepareWithSegments']
let layout: LayoutModule['layout']
let layoutWithLines: LayoutModule['layoutWithLines']
let clearCache: LayoutModule['clearCache']
let setLocale: LayoutModule['setLocale']
let clearMeasurementCaches: MeasurementModule['clearMeasurementCaches']

const emojiPresentationRe = /\p{Emoji_Presentation}/u
const punctuationRe = /[.,!?;:%)\]}'"”’»›…—-]/u
const decimalDigitRe = /\p{Nd}/u

function parseFontSize(font: string): number {
  const match = font.match(/(\d+(?:\.\d+)?)\s*px/)
  return match ? Number.parseFloat(match[1]!) : 16
}

function isWideCharacter(ch: string): boolean {
  const code = ch.codePointAt(0)!
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0x2F800 && code <= 0x2FA1F) ||
    (code >= 0x20000 && code <= 0x2A6DF) ||
    (code >= 0x2A700 && code <= 0x2B73F) ||
    (code >= 0x2B740 && code <= 0x2B81F) ||
    (code >= 0x2B820 && code <= 0x2CEAF) ||
    (code >= 0x2CEB0 && code <= 0x2EBEF) ||
    (code >= 0x2EBF0 && code <= 0x2EE5D) ||
    (code >= 0x30000 && code <= 0x3134F) ||
    (code >= 0x31350 && code <= 0x323AF) ||
    (code >= 0x323B0 && code <= 0x33479) ||
    (code >= 0x3000 && code <= 0x303F) ||
    (code >= 0x3040 && code <= 0x309F) ||
    (code >= 0x30A0 && code <= 0x30FF) ||
    (code >= 0x3130 && code <= 0x318F) ||
    (code >= 0xAC00 && code <= 0xD7AF) ||
    (code >= 0xFF00 && code <= 0xFFEF)
  )
}

function measureWidth(text: string, font: string): number {
  const fontSize = parseFontSize(font)
  let width = 0
  let previousWasDecimalDigit = false

  for (const ch of text) {
    if (ch === ' ') {
      width += fontSize * 0.33
      previousWasDecimalDigit = false
    } else if (ch === '\t') {
      width += fontSize * 1.32
      previousWasDecimalDigit = false
    } else if (emojiPresentationRe.test(ch) || ch === '\uFE0F') {
      width += fontSize
      previousWasDecimalDigit = false
    } else if (decimalDigitRe.test(ch)) {
      width += fontSize * (previousWasDecimalDigit ? 0.48 : 0.52)
      previousWasDecimalDigit = true
    } else if (isWideCharacter(ch)) {
      width += fontSize
      previousWasDecimalDigit = false
    } else if (punctuationRe.test(ch)) {
      width += fontSize * 0.4
      previousWasDecimalDigit = false
    } else {
      width += fontSize * 0.6
      previousWasDecimalDigit = false
    }
  }

  return width
}

class TestCanvasRenderingContext2D {
  font = ''
  measureText(text: string): { width: number } {
    return { width: measureWidth(text, this.font) }
  }
}

class TestOffscreenCanvas {
  constructor(_width: number, _height: number) {}
  getContext(_kind: string): TestCanvasRenderingContext2D {
    return new TestCanvasRenderingContext2D()
  }
}

beforeAll(async () => {
  Reflect.set(globalThis, 'OffscreenCanvas', TestOffscreenCanvas)
  const [mod, measurementMod] = await Promise.all([
    import('./layout.ts'),
    import('./measurement.ts'),
  ])
  ;({
    prepare,
    prepareWithSegments,
    layout,
    layoutWithLines,
    clearCache,
    setLocale,
  } = mod)
  ;({ clearMeasurementCaches } = measurementMod)
})

beforeEach(() => {
  setLocale(undefined)
  clearCache()
  clearMeasurementCaches()
})

describe('Unicode line break compliance', () => {
  const lineBreakers = [
    { name: 'Vertical Tab', char: '\v' },
    { name: 'Next Line', char: '\u0085' },
    { name: 'Line Separator', char: '\u2028' },
    { name: 'Paragraph Separator', char: '\u2029' },
  ]

  for (const { name, char } of lineBreakers) {
    test(`normal mode collapses ${name}`, () => {
      const prepared = prepare(`a${char}b`, FONT)
      const result = layout(prepared, 200, LINE_HEIGHT)
      expect(result.lineCount).toBe(1)
    })

    test(`pre-wrap mode treats ${name} as hard-break`, () => {
      const prepared = prepare(`a${char}b`, FONT, { whiteSpace: 'pre-wrap' })
      const result = layout(prepared, 200, LINE_HEIGHT)
      expect(result.lineCount).toBe(2)

      const rich = layoutWithLines(prepareWithSegments(`a${char}b`, FONT, { whiteSpace: 'pre-wrap' }), 200, LINE_HEIGHT)
      expect(rich.lines.map(l => l.text)).toEqual(['a', 'b'])
    })
  }

  test('custom tabSize', () => {
    const text = '\ta'
    const prepared4 = prepareWithSegments(text, FONT, { whiteSpace: 'pre-wrap', tabSize: 4 })
    const prepared8 = prepareWithSegments(text, FONT, { whiteSpace: 'pre-wrap', tabSize: 8 })

    const result4 = layoutWithLines(prepared4, 200, LINE_HEIGHT)
    const result8 = layoutWithLines(prepared8, 200, LINE_HEIGHT)

    expect(result4.lines[0]!.width).toBeCloseTo(21.12 + 9.6, 5)
    expect(result8.lines[0]!.width).toBeCloseTo(42.24 + 9.6, 5)
  })
})

describe('pre-wrap preserved whitespace breaking', () => {
  test('can break between consecutive preserved spaces', () => {
    const prepared = prepareWithSegments('a  b', FONT, { whiteSpace: 'pre-wrap' })
    const result = layoutWithLines(prepared, 10, LINE_HEIGHT)
    expect(result.lines.map(l => l.text)).toEqual(['a ', ' ', 'b'])
  })
})

describe('URL fragmentation', () => {
  test('can break long URLs at delimiters', () => {
    const url = 'https://example.com/a/b'
    const prepared = prepareWithSegments(url, FONT)
    const result = layoutWithLines(prepared, 80, LINE_HEIGHT)
    expect(result.lines.length).toBeGreaterThan(1)
    expect(result.lines[0]!.text).toBe('https://')
  })
})

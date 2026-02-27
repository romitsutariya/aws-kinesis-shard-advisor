type Atom =
  | { kind: 'literal'; value: string }
  | { kind: 'charclass'; chars: string[] }
  | { kind: 'digit' }
  | { kind: 'word' }
  | { kind: 'space' }

type Piece = {
  atom: Atom
  min: number
  max: number
}

const isDigit = (c: string) => c >= '0' && c <= '9'

const randInt = (min: number, max: number) => {
  const lo = Math.ceil(min)
  const hi = Math.floor(max)
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)]

const expandRange = (a: string, b: string) => {
  const out: string[] = []
  const start = a.charCodeAt(0)
  const end = b.charCodeAt(0)
  if (end < start) throw new Error(`Invalid range ${a}-${b}`)
  for (let i = start; i <= end; i++) out.push(String.fromCharCode(i))
  return out
}

const parseCharClass = (pattern: string, startIndex: number) => {
  const chars: string[] = []
  let i = startIndex

  if (pattern[i] !== '[') throw new Error('Expected [')
  i++

  if (pattern[i] === '^') throw new Error('Negated character classes ([^...]) are not supported')

  while (i < pattern.length) {
    if (pattern[i] === ']') {
      i++
      if (chars.length === 0) throw new Error('Empty character class [] is not supported')
      return { chars, nextIndex: i }
    }

    let ch = pattern[i]
    if (ch === '\\') {
      i++
      if (i >= pattern.length) throw new Error('Invalid escape at end of pattern')
      ch = pattern[i]
      chars.push(ch)
      i++
      continue
    }

    if (i + 2 < pattern.length && pattern[i + 1] === '-' && pattern[i + 2] !== ']') {
      const a = pattern[i]
      const b = pattern[i + 2]
      chars.push(...expandRange(a, b))
      i += 3
      continue
    }

    chars.push(ch)
    i++
  }

  throw new Error('Unterminated character class')
}

const parseQuantifier = (pattern: string, startIndex: number) => {
  let i = startIndex
  if (i >= pattern.length) return { min: 1, max: 1, nextIndex: i }

  const ch = pattern[i]
  if (ch === '?') return { min: 0, max: 1, nextIndex: i + 1 }
  if (ch === '+') return { min: 1, max: 16, nextIndex: i + 1 }
  if (ch === '*') return { min: 0, max: 16, nextIndex: i + 1 }

  if (ch !== '{') return { min: 1, max: 1, nextIndex: i }

  i++
  let n1 = ''
  while (i < pattern.length && isDigit(pattern[i])) {
    n1 += pattern[i]
    i++
  }
  if (n1.length === 0) throw new Error('Invalid quantifier: expected number after {')

  let min = Number(n1)
  let max = min

  if (pattern[i] === ',') {
    i++
    let n2 = ''
    while (i < pattern.length && isDigit(pattern[i])) {
      n2 += pattern[i]
      i++
    }
    max = n2.length === 0 ? min + 16 : Number(n2)
  }

  if (pattern[i] !== '}') throw new Error('Invalid quantifier: expected }')
  i++

  if (min < 0 || max < min) throw new Error('Invalid quantifier bounds')
  if (max > 100000) throw new Error('Quantifier too large')

  return { min, max, nextIndex: i }
}

export const generateFromRegexLikePattern = (pattern: string) => {
  if (pattern.includes('(') || pattern.includes(')') || pattern.includes('|')) {
    throw new Error('Groups and alternation are not supported in this generator')
  }

  const pieces: Piece[] = []
  let i = 0

  while (i < pattern.length) {
    const ch = pattern[i]

    if (ch === '^' || ch === '$') {
      i++
      continue
    }

    let atom: Atom

    if (ch === '[') {
      const { chars, nextIndex } = parseCharClass(pattern, i)
      atom = { kind: 'charclass', chars }
      i = nextIndex
    } else if (ch === '\\') {
      i++
      if (i >= pattern.length) throw new Error('Invalid escape at end of pattern')
      const esc = pattern[i]
      i++
      if (esc === 'd') atom = { kind: 'digit' }
      else if (esc === 'w') atom = { kind: 'word' }
      else if (esc === 's') atom = { kind: 'space' }
      else atom = { kind: 'literal', value: esc }
    } else if (ch === '{' || ch === '}' || ch === '?' || ch === '+' || ch === '*') {
      throw new Error(`Dangling quantifier '${ch}'`)
    } else {
      atom = { kind: 'literal', value: ch }
      i++
    }

    const q = parseQuantifier(pattern, i)
    i = q.nextIndex

    pieces.push({ atom, min: q.min, max: q.max })
  }

  const wordChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split('')
  const digits = '0123456789'.split('')
  const spaces = [' ', '\t']

  let out = ''
  for (const piece of pieces) {
    const count = piece.min === piece.max ? piece.min : randInt(piece.min, piece.max)
    for (let j = 0; j < count; j++) {
      const a = piece.atom
      if (a.kind === 'literal') out += a.value
      else if (a.kind === 'charclass') out += pick(a.chars)
      else if (a.kind === 'digit') out += pick(digits)
      else if (a.kind === 'word') out += pick(wordChars)
      else if (a.kind === 'space') out += pick(spaces)
    }
  }

  return out
}

export const generateMany = (pattern: string, count: number) => {
  const n = Math.max(0, Math.min(50000, Math.floor(count)))
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(generateFromRegexLikePattern(pattern))
  return out
}

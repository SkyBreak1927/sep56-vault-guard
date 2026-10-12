/**
 * Minimal syntax colouring for the docs code blocks. Not a parser; good enough for the
 * short shell, JSON and TypeScript samples in the docs. Works line by line.
 */

export type TokenKind =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'comment'
  | 'command'
  | 'flag'
  | 'placeholder'
  | 'variable'
  | 'key'
  | 'number'

export interface Token {
  kind: TokenKind
  text: string
}

export interface Line {
  /** Shell prompt shown before a command line (display only, never copied). */
  prompt?: string
  tokens: Token[]
}

const PROMPT: Record<string, string> = { bash: '$', powershell: 'PS>', bat: '>' }

const KEYWORDS: Record<string, string[]> = {
  bash: ['for', 'in', 'do', 'done', 'if', 'then', 'fi'],
  powershell: ['foreach', 'in'],
  typescript: ['type', 'interface', 'export', 'const', 'import', 'from'],
  json: ['true', 'false', 'null'],
}

const STRING = `"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'`

/** Ordered alternatives; the first group that matches names the token. */
function rules(language: string): [TokenKind, string][] {
  const keywords = KEYWORDS[language]
  const keyword: [TokenKind, string][] = keywords ? [['keyword', `\\b(?:${keywords.join('|')})\\b`]] : []
  switch (language) {
    case 'bash':
    case 'powershell':
    case 'bat':
    case 'text':
      return [
        ...(language === 'bash' || language === 'powershell' ? [['comment', '#.*$'] as [TokenKind, string]] : []),
        ['string', STRING],
        ['placeholder', '<[A-Za-z_]+>'],
        ['variable', '\\$\\w+'],
        ['flag', '(?<![\\w/.-])--?[A-Za-z][\\w-]*'],
        ...keyword,
      ]
    case 'json':
      return [['key', `"(?:[^"\\\\]|\\\\.)*"(?=\\s*:)`], ['string', STRING], ['number', '-?\\b\\d+\\b'], ...keyword]
    case 'typescript':
      return [['comment', '//.*$'], ['string', STRING], ['number', '\\b\\d+\\b'], ...keyword]
    default:
      return []
  }
}

function tokenize(line: string, language: string): Token[] {
  const list = rules(language)
  if (!list.length) return [{ kind: 'plain', text: line }]
  const pattern = new RegExp(list.map(([, source]) => `(${source})`).join('|'), 'g')
  const tokens: Token[] = []
  let last = 0
  for (const match of line.matchAll(pattern)) {
    const at = match.index ?? 0
    if (at > last) tokens.push({ kind: 'plain', text: line.slice(last, at) })
    const group = match.slice(1).findIndex((value) => value !== undefined)
    tokens.push({ kind: list[group][0], text: match[0] })
    last = at + match[0].length
  }
  if (last < line.length) tokens.push({ kind: 'plain', text: line.slice(last) })
  return tokens
}

/** Marks the first word of a command line as the command. */
function markCommand(tokens: Token[]): Token[] {
  const [first, ...rest] = tokens
  if (first?.kind !== 'plain') return tokens
  const word = /^\S+/.exec(first.text)?.[0]
  if (!word) return tokens
  const tail = first.text.slice(word.length)
  return [{ kind: 'command', text: word }, ...(tail ? [{ kind: 'plain' as const, text: tail }] : []), ...rest]
}

export function highlight(code: string, language = 'text'): Line[] {
  const prompt = PROMPT[language]
  let continued = false
  return code.split('\n').map((text) => {
    const tokens = tokenize(text, language)
    // A command starts on an unindented line that isn't a comment, a closing
    // `done` / `}`, or the continuation of a line ending in `\`.
    const starts =
      !!prompt && !continued && /^\S/.test(text) && !/^(#|done\b|\}|REM\b)/.test(text)
    continued = /\\$/.test(text)
    return starts ? { prompt, tokens: markCommand(tokens) } : { tokens }
  })
}

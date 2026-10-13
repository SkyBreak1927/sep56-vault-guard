import { describe, expect, it } from 'vitest'
import { highlight, type Line } from '../highlight'

const kinds = (line: Line) => line.tokens.filter((t) => t.kind !== 'plain').map((t) => `${t.kind}:${t.text}`)

describe('highlight', () => {
  it('prompts and colours a shell command', () => {
    const [line] = highlight('./sep56-vault-guard --vault <CONTRACT_ADDRESS> --output text', 'bash')
    expect(line.prompt).toBe('$')
    expect(kinds(line)).toEqual(['command:./sep56-vault-guard', 'flag:--vault', 'placeholder:<CONTRACT_ADDRESS>', 'flag:--output'])
  })

  it('keeps the raw text intact', () => {
    const code = 'for n in alice bob; do\n  stellar keys generate "$n" --network testnet --fund\ndone'
    const text = highlight(code, 'bash').map((l) => l.tokens.map((t) => t.text).join('')).join('\n')
    expect(text).toBe(code)
  })

  it('prompts only where a command starts', () => {
    const lines = highlight(
      '# comment\nstellar contract invoke --id <ID> -- \\\n  preview_mint --shares 3000000\n\nfor n in a; do\n  x\ndone',
      'bash',
    )
    expect(lines.map((l) => l.prompt ?? '')).toEqual(['', '$', '', '', '$', '', ''])
    expect(kinds(lines[0])).toEqual(['comment:# comment'])
  })

  it('does not read hyphens inside words or URLs as flags', () => {
    const [line] = highlight('curl -X POST https://aegis-vault-backend.onrender.com/api/check', 'bash')
    expect(kinds(line)).toEqual(['command:curl', 'flag:-X'])
  })

  it('uses the shell-specific prompt', () => {
    expect(highlight('certutil -hashfile x SHA256', 'bat')[0].prompt).toBe('>')
    expect(highlight('foreach ($n in "a") {\n  x\n}', 'powershell').map((l) => l.prompt)).toEqual(['PS>', undefined, undefined])
  })

  it('tells JSON keys from string values', () => {
    const [, line] = highlight('{\n  "status": "ok", "n": 3, "detail": null\n}', 'json')
    expect(kinds(line)).toEqual(['key:"status"', 'string:"ok"', 'key:"n"', 'number:3', 'key:"detail"', 'keyword:null'])
  })

  it('leaves unknown languages plain, without prompts', () => {
    expect(highlight('Summary: N checks', 'text')[0]).toEqual({ tokens: [{ kind: 'plain', text: 'Summary: N checks' }] })
  })
})

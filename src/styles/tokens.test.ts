import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/* Read from disk rather than import.meta.glob. vite.config.ts sets css: false,
   which makes a `?raw` CSS import resolve to an empty string, so a glob-based
   version of this test found all 28 stylesheets and read nothing from any of
   them. It passed no matter what was in them. */
const STYLES = dirname(fileURLToPath(import.meta.url))

const cssFiles = readdirSync(STYLES).filter(name => name.endsWith('.css'))

const read = (name: string): string => readFileSync(join(STYLES, name), 'utf8')

const definedTokens = (): Set<string> => {
  const found = new Set<string>()
  for (const name of cssFiles) {
    for (const match of read(name).matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      found.add(match[1])
    }
  }
  return found
}

/**
 * An undefined custom property does not fall back to a sensible value. It
 * makes the whole declaration invalid at computed-value time, so the property
 * is dropped. `outline: 2px solid var(--nope)` is no outline at all, and
 * `margin: var(--nope) 0 1rem` loses the bottom margin too.
 *
 * Nothing else in this project can catch that. css: false means jsdom never
 * parses a stylesheet, so every component test passes while the page renders
 * wrong. Six of these had already shipped: --color-accent, --text-xs,
 * --text-sm, --radius-md and --space-20 were typos for tokens that exist under
 * another name, and --color-focus left two focus outlines invisible, which is
 * a WCAG 2.4.7 failure.
 */
describe('stylesheet tokens', () => {
  /* This test exists because the first version of the file below was
     vacuously green. If the sheets ever read as empty again, this fails
     first and says so, rather than the check below quietly passing. */
  it('actually reads the stylesheets', () => {
    expect(cssFiles.length).toBeGreaterThan(5)
    expect(read('tokens.css')).toContain('--accent:')
    expect(cssFiles.every(name => read(name).length > 0)).toBe(true)
  })

  it('defines every custom property that the stylesheets use', () => {
    const defined = definedTokens()
    const missing: string[] = []

    for (const name of cssFiles) {
      for (const match of read(name).matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!defined.has(match[1])) missing.push(`${name}: ${match[1]}`)
      }
    }

    expect(missing).toEqual([])
  })
})

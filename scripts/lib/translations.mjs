import {readFile} from 'node:fs/promises'

const MARKER = 'const TRANSLATIONS = '

// Walks the object literal character by character so strings containing braces
// or "//" (every wa.me URL in the dictionary) don't end the scan early.
function endOfObjectLiteral(source, from) {
  let depth = 0
  let inString = false
  let quote = ''
  let escaped = false

  for (let i = from; i < source.length; i++) {
    const char = source[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) inString = false
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true
      quote = char
      continue
    }

    if (char === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i)
      if (i === -1) break
      continue
    }

    if (char === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i)
      if (i === -1) break
      i += 1
      continue
    }

    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }

  throw new Error('Unbalanced braces while reading the TRANSLATIONS object')
}

// Returns where the TRANSLATIONS object literal starts and ends in `source`, so
// the build can swap it out without disturbing the rest of the script block.
export function locateTranslations(source) {
  const marker = source.indexOf(MARKER)
  if (marker === -1) throw new Error(`Could not find "${MARKER}"`)
  const start = source.indexOf('{', marker)
  return {start, end: endOfObjectLiteral(source, start)}
}

export function parseTranslations(source) {
  const {start, end} = locateTranslations(source)
  const parsed = Function(`"use strict"; return (${source.slice(start, end)});`)()
  if (!parsed?.de || !parsed?.en) throw new Error('TRANSLATIONS is missing a "de" or "en" dictionary')
  return parsed
}

export async function extractTranslations(htmlPath) {
  return parseTranslations(await readFile(htmlPath, 'utf8'))
}

// "tour.goldenTriangle.alt" -> "tour_goldenTriangle_alt". No existing key
// contains an underscore, so this round-trips back to dots in the build script.
export const toFieldName = (key) => key.replace(/\./g, '_')
export const toKey = (fieldName) => fieldName.replace(/_/g, '.')
export const groupOf = (key) => key.split('.')[0]

export function assertRoundTrips(keys) {
  const offenders = keys.filter((key) => key.includes('_'))
  if (offenders.length) {
    throw new Error(
      `These keys contain an underscore and would not round-trip: ${offenders.join(', ')}. ` +
        'Rename them in index.html or change the encoding in scripts/lib/translations.mjs.',
    )
  }
}

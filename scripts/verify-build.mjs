// Compares dist/index.html against src/template.html (which is byte-identical
// to the index.html that has been live all along).
//
//   node scripts/verify-build.mjs
//
// A plain `diff` is useless here: image URLs change by design and the
// TRANSLATIONS block gets reformatted. What actually matters is that no key and
// no visible string was lost on the way through Sanity.
//
// Once anyone edits content in the Studio, values legitimately diverge from the
// template. So a changed value is reported as drift, not a failure; only
// structural loss — a missing key, a vanished element, an image that never made
// it to the CDN — exits non-zero.

import * as cheerio from 'cheerio'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {parseTranslations} from './lib/translations.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = path.join(root, 'src', 'template.html')
const BUILT = path.join(root, 'dist', 'index.html')

const REVIEW_KEY = /^reviews\.\d+\./

const problems = []
const drift = []
const notes = []

const textByKey = ($) => {
  const map = new Map()
  $('[data-i18n]').each((_, element) => {
    const node = $(element)
    map.set(node.attr('data-i18n'), node.text())
  })
  return map
}

const compareDictionary = (label, before, after) => {
  const beforeKeys = Object.keys(before).filter((key) => !REVIEW_KEY.test(key))
  const afterKeys = new Set(Object.keys(after))

  const dropped = beforeKeys.filter((key) => !afterKeys.has(key))
  if (dropped.length) problems.push(`${label}: ${dropped.length} key(s) missing — ${dropped.join(', ')}`)

  const changed = beforeKeys.filter((key) => afterKeys.has(key) && before[key] !== after[key])
  for (const key of changed) {
    drift.push(`${label}  ${key}\n      template: ${JSON.stringify(before[key])}\n      Sanity:   ${JSON.stringify(after[key])}`)
  }
}

const run = async () => {
  const templateHtml = await readFile(TEMPLATE, 'utf8')
  const builtHtml = await readFile(BUILT, 'utf8')

  const $before = cheerio.load(templateHtml)
  const $after = cheerio.load(builtHtml)

  const before = parseTranslations(templateHtml)
  const after = parseTranslations(builtHtml)

  compareDictionary('de', before.de, after.de)
  compareDictionary('en', before.en, after.en)

  // Every non-review string baked into the markup must still read the same.
  const textBefore = textByKey($before)
  const textAfter = textByKey($after)
  for (const [key, value] of textBefore) {
    if (REVIEW_KEY.test(key)) continue
    // Changed text is already reported as dictionary drift; only a missing
    // element means the build actually dropped something.
    if (!textAfter.has(key)) problems.push(`markup: element for "${key}" disappeared`)
  }

  // Images must all be absolute Sanity URLs; a leftover relative path means a
  // slot was silently skipped.
  const stale = []
  $after('img[src], video[poster], meta[property="og:image"]').each((_, element) => {
    const node = $after(element)
    const value = node.attr('src') || node.attr('poster') || node.attr('content') || ''
    if (value.startsWith('images/')) stale.push(value)
  })
  if (stale.length) problems.push(`images: ${stale.length} still local — ${stale.join(', ')}`)

  const imageCount = $after('img[src*="cdn.sanity.io"]').length
  const reviewsBefore = $before('.testimonial-card').length
  const reviewsAfter = $after('.testimonial-card').length

  notes.push(`${Object.keys(after.de).length} keys in de, ${Object.keys(after.en).length} in en`)
  notes.push(`${imageCount} images now served from cdn.sanity.io`)
  notes.push(`${reviewsAfter} review card(s) rendered (template had ${reviewsBefore})`)
  notes.push(`size ${(Buffer.byteLength(templateHtml) / 1024).toFixed(1)} KB → ${(Buffer.byteLength(builtHtml) / 1024).toFixed(1)} KB`)

  for (const note of notes) console.log(`  ${note}`)

  if (drift.length) {
    console.log(`\n  ${drift.length} value(s) edited in the Studio since the template was written:`)
    for (const entry of drift.slice(0, 10)) console.log(`    ${entry}`)
    if (drift.length > 10) console.log(`    … and ${drift.length - 10} more`)
  }

  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s):\n`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exit(1)
  }

  console.log('\n✓ Structure intact — no key, element or image lost.')
}

run().catch((error) => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})

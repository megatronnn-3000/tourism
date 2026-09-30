// One-time: turns the three testimonials hardcoded in the template into real
// `review` documents, so reviews have a single source of truth before the build
// starts reading them from Sanity.
//
//   node --env-file-if-exists=.env scripts/seed-reviews.mjs
//
// Safe to re-run: the documents have fixed ids and are replaced wholesale.

import {createClient} from '@sanity/client'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {extractTranslations} from './lib/translations.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(root, 'src', 'template.html')

// Descending, so ordering by submittedAt reproduces the page's current 1-2-3 order.
const SEED_DATES = ['2026-03-01T12:00:00Z', '2026-02-01T12:00:00Z', '2026-01-01T12:00:00Z']

const requireEnv = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`)
  return value
}

// Quotes are stored bare. The build adds the typographic marks, so a guest who
// never types „ or “ still renders identically to these seeded ones.
const stripQuotes = (value) => value.replace(/^[„“"]/, '').replace(/[”“"]$/, '').trim()

// "— Anna, München" -> {author: 'Anna', city: 'München'}
const parseAuthor = (value) => {
  const bare = value.replace(/^[—–-]\s*/, '').trim()
  const comma = bare.lastIndexOf(', ')
  return comma === -1
    ? {author: bare, city: ''}
    : {author: bare.slice(0, comma).trim(), city: bare.slice(comma + 2).trim()}
}

const run = async () => {
  const translations = await extractTranslations(SOURCE)

  const reviews = SEED_DATES.map((submittedAt, index) => {
    const n = index + 1
    const de = translations.de[`reviews.${n}.quote`]
    const en = translations.en[`reviews.${n}.quote`]
    const authorLine = translations.de[`reviews.${n}.author`]
    if (!de || !authorLine) throw new Error(`reviews.${n}.* is missing from the template`)

    const {author, city} = parseAuthor(authorLine)
    return {
      _id: `review.seed-${n}`,
      _type: 'review',
      author,
      city,
      rating: 5,
      language: 'de',
      quoteOriginal: stripQuotes(de),
      quoteDe: stripQuotes(de),
      quoteEn: stripQuotes(en ?? de),
      status: 'approved',
      submittedAt,
    }
  })

  const client = createClient({
    projectId: requireEnv('SANITY_PROJECT_ID'),
    dataset: process.env.SANITY_DATASET || 'production',
    token: requireEnv('SANITY_WRITE_TOKEN'),
    apiVersion: '2024-10-01',
    useCdn: false,
  })

  for (const review of reviews) {
    await client.createOrReplace(review)
    console.log(`✓ ${review._id}  ${review.author}, ${review.city}`)
  }

  console.log(`\n${reviews.length} reviews seeded as approved.`)
}

run().catch((error) => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})

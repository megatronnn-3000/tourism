// Generates studio/schemas/siteContent.ts from the TRANSLATIONS object that is
// currently hardcoded in index.html. Generated rather than hand-written because
// there are ~200 keys and missing one silently blanks part of the site.
//
//   node scripts/generate-content-schema.mjs

import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {extractTranslations, toFieldName, groupOf, assertRoundTrips} from './lib/translations.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(root, 'src', 'template.html')
const TARGET = path.join(root, 'studio', 'schemas', 'siteContent.ts')
// GROQ does not guarantee field order, so the build reads this to emit the
// TRANSLATIONS dictionary in the same order the page has always had.
const KEY_ORDER = path.join(root, 'scripts', 'key-order.json')

// Anything longer than this gets a multi-line textarea in the Studio.
const LONG_TEXT = 110

const GROUP_TITLES = {
  meta: 'Meta & SEO',
  nav: 'Navigation',
  hero: 'Hero',
  trust: 'Trust strip',
  about: 'About Govind',
  journeys: 'Journeys',
  tour: 'Individual tours',
  why: 'Why Govind',
  gallery: 'Gallery',
  reviews: 'Reviews',
  info: 'Travel info',
  enquiry: 'Enquiry',
  form: 'Enquiry form',
  footer: 'Footer',
  whatsapp: 'WhatsApp',
}

const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const run = async () => {
  const translations = await extractTranslations(SOURCE)
  const keys = Object.keys(translations.de)
  assertRoundTrips(keys)

  const missingInEn = keys.filter((key) => translations.en[key] === undefined)
  if (missingInEn.length) {
    console.warn(`⚠ ${missingInEn.length} key(s) exist in DE but not EN:\n  ${missingInEn.join('\n  ')}`)
  }

  const groups = [...new Set(keys.map(groupOf))]
  const unknownGroups = groups.filter((group) => !GROUP_TITLES[group])
  if (unknownGroups.length) {
    console.warn(`⚠ No German title for group(s): ${unknownGroups.join(', ')} — using the raw name.`)
  }

  const groupLines = groups
    .map((group) => `    {name: ${quote(group)}, title: ${quote(GROUP_TITLES[group] || group)}},`)
    .join('\n')

  const fieldLines = keys
    .map((key) => {
      const isLong = String(translations.de[key] ?? '').length > LONG_TEXT
      const label = key.split('.').slice(1).join(' · ') || key
      return [
        '    defineField({',
        `      name: ${quote(toFieldName(key))},`,
        `      title: ${quote(label)},`,
        `      description: ${quote(key)},`,
        `      type: ${quote(isLong ? 'localeText' : 'localeString')},`,
        `      group: ${quote(groupOf(key))},`,
        '    }),',
      ].join('\n')
    })
    .join('\n')

  const file = `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/generate-content-schema.mjs
// Source of truth for the key list is the TRANSLATIONS object in index.html.

import {defineType, defineField} from 'sanity'

export const siteContent = defineType({
  name: 'siteContent',
  title: 'Page text',
  type: 'document',
  groups: [
${groupLines}
  ],
  fields: [
${fieldLines}
  ],
  preview: {
    prepare: () => ({title: 'Page text'}),
  },
})
`

  await writeFile(TARGET, file, 'utf8')
  await writeFile(KEY_ORDER, `${JSON.stringify(keys, null, 2)}\n`, 'utf8')
  console.log(`✓ Wrote ${path.relative(root, TARGET)}`)
  console.log(`✓ Wrote ${path.relative(root, KEY_ORDER)}`)
  console.log(`  ${keys.length} keys across ${groups.length} groups`)
}

run().catch((error) => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})

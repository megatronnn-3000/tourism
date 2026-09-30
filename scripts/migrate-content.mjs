// One-time migration: pushes the hardcoded content out of index.html and into
// Sanity, so the Studio becomes the source of truth.
//
//   node scripts/migrate-content.mjs --dry-run   # show what would happen
//   node scripts/migrate-content.mjs             # add anything missing
//   node scripts/migrate-content.mjs --force     # overwrite everything
//
// Needs SANITY_PROJECT_ID, SANITY_DATASET and SANITY_WRITE_TOKEN in .env.
//
// Safe to re-run. By default only keys that do not exist yet are written, so
// running this after adding new strings to the template cannot clobber copy
// that has since been edited in the Studio. --force resets every field back to
// whatever the template says, discarding those edits.

import {createClient} from '@sanity/client'
import {readdir, readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {extractTranslations, toFieldName, assertRoundTrips} from './lib/translations.mjs'
import {requireEnv, optionalEnv, requireProjectId} from './lib/env.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(root, 'src', 'template.html')
const IMAGE_DIR = path.join(root, 'images')
const CONTENT_ID = 'siteContent'

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

const MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif'}

// "images/gallery/taj-mahal.jpg" -> slot "gallery/taj-mahal", id "siteImage.gallery-taj-mahal"
const slotFor = (relativePath) => relativePath.split(path.sep).join('/').replace(/\.[^.]+$/, '')
const idFor = (slot) => `siteImage.${slot.replace(/[^a-zA-Z0-9]+/g, '-')}`

const buildContentDocument = (translations) => {
  const keys = Object.keys(translations.de)
  assertRoundTrips(keys)

  const document = {_id: CONTENT_ID, _type: 'siteContent'}
  for (const key of keys) {
    document[toFieldName(key)] = {
      _type: 'object',
      de: translations.de[key] ?? '',
      en: translations.en[key] ?? '',
    }
  }
  return {document, count: keys.length}
}

const collectImages = async () => {
  const entries = await readdir(IMAGE_DIR, {recursive: true, withFileTypes: true})
  return entries
    .filter((entry) => entry.isFile() && MIME[path.extname(entry.name).toLowerCase()])
    .map((entry) => {
      const absolute = path.join(entry.parentPath ?? entry.path, entry.name)
      return {absolute, relative: path.relative(IMAGE_DIR, absolute)}
    })
    .sort((a, b) => a.relative.localeCompare(b.relative))
}

const run = async () => {
  const translations = await extractTranslations(SOURCE)
  const {document, count} = buildContentDocument(translations)
  const images = await collectImages()

  console.log(`Seitentexte : ${count} keys`)
  console.log(`Bilder      : ${images.length} files`)

  if (dryRun) {
    console.log('\n--dry-run, nothing written. Slots that would be created:')
    for (const image of images) console.log(`  ${slotFor(image.relative)}`)
    return
  }

  const client = createClient({
    projectId: requireProjectId(),
    dataset: optionalEnv('SANITY_DATASET', 'production'),
    token: requireEnv('SANITY_WRITE_TOKEN'),
    apiVersion: '2024-10-01',
    useCdn: false,
  })

  const {_id, _type, ...fields} = document
  if (force) {
    await client.createOrReplace(document)
    console.log(`✓ ${CONTENT_ID} — all ${Object.keys(fields).length} keys overwritten`)
  } else {
    const existing = (await client.fetch('*[_id == $id][0]', {id: _id})) ?? {}
    const added = Object.keys(fields).filter((key) => existing[key] === undefined)
    await client.createIfNotExists({_id, _type})
    if (added.length) await client.patch(_id).setIfMissing(fields).commit()
    console.log(
      added.length
        ? `✓ ${CONTENT_ID} — ${added.length} new key(s): ${added.slice(0, 6).join(', ')}${added.length > 6 ? ' …' : ''}`
        : `· ${CONTENT_ID} — no new keys`,
    )
  }

  for (const image of images) {
    const slot = slotFor(image.relative)
    const _id = idFor(slot)

    if (!force && (await client.fetch('count(*[_id == $id])', {id: _id}))) {
      console.log(`· ${slot} (exists, skipped)`)
      continue
    }

    const asset = await client.assets.upload('image', await readFile(image.absolute), {
      filename: path.basename(image.relative),
    })

    await client.createOrReplace({
      _id,
      _type: 'siteImage',
      slot,
      image: {_type: 'image', asset: {_type: 'reference', _ref: asset._id}},
    })
    console.log(`✓ ${slot}`)
  }

  console.log('\nDone. Open the Studio and check the content landed before moving to Phase B.')
}

run().catch((error) => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})

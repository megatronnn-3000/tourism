// Builds dist/index.html by injecting Sanity content into src/template.html.
//
//   node --env-file-if-exists=.env build.mjs
//
// Content is baked in at build time rather than fetched in the browser, so the
// German copy ships inside the HTML (Google indexes it, no flash of stale text)
// and visitor traffic never touches Sanity's API quota.

import {createClient} from '@sanity/client'
import {createImageUrlBuilder} from '@sanity/image-url'
import * as cheerio from 'cheerio'
import {readFile, writeFile, mkdir, rm, cp} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {locateTranslations, toFieldName} from './scripts/lib/translations.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.join(root, 'src', 'template.html')
const KEY_ORDER = path.join(root, 'scripts', 'key-order.json')
const DIST = path.join(root, 'dist')

// Copied verbatim into dist. Everything else the page needs comes from Sanity.
const STATIC_FILES = ['video-gast.mp4']

// Review text is stored bare so a guest who never types „ or “ renders the same
// as the seeded testimonials. DE opens low, EN opens high, both close high.
const QUOTES = {de: ['„', '”'], en: ['“', '”']}

const REVIEW_KEY = /^reviews\.\d+\./

const requireEnv = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`)
  return value
}

const slotFromSrc = (src) => src.replace(/^images\//, '').replace(/\.[^.]+$/, '')

const QUERY = `{
  "content": *[_id == "siteContent"][0],
  "images": *[_type == "siteImage"]{slot, image, alt},
  "reviews": *[_type == "review" && status == "approved"] | order(submittedAt desc){
    author, city, rating, quoteDe, quoteEn
  }
}`

// Renders one dictionary in the page's existing shape: 8-space indent, a blank
// line whenever the key namespace changes.
const renderDictionary = (dictionary) => {
  const entries = Object.entries(dictionary)
  const lines = []
  let previousGroup = null

  entries.forEach(([key, value], index) => {
    const group = key.split('.')[0]
    if (previousGroup && group !== previousGroup) lines.push('')
    const comma = index === entries.length - 1 ? '' : ','
    lines.push(`        ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`)
    previousGroup = group
  })

  return lines.join('\n')
}

const renderTranslations = (de, en) =>
  `{\n      de: {\n${renderDictionary(de)}\n      },\n\n      en: {\n${renderDictionary(en)}\n      }\n    }`

const buildDictionaries = (content, reviews, keyOrder) => {
  const de = {}
  const en = {}
  const missing = []
  let reviewsEmitted = false

  for (const key of keyOrder) {
    // reviews.N.* live in `review` documents, not in siteContent.
    if (REVIEW_KEY.test(key)) {
      if (reviewsEmitted) continue
      reviews.forEach((review, index) => {
        const n = index + 1
        de[`reviews.${n}.quote`] = `${QUOTES.de[0]}${review.quoteDe ?? ''}${QUOTES.de[1]}`
        de[`reviews.${n}.author`] = `— ${review.author}${review.city ? `, ${review.city}` : ''}`
        en[`reviews.${n}.quote`] = `${QUOTES.en[0]}${review.quoteEn || review.quoteDe || ''}${QUOTES.en[1]}`
        en[`reviews.${n}.author`] = de[`reviews.${n}.author`]
      })
      reviewsEmitted = true
      continue
    }

    const value = content[toFieldName(key)]
    if (value?.de === undefined && value?.en === undefined) {
      missing.push(key)
      continue
    }
    de[key] = value.de ?? ''
    en[key] = value.en ?? ''
  }

  if (missing.length) {
    throw new Error(
      `${missing.length} key(s) missing from Sanity: ${missing.slice(0, 8).join(', ')}` +
        `${missing.length > 8 ? ' …' : ''}\nRun: npm run migrate`,
    )
  }

  return {de, en}
}

const renderReviewCards = (reviews, de) =>
  reviews
    .map((_, index) => {
      const n = index + 1
      return (
        `          <figure class="testimonial-card reveal">\n` +
        `            <blockquote data-i18n="reviews.${n}.quote">${de[`reviews.${n}.quote`]}</blockquote>\n` +
        `            <figcaption data-i18n="reviews.${n}.author">${de[`reviews.${n}.author`]}</figcaption>\n` +
        `          </figure>`
      )
    })
    .join('\n')

const run = async () => {
  const client = createClient({
    projectId: requireEnv('SANITY_PROJECT_ID'),
    dataset: process.env.SANITY_DATASET || 'production',
    // The dataset is private, so a token is required even to read.
    token: process.env.SANITY_READ_TOKEN || requireEnv('SANITY_WRITE_TOKEN'),
    apiVersion: '2024-10-01',
    // Builds must see what was just published, not a cached copy.
    useCdn: false,
  })

  const {content, images, reviews} = await client.fetch(QUERY)
  if (!content) throw new Error('No siteContent document found. Run: npm run migrate')
  if (!reviews.length) throw new Error('No approved reviews found. Run: npm run seed:reviews')

  const keyOrder = JSON.parse(await readFile(KEY_ORDER, 'utf8'))
  const {de, en} = buildDictionaries(content, reviews, keyOrder)

  const bySlot = new Map(images.map((image) => [image.slot, image]))
  const builder = createImageUrlBuilder(client)
  const urlFor = (slot, width) => {
    const record = bySlot.get(slot)
    if (!record) throw new Error(`No siteImage in Sanity for slot "${slot}". Run: npm run migrate`)
    return builder.image(record.image).width(width).quality(75).auto('format').url()
  }

  const $ = cheerio.load(await readFile(TEMPLATE, 'utf8'))

  $('img[src^="images/"]').each((_, element) => {
    const img = $(element)
    const width = Number(img.attr('width')) || 1080
    img.attr('src', urlFor(slotFromSrc(img.attr('src')), width))
  })

  $('video[poster^="images/"]').each((_, element) => {
    const video = $(element)
    const width = Number(video.attr('width')) || 1080
    video.attr('poster', urlFor(slotFromSrc(video.attr('poster')), width))
  })

  // og:image was a relative path, which social crawlers cannot resolve. The
  // Sanity URL is absolute, so this quietly fixes a broken share card.
  $('meta[property="og:image"]').each((_, element) => {
    const meta = $(element)
    meta.attr('content', urlFor(slotFromSrc(meta.attr('content')), 1200))
  })

  $('.testimonials-grid').html(`\n${renderReviewCards(reviews, de)}\n        `)

  // Bake the German copy into the markup. The dictionary still drives the
  // EN toggle at runtime, exactly as before.
  $('[data-i18n]').each((_, element) => {
    const node = $(element)
    const value = de[node.attr('data-i18n')]
    if (value !== undefined) node.text(value)
  })

  for (const [dataAttribute, target] of [
    ['data-i18n-alt', 'alt'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-href', 'href'],
    ['data-i18n-content', 'content'],
  ]) {
    $(`[${dataAttribute}]`).each((_, element) => {
      const node = $(element)
      const value = de[node.attr(dataAttribute)]
      if (value !== undefined) node.attr(target, value)
    })
  }

  const html = $.html()
  const {start, end} = locateTranslations(html)
  const output = html.slice(0, start) + renderTranslations(de, en) + html.slice(end)

  await rm(DIST, {recursive: true, force: true})
  await mkdir(DIST, {recursive: true})
  await writeFile(path.join(DIST, 'index.html'), output, 'utf8')
  for (const file of STATIC_FILES) {
    await cp(path.join(root, file), path.join(DIST, file))
  }

  console.log(`✓ dist/index.html`)
  console.log(`  ${Object.keys(de).length} keys · ${images.length} images · ${reviews.length} reviews`)
  console.log(`  ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB`)
}

run().catch((error) => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})

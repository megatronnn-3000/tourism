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
import {requireEnv, optionalEnv, requireProjectId} from './scripts/lib/env.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.join(root, 'src', 'template.html')
const KEY_ORDER = path.join(root, 'scripts', 'key-order.json')
const DIST = path.join(root, 'dist')

// Copied verbatim into dist. Everything else the page needs comes from Sanity.
// [source, published name]
const STATIC_FILES = [
  ['video-gast.mp4', 'video-gast.mp4'],
  ['src/404.html', '404.html'],
  ['src/favicon.svg', 'favicon.svg'],
  ['src/legal.css', 'legal.css'],
  ['src/legal-notice.html', 'legal-notice.html'],
  ['src/privacy.html', 'privacy.html'],
  ['src/terms.html', 'terms.html'],
  ['src/fonts.css', 'fonts.css'],
  ['src/fonts', 'fonts'],
]

// The legal pages ship with marked blanks (postal address, email, cancellation
// percentages). Launching with those visible would be worse than having no page,
// so the build counts them and says so rather than letting them slip through.
const PLACEHOLDER = /class="todo"/g

// Review text is stored bare so a guest who never types „ or “ renders the same
// as the seeded testimonials. DE opens low, EN opens high, both close high.
const QUOTES = {de: ['„', '”'], en: ['“', '”']}

const REVIEW_KEY = /^reviews\.\d+\./

const slotFromSrc = (src) => src.replace(/^images\//, '').replace(/\.[^.]+$/, '')

const QUERY = `{
  "content": *[_id == "siteContent"][0],
  "images": *[_type == "siteImage"]{slot, image, alt},
  "reviews": *[_type == "review" && status == "approved"] | order(submittedAt desc){
    author, city, rating, quoteDe, quoteEn
  }
}`

// Review text is written by the public. It reaches the page twice — as markup
// and as a string inside a <script> block — so both paths need escaping, even
// though Govind reads every review first. "</" would otherwise let a quote
// close the script tag early.
const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const jsonForScript = (value) => JSON.stringify(value).replace(/<\//g, '<\\/')

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
    lines.push(`        ${jsonForScript(key)}: ${jsonForScript(value)}${comma}`)
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
    .map((review, index) => {
      const n = index + 1
      const rating = Math.min(5, Math.max(1, Math.round(Number(review.rating)) || 5))
      // "4/5" rather than a translated label, so the toggle cannot leave it stale.
      const stars = `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`
      return (
        `          <figure class="testimonial-card reveal">\n` +
        `            <div class="testimonial-rating" role="img" aria-label="${rating}/5">${stars}</div>\n` +
        `            <blockquote data-i18n="reviews.${n}.quote">${escapeHtml(de[`reviews.${n}.quote`])}</blockquote>\n` +
        `            <figcaption data-i18n="reviews.${n}.author">${escapeHtml(de[`reviews.${n}.author`])}</figcaption>\n` +
        `          </figure>`
      )
    })
    .join('\n')

const run = async () => {
  const client = createClient({
    projectId: requireProjectId(),
    dataset: optionalEnv('SANITY_DATASET', 'production'),
    // The dataset is private, so a token is required even to read.
    token: optionalEnv('SANITY_READ_TOKEN', null) ?? requireEnv('SANITY_WRITE_TOKEN'),
    apiVersion: '2024-10-01',
    // Builds must see what was just published, not a cached copy.
    useCdn: false,
  })

  const {content, images, reviews} = await client.fetch(QUERY)
  if (!content) throw new Error('No siteContent document found. Run: npm run migrate')

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
    const declared = Number(img.attr('width')) || 1080
    // A gallery tile never renders wider than about 400 CSS pixels, so the
    // declared source width is several times what any screen can use. 800
    // still covers a 2x display.
    const width = img.closest('.gallery-item').length ? Math.min(declared, 800) : declared
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

  // No approved reviews is a legitimate content state — the first guest review
  // has not been published yet, or every one was rejected. Dropping the grid is
  // correct; failing the build over it would let content take the site down.
  if (reviews.length) {
    $('.testimonials-grid').html(`\n${renderReviewCards(reviews, de)}\n        `)
  } else {
    $('.testimonials-grid').remove()
  }

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

  // Only emitted when the production origin is known. On preview deploys it is
  // absent, which is correct: a canonical pointing at production would tell
  // Google to credit production for the preview's content.
  const siteUrl = optionalEnv('SITE_URL', null)?.replace(/\/+$/, '')
  if (siteUrl) {
    $('head').append(`\n  <link rel="canonical" href="${siteUrl}/">`)
    $('head').append(`\n  <meta property="og:url" content="${siteUrl}/">\n`)
  }

  const html = $.html()
  const {start, end} = locateTranslations(html)
  const output = html.slice(0, start) + renderTranslations(de, en) + html.slice(end)

  await rm(DIST, {recursive: true, force: true})
  await mkdir(DIST, {recursive: true})
  await writeFile(path.join(DIST, 'index.html'), output, 'utf8')
  let placeholders = 0
  for (const [source, published] of STATIC_FILES) {
    const from = path.join(root, source)
    await cp(from, path.join(DIST, published), {recursive: true})
    if (published.endsWith('.html')) {
      placeholders += ((await readFile(from, 'utf8')).match(PLACEHOLDER) ?? []).length
    }
  }

  await writeFile(
    path.join(DIST, 'robots.txt'),
    `User-agent: *\nAllow: /\n${siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ''}`,
    'utf8',
  )

  if (siteUrl) {
    await writeFile(
      path.join(DIST, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url>\n` +
        `    <loc>${siteUrl}/</loc>\n` +
        `    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n` +
        `  </url>\n` +
        `</urlset>\n`,
      'utf8',
    )
  }

  console.log(`✓ dist/index.html`)
  console.log(`  ${Object.keys(de).length} keys · ${images.length} images · ${reviews.length} reviews`)
  console.log(`  ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB`)
  console.log(
    siteUrl
      ? `  canonical, robots.txt and sitemap.xml for ${siteUrl}`
      : `  SITE_URL not set — no canonical or sitemap (fine for previews)`,
  )
  if (placeholders) {
    console.log(`\n⚠ ${placeholders} unfilled placeholder(s) in the legal pages — do not launch with these.`)
  }
}

run().catch((error) => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})

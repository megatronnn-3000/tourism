// Accepts a guest review and stores it in Sanity as pending.
//
// Nothing written here reaches the site. Reviews render only when Govind sets
// status to "approved" in the Studio and the site rebuilds, so moderation — not
// this endpoint — is the security boundary. Spam that gets past the checks
// below is an item in his queue, never a page change.

import {createClient} from '@sanity/client'

const MAX = {author: 80, city: 80, quote: 1200}
const MIN_QUOTE = 20

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
  })

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

const validate = (payload) => {
  const author = clean(payload.author)
  const city = clean(payload.city)
  const quote = clean(payload.quote)
  const rating = Number(payload.rating)
  const language = payload.language === 'en' ? 'en' : 'de'

  if (!author || author.length > MAX.author) return {error: 'author'}
  if (city.length > MAX.city) return {error: 'city'}
  if (!quote || quote.length < MIN_QUOTE || quote.length > MAX.quote) return {error: 'quote'}
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return {error: 'rating'}
  if (payload.consent !== 'on' && payload.consent !== true) return {error: 'consent'}

  return {review: {author, city, quote, rating, language}}
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ok: false, message: 'Method not allowed'}, 405)

    let payload
    try {
      payload = await request.json()
    } catch {
      return json({ok: false, message: 'Invalid JSON'}, 400)
    }

    // Hidden field. A real guest never sees it; bots fill everything.
    if (clean(payload.botcheck) || payload.botcheck === 'on') {
      // Answer as if it worked, so the bot has no signal to retry differently.
      return json({ok: true})
    }

    const {error, review} = validate(payload)
    if (error) return json({ok: false, message: `Invalid field: ${error}`}, 422)

    const projectId = process.env.SANITY_PROJECT_ID?.trim()
    const token = process.env.SANITY_WRITE_TOKEN?.trim()
    if (!projectId || !token) {
      console.error('submit-review: SANITY_PROJECT_ID or SANITY_WRITE_TOKEN is not set')
      return json({ok: false, message: 'Server not configured'}, 500)
    }

    const client = createClient({
      projectId,
      dataset: process.env.SANITY_DATASET?.trim() || 'production',
      token,
      apiVersion: '2024-10-01',
      useCdn: false,
    })

    try {
      await client.create({
        _type: 'review',
        author: review.author,
        city: review.city,
        rating: review.rating,
        language: review.language,
        // Locked in the Studio: the record of what the guest actually wrote.
        quoteOriginal: review.quote,
        // Pre-filled in the submitted language so Govind only translates the other.
        [review.language === 'en' ? 'quoteEn' : 'quoteDe']: review.quote,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      })
    } catch (cause) {
      console.error('submit-review: failed to write to Sanity', cause)
      return json({ok: false, message: 'Could not save review'}, 502)
    }

    return json({ok: true})
  },
}

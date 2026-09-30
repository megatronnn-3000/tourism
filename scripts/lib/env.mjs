// Values pasted into a dashboard field routinely arrive wrapped in quotes or
// with a trailing newline, and the downstream errors for that are cryptic
// ("`projectId` can only contain only a-z, 0-9 and dashes"). Clean the input
// and, when it is still wrong, say exactly what was received.

const clean = (value) => value.trim().replace(/^["']|["']$/g, '').trim()

export const requireEnv = (name) => {
  const raw = process.env[name]
  if (raw === undefined || clean(raw) === '') {
    throw new Error(
      `${name} is not set.\n` +
        '  Locally: copy .env.example to .env and fill it in.\n' +
        '  On Vercel: Settings → Environment Variables (tick Production and Preview).',
    )
  }
  return clean(raw)
}

export const optionalEnv = (name, fallback) => {
  const raw = process.env[name]
  return raw === undefined || clean(raw) === '' ? fallback : clean(raw)
}

export const requireProjectId = () => {
  const value = requireEnv('SANITY_PROJECT_ID')
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(
      `SANITY_PROJECT_ID may contain only a-z, 0-9 and dashes, but is ${JSON.stringify(value)}.\n` +
        '  Check the value in Vercel for quotes, spaces or a trailing newline —\n' +
        '  paste only the id itself, e.g. 2anoatlz (no quotes, no SANITY_PROJECT_ID= prefix).',
    )
  }
  return value
}

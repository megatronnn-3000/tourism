// Serves dist/ over HTTP so the built site can be checked the way it is
// actually deployed.
//
//   npm run serve
//
// Opening dist/index.html as a file:// URL does not work: the pages reference
// /fonts.css, /legal.css and /legal.js by absolute path, which file:// resolves
// against the filesystem root. Fonts and the legal pages' styling silently go
// missing, so the local preview is not what visitors get.

import {createServer} from 'node:http'
import {readFile, stat} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist')
const PORT = Number(process.env.PORT) || 4321

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

const serve = async (response, filePath, status = 200) => {
  const body = await readFile(filePath)
  response.writeHead(status, {
    'Content-Type': TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  let target = path.join(DIST, requested === '/' ? 'index.html' : requested)

  // Keep traversal inside dist.
  if (!target.startsWith(DIST)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  try {
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html')
    await serve(response, target)
  } catch {
    try {
      await serve(response, path.join(DIST, '404.html'), 404)
    } catch {
      response.writeHead(404, {'Content-Type': 'text/plain'}).end('Not found')
    }
  }
}).listen(PORT, () => {
  console.log(`dist/ is being served at http://localhost:${PORT}`)
  console.log('Legal pages: /privacy.html  /terms.html  /legal-notice.html')
})

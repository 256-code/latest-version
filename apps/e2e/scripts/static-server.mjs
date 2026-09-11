import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const port = Number(process.argv[3] || 3100)
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  let file = path.join(root, url)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const html = file.replace(/\/$/, '') + '.html'
    file = fs.existsSync(html) ? html : path.join(root, 'index.html')
  }
  const body = fs.readFileSync(file)
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
  res.end(body)
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`))

import { createServer } from 'http'
import { default as handler } from './api/check.js'

function buildRes(res) {
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data, null, 2))
  }
  return res
}

function buildReq(req) {
  return Object.assign(req, {
    method: req.method,
    headers: req.headers,
  })
}

const server = createServer((req, res) => {
  handler(buildReq(req), buildRes(res))
})

server.listen(3000, () => {
  console.log('Dev server running at http://localhost:3000')
  console.log('Test with:')
  console.log(`  curl -H "x-cron-secret: ${process.env.CRON_SECRET}" http://localhost:3000/api/check`)
})

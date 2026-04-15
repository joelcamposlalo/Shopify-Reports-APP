import http from 'http'
import { exec } from 'child_process'

import 'dotenv/config'

const CLIENT_ID = process.env.SHOPIFY_API_KEY
const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET
const SHOP = process.env.SHOPIFY_SHOP
const REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI
const SCOPES = 'read_orders,read_analytics,read_products,read_customers,read_reports'

const authUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}`
exec(`start ${authUrl}`)

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, 'http://localhost:3000').searchParams.get('code')
  if (!code) return

  const response = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code })
  })

  const data = await response.json()
  console.log('\n✅ TU ACCESS TOKEN:', data.access_token)
  
  res.end('Listo, ya puedes cerrar esta pestaña')
  server.close()
})

server.listen(3000, () => console.log('Abre el browser y autoriza...'))
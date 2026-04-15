import 'dotenv/config'

const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const SHOP = process.env.SHOPIFY_SHOP

const response = await fetch(`https://${SHOP}/admin/api/2025-10/graphql.json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': TOKEN
  },
  body: JSON.stringify({
    query: `{
      customers(first: 250) {
        edges {
          node {
            id
            createdAt
          }
        }
      }
    }`
  })
})

const data = await response.json()
const clientes = data.data.customers.edges.map(e => e.node)


const porMes = {}
clientes.forEach(c => {
  const mes = c.createdAt.substring(0, 7)
  porMes[mes] = (porMes[mes] || 0) + 1
})

console.log('\n📊 CLIENTES POR MES\n')
console.log(`${'Mes'.padEnd(15)} ${'Clientes'.padEnd(10)}`)
console.log('─'.repeat(25))
Object.keys(porMes).sort().forEach(mes => {
  console.log(`${mes.padEnd(15)} ${String(porMes[mes]).padEnd(10)}`)
})
console.log('─'.repeat(25))
console.log(`${'TOTAL'.padEnd(15)} ${clientes.length}`)
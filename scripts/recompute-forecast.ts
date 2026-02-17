import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { runForecaster } = await import('../lib/collectors/forecaster')
  const result = await runForecaster()
  console.log('Forecaster result:', JSON.stringify(result, null, 2))
}

main().catch(console.error)

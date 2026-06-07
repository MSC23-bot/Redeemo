import 'dotenv/config'
import { validateRequiredEnv } from './api/shared/env'
import { buildApp } from './api/app'

// Fail closed: refuse to boot if any required secret is missing/placeholder
// (SEC-C2). Throws a single error listing everything that's wrong.
validateRequiredEnv()

const PORT = parseInt(process.env.PORT ?? '3000', 10)

buildApp().then((app) => {
  app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      app.log.error(err)
      process.exit(1)
    }
  })
})

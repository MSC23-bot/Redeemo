import 'dotenv/config'
import { bootstrap } from './api/bootstrap'

// NOTE: do NOT statically `import` any app module here. `bootstrap()` runs the
// fail-closed env validation (SEC-C2) BEFORE dynamically importing the app
// graph, so a misconfigured environment reports ALL missing secrets in one
// aggregated error rather than throwing on the first module-level consumer
// (e.g. shared/stripe.ts). See src/api/bootstrap.ts.
bootstrap()
  .then((app) => {
    const PORT = parseInt(process.env.PORT ?? '3000', 10)
    app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
      if (err) {
        app.log.error(err)
        process.exit(1)
      }
    })
  })
  .catch((err: unknown) => {
    // Env-validation failure (or any boot failure) surfaces here. Print just the
    // message so the aggregated "[env] Refusing to start — …" list is the first
    // and only thing the operator sees (no stack noise).
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })

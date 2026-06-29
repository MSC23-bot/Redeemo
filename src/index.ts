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
      // Encryption key-rotation R1 (spec §3.9 / Amendment R3-#2): publish this
      // service's keyring fingerprint AFTER the server is up (so app.prisma is
      // ready). BEST-EFFORT and fire-and-forget — a publish failure logs + is
      // swallowed inside publishKeyringFingerprint and must NEVER block startup
      // or take the process down. (It only blocks later rotation, via the
      // migrator's parity gate.) The import is DYNAMIC to preserve the
      // app-module-free static graph in this file (see bootstrap.ts).
      void import('./api/shared/keyring')
        .then(({ publishKeyringFingerprint }) => publishKeyringFingerprint(app.prisma, 'web'))
        .catch(() => undefined)
    })

    // Graceful shutdown. PR-0.4 makes the API a queue PRODUCER (notify() enqueues
    // email jobs), so the producer queue connection must be closed on the way out
    // alongside Fastify's onClose hooks (prisma.$disconnect, redis.quit). The
    // import stays DYNAMIC so the static graph here remains app-module-free (the
    // aggregated env-validation contract above).
    let shuttingDown = false
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return
      shuttingDown = true
      app.log.info(`[api] ${signal} received — shutting down`)
      try {
        await app.close()
        const { closeQueues } = await import('./api/queues')
        await closeQueues()
      } catch (err) {
        app.log.error(err)
      } finally {
        process.exit(0)
      }
    }
    process.on('SIGTERM', () => void shutdown('SIGTERM'))
    process.on('SIGINT', () => void shutdown('SIGINT'))
  })
  .catch((err: unknown) => {
    // Env-validation failure (or any boot failure) surfaces here. Print just the
    // message so the aggregated "[env] Refusing to start — …" list is the first
    // and only thing the operator sees (no stack noise).
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })

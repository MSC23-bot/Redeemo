import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import Redis from 'ioredis'

async function redisPlugin(app: FastifyInstance) {
  const redis = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    // F2: bound connection/reconnection attempts so a down Redis fails fast
    // instead of hanging — short enough for the rate-limiter's skipOnError
    // fail-open to engage promptly, but kept CONSERVATIVE (1.5s) because this is
    // the SHARED client used by auth / session / OTP flows too, where a too-eager
    // timeout would cause false disconnects.
    connectTimeout: 1500,
  })

  await redis.connect()

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await redis.quit()
  })
}

export default fp(redisPlugin, { name: 'redis' })

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

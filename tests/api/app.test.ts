import { describe, it, expect } from 'vitest'
import { buildApp } from '../../src/api/app'

describe('app factory', () => {
  it('builds a Fastify app without throwing', async () => {
    const app = await buildApp()
    expect(app).toBeDefined()
    await app.close()
  })

  it('responds 200 to GET /health', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' })
    await app.close()
  })
})

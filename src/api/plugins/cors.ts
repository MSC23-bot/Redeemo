import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'

async function corsPlugin(app: FastifyInstance) {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
}

export default fp(corsPlugin, { name: 'cors' })

// Augment @fastify/jwt to type req.user for the merchant namespace.
// This flows through FastifyJWT.user → fastifyJwt.UserType → FastifyRequest.user.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      sub: string
      role: string
      deviceId: string
      sessionId: string
    }
  }
}

export {}

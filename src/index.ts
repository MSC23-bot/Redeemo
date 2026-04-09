import 'dotenv/config'
import { buildApp } from './api/app'

const PORT = parseInt(process.env.PORT ?? '3000', 10)

buildApp().then((app) => {
  app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      app.log.error(err)
      process.exit(1)
    }
  })
})

async function mailRoutes(fastify) {
  fastify.get('/mail/test', async () => {
    return { message: 'Mail routes working' }
  })
}

module.exports = mailRoutes

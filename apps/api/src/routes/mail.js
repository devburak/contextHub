async function mailRoutes(fastify) {
  fastify.get('/mail/test', async (request, reply) => {
    return { message: 'Mail routes working' }
  })
}

module.exports = mailRoutes

// Função serverless (Vercel): todos os pedidos chegam aqui e são tratados pela aplicação Nest compilada em dist/.
module.exports = require('../dist/vercel').default;

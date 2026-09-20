/**
 * Script administrativo: gera ESTIMATIVAS de preços via Gemini.
 * NÃO grava em tbltacoNL.preco_medio.
 * Opcionalmente escreve um arquivo de log com as estimativas.
 *
 * Uso:
 *   node scripts/atualizar-precos-estimados.js
 *
 * Requer: GEMINI_API_KEY, DB_*, e ADMIN_JOB_SECRET no ambiente
 * (o script só roda se ADMIN_JOB_SECRET estiver definido — proteção contra execução acidental).
 *
 * Variáveis opcionais:
 *   PRECOS_ESTIMADOS_LOG=caminho/arquivo.json  — grava as estimativas em arquivo
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

if (!process.env.ADMIN_JOB_SECRET) {
  console.error(
    'Recusado: defina ADMIN_JOB_SECRET no ambiente para executar este job.'
  );
  process.exit(1);
}

const { preencherAlimentos } = require('../src/controllers/precoController');
const { poolPromise } = require('../src/config/db');

async function main() {
  const req = { body: {}, headers: {}, ip: 'cli' };
  let payloadFinal = null;

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      payloadFinal = payload;
      console.log(
        JSON.stringify({
          status: this.statusCode,
          mensagem: payload.mensagem,
          tipo: payload.tipo,
          total: payload.total,
          coletado_em: payload.coletado_em,
          erro: payload.erro,
        })
      );
      return this;
    },
  };

  await preencherAlimentos(req, res);

  if (
    payloadFinal &&
    Array.isArray(payloadFinal.estimativas) &&
    process.env.PRECOS_ESTIMADOS_LOG
  ) {
    const outPath = path.resolve(process.env.PRECOS_ESTIMADOS_LOG);
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          gerado_em: new Date().toISOString(),
          tipo: 'ESTIMATIVAS',
          fonte: 'estimativa_ia',
          localidade: 'BR',
          total: payloadFinal.estimativas.length,
          estimativas: payloadFinal.estimativas,
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`Log de estimativas gravado em: ${outPath}`);
  }

  if (res.statusCode >= 400) {
    process.exit(1);
  }

  // Sem fechar o pool o Node continua aguardando a conexão aberta e o job nunca termina.
  const pool = await poolPromise;
  await pool.close();
}

main().catch((err) => {
  console.error('Falha no job de preços:', err.message);
  process.exit(1);
});

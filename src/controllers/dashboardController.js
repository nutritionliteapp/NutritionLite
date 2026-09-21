const { sql, poolPromise } = require('../config/db');
const logger = require('../utils/logger');
const { montarResumo } = require('../services/dashboardResumo');

/** Quantas fichas recentes entram no gráfico de evolução. */
const LIMITE_FICHAS = 12;

/**
 * Consulta opcional: se a tabela/coluna não existe neste banco (208 = objeto, 207 = coluna),
 * devolve `padrao` em vez de derrubar o dashboard inteiro. Qualquer outro erro sobe.
 */
async function opcional(consulta, padrao) {
  try {
    return await consulta();
  } catch (err) {
    if (err && (err.number === 207 || err.number === 208)) return padrao;
    throw err;
  }
}

/** Tenta o esquema atual (ficha_id) e, se a coluna for a legada ([fich-id]), a variante antiga. */
async function comFallbackLegado(atual, legado, padrao) {
  return opcional(async () => {
    try {
      return await atual();
    } catch (err) {
      if (!/Invalid column name/i.test(err.message || '')) throw err;
      return legado();
    }
  }, padrao);
}

const obterResumo = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const pool = await poolPromise;
    const pedido = () => pool.request().input('id', sql.Int, usuarioId);

    const usuarioResult = await pedido().query(`
      SELECT u.nome, u.peso, u.altura, u.idade, m.peso_alvo, m.foco_principal
      FROM usuarios u
      LEFT JOIN metasUsuario m ON m.usuario_id = u.id
      WHERE u.id = @id
    `);
    const usuario = usuarioResult.recordset[0] || null;
    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }

    const fichasResult = await pedido().query(`
      SELECT TOP ${LIMITE_FICHAS} id, objetivo, total_kcal, total_proteina, total_carboidratos,
             total_gordura, total_fibra, data_criacao
      FROM fichaAlimentar
      WHERE usuario_id = @id
      ORDER BY data_criacao DESC
    `);
    const fichas = fichasResult.recordset;

    const totalResult = await pedido().query(
      'SELECT COUNT(*) AS total FROM fichaAlimentar WHERE usuario_id = @id'
    );
    const totalFichas = totalResult.recordset[0] ? totalResult.recordset[0].total : 0;

    // Itens da ficha mais recente, já com as calorias por 100 g da TACO
    let itensUltimaFicha = [];
    if (fichas.length > 0) {
      const fichaId = fichas[0].id;
      const juncao = `LEFT JOIN tbltacoNL t ON CAST(t.id_alimento AS NVARCHAR(100)) = CAST(fa.alimento_id AS NVARCHAR(100))`;
      itensUltimaFicha = await comFallbackLegado(
        async () =>
          (
            await pool.request().input('ficha_id', sql.Int, fichaId).query(`
              SELECT fa.nome_alimento, fa.quantity_g, fa.meal_type, t.energia_kcal
              FROM fichaAlimentos fa ${juncao}
              WHERE fa.ficha_id = @ficha_id
            `)
          ).recordset,
        async () =>
          (
            await pool.request().input('ficha_id', sql.Int, fichaId).query(`
              SELECT fa.nome_alimento, 100 AS quantity_g, NULL AS meal_type, t.energia_kcal
              FROM fichaAlimentos fa ${juncao}
              WHERE fa.[fich-id] = @ficha_id
            `)
          ).recordset,
        []
      );
    }

    const alimentosFrequentes = await comFallbackLegado(
      async () =>
        (
          await pedido().query(`
            SELECT TOP 6 fa.nome_alimento, COUNT(*) AS vezes
            FROM fichaAlimentos fa
            INNER JOIN fichaAlimentar f ON f.id = fa.ficha_id
            WHERE f.usuario_id = @id
            GROUP BY fa.nome_alimento
            ORDER BY COUNT(*) DESC, fa.nome_alimento
          `)
        ).recordset,
      async () =>
        (
          await pedido().query(`
            SELECT TOP 6 fa.nome_alimento, COUNT(*) AS vezes
            FROM fichaAlimentos fa
            INNER JOIN fichaAlimentar f ON f.id = fa.[fich-id]
            WHERE f.usuario_id = @id
            GROUP BY fa.nome_alimento
            ORDER BY COUNT(*) DESC, fa.nome_alimento
          `)
        ).recordset,
      []
    );

    const chat = await opcional(
      async () =>
        (
          await pedido().query(`
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN favorita = 1 THEN 1 ELSE 0 END) AS favoritas
            FROM chatHistorico
            WHERE usuario_id = @id
          `)
        ).recordset[0] || {},
      {}
    );

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      ...montarResumo({ usuario, fichas, totalFichas, itensUltimaFicha, alimentosFrequentes, chat }),
      gerado_em: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`obterResumo (dashboard): ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro interno ao montar o dashboard.' });
  }
};

module.exports = { obterResumo };

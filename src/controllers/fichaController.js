const { validationResult } = require('express-validator');
const { sql, poolPromise } = require('../config/db');
const logger = require('../utils/logger');
const {
  parseToFloat,
  normalizeFichaItem,
  sumTotals,
} = require('../services/nutritionCalculator');

const shuffleArray = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Resolve itens do body para linhas TACO + quantity_g.
 * Preferência: food_id. Rejeita payload só com nomes.
 */
async function resolveAlimentosComQuantidade(transaction, alimentosRaw) {
  if (!Array.isArray(alimentosRaw) || alimentosRaw.length === 0) {
    const err = new Error('A lista de alimentos deve conter ao menos 1 item.');
    err.status = 400;
    throw err;
  }

  // Compat: array de strings → rejeitado (não é identificador principal)
  if (typeof alimentosRaw[0] === 'string') {
    const err = new Error(
      'Envie alimentos como objetos { food_id, quantity_g }. Nome sozinho não é aceito.'
    );
    err.status = 400;
    throw err;
  }

  const normalized = [];
  for (let i = 0; i < alimentosRaw.length; i++) {
    const n = normalizeFichaItem(alimentosRaw[i], i);
    if (!n.ok) {
      const err = new Error(n.mensagem);
      err.status = 400;
      throw err;
    }
    normalized.push(n.value);
  }

  const ids = [...new Set(normalized.map((a) => a.food_id))];
  const request = new sql.Request(transaction);
  const placeholders = ids.map((_, i) => `@fid${i}`).join(', ');
  ids.forEach((id, i) => {
    request.input(`fid${i}`, sql.NVarChar, String(id));
  });

  const result = await request.query(
    `SELECT id_alimento, nome_alimento, energia_kcal, proteina, carboidratos, lipideos, fibra_alimentar
     FROM tbltacoNL WHERE CAST(id_alimento AS NVARCHAR(100)) IN (${placeholders})`
  );

  const byId = new Map(
    result.recordset.map((r) => [String(r.id_alimento), r])
  );

  const rows = [];
  for (const item of normalized) {
    const food = byId.get(String(item.food_id));
    if (!food) {
      const err = new Error(`Alimento não encontrado: food_id=${item.food_id}`);
      err.status = 404;
      throw err;
    }
    rows.push({
      ...food,
      food_id: String(food.id_alimento),
      quantity_g: item.quantity_g,
      meal_type: item.meal_type,
    });
  }

  return rows;
}

async function insertFichaItens(transaction, fichaId, rows) {
  for (const item of rows) {
    const req = new sql.Request(transaction)
      .input('ficha_id', sql.Int, fichaId)
      .input('alimento_id', sql.NVarChar, String(item.id_alimento))
      .input('nome_alimento', sql.VarChar, item.nome_alimento)
      .input('quantity_g', sql.Decimal(10, 2), item.quantity_g)
      .input('meal_type', sql.VarChar, item.meal_type);

    try {
      await req.query(`
        INSERT INTO fichaAlimentos (ficha_id, alimento_id, nome_alimento, quantity_g, meal_type)
        VALUES (@ficha_id, @alimento_id, @nome_alimento, @quantity_g, @meal_type)
      `);
    } catch (err) {
      // Fallback legado pré-migration 002
      if (/Invalid column name|ficha_id|quantity_g/i.test(err.message)) {
        await new sql.Request(transaction)
          .input('ficha_id', sql.Int, fichaId)
          .input('alimento_id', sql.NVarChar, String(item.id_alimento))
          .input('nome_alimento', sql.VarChar, item.nome_alimento)
          .query(
            'INSERT INTO fichaAlimentos ([fich-id], alimento_id, nome_alimento) VALUES (@ficha_id, @alimento_id, @nome_alimento)'
          );
      } else {
        throw err;
      }
    }
  }
}

async function deleteFichaItens(transaction, fichaId) {
  try {
    await new sql.Request(transaction)
      .input('ficha_id', sql.Int, fichaId)
      .query('DELETE FROM fichaAlimentos WHERE ficha_id = @ficha_id');
  } catch (err) {
    if (/Invalid column name|ficha_id/i.test(err.message)) {
      await new sql.Request(transaction)
        .input('ficha_id', sql.Int, fichaId)
        .query('DELETE FROM fichaAlimentos WHERE [fich-id] = @ficha_id');
    } else if (!/Invalid object name/i.test(err.message)) {
      throw err;
    }
  }
}

const criarFicha = async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    const { alimentos, objetivo } = req.body;
    const usuarioId = req.usuario.id;

    await transaction.begin();
    const rows = await resolveAlimentosComQuantidade(transaction, alimentos);
    const totals = sumTotals(rows);

    const insertResult = await new sql.Request(transaction)
      .input('usuario_id', sql.Int, usuarioId)
      .input('objetivo', sql.VarChar, objetivo)
      .input('total_kcal', sql.Float, totals.total_kcal)
      .input('total_proteina', sql.Float, totals.total_proteina)
      .input('total_carboidratos', sql.Float, totals.total_carboidratos)
      .input('total_gordura', sql.Float, totals.total_gordura)
      .input('total_fibra', sql.Float, totals.total_fibra)
      .query(`
        INSERT INTO fichaAlimentar
        (usuario_id, objetivo, total_kcal, total_proteina, total_carboidratos, total_gordura, total_fibra)
        OUTPUT INSERTED.id AS id
        VALUES (@usuario_id, @objetivo, @total_kcal, @total_proteina, @total_carboidratos, @total_gordura, @total_fibra)
      `);

    const fichaId = insertResult.recordset[0].id;
    await insertFichaItens(transaction, fichaId, rows);
    await transaction.commit();

    return res.status(201).json({
      mensagem: 'Ficha alimentar criada com sucesso!',
      id: fichaId,
      ...totals,
      itens: rows.map((r) => ({
        food_id: r.food_id,
        nome_alimento: r.nome_alimento,
        quantity_g: r.quantity_g,
        meal_type: r.meal_type,
      })),
    });
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (_) {
      /* ignore */
    }
    logger.error(`criarFicha: ${error.message}`);
    const status = error.status || 500;
    return res.status(status).json({
      mensagem:
        status === 500
          ? 'Erro interno ao criar a ficha alimentar.'
          : error.message,
    });
  }
};

const listarFichas = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('usuario_id', sql.Int, usuarioId)
      .query(
        `SELECT id, usuario_id, objetivo, total_kcal, total_proteina, total_carboidratos,
                total_gordura, total_fibra, data_criacao
         FROM fichaAlimentar
         WHERE usuario_id = @usuario_id
         ORDER BY data_criacao DESC`
      );
    return res.status(200).json(result.recordset);
  } catch (error) {
    logger.error(`listarFichas: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro ao buscar fichas alimentares.' });
  }
};

const deletarFicha = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    if (!id) {
      return res.status(400).json({ mensagem: 'ID da ficha não fornecido' });
    }

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const ownership = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('usuario_id', sql.Int, usuarioId)
        .query(
          'SELECT id FROM fichaAlimentar WHERE id = @id AND usuario_id = @usuario_id'
        );

      if (ownership.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ mensagem: 'Ficha não encontrada' });
      }

      await deleteFichaItens(transaction, id);

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('usuario_id', sql.Int, usuarioId)
        .query(
          'DELETE FROM fichaAlimentar WHERE id = @id AND usuario_id = @usuario_id'
        );

      await transaction.commit();
      return res.status(200).json({ mensagem: 'Ficha deletada com sucesso' });
    } catch (transErr) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* ignore */
      }
      throw transErr;
    }
  } catch (erro) {
    logger.error(`deletarFicha: ${erro.message}`);
    return res.status(500).json({ mensagem: 'Erro ao deletar ficha alimentar' });
  }
};

const atualizarObjetivoFicha = async (req, res) => {
  try {
    const { objetivo } = req.body;
    const usuarioId = req.usuario.id;
    const objetivosPermitidos = ['perder_peso', 'ganhar_massa', 'manter_saude'];
    if (!objetivo || !objetivosPermitidos.includes(objetivo)) {
      return res.status(400).json({
        mensagem:
          'Objetivo inválido. Use: perder_peso, ganhar_massa ou manter_saude',
      });
    }

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('usuario_id', sql.Int, usuarioId)
      .input('objetivo', sql.VarChar, objetivo)
      .query(`
        UPDATE fichaAlimentar
        SET objetivo = @objetivo
        WHERE id = (
          SELECT TOP 1 id FROM fichaAlimentar
          WHERE usuario_id = @usuario_id
          ORDER BY data_criacao DESC
        )
      `);

    if (!result.rowsAffected || result.rowsAffected[0] === 0) {
      return res.status(404).json({ mensagem: 'Nenhuma ficha encontrada para atualizar.' });
    }

    return res.status(200).json({ mensagem: 'Objetivo da ficha atualizado com sucesso!', objetivo });
  } catch (error) {
    logger.error(`atualizarObjetivoFicha: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro ao atualizar objetivo da ficha.' });
  }
};

const recomendarDieta = async (req, res) => {
  const { objetivo } = req.body;
  try {
    const pool = await poolPromise;
    // Tabela TACO inteira (~600 linhas): um TOP 200 sem ORDER BY deixava categorias inteiras de fora.
    const result = await pool.request().query(`
      SELECT id_alimento, nome_alimento, energia_kcal, proteina, carboidratos,
             lipideos, fibra_alimentar, sodio
      FROM tbltacoNL
    `);
    const alimentos = result.recordset;
    let recomendados = [];

    // Valores como "Tr"/"NA" não são numéricos; parseToFloat os trata como 0 e eles passariam em "< 100 kcal".
    const temValor = (v) => v !== null && v !== undefined && /\d/.test(String(v));

    if (objetivo === 'perder_peso') {
      recomendados = alimentos.filter(
        (item) =>
          temValor(item.energia_kcal) &&
          temValor(item.lipideos) &&
          parseToFloat(item.energia_kcal) < 100 &&
          parseToFloat(item.lipideos) < 5
      );
    } else if (objetivo === 'ganhar_massa') {
      recomendados = alimentos.filter(
        (item) =>
          parseToFloat(item.proteina) > 10 && parseToFloat(item.energia_kcal) > 150
      );
    } else if (objetivo === 'manter_saude') {
      recomendados = alimentos.filter(
        (item) =>
          temValor(item.sodio) &&
          parseToFloat(item.fibra_alimentar) >= 2 &&
          parseToFloat(item.sodio) < 500
      );
    }

    recomendados = shuffleArray(recomendados).slice(0, 2);
    return res.status(200).json({ alimentos_recomendados: recomendados });
  } catch (error) {
    logger.error(`recomendarDieta: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro interno ao recomendar dieta.' });
  }
};

const atualizarFicha = async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    const { id } = req.params;
    const { objetivo, alimentos } = req.body;
    const usuarioId = req.usuario.id;

    await transaction.begin();

    const fichaCheck = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('usuario_id', sql.Int, usuarioId)
      .query(
        'SELECT id FROM fichaAlimentar WHERE id = @id AND usuario_id = @usuario_id'
      );

    if (fichaCheck.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ mensagem: 'Ficha não encontrada' });
    }

    const rows = await resolveAlimentosComQuantidade(transaction, alimentos);
    const totals = sumTotals(rows);

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('usuario_id', sql.Int, usuarioId)
      .input('objetivo', sql.VarChar, objetivo)
      .input('total_kcal', sql.Float, totals.total_kcal)
      .input('total_proteina', sql.Float, totals.total_proteina)
      .input('total_carboidratos', sql.Float, totals.total_carboidratos)
      .input('total_gordura', sql.Float, totals.total_gordura)
      .input('total_fibra', sql.Float, totals.total_fibra)
      .query(`
        UPDATE fichaAlimentar
        SET objetivo = @objetivo,
            total_kcal = @total_kcal,
            total_proteina = @total_proteina,
            total_carboidratos = @total_carboidratos,
            total_gordura = @total_gordura,
            total_fibra = @total_fibra
        WHERE id = @id AND usuario_id = @usuario_id
      `);

    await deleteFichaItens(transaction, id);
    await insertFichaItens(transaction, id, rows);
    await transaction.commit();

    return res.status(200).json({
      mensagem: 'Ficha alimentar atualizada com sucesso!',
      ...totals,
    });
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (_) {
      /* ignore */
    }
    logger.error(`atualizarFicha: ${error.message}`);
    const status = error.status || 500;
    return res.status(status).json({
      mensagem:
        status === 500
          ? 'Erro interno ao atualizar a ficha alimentar.'
          : error.message,
    });
  }
};

const buscarFichaPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    const pool = await poolPromise;

    const fichaResult = await pool
      .request()
      .input('id', sql.Int, id)
      .input('usuario_id', sql.Int, usuarioId)
      .query(
        `SELECT id, usuario_id, objetivo, total_kcal, total_proteina, total_carboidratos,
                total_gordura, total_fibra, data_criacao
         FROM fichaAlimentar WHERE id = @id AND usuario_id = @usuario_id`
      );

    if (fichaResult.recordset.length === 0) {
      return res.status(404).json({ mensagem: 'Ficha não encontrada' });
    }

    const ficha = fichaResult.recordset[0];

    try {
      let alimentosResult;
      try {
        alimentosResult = await pool
          .request()
          .input('ficha_id', sql.Int, id)
          .query(`
            SELECT alimento_id AS food_id, nome_alimento, quantity_g, meal_type
            FROM fichaAlimentos WHERE ficha_id = @ficha_id
          `);
      } catch (colErr) {
        if (/Invalid column name|ficha_id|quantity_g/i.test(colErr.message)) {
          alimentosResult = await pool
            .request()
            .input('ficha_id', sql.Int, id)
            .query(`
              SELECT alimento_id AS food_id, nome_alimento, 100 AS quantity_g, NULL AS meal_type
              FROM fichaAlimentos WHERE [fich-id] = @ficha_id
            `);
        } else {
          throw colErr;
        }
      }
      ficha.alimentos = alimentosResult.recordset;
    } catch (err) {
      if (err.number === 208) {
        ficha.alimentos = [];
      } else {
        throw err;
      }
    }

    return res.status(200).json(ficha);
  } catch (error) {
    logger.error(`buscarFichaPorId: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro interno ao buscar a ficha.' });
  }
};

module.exports = {
  criarFicha,
  listarFichas,
  deletarFicha,
  recomendarDieta,
  atualizarObjetivoFicha,
  buscarFichaPorId,
  atualizarFicha,
};

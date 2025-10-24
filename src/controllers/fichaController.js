const { poolConnect, pool, sql } = require('../config/db');
const { validationResult } = require('express-validator');


const parseToFloat = (value) => {
  if (!value) return 0;
  return parseFloat(String(value).replace(',', '.'));
};

const criarFicha = async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  try {
    const { alimentos, objetivo } = req.body;
    const usuarioId = req.usuario.id;

    await poolConnect;
    const request = pool.request();

    const nomesFormatados = alimentos.map((_, i) => `@alimento${i}`).join(', ');
    alimentos.forEach((nome, i) => {
      request.input(`alimento${i}`, sql.VarChar, nome);
    });

    const query = `SELECT * FROM tbltacoNL WHERE nome_alimento IN (${nomesFormatados})`;
    const result = await request.query(query);
    const lista = result.recordset;

    if (lista.length === 0) {
      return res.status(404).json({ mensagem: 'Nenhum alimento encontrado.' });
    }

    let total_kcal = 0,
      total_proteina = 0,
      total_carboidratos = 0,
      total_gordura = 0,
      total_fibra = 0;

    lista.forEach((item) => {
      total_kcal += parseToFloat(item.energia_kcal);
      total_proteina += parseToFloat(item.proteina);
      total_carboidratos += parseToFloat(item.carboidratos);
      total_gordura += parseToFloat(item.lipideos);
      total_fibra += parseToFloat(item.fibra_alimentar);
    });

    total_kcal = parseFloat(total_kcal.toFixed(2));
    total_proteina = parseFloat(total_proteina.toFixed(2));
    total_carboidratos = parseFloat(total_carboidratos.toFixed(2));
    total_gordura = parseFloat(total_gordura.toFixed(2));
    total_fibra = parseFloat(total_fibra.toFixed(2));

    await pool.request()
      .input('usuario_id', sql.Int, usuarioId)
      .input('objetivo', sql.VarChar, objetivo)
      .input('total_kcal', sql.Float, total_kcal)
      .input('total_proteina', sql.Float, total_proteina)
      .input('total_carboidratos', sql.Float, total_carboidratos)
      .input('total_gordura', sql.Float, total_gordura)
      .input('total_fibra', sql.Float, total_fibra)
      .query(`
        INSERT INTO fichaAlimentar
        (usuario_id, objetivo, total_kcal, total_proteina, total_carboidratos, total_gordura, total_fibra)
        VALUES (@usuario_id, @objetivo, @total_kcal, @total_proteina, @total_carboidratos, @total_gordura, @total_fibra)
      `);

    return res.status(201).json({
      mensagem: 'Ficha alimentar criada com sucesso!',
      total_kcal,
      total_proteina,
      total_carboidratos,
      total_gordura,
      total_fibra,
    });
  } catch (error) {
    console.error('Erro ao criar ficha alimentar:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao criar a ficha alimentar.' });
  }
};

const listarFichas = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;

    await poolConnect;
    const request = pool.request();

    const result = await request
      .input('usuario_id', sql.Int, usuarioId)
      .query('SELECT * FROM fichaAlimentar WHERE usuario_id = @usuario_id ORDER BY data_criacao DESC');

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Erro ao listar fichas:', error);
    return res.status(500).json({ mensagem: 'Erro ao buscar fichas alimentares.' });
  }
};

const deletarFicha = async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  try {
    const usuarioId = req.usuario.id;
    const fichaId = parseInt(req.params.id);

    const verifica = await pool.request()
      .input('id', sql.Int, fichaId)
      .input('usuario_id', sql.Int, usuarioId)
      .query('SELECT * FROM fichaAlimentar WHERE id = @id AND usuario_id = @usuario_id');

    if (verifica.recordset.length === 0) {
      return res.status(404).json({ mensagem: 'Ficha não encontrada ou não pertence ao usuário.' });
    }

    await pool.request()
      .input('id', sql.Int, fichaId)
      .query('DELETE FROM fichaAlimentar WHERE id = @id');

    return res.status(200).json({ mensagem: 'Ficha deletada com sucesso!' });
  } catch (error) {
    console.error('Erro ao deletar ficha:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao deletar ficha.' });
  }
};

const recomendarDieta = async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  const { objetivo } = req.body;

  try {
    await poolConnect;
    const request = pool.request();
    const result = await request.query('SELECT * FROM tbltacoNL');
    const alimentos = result.recordset;

    let recomendados = [];

    if (objetivo === 'perder_peso') {
      recomendados = alimentos
        .filter((item) => parseToFloat(item.energia_kcal) < 100 && parseToFloat(item.lipideos) < 5)
        .sort((a, b) => parseToFloat(b.proteina) - parseToFloat(a.proteina));
    } else if (objetivo === 'ganhar_massa') {
      recomendados = alimentos
        .filter((item) => parseToFloat(item.proteina) > 10 && parseToFloat(item.energia_kcal) > 150)
        .sort((a, b) => parseToFloat(b.proteina) - parseToFloat(a.proteina));
    } else if (objetivo === 'manter_saude') {
      recomendados = alimentos
        .filter((item) => parseToFloat(item.fibra_alimentar) >= 2 && parseToFloat(item.sodio) < 500)
        .sort((a, b) => parseToFloat(a.energia_kcal) - parseToFloat(b.energia_kcal));
    }

    return res.status(200).json({ alimentos_recomendados: recomendados.slice(0, 5) });
  } catch (error) {
    console.error('Erro ao recomendar dieta:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao recomendar dieta.' });
  }
};

module.exports = {
  criarFicha,
  listarFichas,
  deletarFicha,
  recomendarDieta,
};

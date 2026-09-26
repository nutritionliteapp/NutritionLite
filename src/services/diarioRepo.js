/**
 * Acesso ao banco do diário alimentar e do perfil de metas (SQL parametrizado).
 * Quem chama trata os erros 207/208 (coluna/tabela ausente) com `ehTabelaAusente`.
 */
const { sql, poolPromise } = require('../config/db');
const { roundNutrient, scaleNutrient } = require('./nutritionCalculator');
const { calcularMetas, somarDia, progressoDoDia } = require('./metasDiarias');

const REFEICOES_VALIDAS = Object.freeze(['cafe_da_manha', 'almoco', 'lanche', 'jantar', 'ceia']);
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

function hojeBrasilia(agora = Date.now()) {
  return new Date(agora - OFFSET_BRASILIA_MS).toISOString().slice(0, 10);
}

function horaBrasilia(agora = Date.now()) {
  return new Date(agora - OFFSET_BRASILIA_MS).getUTCHours();
}

/** AAAA-MM-DD válido (e real: recusa 2026-02-31). */
function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** 207 = coluna, 208 = tabela inexistente: a migration 005 ainda não foi aplicada. */
function ehTabelaAusente(err) {
  return Boolean(err && (err.number === 207 || err.number === 208));
}

/** TACO traz "Tr"/"NA" em alguns campos: só vale o que tem dígito. */
function valorTaco(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!/\d/.test(s)) return 0;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Macros de um alimento da TACO (valores por 100 g) para `quantidadeG` gramas. */
function macrosDaTaco(linha, quantidadeG) {
  return {
    kcal: scaleNutrient(valorTaco(linha.energia_kcal), quantidadeG),
    proteina: scaleNutrient(valorTaco(linha.proteina), quantidadeG),
    carboidratos: scaleNutrient(valorTaco(linha.carboidratos), quantidadeG),
    gordura: scaleNutrient(valorTaco(linha.lipideos), quantidadeG),
    fibra: scaleNutrient(valorTaco(linha.fibra_alimentar), quantidadeG),
    sodio_mg: scaleNutrient(valorTaco(linha.sodio), quantidadeG),
  };
}

/** Objetivo e medidas do usuário → metas diárias estimadas. Tolera coluna objetivo_atual ausente. */
async function metasDoUsuario(usuarioId) {
  const pool = await poolPromise;
  const consulta = (colunaObjetivo) =>
    pool.request().input('id', sql.Int, usuarioId).query(`
      SELECT u.nome, u.peso, u.altura, u.idade, ${colunaObjetivo} AS objetivo
      FROM usuarios u
      LEFT JOIN metasUsuario m ON m.usuario_id = u.id
      OUTER APPLY (SELECT TOP 1 objetivo FROM fichaAlimentar WHERE usuario_id = u.id ORDER BY data_criacao DESC) f
      WHERE u.id = @id
    `);

  let resultado;
  try {
    resultado = await consulta('COALESCE(m.objetivo_atual, f.objetivo)');
  } catch (err) {
    if (!ehTabelaAusente(err)) throw err;
    resultado = await consulta('f.objetivo');
  }

  const perfil = resultado.recordset[0] || null;
  return { perfil, metas: perfil ? calcularMetas(perfil) : null };
}

async function itensDoDia(usuarioId, data) {
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input('id', sql.Int, usuarioId)
    .input('data', sql.VarChar, data)
    .query(`
      SELECT id, refeicao, nome_alimento, alimento_id, quantidade_g, kcal, proteina, carboidratos,
             gordura, fibra, sodio_mg, origem, estimado
      FROM diarioRefeicoes
      WHERE usuario_id = @id AND data = CAST(@data AS DATE)
      ORDER BY id
    `);
  return r.recordset;
}

async function resumoDoDia(usuarioId, data) {
  const [itens, { metas }] = await Promise.all([itensDoDia(usuarioId, data), metasDoUsuario(usuarioId)]);
  const total = somarDia(itens);
  return { data, itens, total, metas, progresso: progressoDoDia(total, metas) };
}

/** Uma consulta por item: melhor correspondência na TACO pelo nome (ou null). */
async function acharNaTaco(nome) {
  const pool = await poolPromise;
  const palavras = normalizarTexto(nome)
    .split(' ')
    .filter((p) => p.length > 2);
  if (!palavras.length) return null;

  const r = await pool
    .request()
    .input('p', sql.VarChar, `%${palavras[0]}%`)
    .query(`
      SELECT TOP 40 id_alimento, nome_alimento, energia_kcal, proteina, carboidratos, lipideos,
             fibra_alimentar, sodio
      FROM tbltacoNL WHERE nome_alimento LIKE @p
    `);

  let melhor = null;
  let melhorPontos = 0;
  for (const linha of r.recordset) {
    const alvo = normalizarTexto(linha.nome_alimento);
    const pontos = palavras.reduce((s, p) => s + (alvo.includes(p) ? 1 : 0), 0);
    // desempate: nomes mais curtos (o alimento "puro") ganham; ex.: "Arroz, cozido" > "Arroz, tipo 1, cozido"
    const ajustado = pontos - alvo.length / 1000;
    if (pontos > 0 && ajustado > melhorPontos) {
      melhorPontos = ajustado;
      melhor = linha;
    }
  }
  return melhor;
}

function normalizarTexto(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  REFEICOES_VALIDAS,
  hojeBrasilia,
  horaBrasilia,
  dataValida,
  ehTabelaAusente,
  valorTaco,
  macrosDaTaco,
  metasDoUsuario,
  itensDoDia,
  resumoDoDia,
  acharNaTaco,
  normalizarTexto,
  roundNutrient,
};

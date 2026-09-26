/**
 * Cota diária para visitantes (sem login) nos recursos gratuitos: chat e Tabela TACO.
 *
 * - Logado (JWT válido no header Authorization): ilimitado, passa direto.
 * - Visitante: LIMITE_DIARIO_VISITANTE (padrão 5) usos por dia, por recurso, contados por IP.
 *   A cota renova à meia-noite de Brasília.
 * - Só respostas bem-sucedidas consomem a cota (uma resposta >= 400 devolve o uso).
 *
 * Os contadores ficam em memória (rápido) e são espelhados na tabela usoVisitante (migration 005):
 * assim sobrevivem a reinício e valem entre instâncias. Se a tabela não existir ou o banco falhar,
 * o limite segue funcionando só em memória. Nos testes (NODE_ENV=test) o banco não é usado.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const LIMITE_PADRAO = 5;
const RECURSOS = Object.freeze(['chat', 'taco']);
/** America/Sao_Paulo não tem horário de verão desde 2019: UTC-3 fixo. */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const MAX_CONTADORES = 20000;

/** chave `${recurso}:${visitante}` -> { dia, usado } */
const contadores = new Map();

/** Persistência no banco: desligada nos testes e por 10 min depois de uma falha (evita insistir). */
const PAUSA_APOS_FALHA_MS = 10 * 60 * 1000;
let pausadoAte = 0;

function persistente() {
  if (process.env.LIMITE_VISITANTE_DB === '0') return false;
  if (process.env.NODE_ENV === 'test' && process.env.LIMITE_VISITANTE_DB !== '1') return false;
  return Date.now() >= pausadoAte;
}

function falhaNoBanco(err, acao) {
  pausadoAte = Date.now() + PAUSA_APOS_FALHA_MS;
  logger.warn(`limiteVisitante: ${acao} no banco falhou, usando só memória por 10 min (${err.message})`);
}

async function lerDoBanco(chave, dia) {
  const { sql, poolPromise } = require('../config/db');
  const pool = await poolPromise;
  const r = await pool
    .request()
    .input('chave', sql.VarChar, chave)
    .input('dia', sql.VarChar, dia)
    .query('SELECT usado FROM usoVisitante WHERE chave = @chave AND dia = CAST(@dia AS DATE)');
  return r.recordset[0] ? Number(r.recordset[0].usado) || 0 : 0;
}

async function gravarNoBanco(chave, dia, usado) {
  const { sql, poolPromise } = require('../config/db');
  const pool = await poolPromise;
  await pool
    .request()
    .input('chave', sql.VarChar, chave)
    .input('dia', sql.VarChar, dia)
    .input('usado', sql.Int, usado)
    .query(`
      MERGE usoVisitante AS alvo
      USING (SELECT @chave AS chave, CAST(@dia AS DATE) AS dia) AS origem
        ON alvo.chave = origem.chave AND alvo.dia = origem.dia
      WHEN MATCHED THEN UPDATE SET usado = @usado
      WHEN NOT MATCHED THEN INSERT (chave, dia, usado) VALUES (@chave, CAST(@dia AS DATE), @usado);
    `);
}

/** Traz do banco o que já foi usado hoje (uma vez por chave/processo) e mantém o maior valor. */
async function sincronizar(chave, entrada) {
  if (entrada.carregada || !persistente()) return;
  entrada.carregada = true;
  try {
    entrada.usado = Math.max(entrada.usado, await lerDoBanco(chave, entrada.dia));
  } catch (err) {
    falhaNoBanco(err, 'leitura');
  }
}

function espelhar(chave, entrada) {
  if (!persistente()) return;
  gravarNoBanco(chave, entrada.dia, entrada.usado).catch((err) => falhaNoBanco(err, 'gravação'));
}

function limiteDiario() {
  const n = parseInt(process.env.LIMITE_DIARIO_VISITANTE, 10);
  return Number.isInteger(n) && n > 0 ? n : LIMITE_PADRAO;
}

/** Data (AAAA-MM-DD) em Brasília. */
function diaDeBrasilia(agora = Date.now()) {
  return new Date(agora - OFFSET_BRASILIA_MS).toISOString().slice(0, 10);
}

/** Próxima meia-noite de Brasília, como Date (instante real). */
function proximaRenovacao(agora = Date.now()) {
  const local = new Date(agora - OFFSET_BRASILIA_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) +
      OFFSET_BRASILIA_MS
  );
}

/** Identifica o visitante pelo IP (hash: o IP cru nunca fica guardado). */
function identificarVisitante(req) {
  return crypto
    .createHash('sha256')
    .update(String(req.ip || 'desconhecido'))
    .digest('hex')
    .slice(0, 24);
}

/** Payload do JWT do header Authorization, ou null (ausente, inválido ou expirado). */
function usuarioDoToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch (_) {
    return null;
  }
}

function limparExpirados(agora = Date.now()) {
  const hoje = diaDeBrasilia(agora);
  for (const [chave, entrada] of contadores) {
    if (entrada.dia !== hoje) contadores.delete(chave);
  }
}

// Limpeza periódica; unref() para não segurar o processo (nem os testes) aberto.
setInterval(() => limparExpirados(), 60 * 60 * 1000).unref();

function entradaDe(chave, agora) {
  const hoje = diaDeBrasilia(agora);
  let entrada = contadores.get(chave);
  if (!entrada || entrada.dia !== hoje) {
    if (contadores.size >= MAX_CONTADORES) limparExpirados(agora);
    entrada = { dia: hoje, usado: 0 };
    contadores.set(chave, entrada);
  }
  return entrada;
}

function descrever(entrada, agora) {
  const total = limiteDiario();
  return {
    total,
    usado: entrada.usado,
    restantes: Math.max(0, total - entrada.usado),
    renova_em: proximaRenovacao(agora).toISOString(),
  };
}

function aplicarCabecalhos(res, estado) {
  res.set('X-Limite-Total', String(estado.total));
  res.set('X-Limite-Restantes', String(estado.restantes));
  res.set('X-Limite-Renova-Em', estado.renova_em);
}

/**
 * @param {'chat'|'taco'} recurso
 */
function limiteDiarioVisitante(recurso) {
  return async (req, res, next) => {
    const usuario = usuarioDoToken(req);
    if (usuario) {
      req.usuario = usuario;
      return next();
    }

    req.visitante = true;
    const agora = Date.now();
    const chave = `${recurso}:${identificarVisitante(req)}`;
    const entrada = entradaDe(chave, agora);
    await sincronizar(chave, entrada);

    if (entrada.usado >= limiteDiario()) {
      const estado = descrever(entrada, agora);
      aplicarCabecalhos(res, estado);
      res.set('Retry-After', String(Math.ceil((new Date(estado.renova_em) - agora) / 1000)));
      return res.status(429).json({
        mensagem: `Suas ${estado.total} consultas gratuitas de hoje acabaram. Elas renovam às 00:00 (horário de Brasília). Entre na sua conta para usar sem limites.`,
        limite_diario: true,
        recurso,
        ...estado,
      });
    }

    // Reserva a cota antes de processar (requisições paralelas não furam o limite)...
    entrada.usado += 1;
    espelhar(chave, entrada);
    aplicarCabecalhos(res, descrever(entrada, agora));

    // ...e devolve se o processamento falhar: só resposta bem-sucedida consome a cota.
    res.on('finish', () => {
      if (res.statusCode >= 400 && entrada.dia === diaDeBrasilia() && entrada.usado > 0) {
        entrada.usado -= 1;
        espelhar(chave, entrada);
      }
    });

    return next();
  };
}

/** GET /api/uso/:recurso — saldo atual, sem consumir. */
async function statusUso(req, res) {
  const { recurso } = req.params;
  if (!RECURSOS.includes(recurso)) {
    return res.status(404).json({ mensagem: 'Recurso desconhecido.', recursos: [...RECURSOS] });
  }

  res.set('Cache-Control', 'no-store');

  if (usuarioDoToken(req)) {
    return res.status(200).json({ recurso, ilimitado: true });
  }

  const agora = Date.now();
  const chave = `${recurso}:${identificarVisitante(req)}`;
  const entrada = entradaDe(chave, agora);
  await sincronizar(chave, entrada);
  const vigente = entrada;
  return res.status(200).json({ recurso, ilimitado: false, ...descrever(vigente, agora) });
}

module.exports = {
  limiteDiarioVisitante,
  statusUso,
  RECURSOS,
  // exportados para teste
  _test: { contadores, diaDeBrasilia, proximaRenovacao, limiteDiario },
};

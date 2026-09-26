/**
 * Lembretes por notificação (Web Push). Desligado enquanto VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não
 * estiverem no .env (gere com `npm run vapid`). O agendador roda dentro do servidor, a cada minuto.
 *
 * Regras (puras, testáveis): horários "HH:MM" em Brasília; envia dentro de uma janela de 10 minutos
 * depois do horário (tolera servidor que acordou tarde), no máximo uma vez por horário por dia, e
 * não incomoda quem acabou de registrar uma refeição.
 */
const crypto = require('crypto');
const logger = require('../utils/logger');

const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const JANELA_MIN = 10;
const MAX_HORARIOS = 4;
const PADRAO_HORARIOS = ['12:00', '19:00'];
const RE_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

function configurado() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function chavePublica() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** Lista de horários válidos, sem repetição, em ordem, no máximo MAX_HORARIOS. */
function normalizarHorarios(lista) {
  const itens = Array.isArray(lista) ? lista : String(lista || '').split(',');
  const validos = [...new Set(itens.map((h) => String(h).trim()).filter((h) => RE_HORARIO.test(h)))].sort();
  return validos.slice(0, MAX_HORARIOS);
}

function hashEndpoint(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint)).digest('hex');
}

/** { data: 'AAAA-MM-DD', hhmm: 'HH:MM' } no horário de Brasília. */
function agoraBrasilia(agora = Date.now()) {
  const iso = new Date(agora - OFFSET_BRASILIA_MS).toISOString();
  return { data: iso.slice(0, 10), hhmm: iso.slice(11, 16) };
}

const minutos = (hhmm) => parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10);

/**
 * Qual horário do lembrete está "no ar" agora e ainda não foi enviado hoje? (ou null)
 * @param {{horarios: string, ultimo_envio_data?: string, ultimo_envio_hora?: string}} lembrete
 * @param {{data: string, hhmm: string}} agora
 */
function horarioDevido(lembrete, agora) {
  const atual = minutos(agora.hhmm);
  for (const h of normalizarHorarios(lembrete.horarios)) {
    const passou = atual - minutos(h);
    if (passou < 0 || passou >= JANELA_MIN) continue;
    const jaEnviado = lembrete.ultimo_envio_data === agora.data && lembrete.ultimo_envio_hora === h;
    if (!jaEnviado) return h;
  }
  return null;
}

/** Texto da notificação conforme a hora. */
function mensagemPara(hhmm) {
  const m = minutos(hhmm);
  let corpo;
  if (m < 10 * 60) corpo = 'Bom dia! Já registrou o café da manhã? Uma foto do prato resolve.';
  else if (m < 15 * 60) corpo = 'Hora do almoço! Registre o que você comeu no diário.';
  else if (m < 19 * 60) corpo = 'Que tal registrar o seu lanche da tarde?';
  else corpo = 'Registre o jantar e feche o dia dentro da sua meta.';
  return { titulo: 'NutritionLite', corpo, url: '/diario' };
}

let webpush = null;
function obterWebPush() {
  if (!webpush) {
    webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:nutritionliteapp@gmail.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
  return webpush;
}

/** Envia uma notificação. Devolve 'ok', 'expirada' (apagar a assinatura) ou 'erro'. */
async function enviar(assinatura, mensagem) {
  try {
    await obterWebPush().sendNotification(
      { endpoint: assinatura.endpoint, keys: { p256dh: assinatura.p256dh, auth: assinatura.auth } },
      JSON.stringify(mensagem),
      { TTL: 3600, urgency: 'normal' }
    );
    return 'ok';
  } catch (err) {
    if (err && (err.statusCode === 404 || err.statusCode === 410)) return 'expirada';
    logger.warn(`lembretes: falha ao enviar (${err && err.statusCode ? err.statusCode : err.message})`);
    return 'erro';
  }
}

/**
 * Um ciclo do agendador. `agora` e `enviarFn` são injetáveis para teste.
 * @returns {{avaliados: number, enviados: number, removidos: number}}
 */
async function processarLembretes({ agora = Date.now(), enviarFn = enviar } = {}) {
  const { sql, poolPromise } = require('../config/db');
  const pool = await poolPromise;
  const quando = agoraBrasilia(agora);
  const resultado = { avaliados: 0, enviados: 0, removidos: 0 };

  const lista = (
    await pool.request().query(`
      SELECT id, usuario_id, endpoint, p256dh, auth, horarios,
             CONVERT(VARCHAR(10), ultimo_envio_data, 23) AS ultimo_envio_data, ultimo_envio_hora
      FROM lembretes WHERE ativo = 1
    `)
  ).recordset;

  const devidos = lista.map((l) => ({ l, horario: horarioDevido(l, quando) })).filter((x) => x.horario);
  resultado.avaliados = lista.length;
  if (!devidos.length) return resultado;

  // quem registrou algo nos últimos 90 minutos já está engajado: não incomodar
  let recentes = new Set();
  try {
    const r = await pool.request().query(
      'SELECT DISTINCT usuario_id FROM diarioRefeicoes WHERE criado_em >= DATEADD(MINUTE, -90, SYSUTCDATETIME())'
    );
    recentes = new Set(r.recordset.map((x) => x.usuario_id));
  } catch (err) {
    if (!(err && (err.number === 207 || err.number === 208))) throw err;
  }

  for (const { l, horario } of devidos) {
    const marcar = () =>
      pool
        .request()
        .input('id', sql.Int, l.id)
        .input('data', sql.VarChar, quando.data)
        .input('hora', sql.VarChar, horario)
        .query('UPDATE lembretes SET ultimo_envio_data = CAST(@data AS DATE), ultimo_envio_hora = @hora WHERE id = @id');

    if (recentes.has(l.usuario_id)) {
      await marcar(); // conta como "resolvido" para este horário
      continue;
    }

    const status = await enviarFn(l, mensagemPara(horario));
    if (status === 'expirada') {
      await pool.request().input('id', sql.Int, l.id).query('DELETE FROM lembretes WHERE id = @id');
      resultado.removidos += 1;
    } else {
      await marcar();
      if (status === 'ok') resultado.enviados += 1;
    }
  }
  return resultado;
}

let temporizador = null;
let rodando = false;

/** Liga o agendador (uma vez). Não faz nada sem VAPID ou nos testes. */
function iniciarAgendador() {
  if (temporizador || !configurado() || process.env.NODE_ENV === 'test') return false;
  temporizador = setInterval(async () => {
    if (rodando) return;
    rodando = true;
    try {
      const r = await processarLembretes();
      if (r.enviados || r.removidos) logger.info(`lembretes: enviados=${r.enviados} removidos=${r.removidos}`);
    } catch (err) {
      if (!(err && (err.number === 207 || err.number === 208))) logger.warn(`lembretes: ${err.message}`);
    } finally {
      rodando = false;
    }
  }, 60 * 1000);
  temporizador.unref();
  logger.info('Lembretes por notificação ativos.');
  return true;
}

module.exports = {
  configurado,
  chavePublica,
  normalizarHorarios,
  hashEndpoint,
  agoraBrasilia,
  horarioDevido,
  mensagemPara,
  enviar,
  processarLembretes,
  iniciarAgendador,
  PADRAO_HORARIOS,
  MAX_HORARIOS,
};

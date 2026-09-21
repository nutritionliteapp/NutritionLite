/**
 * Cota diária para visitantes (sem login) nos recursos gratuitos: chat e Tabela TACO.
 *
 * - Logado (JWT válido no header Authorization): ilimitado, passa direto.
 * - Visitante: LIMITE_DIARIO_VISITANTE (padrão 5) usos por dia, por recurso, contados por IP.
 *   A cota renova à meia-noite de Brasília.
 * - Só respostas bem-sucedidas consomem a cota (uma resposta >= 400 devolve o uso).
 *
 * Os contadores ficam em memória: zeram se o servidor reiniciar e não são compartilhados
 * entre instâncias. Para algo mais rígido, persistir em banco.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const LIMITE_PADRAO = 5;
const RECURSOS = Object.freeze(['chat', 'taco']);
/** America/Sao_Paulo não tem horário de verão desde 2019: UTC-3 fixo. */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const MAX_CONTADORES = 20000;

/** chave `${recurso}:${visitante}` -> { dia, usado } */
const contadores = new Map();

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
  return (req, res, next) => {
    const usuario = usuarioDoToken(req);
    if (usuario) {
      req.usuario = usuario;
      return next();
    }

    req.visitante = true;
    const agora = Date.now();
    const chave = `${recurso}:${identificarVisitante(req)}`;
    const entrada = entradaDe(chave, agora);

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
    aplicarCabecalhos(res, descrever(entrada, agora));

    // ...e devolve se o processamento falhar: só resposta bem-sucedida consome a cota.
    res.on('finish', () => {
      if (res.statusCode >= 400 && entrada.dia === diaDeBrasilia() && entrada.usado > 0) {
        entrada.usado -= 1;
      }
    });

    return next();
  };
}

/** GET /api/uso/:recurso — saldo atual, sem consumir. */
function statusUso(req, res) {
  const { recurso } = req.params;
  if (!RECURSOS.includes(recurso)) {
    return res.status(404).json({ mensagem: 'Recurso desconhecido.', recursos: [...RECURSOS] });
  }

  res.set('Cache-Control', 'no-store');

  if (usuarioDoToken(req)) {
    return res.status(200).json({ recurso, ilimitado: true });
  }

  const agora = Date.now();
  const entrada = contadores.get(`${recurso}:${identificarVisitante(req)}`);
  const vigente = entrada && entrada.dia === diaDeBrasilia(agora) ? entrada : { usado: 0 };
  return res.status(200).json({ recurso, ilimitado: false, ...descrever(vigente, agora) });
}

module.exports = {
  limiteDiarioVisitante,
  statusUso,
  RECURSOS,
  // exportados para teste
  _test: { contadores, diaDeBrasilia, proximaRenovacao, limiteDiario },
};

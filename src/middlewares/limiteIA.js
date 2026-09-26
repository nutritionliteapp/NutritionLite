/**
 * Teto diário de usos de IA por usuário logado (protege o custo do Gemini).
 * Ajustável por env: LIMITE_IA_ROTULOS, LIMITE_IA_DIARIO_FOTO, LIMITE_IA_CARDAPIO.
 * Contadores em memória (por dia de Brasília); só respostas bem-sucedidas consomem.
 */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const PADROES = Object.freeze({ rotulos: 20, foto: 20, cardapio: 5 });
const MAX_CONTADORES = 20000;

const contadores = new Map();

function diaDeBrasilia(agora = Date.now()) {
  return new Date(agora - OFFSET_BRASILIA_MS).toISOString().slice(0, 10);
}

function limiteDe(recurso) {
  const n = parseInt(process.env[`LIMITE_IA_${recurso.toUpperCase()}`], 10);
  return Number.isInteger(n) && n > 0 ? n : PADROES[recurso] || 10;
}

function limparAntigos() {
  const hoje = diaDeBrasilia();
  for (const [chave, e] of contadores) if (e.dia !== hoje) contadores.delete(chave);
}
setInterval(limparAntigos, 60 * 60 * 1000).unref();

function limiteIAUsuario(recurso) {
  return (req, res, next) => {
    const usuarioId = req.usuario && req.usuario.id;
    if (!usuarioId) return next();

    const hoje = diaDeBrasilia();
    const chave = `${recurso}:${usuarioId}`;
    let entrada = contadores.get(chave);
    if (!entrada || entrada.dia !== hoje) {
      if (contadores.size >= MAX_CONTADORES) limparAntigos();
      entrada = { dia: hoje, usado: 0 };
      contadores.set(chave, entrada);
    }

    const limite = limiteDe(recurso);
    if (entrada.usado >= limite) {
      return res.status(429).json({
        mensagem: `Você atingiu o limite diário de ${limite} análises com IA neste recurso. Ele renova à meia-noite (horário de Brasília).`,
        limite_diario: true,
        recurso,
      });
    }

    entrada.usado += 1;
    res.on('finish', () => {
      if (res.statusCode >= 400 && entrada.dia === diaDeBrasilia() && entrada.usado > 0) entrada.usado -= 1;
    });
    return next();
  };
}

module.exports = { limiteIAUsuario, _test: { contadores, limiteDe, diaDeBrasilia } };

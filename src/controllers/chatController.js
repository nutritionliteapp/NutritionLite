require('dotenv').config();
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { poolPromise, sql } = require('../config/db.js');
const logger = require('../utils/logger');
const repo = require('../services/diarioRepo');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
});

/** Histórico em memória por usuário + sessão (MVP). */
const sessionHistories = new Map();

const MODOS_VALIDOS = Object.freeze([
  'geral',
  'dieta',
  'treino',
  'educacao',
  'economico',
]);
/** "normal" é o modo padrão enviado pelo front-end (e pela API antiga): equivale a "geral". */
const MODOS_ALIAS = Object.freeze({ normal: 'geral' });
const MAX_MENSAGEM_CHARS = 2000;
/** Limite do VARCHAR(64) de chatHistorico.session_id (migration 004). */
const MAX_SESSION_ID_CHARS = 64;
/** Teto de conversas mantidas em memória; as mais antigas são descartadas. */
const MAX_SESSOES_EM_MEMORIA = 1000;
/** 10 turnos = até 20 mensagens (user + assistant). */
const MAX_HISTORY_MESSAGES = 20;
const GEMINI_TIMEOUT_MS = 45_000;
const GEMINI_MAX_RETRIES = 1;

const DISCLAIMER_EDUCATIVO =
  'Esta conversa é educativa e informativa. Não substitui consulta com nutricionista, médico ou outro profissional de saúde.';

const RESPOSTA_SEGURA_EMERGENCIA =
  'Se você está em risco imediato ou passando por uma emergência, procure ajuda profissional agora: ligue para o SAMU (192) ou vá ao pronto-socorro mais próximo. ' +
  'Para apoio emocional no Brasil, o CVV atende 24h pelo 188. ' +
  DISCLAIMER_EDUCATIVO;

const RESPOSTA_SEGURA_TCA =
  'Sinais de transtorno alimentar ou sofrimento intenso com comida merecem atenção especializada. ' +
  'Procure um nutricionista e/ou psicólogo/psiquiatra; se houver risco imediato, use o SAMU (192) ou o CVV (188). ' +
  DISCLAIMER_EDUCATIVO;

const RESPOSTA_SEGURA_SINTOMAS =
  'Sintomas físicos persistentes, intensos ou preocupantes devem ser avaliados por um médico. ' +
  'Não posso diagnosticar nem indicar tratamento. Procure atendimento de saúde. ' +
  DISCLAIMER_EDUCATIVO;

const respostasComuns = [
  { pergunta: /ovo engorda\??/i, resposta: 'Não, ovo é uma ótima fonte de proteína e não engorda sozinho. O importante é a quantidade e equilíbrio na dieta.' },
  { pergunta: /pão à noite\??/i, resposta: 'Pão à noite não é proibido, mas prefira integral e combine com proteínas para saciedade.' },
  { pergunta: /posso comer doces\??/i, resposta: 'Pode sim, mas moderação é a chave. Prefira doces naturais, como frutas.' },
  { pergunta: /quero perder peso/i, resposta: 'Para perder peso, foque em déficit calórico, proteínas adequadas e escolha de alimentos nutritivos.' },
  { pergunta: /quero ganhar massa/i, resposta: 'Para ganhar massa, aumente proteínas, carboidratos saudáveis e mantenha treino regular.' },
  { pergunta: /como aumentar proteína/i, resposta: 'Inclua ovos, carnes magras, peixes, leite, iogurte e leguminosas na sua dieta diária.' },
  { pergunta: /quanto devo beber de água/i, resposta: 'O ideal é cerca de 2 litros por dia, ajustando conforme atividade física e clima.' },
  { pergunta: /melhor horário para treinar/i, resposta: 'O melhor horário é aquele que você consegue manter de forma consistente, seja manhã, tarde ou noite.' },
  { pergunta: /café da manhã é importante/i, resposta: 'Sim, ele dá energia para o dia, ajuda a controlar fome e melhora concentração.' },
  { pergunta: /quanto comer de carboidrato/i, resposta: 'Depende do seu objetivo, mas escolha carboidratos complexos como arroz integral, batata, quinoa e aveia.' },
  { pergunta: /qual melhor lanche/i, resposta: 'Frutas, iogurte natural, castanhas e sanduíches integrais são boas opções de lanche saudável.' },
  { pergunta: /ovo ou frango/i, resposta: 'Ambos são ótimas fontes de proteína; escolha o que preferir e varie durante a semana.' },
  { pergunta: /evitar gordura/i, resposta: 'Evite gorduras trans e ultraprocessadas. Prefira azeite, abacate, oleaginosas e peixes.' },
  { pergunta: /como ganhar energia/i, resposta: 'Coma carboidratos complexos, proteínas e mantenha hidratação adequada.' },
  { pergunta: /chá ajuda a emagrecer/i, resposta: 'Alguns chás podem auxiliar na hidratação e metabolismo, mas não substituem alimentação equilibrada.' },
  { pergunta: /quantas refeições por dia/i, resposta: 'Geralmente 3 refeições principais + 1-2 lanches saudáveis, adaptando à sua rotina.' },
  { pergunta: /posso comer à noite/i, resposta: 'Pode, mas prefira refeições leves, evitando grandes quantidades de carboidratos simples.' },
  { pergunta: /iogurte faz bem/i, resposta: 'Sim, principalmente natural, é fonte de proteínas e probióticos que auxiliam na digestão.' },
  { pergunta: /frutas engordam/i, resposta: 'Não, frutas são saudáveis e fornecem vitaminas, fibras e energia, desde que consumidas com moderação.' },
  { pergunta: /como evitar fome à noite/i, resposta: 'Inclua proteínas e fibras no jantar; evite açúcar e alimentos ultraprocessados perto da hora de dormir.' },
  { pergunta: /suco natural ou refrigerante/i, resposta: 'Prefira sucos naturais sem açúcar. Evite refrigerantes, mesmo zero, que podem atrapalhar metabolismo e saciedade.' },
  { pergunta: /o que é dieta balanceada/i, resposta: 'Uma dieta balanceada inclui proteínas, carboidratos complexos, gorduras boas, fibras, vitaminas e minerais.' },
  { pergunta: /alimentos processados/i, resposta: 'Evite ultraprocessados ricos em açúcar, sódio e gorduras ruins; prefira alimentos naturais e frescos.' },
  { pergunta: /como aumentar massa muscular/i, resposta: 'Treino de resistência + proteínas suficientes + calorias adequadas são a chave.' },
  { pergunta: /como reduzir gordura/i, resposta: 'Déficit calórico controlado + exercícios regulares + foco em alimentos nutritivos ajudam na redução de gordura.' },
  { pergunta: /qual melhor proteína/i, resposta: 'Proteínas magras como frango, peixe, ovos, leguminosas e laticínios são excelentes escolhas.' },
  { pergunta: /melhor café/i, resposta: 'Prefira café puro ou com pouco açúcar. Pode ajudar na energia e concentração, moderadamente.' },
  { pergunta: /fast food faz mal/i, resposta: 'Sim, em excesso contribui para obesidade, doenças cardíacas e alterações metabólicas.' },
  { pergunta: /como melhorar digestão/i, resposta: 'Fibras, água suficiente, probióticos e alimentação regular ajudam na digestão.' },
  { pergunta: /suplemento necessário/i, resposta: 'Suplementos só se houver necessidade identificada por nutricionista ou médico; alimentação completa é prioridade.' },
  { pergunta: /como controlar ansiedade por comida/i, resposta: 'Planejamento de refeições, lanches saudáveis e técnicas de respiração podem ajudar a controlar a fome emocional.' },
];

/** Visitante (sem login): o histórico existe só em memória, identificado pelo IP (hash) — nunca vai ao banco. */
function identificarVisitante(req) {
  const hash = crypto
    .createHash('sha256')
    .update(String(req.ip || 'desconhecido'))
    .digest('hex')
    .slice(0, 16);
  return `visitante_${hash}`;
}

const CONTEXTO_VISITANTE =
  'Visitante sem login (não há ficha alimentar nem dados pessoais). Responda de forma geral e, quando fizer sentido, ' +
  'lembre que criando uma conta e uma ficha alimentar ele recebe respostas personalizadas ao seu objetivo.';

function sessionKey(usuarioId, sessionId) {
  return `${usuarioId}:${sessionId}`;
}

function getOrCreateHistory(usuarioId, sessionId) {
  const key = sessionKey(usuarioId, sessionId);
  if (!sessionHistories.has(key)) {
    // O Map nunca era limpo: descarta a conversa mais antiga (ordem de inserção) ao atingir o teto.
    while (sessionHistories.size >= MAX_SESSOES_EM_MEMORIA) {
      sessionHistories.delete(sessionHistories.keys().next().value);
    }
    sessionHistories.set(key, []);
  }
  return sessionHistories.get(key);
}

function appendToHistory(usuarioId, sessionId, role, content) {
  const history = getOrCreateHistory(usuarioId, sessionId);
  history.push({ role, content });
  while (history.length > MAX_HISTORY_MESSAGES) {
    history.shift();
  }
}

/** Últimas N mensagens já armazenadas (sem incluir a mensagem atual). */
function getRecentHistory(usuarioId, sessionId) {
  const history = getOrCreateHistory(usuarioId, sessionId);
  return history.slice(-MAX_HISTORY_MESSAGES);
}

function clearSessionHistory(usuarioId, sessionId) {
  sessionHistories.delete(sessionKey(usuarioId, sessionId));
}

function clearAllSessionHistories() {
  sessionHistories.clear();
}

function getHistorySnapshot(usuarioId, sessionId) {
  const h = sessionHistories.get(sessionKey(usuarioId, sessionId));
  return h ? h.map((m) => ({ ...m })) : [];
}

function detectarRespostaSegura(mensagem) {
  const texto = String(mensagem || '');
  if (
    /suicid|me matar|tirar (a )?minha vida|quero morrer|autoles[aã]o|me cortar|overdose/i.test(texto)
  ) {
    return RESPOSTA_SEGURA_EMERGENCIA;
  }
  if (
    /anorexia|bulimia|ortorexia|transtorno alimentar|vomitar (depois|após)|purgar|compuls[aã]o alimentar/i.test(
      texto
    )
  ) {
    return RESPOSTA_SEGURA_TCA;
  }
  if (
    /dor no peito|falta de ar|desmaio|convuls|sangramento|infarto|avc|febre alta|n[aã]o consigo respirar/i.test(
      texto
    )
  ) {
    return RESPOSTA_SEGURA_SINTOMAS;
  }
  return null;
}

function systemPromptParaModo(modo) {
  const base = `
Você é a Salus, assistente nutricional educativa do NutritionLite (Brasil).

${DISCLAIMER_EDUCATIVO}

Regras de segurança:
- Em emergências, risco de vida, transtornos alimentares ou sintomas que exijam avaliação médica, oriente a procurar profissional/SAMU 192/CVV 188. Não diagnostique nem prescreva tratamento.
- Não invente valores nutricionais; use dados do banco TACO/ficha quando fornecidos.
- Separe orientação educativa de aconselhamento clínico.
- Quando usar um dado ou recomendação, cite a fonte de forma curta (ex.: "segundo a Tabela TACO", "Guia Alimentar para a População Brasileira", "OMS"). Se não tiver fonte confiável, diga que é uma orientação geral.
- Se houver dados do diário do dia, use-os para personalizar (o que já foi consumido e o que falta), sem cobrar nem julgar.

Estilo: natural, empática, objetiva. Não se apresente de novo se já houver histórico.
`.trim();

  const porModo = {
    geral: 'Modo geral: educação alimentar e escolhas saudáveis no dia a dia.',
    dieta: 'Modo dieta: foque em equilíbrio calórico/macros e hábitos sustentáveis, sem dietas extremas.',
    treino: 'Modo treino: alimentação em torno de treino e recuperação, sem substituir preparador físico.',
    educacao: 'Modo educação: explique conceitos nutricionais de forma didática e acessível.',
    economico:
      'Modo Econômico: ajude o usuário a se alimentar bem gastando pouco. Compare custo-benefício com base nos dados do banco TACO e na ficha do usuário e recomende alternativas mais baratas e acessíveis mantendo o equilíbrio nutricional (ex.: sardinha ou atum enlatado no lugar de salmão). ' +
      'Priorize alimentos nacionais, simples e fáceis de encontrar. Se não encontrar o alimento citado, diga que não o achou no banco e sugira opções econômicas semelhantes, sendo honesta sobre substituições. ' +
      'Não recomende industrializados caros sem indicar uma opção econômica equivalente. Mostre que comer bem não precisa ser caro.',
  };

  return `${base}\n\n${porModo[modo] || porModo.geral}`;
}

const salvarHistorico = async (usuarioId, mensagem, resposta, modo) => {
  const pool = await poolPromise;
  const request = pool.request();
  await request
    .input('usuario_id', sql.Int, usuarioId)
    .input('mensagem', sql.NVarChar, mensagem)
    .input('resposta', sql.NVarChar, resposta)
    .input('modo_chat', sql.VarChar, modo)
    .query(`
      INSERT INTO chatHistorico (usuario_id, mensagem, resposta, modo_chat) 
      VALUES (@usuario_id, @mensagem, @resposta, @modo_chat)
    `);
};

/** Falha ao gravar o histórico não deve descartar uma resposta que já está pronta. */
const salvarHistoricoSeguro = async (usuarioId, mensagem, resposta, modo) => {
  if (!usuarioId) return; // visitante: nada é gravado
  try {
    await salvarHistorico(usuarioId, mensagem, resposta, modo);
  } catch (err) {
    logger.error(`chat salvarHistorico: ${err.message}`);
  }
};

const buscarAlimentos = async (mensagem) => {
  const pool = await poolPromise;
  const request = pool.request();
  const resultado = await request
    .input('nome', sql.VarChar, `%${mensagem}%`)
    .query('SELECT TOP 5 * FROM tbltacoNL WHERE nome_alimento LIKE @nome');

  if (resultado.recordset.length === 0) return [];
  return resultado.recordset.map((a) => ({
    nome: a.nome_alimento,
    descricao: a.descricao,
    kcal: a.energia_kcal,
    proteina: a.proteina,
    carboidrato: a.carboidratos,
    gordura: a.lipideos,
    preco: a.preco_medio,
  }));
};

const formatarFicha = (ficha, nomesAlimentos = []) => {
  if (!ficha) return 'O usuário não possui ficha alimentar registrada.';
  const alimentosLinha =
    nomesAlimentos.length > 0
      ? `\nAlimentos escolhidos na ficha: ${nomesAlimentos.join(', ')}`
      : '';
  return `Objetivo: ${ficha.objetivo}
Calorias totais (soma dos alimentos da ficha): ${ficha.total_kcal} kcal
Proteínas: ${ficha.total_proteina} g
Carboidratos: ${ficha.total_carboidratos} g
Gorduras: ${ficha.total_gordura} g
Fibras: ${ficha.total_fibra != null ? ficha.total_fibra : '—'}${alimentosLinha}`;
};

const buscarFichaParaContexto = async (usuarioId) => {
  const pool = await poolPromise;
  const fichaResult = await pool
    .request()
    .input('usuario_id', sql.Int, usuarioId)
    .query(`
      SELECT TOP 1 *
      FROM fichaAlimentar
      WHERE usuario_id = @usuario_id
      ORDER BY data_criacao DESC
    `);

  if (fichaResult.recordset.length === 0) {
    return { ficha: null, nomesAlimentos: [] };
  }

  const ficha = fichaResult.recordset[0];
  let nomesAlimentos = [];

  const consultarNomes = (coluna) =>
    pool
      .request()
      .input('ficha_id', sql.Int, ficha.id)
      .query(
        `SELECT nome_alimento FROM fichaAlimentos WHERE ${coluna} = @ficha_id ORDER BY nome_alimento`
      );

  try {
    let alRes;
    try {
      alRes = await consultarNomes('ficha_id');
    } catch (colErr) {
      // Esquema legado (pré-migration 002): a coluna se chamava [fich-id].
      if (!/Invalid column name/i.test(colErr.message || '')) throw colErr;
      alRes = await consultarNomes('[fich-id]');
    }
    nomesAlimentos = alRes.recordset.map((r) => r.nome_alimento).filter(Boolean);
  } catch (err) {
    if (err.number !== 208) {
      logger.warn(`chat: não foi possível ler fichaAlimentos: ${err.message || err}`);
    }
  }

  return { ficha, nomesAlimentos };
};

/** Metas e consumo do dia (diário). Qualquer falha (tabela ainda não migrada, etc.) só omite o bloco. */
const contextoDoDiario = async (usuarioId) => {
  try {
    const resumo = await repo.resumoDoDia(usuarioId, repo.hojeBrasilia());
    if (!resumo || !resumo.metas) return '';
    const p = resumo.progresso;
    const linhaMetas = `Metas diárias estimadas: ${resumo.metas.kcal} kcal, ${resumo.metas.proteina_g} g de proteína, ${resumo.metas.carboidratos_g} g de carboidratos, ${resumo.metas.gordura_g} g de gorduras.`;
    const linhaHoje = resumo.itens.length
      ? `Consumido hoje (diário): ${resumo.total.kcal} kcal (${p.kcal.pct}% da meta), ${resumo.total.proteina} g de proteína (${p.proteina.pct}%). Faltam ${Math.round(p.kcal.falta)} kcal e ${Math.round(p.proteina.falta)} g de proteína.`
      : 'O usuário ainda não registrou nada no diário hoje.';
    return `${linhaMetas}\n${linhaHoje}`;
  } catch (err) {
    return '';
  }
};

function withTimeout(promise, ms, label = 'operação') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timeout após ${ms}ms (${label})`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function chamarGeminiComRetry(promptTexto) {
  let ultimoErro;
  for (let tentativa = 0; tentativa <= GEMINI_MAX_RETRIES; tentativa++) {
    const inicio = Date.now();
    try {
      const result = await withTimeout(
        model.generateContent(promptTexto),
        GEMINI_TIMEOUT_MS,
        'gemini.generateContent'
      );
      const latenciaMs = Date.now() - inicio;
      logger.info(
        `chat Gemini ok tentativa=${tentativa + 1} latencia_ms=${latenciaMs}`
      );
      return result.response.text();
    } catch (err) {
      ultimoErro = err;
      const latenciaMs = Date.now() - inicio;
      logger.warn(
        `chat Gemini falha tentativa=${tentativa + 1} latencia_ms=${latenciaMs} erro=${err.message}`
      );
      if (tentativa >= GEMINI_MAX_RETRIES) break;
    }
  }
  throw ultimoErro;
}

const conversarComIA = async (req, res) => {
  const { mensagem, session_id: sessionIdBody } = req.body;
  const modoInformado =
    req.body.modo != null ? String(req.body.modo).trim().toLowerCase() : 'geral';
  const modoRaw = Object.hasOwn(MODOS_ALIAS, modoInformado)
    ? MODOS_ALIAS[modoInformado]
    : modoInformado;
  // Sem usuário = visitante (a cota diária é aplicada pelo middleware da rota).
  const userId = req.usuario?.id ?? null;
  const donoDaSessao = userId ?? identificarVisitante(req);

  if (mensagem == null || String(mensagem).trim() === '') {
    return res.status(400).json({ mensagem: 'Envie uma mensagem para a IA!' });
  }

  const mensagemTexto = String(mensagem).trim();

  if (mensagemTexto.length > MAX_MENSAGEM_CHARS) {
    return res.status(400).json({
      mensagem: `Mensagem muito longa. Máximo de ${MAX_MENSAGEM_CHARS} caracteres.`,
    });
  }

  if (!MODOS_VALIDOS.includes(modoRaw)) {
    return res.status(400).json({
      mensagem: `Modo inválido. Use um de: ${MODOS_VALIDOS.join(', ')}.`,
      modos_validos: [...MODOS_VALIDOS],
    });
  }

  const modo = modoRaw;
  const sessionId =
    (sessionIdBody && String(sessionIdBody).trim().slice(0, MAX_SESSION_ID_CHARS)) ||
    crypto.randomUUID();

  try {
    const respostaSegura = detectarRespostaSegura(mensagemTexto);
    if (respostaSegura) {
      appendToHistory(donoDaSessao, sessionId, 'user', mensagemTexto);
      appendToHistory(donoDaSessao, sessionId, 'assistant', respostaSegura);
      try {
        if (userId) await salvarHistorico(userId, mensagemTexto, respostaSegura, modo);
      } catch (dbErr) {
        logger.error(`chat salvarHistorico (seguro): ${dbErr.message}`);
      }
      return res.status(200).json({
        resposta: respostaSegura,
        session_id: sessionId,
        disclaimer: DISCLAIMER_EDUCATIVO,
      });
    }

    const respostaPronta = respostasComuns.find((item) =>
      item.pergunta.test(mensagemTexto)
    );
    if (respostaPronta) {
      const resposta = `${respostaPronta.resposta}\n\n_${DISCLAIMER_EDUCATIVO}_`;
      appendToHistory(donoDaSessao, sessionId, 'user', mensagemTexto);
      appendToHistory(donoDaSessao, sessionId, 'assistant', resposta);
      await salvarHistoricoSeguro(userId, mensagemTexto, resposta, modo);
      return res.status(200).json({
        resposta,
        session_id: sessionId,
        disclaimer: DISCLAIMER_EDUCATIVO,
      });
    }

    let fichaInfo = CONTEXTO_VISITANTE;
    if (userId) {
      const { ficha, nomesAlimentos } = await buscarFichaParaContexto(userId);
      fichaInfo = formatarFicha(ficha, nomesAlimentos);
      const diario = await contextoDoDiario(userId);
      if (diario) fichaInfo += `\n${diario}`;
    }

    const alimentos = await buscarAlimentos(mensagemTexto);
    const alimentosInfo =
      alimentos.length > 0
        ? 'Alimentos encontrados no banco:\n' +
          alimentos
            .map(
              (a) =>
                `- ${a.descricao || a.nome}: ${a.kcal} kcal, ${a.proteina}g proteínas, ${a.carboidrato}g carboidratos, ${a.gordura}g gorduras, R$${a.preco != null ? Number(a.preco).toFixed(2) : 'N/D'}`
            )
            .join('\n')
        : 'Nenhum alimento correspondente encontrado no banco.';

    const systemMessage = systemPromptParaModo(modo);
    const historicoPrevio = getRecentHistory(donoDaSessao, sessionId);

    const historicoComoTexto = historicoPrevio
      .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
      .join('\n\n');

    const promptTexto = [
      '=== SYSTEM INSTRUCTIONS ===',
      systemMessage,
      '',
      '=== CONVERSATION HISTORY (previous turns only) ===',
      historicoComoTexto || '(sem histórico prévio)',
      '',
      '=== CONTEXT ===',
      `Ficha do usuário:\n${fichaInfo}`,
      '',
      `Alimentos:\n${alimentosInfo}`,
      '',
      '=== CURRENT USER MESSAGE (respond to this once; do not treat it as already answered) ===',
      mensagemTexto,
    ].join('\n');

    const respostaIA = await chamarGeminiComRetry(promptTexto);
    const respostaFinal = `${respostaIA}\n\n_${DISCLAIMER_EDUCATIVO}_`;

    appendToHistory(donoDaSessao, sessionId, 'user', mensagemTexto);
    appendToHistory(donoDaSessao, sessionId, 'assistant', respostaFinal);

    await salvarHistoricoSeguro(userId, mensagemTexto, respostaFinal, modo);

    return res.status(200).json({
      resposta: respostaFinal,
      session_id: sessionId,
      disclaimer: DISCLAIMER_EDUCATIVO,
    });
  } catch (erro) {
    logger.error(`Erro ao conversar com a IA: ${erro.message}`);
    return res
      .status(500)
      .json({ erro: 'Erro interno ao processar a conversa com a IA.' });
  }
};

module.exports = {
  conversarComIA,
  MODOS_VALIDOS,
  MAX_MENSAGEM_CHARS,
  MAX_HISTORY_MESSAGES,
  MAX_SESSOES_EM_MEMORIA,
  MAX_SESSION_ID_CHARS,
  /** Helpers de teste / inspeção do isolamento por sessão */
  _test: {
    sessionCount: () => sessionHistories.size,
    sessionKey,
    getHistorySnapshot,
    clearSessionHistory,
    clearAllSessionHistories,
    getOrCreateHistory,
    appendToHistory,
  },
};

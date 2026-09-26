/**
 * Metas diárias estimadas (calorias e macros) e comparação com o que foi consumido no dia.
 * Funções puras. Tudo é ESTIMATIVA EDUCATIVA, não prescrição: a fórmula de Mifflin-St Jeor
 * usa um termo de sexo que o cadastro não coleta, então usamos o ponto médio entre os dois.
 */
const { roundNutrient } = require('./nutritionCalculator');
const { normalizarObjetivo, PROTEINA_POR_KG } = require('./dashboardResumo');

/** Fator de atividade "leve": não sabemos a rotina da pessoa, então evitamos superestimar. */
const FATOR_ATIVIDADE = 1.4;
/** Ajuste calórico por objetivo. */
const AJUSTE_OBJETIVO = Object.freeze({ perder_peso: 0.85, ganhar_massa: 1.1, manter_saude: 1 });
/** Piso de segurança: nunca sugerimos menos que isso. */
const KCAL_MINIMA = 1200;
const KCAL_MAXIMA = 4500;
/** Limites diários de referência (OMS): açúcares livres < 50 g, sódio < 2000 mg. */
const LIMITES_REFERENCIA = Object.freeze({ acucar_g: 50, sodio_mg: 2000, gordura_saturada_g: 22 });

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {{kcal, proteina_g, carboidratos_g, gordura_g, fibra_g, objetivo, estimada: true} | null}
 */
function calcularMetas({ peso, altura, idade, objetivo } = {}) {
  const kg = numero(peso);
  const cm = numero(altura);
  const anos = numero(idade);
  if (!kg || !cm || !anos || kg < 20 || kg > 400 || cm < 100 || cm > 250 || anos < 10 || anos > 110) {
    return null;
  }

  const chave = normalizarObjetivo(objetivo) || 'manter_saude';
  // Mifflin-St Jeor: 10p + 6,25a - 5i + s   (s = +5 homem, -161 mulher; ponto médio = -78)
  const tmb = 10 * kg + 6.25 * cm - 5 * anos - 78;
  const bruta = tmb * FATOR_ATIVIDADE * AJUSTE_OBJETIVO[chave];
  const kcal = Math.round(Math.min(KCAL_MAXIMA, Math.max(KCAL_MINIMA, bruta)));

  const proteinaG = Math.round(kg * PROTEINA_POR_KG[chave]);
  const gorduraG = Math.round((kcal * 0.27) / 9);
  const carboidratosG = Math.max(0, Math.round((kcal - proteinaG * 4 - gorduraG * 9) / 4));

  return {
    objetivo: chave,
    kcal,
    proteina_g: proteinaG,
    carboidratos_g: carboidratosG,
    gordura_g: gorduraG,
    fibra_g: 25,
    estimada: true,
  };
}

/** Soma os itens do dia. Aceita linhas do banco (kcal, proteina, carboidratos, gordura, fibra, sodio_mg). */
function somarDia(itens = []) {
  const total = { kcal: 0, proteina: 0, carboidratos: 0, gordura: 0, fibra: 0, sodio_mg: 0 };
  for (const item of itens) {
    for (const campo of Object.keys(total)) total[campo] += numero(item[campo]) || 0;
  }
  for (const campo of Object.keys(total)) total[campo] = roundNutrient(total[campo]);
  return total;
}

const pct = (valor, meta) => (meta > 0 ? Math.round((valor / meta) * 100) : null);

/** Consumido x meta, com percentuais e o que ainda falta. */
function progressoDoDia(total, metas) {
  if (!metas) return null;
  const falta = (meta, feito) => Math.max(0, roundNutrient(meta - feito));
  return {
    kcal: { meta: metas.kcal, feito: total.kcal, pct: pct(total.kcal, metas.kcal), falta: falta(metas.kcal, total.kcal) },
    proteina: { meta: metas.proteina_g, feito: total.proteina, pct: pct(total.proteina, metas.proteina_g), falta: falta(metas.proteina_g, total.proteina) },
    carboidratos: { meta: metas.carboidratos_g, feito: total.carboidratos, pct: pct(total.carboidratos, metas.carboidratos_g), falta: falta(metas.carboidratos_g, total.carboidratos) },
    gordura: { meta: metas.gordura_g, feito: total.gordura, pct: pct(total.gordura, metas.gordura_g), falta: falta(metas.gordura_g, total.gordura) },
    fibra: { meta: metas.fibra_g, feito: total.fibra, pct: pct(total.fibra, metas.fibra_g), falta: falta(metas.fibra_g, total.fibra) },
  };
}

/**
 * Sequência de dias seguidos com registro, terminando hoje (ou ontem, se hoje ainda não teve registro).
 * @param {string[]} datas AAAA-MM-DD distintas
 * @param {string} hoje AAAA-MM-DD
 */
function calcularSequencia(datas, hoje) {
  const conjunto = new Set(datas);
  const dia = (iso, delta) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };
  let cursor = conjunto.has(hoje) ? hoje : dia(hoje, -1);
  let total = 0;
  while (conjunto.has(cursor)) {
    total += 1;
    cursor = dia(cursor, -1);
  }
  return total;
}

/**
 * Dica curta da Salus, gerada por regra (sem IA: custo zero e instantânea).
 * @param {object|null} progresso resultado de progressoDoDia
 * @param {number} horaLocal 0-23 (Brasília)
 * @param {number} refeicoesHoje quantidade de itens já registrados hoje
 */
function dicaDoDia(progresso, horaLocal, refeicoesHoje) {
  if (!progresso) {
    return {
      tipo: 'perfil',
      texto: 'Complete seu perfil (peso, altura e idade) para eu calcular suas metas diárias.',
      acao: { texto: 'Abrir perfil', href: '/perfil' },
    };
  }
  if (!refeicoesHoje) {
    const nome = horaLocal < 11 ? 'café da manhã' : horaLocal < 15 ? 'almoço' : horaLocal < 19 ? 'lanche' : 'jantar';
    return {
      tipo: 'registrar',
      texto: `Ainda não vi nada no seu diário hoje. Que tal registrar o ${nome}? Uma foto do prato já resolve.`,
      acao: { texto: 'Registrar refeição', href: '/diario' },
    };
  }

  const { kcal, proteina, fibra } = progresso;
  if (kcal.pct !== null && kcal.pct > 115) {
    return {
      tipo: 'excesso',
      texto: `Você já passou ${kcal.pct - 100}% da meta de calorias de hoje. Sem culpa: prefira algo leve no resto do dia e volte ao plano amanhã.`,
      acao: { texto: 'Pedir ideias leves', href: '/chat' },
    };
  }
  if (proteina.pct !== null && proteina.pct < 60 && horaLocal >= 14) {
    return {
      tipo: 'proteina',
      texto: `Faltam ${Math.round(proteina.falta)} g de proteína hoje. Ovos, frango, atum, feijão com arroz ou iogurte ajudam a fechar a conta.`,
      acao: { texto: 'Ver sugestões', href: '/chat' },
    };
  }
  if (fibra.pct !== null && fibra.pct < 50 && horaLocal >= 17) {
    return {
      tipo: 'fibra',
      texto: 'Suas fibras estão baixas hoje. Uma fruta, uma porção de feijão ou verduras no jantar melhoram isso.',
      acao: { texto: 'Ver sugestões', href: '/chat' },
    };
  }
  if (kcal.pct !== null && kcal.pct >= 85 && kcal.pct <= 115) {
    return {
      tipo: 'parabens',
      texto: 'Dia no alvo: você está dentro da sua meta de calorias. Continue assim!',
      acao: null,
    };
  }
  return {
    tipo: 'seguir',
    texto: `Você já consumiu ${kcal.pct ?? 0}% da meta de calorias. Faltam ${Math.round(kcal.falta)} kcal — registre a próxima refeição para manter o diário em dia.`,
    acao: { texto: 'Registrar refeição', href: '/diario' },
  };
}

/**
 * Quanto um produto (por porção) pesa nos limites do dia.
 * @param {{kcal?, acucar_g?, sodio_mg?, gordura_saturada_g?, proteina_g?}} porPorcao
 */
function impactoNoDia(porPorcao, metas, totalHoje) {
  if (!porPorcao) return null;
  const linhas = [];
  const add = (rotulo, valor, limite, unidade, restante) => {
    const v = numero(valor);
    if (v === null || !limite) return;
    linhas.push({
      rotulo,
      valor: roundNutrient(v),
      unidade,
      pct_do_dia: Math.round((v / limite) * 100),
      restante_hoje: restante === null || restante === undefined ? null : roundNutrient(restante - v),
    });
  };
  const hoje = totalHoje || {};
  add('Calorias', porPorcao.kcal, metas && metas.kcal, 'kcal', metas ? metas.kcal - (hoje.kcal || 0) : null);
  add('Açúcares', porPorcao.acucar_g, LIMITES_REFERENCIA.acucar_g, 'g', null);
  add('Sódio', porPorcao.sodio_mg, LIMITES_REFERENCIA.sodio_mg, 'mg', LIMITES_REFERENCIA.sodio_mg - (hoje.sodio_mg || 0));
  add('Gordura saturada', porPorcao.gordura_saturada_g, LIMITES_REFERENCIA.gordura_saturada_g, 'g', null);
  add('Proteína', porPorcao.proteina_g, metas && metas.proteina_g, 'g', null);
  return linhas.length ? linhas : null;
}

module.exports = {
  calcularMetas,
  somarDia,
  progressoDoDia,
  calcularSequencia,
  dicaDoDia,
  impactoNoDia,
  LIMITES_REFERENCIA,
  KCAL_MINIMA,
};

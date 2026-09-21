/**
 * Indicadores do dashboard (/dashboard), calculados a partir das fichas alimentares do usuário.
 * Funções puras: recebem o que veio do banco e devolvem números prontos para exibir.
 *
 * Tudo aqui é orientação educativa, não prescrição.
 */
const { roundNutrient } = require('./nutritionCalculator');

/** g de proteína por kg de peso, por objetivo (estimativa geral, não prescrição). */
const PROTEINA_POR_KG = Object.freeze({
  perder_peso: 1.4,
  ganhar_massa: 1.8,
  manter_saude: 1.0,
});

/** kcal por grama de cada macronutriente (fatores de Atwater). */
const KCAL_POR_G = Object.freeze({ proteina: 4, carboidratos: 4, gordura: 9 });

const REFEICOES = Object.freeze({
  cafe_da_manha: 'Café da manhã',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  ceia: 'Ceia',
});

/**
 * Número ou null. Texto não numérico da TACO ("NA", "Tr") vira null, e não 0
 * (o parseToFloat do cálculo nutricional devolve 0, o que faria o item parecer "0 kcal").
 */
function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = parseFloat(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Aceita o código (perder_peso) ou texto livre; devolve null se não reconhece. */
function normalizarObjetivo(valor) {
  if (!valor) return null;
  const t = String(valor).toLowerCase();
  if (PROTEINA_POR_KG[t]) return t;
  if (/perder|gordura|emagrec/.test(t)) return 'perder_peso';
  if (/ganh|massa|hipertrof/.test(t)) return 'ganhar_massa';
  if (/manter|saud/.test(t)) return 'manter_saude';
  return null;
}

/** Classificação da OMS para adultos. */
function classificarIMC(imc) {
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Peso normal';
  if (imc < 30) return 'Sobrepeso';
  return 'Obesidade';
}

/** IMC = peso (kg) / altura (m)². Devolve null se faltar dado ou for implausível. */
function calcularIMC(peso, altura) {
  const kg = numero(peso);
  const cm = numero(altura);
  if (!kg || !cm || kg <= 0 || cm < 50 || cm > 260) return null;
  const valor = roundNutrient(kg / (cm / 100) ** 2);
  return { valor, classificacao: classificarIMC(valor) };
}

/**
 * Divisão das calorias entre proteína, carboidratos e gordura.
 * Percentuais somam 100 (calculados sobre a soma das calorias dos três macros).
 */
function distribuirMacros(ficha) {
  if (!ficha) return null;
  const kcal = {
    proteina: (numero(ficha.proteina) || 0) * KCAL_POR_G.proteina,
    carboidratos: (numero(ficha.carboidratos) || 0) * KCAL_POR_G.carboidratos,
    gordura: (numero(ficha.gordura) || 0) * KCAL_POR_G.gordura,
  };
  const total = kcal.proteina + kcal.carboidratos + kcal.gordura;
  if (total <= 0) return null;

  const pct = {
    proteina: Math.round((kcal.proteina / total) * 100),
    carboidratos: Math.round((kcal.carboidratos / total) * 100),
    gordura: Math.round((kcal.gordura / total) * 100),
  };
  // Corrige o arredondamento para fechar em 100.
  const diferenca = 100 - (pct.proteina + pct.carboidratos + pct.gordura);
  const maior = Object.keys(pct).reduce((a, b) => (pct[a] >= pct[b] ? a : b));
  pct[maior] += diferenca;

  return {
    kcal_proteina: roundNutrient(kcal.proteina),
    kcal_carboidratos: roundNutrient(kcal.carboidratos),
    kcal_gordura: roundNutrient(kcal.gordura),
    pct_proteina: pct.proteina,
    pct_carboidratos: pct.carboidratos,
    pct_gordura: pct.gordura,
  };
}

/** Média de cada total entre as fichas informadas. */
function mediaFichas(fichas) {
  if (!fichas.length) return null;
  const media = (campo) =>
    roundNutrient(fichas.reduce((soma, f) => soma + (numero(f[campo]) || 0), 0) / fichas.length);
  return {
    kcal: media('kcal'),
    proteina: media('proteina'),
    carboidratos: media('carboidratos'),
    gordura: media('gordura'),
    fibra: media('fibra'),
  };
}

/** Meta estimada de proteína (peso × g/kg do objetivo) e quanto a última ficha atinge. */
function calcularProteina(peso, objetivo, consumidoG) {
  const kg = numero(peso);
  if (!kg || kg <= 0) return null;
  const chave = normalizarObjetivo(objetivo) || 'manter_saude';
  const porKg = PROTEINA_POR_KG[chave];
  const metaG = roundNutrient(kg * porKg);
  const consumido = numero(consumidoG);
  return {
    objetivo: chave,
    por_kg: porKg,
    meta_g: metaG,
    consumido_g: consumido,
    percentual: consumido === null ? null : Math.round((consumido / metaG) * 100),
  };
}

/** Peso atual x peso alvo (metas). */
function calcularPeso(atual, alvo) {
  const a = numero(atual);
  const b = numero(alvo);
  if (!a && !b) return null;
  return {
    atual: a,
    alvo: b,
    diferenca: a !== null && b !== null ? roundNutrient(a - b) : null,
  };
}

/** Calorias de cada item da ficha (TACO é por 100 g) e maiores contribuições. */
function itensPorCalorias(itens, limite = 6) {
  return itens
    .map((i) => {
      const quantidade = numero(i.quantity_g) ?? 100;
      const kcal100 = numero(i.energia_kcal);
      return {
        nome: i.nome_alimento,
        quantidade_g: quantidade,
        refeicao: i.meal_type || null,
        kcal: kcal100 === null ? null : roundNutrient((kcal100 * quantidade) / 100),
      };
    })
    .filter((i) => i.kcal !== null)
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, limite);
}

/** Soma de calorias por refeição (só itens com refeição definida). */
function caloriasPorRefeicao(itens) {
  const soma = {};
  for (const i of itens) {
    const chave = i.meal_type;
    const kcal100 = numero(i.energia_kcal);
    if (!chave || kcal100 === null) continue;
    const quantidade = numero(i.quantity_g) ?? 100;
    soma[chave] = (soma[chave] || 0) + (kcal100 * quantidade) / 100;
  }
  return Object.entries(soma)
    .map(([refeicao, kcal]) => ({
      refeicao,
      nome: REFEICOES[refeicao] || refeicao,
      kcal: roundNutrient(kcal),
    }))
    .sort((a, b) => b.kcal - a.kcal);
}

function paraFicha(f) {
  return {
    id: f.id,
    objetivo: f.objetivo,
    data: f.data_criacao ? new Date(f.data_criacao).toISOString() : null,
    kcal: numero(f.total_kcal) || 0,
    proteina: numero(f.total_proteina) || 0,
    carboidratos: numero(f.total_carboidratos) || 0,
    gordura: numero(f.total_gordura) || 0,
    fibra: numero(f.total_fibra) || 0,
  };
}

/**
 * @param {object} dados
 * @param {object|null} dados.usuario   { nome, peso, altura, idade, peso_alvo, foco_principal }
 * @param {Array}  dados.fichas         mais recentes primeiro (linhas de fichaAlimentar)
 * @param {number} dados.totalFichas
 * @param {Array}  dados.itensUltimaFicha  { nome_alimento, quantity_g, meal_type, energia_kcal }
 * @param {Array}  dados.alimentosFrequentes  { nome_alimento, vezes }
 * @param {object} dados.chat           { total, favoritas }
 */
function montarResumo({
  usuario,
  fichas = [],
  totalFichas = 0,
  itensUltimaFicha = [],
  alimentosFrequentes = [],
  chat = {},
} = {}) {
  const cronologicas = fichas.map(paraFicha).reverse(); // antiga → recente (para o gráfico)
  const ultima = cronologicas.length ? cronologicas[cronologicas.length - 1] : null;

  return {
    usuario: usuario
      ? {
          nome: usuario.nome,
          peso: numero(usuario.peso),
          altura: numero(usuario.altura),
          idade: numero(usuario.idade),
        }
      : null,
    fichas: {
      total: Number(totalFichas) || 0,
      evolucao: cronologicas,
      ultima,
    },
    medias: mediaFichas(cronologicas),
    macros: distribuirMacros(ultima),
    imc: calcularIMC(usuario && usuario.peso, usuario && usuario.altura),
    peso: calcularPeso(usuario && usuario.peso, usuario && usuario.peso_alvo),
    foco: (usuario && usuario.foco_principal) || null,
    proteina: calcularProteina(usuario && usuario.peso, ultima && ultima.objetivo, ultima && ultima.proteina),
    itens_ultima_ficha: itensPorCalorias(itensUltimaFicha),
    refeicoes: caloriasPorRefeicao(itensUltimaFicha),
    alimentos_frequentes: alimentosFrequentes.map((a) => ({
      nome: a.nome_alimento,
      vezes: Number(a.vezes) || 0,
    })),
    chat: {
      mensagens: Number(chat.total) || 0,
      favoritas: Number(chat.favoritas) || 0,
    },
  };
}

module.exports = {
  montarResumo,
  calcularIMC,
  classificarIMC,
  distribuirMacros,
  mediaFichas,
  calcularProteina,
  calcularPeso,
  itensPorCalorias,
  caloriasPorRefeicao,
  normalizarObjetivo,
  PROTEINA_POR_KG,
  REFEICOES,
};

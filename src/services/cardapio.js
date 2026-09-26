/**
 * Cardápio semanal: valida o que a IA propôs contra a lista de alimentos permitidos (TACO com preço)
 * e calcula macros, custo por dia/semana e a lista de compras. A IA só escolhe alimentos e
 * quantidades; todos os números vêm daqui, para serem consistentes e auditáveis.
 *
 * O preço (tbltacoNL.preco_medio) é uma ESTIMATIVA por kg — a tela avisa disso.
 */
const { roundNutrient, scaleNutrient } = require('./nutritionCalculator');

const DIAS = Object.freeze(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']);
const TIPOS_REFEICAO = Object.freeze(['cafe_da_manha', 'almoco', 'lanche', 'jantar', 'ceia']);
const NOMES_REFEICAO = Object.freeze({
  cafe_da_manha: 'Café da manhã',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  ceia: 'Ceia',
});
const MAX_ITENS_POR_REFEICAO = 8;

function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numero(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!/\d/.test(s)) return 0;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Índice de alimentos permitidos por nome normalizado. */
function indexarCandidatos(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    mapa.set(normalizar(l.nome_alimento), {
      id: String(l.id_alimento),
      nome: l.nome_alimento,
      preco_kg: numero(l.preco_medio),
      kcal: numero(l.energia_kcal),
      proteina: numero(l.proteina),
      carboidratos: numero(l.carboidratos),
      gordura: numero(l.lipideos),
      fibra: numero(l.fibra_alimentar),
    });
  }
  return mapa;
}

/** Resolve o nome da IA: exato (normalizado) ou, na falta, o candidato que contém todas as palavras. */
function resolverAlimento(nomeIA, indice) {
  const chave = normalizar(nomeIA);
  if (!chave) return null;
  if (indice.has(chave)) return indice.get(chave);
  const palavras = chave.split(' ').filter((p) => p.length > 2);
  if (!palavras.length) return null;
  let melhor = null;
  for (const [nome, item] of indice) {
    if (palavras.every((p) => nome.includes(p)) && (!melhor || nome.length < melhor.nome.length)) {
      melhor = { nome, item };
    }
  }
  return melhor ? melhor.item : null;
}

const somaMacros = (a, b) => ({
  kcal: a.kcal + b.kcal,
  proteina: a.proteina + b.proteina,
  carboidratos: a.carboidratos + b.carboidratos,
  gordura: a.gordura + b.gordura,
  custo: a.custo + b.custo,
});
const zero = () => ({ kcal: 0, proteina: 0, carboidratos: 0, gordura: 0, custo: 0 });
const arredondar = (m) => ({
  kcal: Math.round(m.kcal),
  proteina: roundNutrient(m.proteina),
  carboidratos: roundNutrient(m.carboidratos),
  gordura: roundNutrient(m.gordura),
  custo: roundNutrient(m.custo),
});

/**
 * @param {object} json resposta da IA ({ dias: [...] })
 * @param {Map} indice de indexarCandidatos
 * @returns {{ok: false} | {ok: true, cardapio: object}}
 */
function montarCardapio(json, indice, { orcamento = null, metaKcal = null } = {}) {
  if (!json || !Array.isArray(json.dias) || json.dias.length === 0) return { ok: false };

  const compras = new Map();
  const dias = [];
  let totalSemana = zero();
  let descartados = 0;

  json.dias.slice(0, 7).forEach((diaIA, i) => {
    const refeicoes = [];
    let totalDia = zero();

    for (const refIA of Array.isArray(diaIA && diaIA.refeicoes) ? diaIA.refeicoes : []) {
      if (!TIPOS_REFEICAO.includes(refIA && refIA.tipo)) continue;
      const itens = [];
      let totalRef = zero();

      for (const itIA of (Array.isArray(refIA.itens) ? refIA.itens : []).slice(0, MAX_ITENS_POR_REFEICAO)) {
        const alimento = resolverAlimento(itIA && itIA.alimento, indice);
        const q = Math.round(Number(itIA && itIA.quantidade_g));
        if (!alimento || !Number.isFinite(q) || q < 5 || q > 1500) {
          descartados += 1;
          continue;
        }
        const macros = {
          kcal: scaleNutrient(alimento.kcal, q),
          proteina: scaleNutrient(alimento.proteina, q),
          carboidratos: scaleNutrient(alimento.carboidratos, q),
          gordura: scaleNutrient(alimento.gordura, q),
          custo: (alimento.preco_kg * q) / 1000,
        };
        itens.push({ alimento: alimento.nome, alimento_id: alimento.id, quantidade_g: q, kcal: Math.round(macros.kcal), custo: roundNutrient(macros.custo) });
        totalRef = somaMacros(totalRef, macros);

        const c = compras.get(alimento.id) || { alimento: alimento.nome, quantidade_g: 0, preco_kg: alimento.preco_kg };
        c.quantidade_g += q;
        compras.set(alimento.id, c);
      }

      if (itens.length) {
        refeicoes.push({ tipo: refIA.tipo, nome: NOMES_REFEICAO[refIA.tipo], itens, total: arredondar(totalRef) });
        totalDia = somaMacros(totalDia, totalRef);
      }
    }

    if (refeicoes.length) {
      dias.push({ dia: DIAS[i] || `Dia ${i + 1}`, refeicoes, total: arredondar(totalDia) });
      totalSemana = somaMacros(totalSemana, totalDia);
    }
  });

  if (dias.length === 0) return { ok: false };

  const listaCompras = [...compras.values()]
    .map((c) => ({
      alimento: c.alimento,
      quantidade_g: c.quantidade_g,
      custo_estimado: c.preco_kg > 0 ? roundNutrient((c.preco_kg * c.quantidade_g) / 1000) : null,
    }))
    .sort((a, b) => (b.custo_estimado ?? -1) - (a.custo_estimado ?? -1));

  const totais = arredondar(totalSemana);
  return {
    ok: true,
    cardapio: {
      dias,
      lista_compras: listaCompras,
      total_semana: totais,
      media_diaria_kcal: Math.round(totais.kcal / dias.length),
      meta_kcal: metaKcal,
      orcamento,
      dentro_do_orcamento: orcamento ? totais.custo <= orcamento : null,
      itens_descartados: descartados,
      itens_sem_preco: listaCompras.filter((c) => c.custo_estimado === null).length,
      aviso_precos: 'Preços são estimativas médias por kg (mercados populares) e variam por região e época.',
    },
  };
}

module.exports = {
  DIAS,
  TIPOS_REFEICAO,
  NOMES_REFEICAO,
  normalizar,
  numero,
  indexarCandidatos,
  resolverAlimento,
  montarCardapio,
};

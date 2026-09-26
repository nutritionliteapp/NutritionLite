/**
 * Sugestões de alimentos por objetivo (home e ficha), sobre a Tabela TACO.
 *
 * Só olhar calorias e gordura recomendava "refrigerante tipo cola" para quem quer emagrecer.
 * Agora: (1) alimentos que não são comida de verdade (bebidas açucaradas, doces, embutidos,
 * temperos, ultraprocessados) ficam de fora; (2) o que sobra é ordenado por densidade nutricional
 * do objetivo; (3) sorteamos entre os melhores para a lista variar.
 */
const { parseToFloat } = require('./nutritionCalculator');

/** Nomes da TACO que nunca devem ser sugeridos como "alimento do dia". */
const EXCLUIR = new RegExp(
  [
    'refrigerante', 'refresco', 'bebida', 'energ[ée]tico', 'cerveja', 'vinho', 'cacha[cç]a', 'u[ií]sque', 'vodca', 'licor',
    'achocolatado', 'gelatina', 'sorvete', 'chocolate', 'doce', 'bala\\b', 'pudim', 'bolo', 'biscoito', 'bolacha', 'torta',
    'a[cç][uú]car', 'melado', 'geleia', 'goiabada', 'rapadura', 'leite condensado', 'creme de leite', 'sonho', 'brigadeiro',
    'salgadinho', 'snack', 'hamb[uú]rguer', 'pizza', 'coxinha', 'empada', 'pastel', 'nuggets?', 'p[aã]o de queijo', 'macarr[aã]o instant',
    'mortadela', 'salsicha', 'lingui[cç]a', 'bacon', 'presunto', 'salame', 'apresuntado',
    'margarina', 'maionese', 'ketchup', 'molho', 'caldo', 'tempero', 'sal\\b', 'fermento', 'gordura vegetal', 'azeite', '[óo]leo',
    'p[óo]\\b', 'em p[óo]', 'concentrado', 'xarope', 'ado[cç]ante', 'pipoca.*[óo]leo',
    'desidratad', 'defumad', 'salgad', 'enlatad', 'em conserva',
    // leguminosas e cereais crus não são comida pronta ("feijão-preto-cru")
    '(feij[aã]o|tremo[cç]o|lentilha|gr[aã]o|soja|ervilha|milho|arroz|trigo|aveia).*[- ,]cru\\b',
  ].join('|'),
  'i'
);

const OBJETIVOS = Object.freeze(['perder_peso', 'ganhar_massa', 'manter_saude']);

/** "Tr" e "NA" da TACO não são números: só vale o que tem dígito. */
const temValor = (v) => v !== null && v !== undefined && /\d/.test(String(v));
const num = (v) => (temValor(v) ? parseToFloat(v) : null);

function ehComidaDeVerdade(item) {
  return !EXCLUIR.test(String(item.nome_alimento || ''));
}

/** Filtro duro + pontuação por objetivo. Devolve null se o alimento não serve ao objetivo. */
function avaliar(item, objetivo) {
  const kcal = num(item.energia_kcal);
  const gord = num(item.lipideos);
  const prot = num(item.proteina) ?? 0;
  const fibra = num(item.fibra_alimentar) ?? 0;
  const sodio = num(item.sodio);

  if (objetivo === 'perder_peso') {
    if (kcal === null || gord === null || kcal >= 100 || gord >= 5) return null;
    if (sodio !== null && sodio > 500) return null;
    return fibra * 2 + prot + (100 - kcal) / 20;
  }
  if (objetivo === 'ganhar_massa') {
    if (prot <= 10 || kcal === null || kcal <= 150 || kcal > 400) return null;
    if (sodio !== null && sodio > 800) return null;
    return prot * 1.5 + fibra - (sodio || 0) / 200;
  }
  if (objetivo === 'manter_saude') {
    if (sodio === null || fibra < 2 || sodio >= 500) return null;
    if (kcal !== null && kcal > 300) return null;
    return fibra * 2 + prot / 2 - sodio / 250;
  }
  return null;
}

/**
 * @param {Array} alimentos linhas da tbltacoNL
 * @param {string} objetivo perder_peso | ganhar_massa | manter_saude
 * @param {{quantidade?: number, sorteio?: () => number}} opcoes
 */
function recomendar(alimentos, objetivo, { quantidade = 2, sorteio = Math.random } = {}) {
  if (!OBJETIVOS.includes(objetivo)) return [];

  const pontuados = [];
  for (const item of alimentos || []) {
    if (!ehComidaDeVerdade(item)) continue;
    const pontos = avaliar(item, objetivo);
    if (pontos !== null) pontuados.push({ item, pontos });
  }

  pontuados.sort((a, b) => b.pontos - a.pontos);
  const melhores = pontuados.slice(0, Math.max(quantidade * 6, 12)).map((p) => p.item);

  // Fisher-Yates sobre o grupo dos melhores: variedade sem perder qualidade
  for (let i = melhores.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1));
    [melhores[i], melhores[j]] = [melhores[j], melhores[i]];
  }
  return melhores.slice(0, quantidade);
}

module.exports = { recomendar, ehComidaDeVerdade, avaliar, EXCLUIR, OBJETIVOS };

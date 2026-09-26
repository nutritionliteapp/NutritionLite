/**
 * Regras determinísticas da análise de rótulos (fora da IA, para serem confiáveis e testáveis):
 * selos de alerta da ANVISA, classificação NOVA, conversão para 100 g e custo por caloria.
 *
 * Referências: RDC 429/2020 e IN 75/2020 (ANVISA, rotulagem nutricional frontal),
 * Guia Alimentar para a População Brasileira (classificação NOVA).
 */

/** Limites da rotulagem frontal (por 100 g de sólidos ou 100 ml de líquidos). */
const LIMITES_SELO = Object.freeze({
  solido: { acucar_g: 15, gordura_saturada_g: 6, sodio_mg: 600 },
  liquido: { acucar_g: 7.5, gordura_saturada_g: 3, sodio_mg: 300 },
});

const NOVA = Object.freeze({
  1: { rotulo: 'Grupo 1 · In natura ou minimamente processado', nivel: 'bom' },
  2: { rotulo: 'Grupo 2 · Ingrediente culinário', nivel: 'bom' },
  3: { rotulo: 'Grupo 3 · Processado', nivel: 'medio' },
  4: { rotulo: 'Grupo 4 · Ultraprocessado', nivel: 'ruim' },
});

const CAMPOS_NUTRIENTES = [
  'porcao_g',
  'kcal',
  'carboidratos_g',
  'acucar_g',
  'acucar_adicionado_g',
  'proteina_g',
  'gordura_total_g',
  'gordura_saturada_g',
  'fibra_g',
  'sodio_mg',
  'embalagem_g',
];

function numeroPositivo(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 1e6 ? n : null;
}

/** Aceita o objeto da IA/Open Food Facts e devolve só números válidos (ou null) + `liquido`. */
function normalizarNutrientes(bruto) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const saida = {};
  let algum = false;
  for (const campo of CAMPOS_NUTRIENTES) {
    saida[campo] = numeroPositivo(bruto[campo]);
    if (saida[campo] !== null && campo !== 'porcao_g' && campo !== 'embalagem_g') algum = true;
  }
  saida.liquido = bruto.liquido === true;
  return algum ? saida : null;
}

const arredonda = (v) => (v === null ? null : Math.round(v * 10) / 10);

/**
 * Converte para "por 100 g/ml". `base` diz de onde vieram os números:
 * 'porcao' (rótulo, precisa de porcao_g) ou '100g' (já está por 100).
 */
function porCem(nutrientes, base = 'porcao') {
  if (!nutrientes) return null;
  let fator;
  if (base === '100g') fator = 1;
  else if (nutrientes.porcao_g > 0) fator = 100 / nutrientes.porcao_g;
  else return null;

  const escala = (v) => (v === null ? null : arredonda(v * fator));
  return {
    kcal: escala(nutrientes.kcal),
    acucar_g: escala(nutrientes.acucar_g),
    acucar_adicionado_g: escala(nutrientes.acucar_adicionado_g),
    proteina_g: escala(nutrientes.proteina_g),
    carboidratos_g: escala(nutrientes.carboidratos_g),
    gordura_g: escala(nutrientes.gordura_total_g),
    gordura_saturada_g: escala(nutrientes.gordura_saturada_g),
    fibra_g: escala(nutrientes.fibra_g),
    sodio_mg: escala(nutrientes.sodio_mg),
  };
}

/** Por porção (o que a pessoa realmente come) no formato usado por impactoNoDia. */
function porPorcao(nutrientes) {
  if (!nutrientes) return null;
  return {
    kcal: nutrientes.kcal,
    acucar_g: nutrientes.acucar_adicionado_g ?? nutrientes.acucar_g,
    sodio_mg: nutrientes.sodio_mg,
    gordura_saturada_g: nutrientes.gordura_saturada_g,
    proteina_g: nutrientes.proteina_g,
  };
}

/**
 * Selos "ALTO EM…" da ANVISA. Usa açúcar adicionado quando o rótulo informa; senão, o total
 * (então o selo é aproximado e a tela avisa).
 */
function selosAnvisa(por100, liquido = false) {
  if (!por100) return { selos: [], aproximado: false };
  const lim = liquido ? LIMITES_SELO.liquido : LIMITES_SELO.solido;
  const temAdicionado = por100.acucar_adicionado_g !== null && por100.acucar_adicionado_g !== undefined;
  const acucar = temAdicionado ? por100.acucar_adicionado_g : por100.acucar_g;

  const selos = [];
  if (acucar !== null && acucar !== undefined && acucar >= lim.acucar_g) selos.push('Alto em açúcar adicionado');
  if (por100.gordura_saturada_g !== null && por100.gordura_saturada_g >= lim.gordura_saturada_g) selos.push('Alto em gordura saturada');
  if (por100.sodio_mg !== null && por100.sodio_mg >= lim.sodio_mg) selos.push('Alto em sódio');
  return { selos, aproximado: !temAdicionado && acucar !== null && acucar !== undefined };
}

function normalizarNova(v) {
  const n = parseInt(v, 10);
  return n >= 1 && n <= 4 ? n : null;
}

function descreverNova(grupo) {
  const n = normalizarNova(grupo);
  return n ? { grupo: n, ...NOVA[n] } : null;
}

/** Preço (R$) da embalagem -> custo de 100 kcal. Null se faltar dado. */
function custoPor100kcal(preco, embalagemG, por100) {
  const p = numeroPositivo(preco);
  const emb = numeroPositivo(embalagemG);
  if (!p || !emb || !por100 || !por100.kcal) return null;
  const kcalTotal = (emb / 100) * por100.kcal;
  if (kcalTotal <= 0) return null;
  return Math.round((p / kcalTotal) * 100 * 100) / 100;
}

/** Custo por 100 g. */
function custoPor100g(preco, embalagemG) {
  const p = numeroPositivo(preco);
  const emb = numeroPositivo(embalagemG);
  if (!p || !emb) return null;
  return Math.round((p / emb) * 100 * 100) / 100;
}

module.exports = {
  LIMITES_SELO,
  NOVA,
  normalizarNutrientes,
  porCem,
  porPorcao,
  selosAnvisa,
  normalizarNova,
  descreverNova,
  custoPor100kcal,
  custoPor100g,
  numeroPositivo,
};

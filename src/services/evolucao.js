/**
 * Evolução ao longo do tempo para o dashboard: diário dos últimos 30 dias e peso.
 * Funções puras: recebem linhas do banco e devolvem séries prontas para desenhar.
 */
const { roundNutrient } = require('./nutritionCalculator');

const DIAS_DIARIO = 30;
/** "Na meta" = calorias do dia entre 85% e 115% da meta. */
const FAIXA_META = Object.freeze({ min: 0.85, max: 1.15 });

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function somarDias(iso, delta) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {{data: string, kcal: number, proteina?: number}[]} linhas um registro por dia com consumo
 * @param {{kcal: number}|null} metas
 * @param {string} hoje AAAA-MM-DD
 */
function resumirDiario(linhas, metas, hoje) {
  const porData = new Map((linhas || []).map((l) => [l.data, l]));
  const dias = [];
  for (let i = DIAS_DIARIO - 1; i >= 0; i--) {
    const data = somarDias(hoje, -i);
    const l = porData.get(data);
    dias.push({ data, kcal: l ? Math.round(numero(l.kcal) || 0) : 0, proteina: l ? roundNutrient(numero(l.proteina) || 0) : 0 });
  }

  const registrados = dias.filter((d) => d.kcal > 0);
  const media = registrados.length ? Math.round(registrados.reduce((s, d) => s + d.kcal, 0) / registrados.length) : null;
  const naMeta = metas && metas.kcal
    ? registrados.filter((d) => d.kcal >= metas.kcal * FAIXA_META.min && d.kcal <= metas.kcal * FAIXA_META.max).length
    : null;

  return {
    dias,
    dias_registrados: registrados.length,
    aderencia_pct: Math.round((registrados.length / DIAS_DIARIO) * 100),
    media_kcal: media,
    dias_na_meta: naMeta,
    meta_kcal: metas ? metas.kcal : null,
  };
}

/**
 * @param {{data: string, peso: number}[]} linhas em ordem crescente de data
 * @param {number|null} alvo peso alvo
 */
function resumirPeso(linhas, alvo) {
  const pontos = (linhas || [])
    .map((l) => ({ data: l.data, peso: numero(l.peso) }))
    .filter((p) => p.peso !== null && p.peso > 0);
  const meta = numero(alvo);
  if (!pontos.length) return { pontos: [], alvo: meta, variacao: null, primeiro: null, atual: null };

  const primeiro = pontos[0].peso;
  const atual = pontos[pontos.length - 1].peso;
  return {
    pontos,
    alvo: meta,
    primeiro,
    atual,
    variacao: pontos.length > 1 ? roundNutrient(atual - primeiro) : null,
  };
}

module.exports = { resumirDiario, resumirPeso, DIAS_DIARIO, FAIXA_META };

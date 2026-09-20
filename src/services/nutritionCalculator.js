/**
 * Cálculo nutricional com base TACO (valores por 100 g).
 * Política de arredondamento: 2 casas decimais (half-up via toFixed).
 */

const MIN_QUANTITY_G = 1;
const MAX_QUANTITY_G = 5000;
const ROUND_DECIMALS = 2;

function parseToFloat(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function roundNutrient(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(ROUND_DECIMALS));
}

/**
 * nutriente_total = nutriente_por_100g * quantity_g / 100
 */
function scaleNutrient(per100g, quantityG) {
  return roundNutrient((parseToFloat(per100g) * quantityG) / 100);
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: number } | { ok: false, mensagem: string }}
 */
function validateQuantity(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, mensagem: 'quantity_g é obrigatório.' };
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    return { ok: false, mensagem: 'quantity_g deve ser um número válido.' };
  }
  if (n < MIN_QUANTITY_G || n > MAX_QUANTITY_G) {
    return {
      ok: false,
      mensagem: `quantity_g deve estar entre ${MIN_QUANTITY_G} e ${MAX_QUANTITY_G}.`,
    };
  }
  return { ok: true, value: n };
}

/**
 * Normaliza item do body: { food_id, quantity_g, meal_type? }
 * Aceita aliases id / quantidade por compatibilidade temporária.
 */
function normalizeFichaItem(raw, index) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, mensagem: `Item ${index}: formato inválido.` };
  }
  const foodId = raw.food_id ?? raw.id ?? raw.alimento_id;
  if (foodId === null || foodId === undefined || foodId === '') {
    return {
      ok: false,
      mensagem: `Item ${index}: food_id é obrigatório (não use apenas o nome).`,
    };
  }
  const q = validateQuantity(raw.quantity_g ?? raw.quantidade);
  if (!q.ok) {
    return { ok: false, mensagem: `Item ${index}: ${q.mensagem}` };
  }
  const mealType =
    typeof raw.meal_type === 'string' && raw.meal_type.trim()
      ? raw.meal_type.trim().slice(0, 40)
      : null;

  return {
    ok: true,
    value: {
      food_id: String(foodId),
      quantity_g: q.value,
      meal_type: mealType,
    },
  };
}

/**
 * @param {Array<{ energia_kcal, proteina, carboidratos, lipideos, fibra_alimentar, quantity_g }>} rows
 */
function sumTotals(rows) {
  let total_kcal = 0;
  let total_proteina = 0;
  let total_carboidratos = 0;
  let total_gordura = 0;
  let total_fibra = 0;

  for (const row of rows) {
    const q = row.quantity_g;
    total_kcal += scaleNutrient(row.energia_kcal, q);
    total_proteina += scaleNutrient(row.proteina, q);
    total_carboidratos += scaleNutrient(row.carboidratos, q);
    total_gordura += scaleNutrient(row.lipideos, q);
    total_fibra += scaleNutrient(row.fibra_alimentar, q);
  }

  return {
    total_kcal: roundNutrient(total_kcal),
    total_proteina: roundNutrient(total_proteina),
    total_carboidratos: roundNutrient(total_carboidratos),
    total_gordura: roundNutrient(total_gordura),
    total_fibra: roundNutrient(total_fibra),
  };
}

module.exports = {
  MIN_QUANTITY_G,
  MAX_QUANTITY_G,
  ROUND_DECIMALS,
  parseToFloat,
  roundNutrient,
  scaleNutrient,
  validateQuantity,
  normalizeFichaItem,
  sumTotals,
};

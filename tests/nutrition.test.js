const {
  scaleNutrient,
  sumTotals,
  validateQuantity,
  normalizeFichaItem,
} = require('../src/services/nutritionCalculator');

describe('nutritionCalculator', () => {
  const base = {
    energia_kcal: 100,
    proteina: 10,
    carboidratos: 20,
    lipideos: 5,
    fibra_alimentar: 2,
  };

  test('100 g retorna o valor-base', () => {
    expect(scaleNutrient(100, 100)).toBe(100);
    expect(scaleNutrient(10, 100)).toBe(10);
  });

  test('50 g retorna metade', () => {
    expect(scaleNutrient(100, 50)).toBe(50);
    expect(scaleNutrient(10, 50)).toBe(5);
  });

  test('dois alimentos somam corretamente', () => {
    const totals = sumTotals([
      { ...base, quantity_g: 100 },
      { ...base, energia_kcal: 200, proteina: 20, quantity_g: 50 },
    ]);
    // 100 + (200*50/100=100) = 200 kcal; 10 + 10 = 20 prot
    expect(totals.total_kcal).toBe(200);
    expect(totals.total_proteina).toBe(20);
  });

  test('quantidade inválida é rejeitada', () => {
    expect(validateQuantity(-1).ok).toBe(false);
    expect(validateQuantity(0).ok).toBe(false);
    expect(validateQuantity(NaN).ok).toBe(false);
    expect(validateQuantity(99999).ok).toBe(false);
    expect(validateQuantity(100).ok).toBe(true);
  });

  test('normalizeFichaItem exige food_id', () => {
    const bad = normalizeFichaItem({ quantity_g: 100, nome: 'Arroz' }, 0);
    expect(bad.ok).toBe(false);
    const good = normalizeFichaItem({ food_id: 12, quantity_g: 80 }, 0);
    expect(good.ok).toBe(true);
    expect(good.value.quantity_g).toBe(80);
  });
});

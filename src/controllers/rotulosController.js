const axios = require('axios');
const logger = require('../utils/logger');
const ia = require('../services/ia');
const ra = require('../services/rotuloAnalise');
const repo = require('../services/diarioRepo');
const { impactoNoDia, somarDia } = require('../services/metasDiarias');

const MAX_IMAGENS = 4;

const DISCLAIMER_EDUCATIVO =
  'Esta análise é educativa e não substitui orientação de nutricionista ou médico. Leia sempre o rótulo oficial do produto.';

const FONTES = Object.freeze([
  'Selos de alerta: RDC 429/2020 e IN 75/2020 (ANVISA)',
  'Classificação NOVA: Guia Alimentar para a População Brasileira (Ministério da Saúde)',
  'Limites diários de referência: OMS (açúcares livres, sódio)',
]);

const isString = (v) => typeof v === 'string';

function isNotaSaudabilidadeValida(v) {
  if (v === null) return true;
  if (typeof v !== 'number' || Number.isNaN(v)) return false;
  return v >= 0 && v <= 100;
}

/**
 * Valida o JSON da IA contra o schema esperado. Campos novos (nutrientes, NOVA, alternativa)
 * são opcionais: se vierem malformados, são descartados em vez de reprovar a análise inteira.
 * Retorna { ok: true, analise } ou { ok: false }.
 */
function validarAnaliseRotulo(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false };

  if (!isNotaSaudabilidadeValida(json.nota_saudabilidade)) return { ok: false };
  if (!isString(json.nivel)) return { ok: false };
  if (!isString(json.resumo_produto)) return { ok: false };
  if (!isString(json.tabela_nutricional_resumo)) return { ok: false };
  if (!Array.isArray(json.ingredientes_explicados)) return { ok: false };
  if (!Array.isArray(json.pontos_atencao)) return { ok: false };

  for (const item of json.ingredientes_explicados) {
    if (!item || typeof item !== 'object') return { ok: false };
    if (!isString(item.termo_original) || !isString(item.explicacao_simples)) return { ok: false };
    if (item.observacao != null && !isString(item.observacao)) return { ok: false };
  }
  for (const p of json.pontos_atencao) {
    if (!isString(p)) return { ok: false };
  }

  const disclaimer =
    isString(json.disclaimer) && json.disclaimer.trim() ? json.disclaimer.trim() : DISCLAIMER_EDUCATIVO;

  const nutrientes = ra.normalizarNutrientes(json.nutrientes);
  if (nutrientes && json.liquido === true) nutrientes.liquido = true;

  return {
    ok: true,
    analise: {
      nota_saudabilidade: json.nota_saudabilidade,
      nivel: json.nivel,
      resumo_produto: json.resumo_produto,
      tabela_nutricional_resumo: json.tabela_nutricional_resumo,
      ingredientes_explicados: json.ingredientes_explicados,
      pontos_atencao: json.pontos_atencao,
      disclaimer,
      nutrientes,
      nova_grupo: ra.normalizarNova(json.nova_grupo),
      nova_justificativa: isString(json.nova_justificativa) ? json.nova_justificativa.slice(0, 300) : '',
      alternativa_saudavel: isString(json.alternativa_saudavel) ? json.alternativa_saudavel.slice(0, 300) : '',
    },
  };
}

/** Impacto do produto nas metas do dia (só para logado; qualquer falha apenas omite o bloco). */
async function calcularImpacto(usuarioId, porcao) {
  if (!usuarioId || !porcao) return null;
  try {
    const hoje = repo.hojeBrasilia();
    const [{ metas }, itens] = await Promise.all([repo.metasDoUsuario(usuarioId), repo.itensDoDia(usuarioId, hoje)]);
    return impactoNoDia(porcao, metas, somarDia(itens));
  } catch (err) {
    if (!repo.ehTabelaAusente(err)) logger.warn(`rotulos impacto: ${err.message}`);
    try {
      const { metas } = await repo.metasDoUsuario(usuarioId);
      return impactoNoDia(porcao, metas, null);
    } catch (_) {
      return null;
    }
  }
}

/**
 * Nota determinística para produtos sem análise da IA (leitura por código de barras).
 * Simples e explicável: parte de 90 e desconta ultraprocessamento e selos de alerta.
 */
function notaPorRegras({ por100, nova, selos }) {
  let nota = 90;
  if (nova === 4) nota -= 30;
  else if (nova === 3) nota -= 12;
  else if (nova === 1) nota += 5;
  nota -= (selos ? selos.length : 0) * 10;
  if (por100) {
    if (por100.fibra_g >= 3) nota += 5;
    if (por100.proteina_g >= 10) nota += 3;
    if (por100.kcal >= 450) nota -= 5;
  }
  return Math.max(0, Math.min(100, Math.round(nota)));
}

/** Valores por 100 g -> valores da porção consumida (fator = porção/100). */
function escalarNutrientes(n, fator) {
  const saida = { ...n };
  for (const c of ['kcal', 'carboidratos_g', 'acucar_g', 'acucar_adicionado_g', 'proteina_g', 'gordura_total_g', 'gordura_saturada_g', 'fibra_g', 'sodio_mg']) {
    saida[c] = n[c] === null ? null : Math.round(n[c] * fator * 10) / 10;
  }
  return saida;
}

const nivelDaNota = (n) => (n === null ? '' : n >= 70 ? 'Bom' : n >= 40 ? 'Regular' : 'Ruim');

/** Junta o que é calculado no servidor (100 g, selos, NOVA, custo, impacto, fontes) à análise. */
async function enriquecer(analise, { usuarioId, preco, embalagemG, base = 'porcao', nutrientesImpacto }) {
  const nutr = analise.nutrientes;
  const emb = ra.numeroPositivo(embalagemG) ?? (nutr ? nutr.embalagem_g : null);
  const por100 = ra.porCem(nutr, base);
  const selos = ra.selosAnvisa(por100, nutr ? nutr.liquido : false);
  const custo = por100
    ? {
        preco: ra.numeroPositivo(preco),
        por_100g: ra.custoPor100g(preco, emb),
        por_100kcal: ra.custoPor100kcal(preco, emb, por100),
      }
    : null;

  return {
    ...analise,
    por_100g: por100,
    selos_anvisa: selos,
    nova: ra.descreverNova(analise.nova_grupo)
      ? { ...ra.descreverNova(analise.nova_grupo), justificativa: analise.nova_justificativa || '' }
      : null,
    custo: custo && (custo.por_100g !== null || custo.por_100kcal !== null) ? custo : null,
    impacto: await calcularImpacto(usuarioId, ra.porPorcao(nutrientesImpacto || nutr)),
    fontes: FONTES,
  };
}

const PROMPT = `Você é um assistente de educação alimentar do app NutritionLite (Brasil).
O usuário enviou uma ou mais fotos de rótulo de produto industrializado (tabela nutricional e/ou lista de ingredientes).

Tarefas:
1) Leia o que for legível nas imagens (OCR mental).
2) Explique em linguagem simples os ingredientes com nomes técnicos (conservantes, adoçantes, espessantes, corantes, etc.): diga o que são e para que servem, sem alarmismo.
3) Resuma a tabela nutricional em poucas linhas (porções, calorias, açúcares, sódio, gorduras saturadas, etc., se visíveis).
4) Extraia os NÚMEROS da tabela nutricional (por porção, exatamente como no rótulo). Use null para o que não aparece. Não some nem estime.
5) Classifique o produto pela NOVA (Guia Alimentar brasileiro): 1 in natura/minimamente processado, 2 ingrediente culinário, 3 processado, 4 ultraprocessado (presença de aditivos cosméticos, aromatizantes, corantes, emulsificantes, xarope de milho, gordura hidrogenada, proteína isolada etc.).
6) Atribua uma NOTA DE SAUDABILIDADE de 0 a 100 para uso ocasional em uma alimentação variada (não é diagnóstico médico).
   - 80–100: em geral boas escolhas, poucos aditivos problemáticos, bom perfil nutricional relativo.
   - 50–79: moderado; atenção a sódio/açúcar/gordura ou vários aditivos.
   - 0–49: ultraprocessado ou alto em sódio/açúcar/gorduras de má qualidade, muitos aditivos — consumir raramente.
7) Sugira em UMA frase uma alternativa mais saudável e comum no Brasil (ex.: "troque por iogurte natural com fruta").

IMPORTANTE: Responda APENAS com um único objeto JSON válido (sem markdown), neste formato exato:
{
  "nota_saudabilidade": <número 0-100 ou null se ilegível>,
  "nivel": "<string curta: Ex.: Bom / Regular / Ruim>",
  "resumo_produto": "<1-3 frases sobre o que parece ser o produto>",
  "tabela_nutricional_resumo": "<texto curto ou string vazia se ilegível>",
  "nutrientes": {
    "porcao_g": <gramas ou ml da porção ou null>, "liquido": <true se o produto é líquido/bebida>,
    "kcal": <n|null>, "carboidratos_g": <n|null>, "acucar_g": <açúcares totais n|null>, "acucar_adicionado_g": <n|null>,
    "proteina_g": <n|null>, "gordura_total_g": <n|null>, "gordura_saturada_g": <n|null>, "fibra_g": <n|null>,
    "sodio_mg": <n|null>, "embalagem_g": <peso/volume total da embalagem ou null>
  },
  "nova_grupo": <1|2|3|4|null>,
  "nova_justificativa": "<uma frase>",
  "alternativa_saudavel": "<uma frase>",
  "ingredientes_explicados": [
    { "termo_original": "<como no rótulo>", "explicacao_simples": "<o que é, em português claro>", "observacao": "<opcional>" }
  ],
  "pontos_atencao": [ "<bullet 1>", "<bullet 2>" ],
  "disclaimer": "${DISCLAIMER_EDUCATIVO}"
}

Se as imagens estiverem ilegíveis ou não forem de rótulo, use nota_saudabilidade null e explique em resumo_produto.`;

const analisarRotulos = async (req, res) => {
  const inicio = Date.now();
  try {
    if (!ia.iaConfigurada()) {
      return res.status(503).json({ mensagem: 'Serviço de IA não configurado (GEMINI_API_KEY).' });
    }

    const preparo = ia.prepararImagens(req.body.imagens, {
      max: MAX_IMAGENS,
      semImagemMsg: 'Envie pelo menos uma foto da tabela nutricional e/ou da lista de ingredientes.',
    });
    if (!preparo.ok) return res.status(400).json({ mensagem: preparo.mensagem });

    const texto = await ia.gerarTexto([{ text: PROMPT }, ...preparo.partes], { rotulo: 'rotulos.analisar' });
    const json = ia.extrairJson(texto);
    const validado = validarAnaliseRotulo(json);

    logger.info(
      `rotulos analisar latencia_ms=${Date.now() - inicio} imagens=${req.body.imagens.length} parse_ok=${Boolean(json)} schema_ok=${validado.ok}`
    );

    if (!validado.ok) {
      return res.status(502).json({
        mensagem: 'Não foi possível validar a análise do rótulo. Tente outra foto ou tente novamente mais tarde.',
        disclaimer: DISCLAIMER_EDUCATIVO,
      });
    }

    const analise = await enriquecer(validado.analise, {
      usuarioId: req.usuario && req.usuario.id,
      preco: req.body.preco,
      embalagemG: req.body.embalagem_g,
    });

    return res.status(200).json({ parseado: true, analise, disclaimer: DISCLAIMER_EDUCATIVO });
  } catch (err) {
    logger.error(`analisarRotulos: ${err.message}`);
    return res.status(500).json({
      mensagem: 'Erro ao analisar rótulos. Tente novamente.',
      disclaimer: DISCLAIMER_EDUCATIVO,
    });
  }
};

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_CAMPOS = [
  'product_name', 'brands', 'quantity', 'product_quantity', 'serving_size', 'serving_quantity',
  'nutriments', 'nova_group', 'ingredients_text_pt', 'ingredients_text', 'image_front_small_url', 'categories_tags',
].join(',');

const num = (v) => ra.numeroPositivo(v);

/** Mapeia um produto do Open Food Facts (valores por 100 g/ml) para o formato interno. */
function mapearProdutoOFF(produto) {
  const n = produto.nutriments || {};
  const sodioG = num(n.sodium_100g);
  const sal = num(n.salt_100g);
  const categorias = Array.isArray(produto.categories_tags) ? produto.categories_tags.join(' ') : '';
  const liquido = /beverage|bebida|drinks?\b|juice|sucos?/i.test(categorias) || /\d\s*(ml|l)\b/i.test(String(produto.quantity || ''));

  const nutrientes = ra.normalizarNutrientes({
    kcal: n['energy-kcal_100g'] ?? (num(n.energy_100g) !== null ? num(n.energy_100g) / 4.184 : null),
    carboidratos_g: n.carbohydrates_100g,
    acucar_g: n.sugars_100g,
    proteina_g: n.proteins_100g,
    gordura_total_g: n.fat_100g,
    gordura_saturada_g: n['saturated-fat_100g'],
    fibra_g: n.fiber_100g,
    sodio_mg: sodioG !== null ? sodioG * 1000 : sal !== null ? (sal / 2.5) * 1000 : null,
    embalagem_g: produto.product_quantity,
    porcao_g: produto.serving_quantity,
    liquido,
  });
  return { nutrientes, liquido };
}

/** GET /api/rotulos/codigo/:ean — leitura por código de barras (Open Food Facts), sem IA e sem custo. */
const buscarPorCodigo = async (req, res) => {
  try {
    const ean = String(req.params.ean || '').replace(/\s/g, '');
    if (!/^\d{8,14}$/.test(ean)) {
      return res.status(400).json({ mensagem: 'Código de barras inválido. Use de 8 a 14 dígitos.' });
    }

    let produto;
    try {
      const r = await axios.get(`${OFF_URL}/${ean}.json`, {
        params: { fields: OFF_CAMPOS },
        timeout: 8000,
        headers: { 'User-Agent': 'NutritionLite/1.0 (educacao alimentar; Brasil)' },
        validateStatus: (s) => s === 200 || s === 404,
      });
      produto = r.status === 200 && r.data && r.data.status === 1 ? r.data.product : null;
    } catch (err) {
      logger.warn(`rotulos codigo ${ean}: ${err.message}`);
      return res.status(502).json({ mensagem: 'Não consegui consultar a base de produtos agora. Tente de novo ou fotografe o rótulo.' });
    }

    if (!produto) {
      return res.status(404).json({
        mensagem: 'Produto não encontrado na base aberta. Fotografe o rótulo para analisar com a IA.',
        codigo: ean,
      });
    }

    const { nutrientes } = mapearProdutoOFF(produto);
    if (!nutrientes) {
      return res.status(404).json({
        mensagem: 'Esse produto está cadastrado sem tabela nutricional. Fotografe o rótulo para analisar com a IA.',
        codigo: ean,
      });
    }

    const nova = ra.normalizarNova(produto.nova_group);
    const por100 = ra.porCem(nutrientes, '100g');
    const selos = ra.selosAnvisa(por100, nutrientes.liquido);
    const nota = notaPorRegras({ por100, nova, selos: selos.selos });

    const ingredientesTexto = String(produto.ingredients_text_pt || produto.ingredients_text || '').slice(0, 1500);
    // os selos já aparecem em destaque na tela; aqui ficam só os avisos que eles não cobrem
    const pontos = [];
    if (nova === 4) pontos.push('Ultraprocessado (NOVA 4): prefira consumir raramente.');

    const base = {
      nota_saudabilidade: nota,
      nivel: nivelDaNota(nota),
      resumo_produto: `${produto.product_name || 'Produto'}${produto.brands ? ' — ' + String(produto.brands).split(',')[0] : ''}. Dados da base aberta Open Food Facts (por 100 g/ml); a nota segue regras simples e explicáveis.`,
      tabela_nutricional_resumo: por100
        ? `Por 100 ${nutrientes.liquido ? 'ml' : 'g'}: ${por100.kcal ?? '—'} kcal, açúcares ${por100.acucar_g ?? '—'} g, gordura saturada ${por100.gordura_saturada_g ?? '—'} g, sódio ${por100.sodio_mg ?? '—'} mg.`
        : '',
      ingredientes_explicados: [],
      ingredientes_texto: ingredientesTexto,
      pontos_atencao: pontos,
      disclaimer: DISCLAIMER_EDUCATIVO,
      nutrientes,
      nova_grupo: nova,
      nova_justificativa: nova ? 'Classificação vinda da base Open Food Facts.' : '',
      alternativa_saudavel: '',
    };

    const analise = await enriquecer(base, {
      usuarioId: req.usuario && req.usuario.id,
      preco: req.query.preco,
      embalagemG: nutrientes.embalagem_g,
      base: '100g',
      nutrientesImpacto: escalarNutrientes(nutrientes, nutrientes.porcao_g ? nutrientes.porcao_g / 100 : 1),
    });

    return res.status(200).json({
      parseado: true,
      origem: 'open_food_facts',
      produto: {
        codigo: ean,
        nome: produto.product_name || null,
        marca: produto.brands ? String(produto.brands).split(',')[0] : null,
        imagem: /^https:\/\//.test(produto.image_front_small_url || '') ? produto.image_front_small_url : null,
        referencia: nutrientes.porcao_g ? `porção de ${nutrientes.porcao_g} g` : '100 g',
      },
      analise,
      disclaimer: DISCLAIMER_EDUCATIVO,
    });
  } catch (err) {
    logger.error(`buscarPorCodigo: ${err.message}`);
    return res.status(500).json({ mensagem: 'Erro ao consultar o produto. Tente novamente.' });
  }
};

module.exports = {
  analisarRotulos,
  buscarPorCodigo,
  validarAnaliseRotulo,
  notaPorRegras,
  mapearProdutoOFF,
  DISCLAIMER_EDUCATIVO,
};

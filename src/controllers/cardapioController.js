const { sql, poolPromise } = require('../config/db');
const logger = require('../utils/logger');
const ia = require('../services/ia');
const repo = require('../services/diarioRepo');
const { indexarCandidatos, montarCardapio, TIPOS_REFEICAO, NOMES_REFEICAO } = require('../services/cardapio');

const ORCAMENTO_MIN = 30;
const ORCAMENTO_MAX = 5000;
const CANDIDATOS_COM_PRECO = 130;
const CANDIDATOS_SEM_PRECO = 40;

function erroTabela(res, err, contexto) {
  if (repo.ehTabelaAusente(err)) {
    return res.status(503).json({
      mensagem: 'O cardápio ainda não foi habilitado neste servidor. Peça ao administrador para rodar "npm run migrar".',
      migracao_pendente: true,
    });
  }
  logger.error(`${contexto}: ${err.message}`);
  return res.status(500).json({ mensagem: 'Erro interno. Tente novamente.' });
}

/** Alimentos que a IA pode usar: com preço estimado (a maioria) + alguns sem preço se a base for curta. */
async function carregarCandidatos() {
  const pool = await poolPromise;
  const colunas = 'id_alimento, nome_alimento, energia_kcal, proteina, carboidratos, lipideos, fibra_alimentar, preco_medio';
  const comPreco = await pool.request().query(`
    SELECT TOP ${CANDIDATOS_COM_PRECO} ${colunas}
    FROM tbltacoNL
    WHERE preco_medio IS NOT NULL AND preco_medio > 0 AND energia_kcal LIKE '%[0-9]%'
    ORDER BY NEWID()
  `);
  let linhas = comPreco.recordset;
  if (linhas.length < 60) {
    const semPreco = await pool.request().query(`
      SELECT TOP ${CANDIDATOS_SEM_PRECO} ${colunas}
      FROM tbltacoNL
      WHERE (preco_medio IS NULL OR preco_medio = 0) AND energia_kcal LIKE '%[0-9]%'
      ORDER BY NEWID()
    `);
    linhas = linhas.concat(semPreco.recordset);
  }
  return linhas;
}

function montarPrompt({ candidatos, orcamento, refeicoes, restricoes, metas }) {
  const lista = [...candidatos.values()]
    .map((c) => `${c.nome} | ${Math.round(c.kcal)} kcal/100g | prot ${c.proteina} g | R$ ${c.preco_kg > 0 ? c.preco_kg.toFixed(2) + '/kg' : 'sem preço'}`)
    .join('\n');

  return `Você é uma nutricionista brasileira montando um CARDÁPIO SEMANAL econômico e equilibrado.

Regras:
- Use SOMENTE alimentos da lista abaixo, escrevendo o nome EXATAMENTE como na lista.
- 7 dias (Segunda a Domingo). Refeições de cada dia: ${refeicoes.join(', ')}.
- Orçamento total da semana: R$ ${orcamento.toFixed(2)} (some quantidade × preço/kg ÷ 1000). Fique dentro dele; priorize alimentos baratos e nutritivos (arroz, feijão, ovo, frango, legumes da estação, frutas).
- Meta diária aproximada: ${metas ? `${metas.kcal} kcal e ${metas.proteina_g} g de proteína` : 'cerca de 2000 kcal'}.
- Varie os alimentos ao longo da semana; monte refeições realistas (ex.: arroz + feijão + proteína + salada).
- Quantidades em gramas, porções reais (entre 10 g e 400 g por item).
- Restrições/preferências do usuário (respeite): ${restricoes || 'nenhuma'}.
- Educativo: não é prescrição médica.

Alimentos permitidos (nome | energia | proteína | preço estimado):
${lista}

Responda APENAS com JSON válido (sem markdown):
{
  "dias": [
    { "refeicoes": [
      { "tipo": "cafe_da_manha" | "almoco" | "lanche" | "jantar" | "ceia",
        "itens": [ { "alimento": "<nome exato da lista>", "quantidade_g": <número> } ] }
    ] }
  ],
  "dicas": ["<dica curta de economia ou preparo>", "<outra>"]
}`;
}

/** POST /api/cardapio/gerar  { orcamento, refeicoes?, restricoes? } */
const gerar = async (req, res) => {
  const inicio = Date.now();
  try {
    if (!ia.iaConfigurada()) {
      return res.status(503).json({ mensagem: 'Serviço de IA não configurado (GEMINI_API_KEY).' });
    }

    const orcamento = Number(String((req.body && req.body.orcamento) ?? '').replace(',', '.'));
    if (!Number.isFinite(orcamento) || orcamento < ORCAMENTO_MIN || orcamento > ORCAMENTO_MAX) {
      return res.status(400).json({ mensagem: `Informe um orçamento semanal entre R$ ${ORCAMENTO_MIN} e R$ ${ORCAMENTO_MAX}.` });
    }

    const pedidas = Array.isArray(req.body.refeicoes) ? req.body.refeicoes.filter((r) => TIPOS_REFEICAO.includes(r)) : [];
    const refeicoes = pedidas.length ? [...new Set(pedidas)] : ['cafe_da_manha', 'almoco', 'lanche', 'jantar'];
    const restricoes = ia.textoParaPrompt(req.body.restricoes, 200);

    const [linhas, { metas }] = await Promise.all([carregarCandidatos(), repo.metasDoUsuario(req.usuario.id)]);
    if (linhas.length < 15) {
      return res.status(409).json({ mensagem: 'A base de alimentos ainda não tem dados suficientes para montar o cardápio.' });
    }
    const candidatos = indexarCandidatos(linhas);

    const prompt = montarPrompt({ candidatos, orcamento, refeicoes: refeicoes.map((r) => NOMES_REFEICAO[r]), restricoes, metas });
    const texto = await ia.gerarTexto(prompt, { ms: 90_000, rotulo: 'cardapio.gerar' });
    const json = ia.extrairJson(texto);
    const montado = montarCardapio(json, candidatos, { orcamento, metaKcal: metas ? metas.kcal : null });

    logger.info(`cardapio gerar latencia_ms=${Date.now() - inicio} ok=${montado.ok}`);
    if (!montado.ok) {
      return res.status(502).json({ mensagem: 'Não consegui montar o cardápio desta vez. Tente novamente.' });
    }

    const cardapio = {
      ...montado.cardapio,
      dicas: Array.isArray(json.dicas) ? json.dicas.slice(0, 5).map((d) => ia.textoParaPrompt(d, 200)).filter(Boolean) : [],
      gerado_em: new Date().toISOString(),
    };

    try {
      const pool = await poolPromise;
      await pool
        .request()
        .input('usuario_id', sql.Int, req.usuario.id)
        .input('orcamento', sql.Float, orcamento)
        .input('conteudo', sql.NVarChar, JSON.stringify(cardapio))
        .query('INSERT INTO cardapios (usuario_id, orcamento, conteudo) VALUES (@usuario_id, @orcamento, @conteudo)');
    } catch (errSalvar) {
      if (!repo.ehTabelaAusente(errSalvar)) logger.warn(`cardapio salvar: ${errSalvar.message}`);
    }

    return res.status(200).json({ cardapio, disclaimer: 'Cardápio educativo, não substitui nutricionista.' });
  } catch (err) {
    logger.error(`cardapio gerar: ${err.message}`);
    return res.status(500).json({ mensagem: 'Erro ao gerar o cardápio. Tente novamente.' });
  }
};

/** GET /api/cardapio/ultimo */
const ultimo = async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool
      .request()
      .input('id', sql.Int, req.usuario.id)
      .query('SELECT TOP 1 conteudo FROM cardapios WHERE usuario_id = @id ORDER BY id DESC');
    if (!r.recordset.length) return res.status(200).json({ cardapio: null });
    let cardapio = null;
    try {
      cardapio = JSON.parse(r.recordset[0].conteudo);
    } catch (_) { /* conteúdo antigo/corrompido: trata como vazio */ }
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ cardapio });
  } catch (err) {
    if (repo.ehTabelaAusente(err)) return res.status(200).json({ cardapio: null, migracao_pendente: true });
    return erroTabela(res, err, 'cardapio ultimo');
  }
};

module.exports = { gerar, ultimo };

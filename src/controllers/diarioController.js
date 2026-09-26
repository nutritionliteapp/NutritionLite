const { sql, poolPromise } = require('../config/db');
const logger = require('../utils/logger');
const ia = require('../services/ia');
const repo = require('../services/diarioRepo');
const { validateQuantity, roundNutrient, scaleNutrient } = require('../services/nutritionCalculator');
const { calcularSequencia, dicaDoDia } = require('../services/metasDiarias');

const MAX_ITENS_POR_ENVIO = 30;
const MAX_ITENS_FOTO = 12;
const MSG_MIGRACAO =
  'O diário ainda não foi habilitado neste servidor. Peça ao administrador para rodar "npm run migrar".';

function responderErro(res, err, contexto) {
  if (repo.ehTabelaAusente(err)) {
    logger.warn(`${contexto}: tabela ausente (${err.message})`);
    return res.status(503).json({ mensagem: MSG_MIGRACAO, migracao_pendente: true });
  }
  logger.error(`${contexto}: ${err.message}`);
  return res.status(500).json({ mensagem: 'Erro interno. Tente novamente.' });
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : 0));

/** GET /api/diario?data=AAAA-MM-DD */
const obterDia = async (req, res) => {
  try {
    const data = req.query.data || repo.hojeBrasilia();
    if (!repo.dataValida(data)) {
      return res.status(400).json({ mensagem: 'Data inválida. Use AAAA-MM-DD.' });
    }
    const resumo = await repo.resumoDoDia(req.usuario.id, data);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(resumo);
  } catch (err) {
    return responderErro(res, err, 'diario obterDia');
  }
};

/** GET /api/diario/semana — calorias dos últimos 7 dias + sequência de dias registrados. */
const obterSemana = async (req, res) => {
  try {
    const pool = await poolPromise;
    const hoje = repo.hojeBrasilia();
    const r = await pool
      .request()
      .input('id', sql.Int, req.usuario.id)
      .input('hoje', sql.VarChar, hoje)
      .query(`
        SELECT CONVERT(VARCHAR(10), data, 23) AS data, SUM(kcal) AS kcal, SUM(proteina) AS proteina
        FROM diarioRefeicoes
        WHERE usuario_id = @id AND data >= DATEADD(DAY, -59, CAST(@hoje AS DATE))
        GROUP BY data
        ORDER BY data
      `);

    const porData = new Map(r.recordset.map((l) => [l.data, l]));
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(`${hoje}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const linha = porData.get(iso);
      dias.push({ data: iso, kcal: linha ? roundNutrient(linha.kcal) : 0, proteina: linha ? roundNutrient(linha.proteina) : 0 });
    }

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      dias,
      sequencia: calcularSequencia(r.recordset.map((l) => l.data), hoje),
    });
  } catch (err) {
    return responderErro(res, err, 'diario obterSemana');
  }
};

/** GET /api/diario/alimentos?q= — busca leve na TACO, já com id e macros por 100 g. */
const buscarAlimentos = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) return res.status(200).json([]);
    const pool = await poolPromise;
    const r = await pool
      .request()
      .input('q', sql.VarChar, `%${q}%`)
      .query(`
        SELECT TOP 15 id_alimento, nome_alimento, energia_kcal, proteina, carboidratos, lipideos
        FROM tbltacoNL WHERE nome_alimento LIKE @q ORDER BY nome_alimento
      `);
    return res.status(200).json(
      r.recordset.map((l) => ({
        id: String(l.id_alimento),
        nome: l.nome_alimento,
        kcal_100g: repo.valorTaco(l.energia_kcal),
        proteina_100g: repo.valorTaco(l.proteina),
        carboidratos_100g: repo.valorTaco(l.carboidratos),
        gordura_100g: repo.valorTaco(l.lipideos),
      }))
    );
  } catch (err) {
    return responderErro(res, err, 'diario buscarAlimentos');
  }
};

/**
 * POST /api/diario  { data?, refeicao, itens: [{ alimento_id?, nome, quantidade_g, origem?, estimativa_100g? }] }
 * Itens com alimento_id têm os macros recalculados aqui a partir da TACO (o cliente não decide os números).
 * Itens sem id só entram com estimativa_100g, marcados como estimados.
 */
const registrar = async (req, res) => {
  try {
    const { refeicao, itens } = req.body || {};
    const data = req.body && req.body.data ? req.body.data : repo.hojeBrasilia();

    if (!repo.dataValida(data)) return res.status(400).json({ mensagem: 'Data inválida. Use AAAA-MM-DD.' });
    if (data > repo.hojeBrasilia()) return res.status(400).json({ mensagem: 'Não é possível registrar refeições futuras.' });
    if (!repo.REFEICOES_VALIDAS.includes(refeicao)) {
      return res.status(400).json({ mensagem: `Refeição inválida. Use: ${repo.REFEICOES_VALIDAS.join(', ')}.` });
    }
    if (!Array.isArray(itens) || itens.length === 0 || itens.length > MAX_ITENS_POR_ENVIO) {
      return res.status(400).json({ mensagem: `Envie de 1 a ${MAX_ITENS_POR_ENVIO} alimentos.` });
    }

    const pool = await poolPromise;
    const linhas = [];

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i] || {};
      const q = validateQuantity(item.quantidade_g);
      if (!q.ok) return res.status(400).json({ mensagem: `Item ${i + 1}: ${q.mensagem.replace('quantity_g', 'quantidade_g')}` });
      const nome = String(item.nome || '').trim().slice(0, 200);

      if (item.alimento_id !== undefined && item.alimento_id !== null && item.alimento_id !== '') {
        const r = await pool
          .request()
          .input('id', sql.VarChar, String(item.alimento_id).slice(0, 50))
          .query(`
            SELECT id_alimento, nome_alimento, energia_kcal, proteina, carboidratos, lipideos, fibra_alimentar, sodio
            FROM tbltacoNL WHERE CAST(id_alimento AS NVARCHAR(100)) = @id
          `);
        const taco = r.recordset[0];
        if (!taco) return res.status(404).json({ mensagem: `Item ${i + 1}: alimento não encontrado na TACO.` });
        linhas.push({
          nome: taco.nome_alimento,
          alimento_id: String(taco.id_alimento),
          quantidade_g: q.value,
          ...repo.macrosDaTaco(taco, q.value),
          origem: item.origem === 'foto' ? 'foto' : 'manual',
          estimado: 0,
        });
      } else {
        const e = item.estimativa_100g;
        if (!nome || !e || typeof e !== 'object') {
          return res.status(400).json({ mensagem: `Item ${i + 1}: informe o alimento da TACO ou nome com estimativa.` });
        }
        linhas.push({
          nome,
          alimento_id: null,
          quantidade_g: q.value,
          kcal: scaleNutrient(limitar(e.kcal, 0, 900), q.value),
          proteina: scaleNutrient(limitar(e.proteina, 0, 100), q.value),
          carboidratos: scaleNutrient(limitar(e.carboidratos, 0, 100), q.value),
          gordura: scaleNutrient(limitar(e.gordura, 0, 100), q.value),
          fibra: scaleNutrient(limitar(e.fibra, 0, 100), q.value),
          sodio_mg: 0,
          origem: item.origem === 'foto' ? 'foto' : item.origem === 'rotulo' ? 'rotulo' : 'manual',
          estimado: 1,
        });
      }
    }

    const req2 = pool.request().input('usuario_id', sql.Int, req.usuario.id).input('data', sql.VarChar, data).input('refeicao', sql.VarChar, refeicao);
    const valores = linhas.map((l, i) => {
      req2
        .input(`n${i}`, sql.NVarChar, l.nome)
        .input(`a${i}`, sql.VarChar, l.alimento_id)
        .input(`q${i}`, sql.Float, l.quantidade_g)
        .input(`k${i}`, sql.Float, l.kcal)
        .input(`p${i}`, sql.Float, l.proteina)
        .input(`c${i}`, sql.Float, l.carboidratos)
        .input(`g${i}`, sql.Float, l.gordura)
        .input(`f${i}`, sql.Float, l.fibra)
        .input(`s${i}`, sql.Float, l.sodio_mg)
        .input(`o${i}`, sql.VarChar, l.origem)
        .input(`e${i}`, sql.Bit, l.estimado);
      return `(@usuario_id, CAST(@data AS DATE), @refeicao, @n${i}, @a${i}, @q${i}, @k${i}, @p${i}, @c${i}, @g${i}, @f${i}, @s${i}, @o${i}, @e${i})`;
    });
    await req2.query(`
      INSERT INTO diarioRefeicoes
        (usuario_id, data, refeicao, nome_alimento, alimento_id, quantidade_g, kcal, proteina, carboidratos, gordura, fibra, sodio_mg, origem, estimado)
      VALUES ${valores.join(', ')}
    `);

    const resumo = await repo.resumoDoDia(req.usuario.id, data);
    return res.status(201).json({ mensagem: 'Refeição registrada!', ...resumo });
  } catch (err) {
    return responderErro(res, err, 'diario registrar');
  }
};

/** DELETE /api/diario/:id */
const remover = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ mensagem: 'ID inválido.' });
    const pool = await poolPromise;
    const r = await pool
      .request()
      .input('id', sql.Int, id)
      .input('usuario_id', sql.Int, req.usuario.id)
      .query('DELETE FROM diarioRefeicoes WHERE id = @id AND usuario_id = @usuario_id');
    if (!r.rowsAffected || r.rowsAffected[0] === 0) {
      return res.status(404).json({ mensagem: 'Registro não encontrado.' });
    }
    return res.status(200).json({ mensagem: 'Removido.' });
  } catch (err) {
    return responderErro(res, err, 'diario remover');
  }
};

const PROMPT_FOTO = `Você é um nutricionista brasileiro ajudando a registrar uma refeição a partir de uma foto.

Identifique cada alimento visível no prato/mesa e estime a QUANTIDADE EM GRAMAS de cada um (porção realmente servida, use referências como tamanho do prato, talheres e mãos).
Use nomes simples em português como aparecem na Tabela TACO (ex.: "arroz branco cozido", "feijão carioca cozido", "peito de frango grelhado", "alface", "banana prata").
Para cada alimento dê também uma estimativa por 100 g (kcal, proteína, carboidratos, gordura, fibra) — ela só será usada se o alimento não existir na TACO.
Não invente itens que não aparecem. Se a foto não for de comida, devolva itens vazio.

Responda APENAS com um objeto JSON válido (sem markdown):
{
  "refeicao_sugerida": "cafe_da_manha" | "almoco" | "lanche" | "jantar" | "ceia",
  "itens": [
    { "nome": "<string>", "quantidade_g": <número>, "confianca": "alta" | "media" | "baixa",
      "estimativa_100g": { "kcal": <n>, "proteina": <n>, "carboidratos": <n>, "gordura": <n>, "fibra": <n> } }
  ],
  "observacao": "<uma frase opcional sobre a incerteza da estimativa>"
}`;

/** POST /api/diario/analisar-foto  { imagem: { base64, mimeType } } — só analisa; quem salva é o POST /api/diario. */
const analisarFoto = async (req, res) => {
  const inicio = Date.now();
  try {
    if (!ia.iaConfigurada()) {
      return res.status(503).json({ mensagem: 'Serviço de IA não configurado (GEMINI_API_KEY).' });
    }
    const imagem = req.body && (req.body.imagem || (Array.isArray(req.body.imagens) && req.body.imagens[0]));
    const preparo = ia.prepararImagens(imagem ? [imagem] : [], {
      max: 1,
      semImagemMsg: 'Envie a foto da refeição.',
    });
    if (!preparo.ok) return res.status(400).json({ mensagem: preparo.mensagem });

    const texto = await ia.gerarTexto([{ text: PROMPT_FOTO }, ...preparo.partes], { rotulo: 'diario.foto' });
    const json = ia.extrairJson(texto);
    if (!json || !Array.isArray(json.itens)) {
      logger.warn('diario analisarFoto: resposta da IA fora do formato');
      return res.status(502).json({ mensagem: 'Não consegui entender a foto. Tente outra mais nítida.' });
    }

    const itens = [];
    for (const bruto of json.itens.slice(0, MAX_ITENS_FOTO)) {
      const nomeIA = ia.textoParaPrompt(bruto && bruto.nome, 120);
      const qtd = limitar(bruto && bruto.quantidade_g, 1, 2000);
      if (!nomeIA || !qtd) continue;

      const taco = await repo.acharNaTaco(nomeIA);
      const est = (bruto && bruto.estimativa_100g) || {};
      const estimativa = {
        kcal: limitar(est.kcal, 0, 900),
        proteina: limitar(est.proteina, 0, 100),
        carboidratos: limitar(est.carboidratos, 0, 100),
        gordura: limitar(est.gordura, 0, 100),
        fibra: limitar(est.fibra, 0, 100),
      };
      const conf = ['alta', 'media', 'baixa'].includes(bruto.confianca) ? bruto.confianca : 'media';

      if (taco) {
        itens.push({
          nome: taco.nome_alimento,
          nome_original: nomeIA,
          alimento_id: String(taco.id_alimento),
          quantidade_g: Math.round(qtd),
          confianca: conf,
          fonte: 'TACO',
          ...repo.macrosDaTaco(taco, Math.round(qtd)),
        });
      } else {
        itens.push({
          nome: nomeIA,
          nome_original: nomeIA,
          alimento_id: null,
          quantidade_g: Math.round(qtd),
          confianca: 'baixa',
          fonte: 'estimativa da IA',
          estimativa_100g: estimativa,
          kcal: scaleNutrient(estimativa.kcal, qtd),
          proteina: scaleNutrient(estimativa.proteina, qtd),
          carboidratos: scaleNutrient(estimativa.carboidratos, qtd),
          gordura: scaleNutrient(estimativa.gordura, qtd),
          fibra: scaleNutrient(estimativa.fibra, qtd),
          sodio_mg: 0,
        });
      }
    }

    logger.info(`diario analisarFoto latencia_ms=${Date.now() - inicio} itens=${itens.length}`);
    return res.status(200).json({
      refeicao_sugerida: repo.REFEICOES_VALIDAS.includes(json.refeicao_sugerida) ? json.refeicao_sugerida : null,
      itens,
      observacao: ia.textoParaPrompt(json.observacao, 240),
      aviso: 'Estimativa a partir da foto: confira os nomes e as quantidades antes de salvar.',
    });
  } catch (err) {
    logger.error(`diario analisarFoto: ${err.message}`);
    return res.status(500).json({ mensagem: 'Erro ao analisar a foto. Tente novamente.' });
  }
};

/** GET /api/diario/dica — dica da Salus por regra (sem IA). */
const obterDica = async (req, res) => {
  try {
    const hoje = repo.hojeBrasilia();
    const resumo = await repo.resumoDoDia(req.usuario.id, hoje);
    const dica = dicaDoDia(resumo.progresso, repo.horaBrasilia(), resumo.itens.length);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ dica, progresso: resumo.progresso });
  } catch (err) {
    if (repo.ehTabelaAusente(err)) {
      // Sem a tabela do diário a dica ainda funciona só com o perfil.
      try {
        const { metas } = await repo.metasDoUsuario(req.usuario.id);
        return res.status(200).json({ dica: dicaDoDia(metas ? { kcal: { pct: 0, falta: metas.kcal }, proteina: { pct: null }, fibra: { pct: null } } : null, repo.horaBrasilia(), 0), progresso: null });
      } catch (_) { /* cai no erro padrão */ }
    }
    return responderErro(res, err, 'diario obterDica');
  }
};

module.exports = { obterDia, obterSemana, buscarAlimentos, registrar, remover, analisarFoto, obterDica };

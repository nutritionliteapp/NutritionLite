const { sql, poolPromise } = require('../config/db');
const logger = require('../utils/logger');
const lembretes = require('../services/lembretes');

const MSG_MIGRACAO = 'Os lembretes ainda não foram habilitados neste servidor. Peça ao administrador para rodar "npm run migrar".';

const tabelaAusente = (err) => Boolean(err && (err.number === 207 || err.number === 208));
const base64Url = /^[A-Za-z0-9_-]{16,200}={0,2}$/;

function falhar(res, err, contexto) {
  if (tabelaAusente(err)) return res.status(503).json({ mensagem: MSG_MIGRACAO, migracao_pendente: true });
  logger.error(`${contexto}: ${err.message}`);
  return res.status(500).json({ mensagem: 'Erro interno. Tente novamente.' });
}

/** Assinatura enviada pelo navegador → { endpoint, p256dh, auth } ou null se for inválida. */
function lerAssinatura(corpo) {
  const s = corpo && corpo.subscription;
  if (!s || typeof s.endpoint !== 'string' || !s.keys) return null;
  if (s.endpoint.length > 1200 || !/^https:\/\/[^\s]+$/.test(s.endpoint)) return null;
  if (!base64Url.test(String(s.keys.p256dh || '')) || !base64Url.test(String(s.keys.auth || ''))) return null;
  return { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth };
}

/** GET /api/lembretes/config — o front decide se mostra o cartão. */
const configuracao = (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({
    disponivel: lembretes.configurado(),
    chave_publica: lembretes.chavePublica(),
    horarios_padrao: lembretes.PADRAO_HORARIOS,
    max_horarios: lembretes.MAX_HORARIOS,
  });
};

/** POST /api/lembretes/estado  { endpoint } — este aparelho já está inscrito? */
const estado = async (req, res) => {
  try {
    const endpoint = req.body && req.body.endpoint;
    if (typeof endpoint !== 'string' || !endpoint) return res.status(200).json({ ativo: false });
    const pool = await poolPromise;
    const r = await pool
      .request()
      .input('usuario_id', sql.Int, req.usuario.id)
      .input('hash', sql.VarChar, lembretes.hashEndpoint(endpoint))
      .query('SELECT horarios, ativo FROM lembretes WHERE usuario_id = @usuario_id AND endpoint_hash = @hash');
    const linha = r.recordset && r.recordset[0];
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(linha ? { ativo: Boolean(linha.ativo), horarios: lembretes.normalizarHorarios(linha.horarios) } : { ativo: false });
  } catch (err) {
    if (tabelaAusente(err)) return res.status(200).json({ ativo: false, migracao_pendente: true });
    return falhar(res, err, 'lembretes estado');
  }
};

/** PUT /api/lembretes  { subscription, horarios } — cria/atualiza a inscrição deste aparelho. */
const salvar = async (req, res) => {
  try {
    if (!lembretes.configurado()) return res.status(503).json({ mensagem: 'Lembretes indisponíveis neste servidor.' });
    const assinatura = lerAssinatura(req.body);
    if (!assinatura) return res.status(400).json({ mensagem: 'Assinatura de notificação inválida.' });

    let horarios = lembretes.normalizarHorarios(req.body.horarios);
    if (!horarios.length) horarios = lembretes.PADRAO_HORARIOS;

    const pool = await poolPromise;
    await pool
      .request()
      .input('usuario_id', sql.Int, req.usuario.id)
      .input('hash', sql.VarChar, lembretes.hashEndpoint(assinatura.endpoint))
      .input('endpoint', sql.NVarChar, assinatura.endpoint)
      .input('p256dh', sql.VarChar, assinatura.p256dh)
      .input('auth', sql.VarChar, assinatura.auth)
      .input('horarios', sql.VarChar, horarios.join(','))
      .query(`
        MERGE lembretes AS alvo
        USING (SELECT @hash AS endpoint_hash) AS origem ON alvo.endpoint_hash = origem.endpoint_hash
        WHEN MATCHED THEN UPDATE SET usuario_id = @usuario_id, endpoint = @endpoint, p256dh = @p256dh, auth = @auth,
                                     horarios = @horarios, ativo = 1, ultimo_envio_data = NULL, ultimo_envio_hora = NULL
        WHEN NOT MATCHED THEN INSERT (usuario_id, endpoint_hash, endpoint, p256dh, auth, horarios)
                              VALUES (@usuario_id, @hash, @endpoint, @p256dh, @auth, @horarios);
      `);
    return res.status(200).json({ mensagem: 'Lembretes ativados!', horarios });
  } catch (err) {
    return falhar(res, err, 'lembretes salvar');
  }
};

/** DELETE /api/lembretes  { endpoint } */
const remover = async (req, res) => {
  try {
    const endpoint = req.body && req.body.endpoint;
    if (typeof endpoint !== 'string' || !endpoint) return res.status(400).json({ mensagem: 'Informe o endpoint.' });
    const pool = await poolPromise;
    await pool
      .request()
      .input('usuario_id', sql.Int, req.usuario.id)
      .input('hash', sql.VarChar, lembretes.hashEndpoint(endpoint))
      .query('DELETE FROM lembretes WHERE usuario_id = @usuario_id AND endpoint_hash = @hash');
    return res.status(200).json({ mensagem: 'Lembretes desativados.' });
  } catch (err) {
    if (tabelaAusente(err)) return res.status(200).json({ mensagem: 'Lembretes desativados.' });
    return falhar(res, err, 'lembretes remover');
  }
};

/** POST /api/lembretes/teste — manda uma notificação de teste para os aparelhos do usuário. */
const testar = async (req, res) => {
  try {
    if (!lembretes.configurado()) return res.status(503).json({ mensagem: 'Lembretes indisponíveis neste servidor.' });
    const pool = await poolPromise;
    const r = await pool
      .request()
      .input('usuario_id', sql.Int, req.usuario.id)
      .query('SELECT id, endpoint, p256dh, auth FROM lembretes WHERE usuario_id = @usuario_id AND ativo = 1');
    if (!r.recordset.length) return res.status(404).json({ mensagem: 'Ative os lembretes neste aparelho primeiro.' });

    let enviados = 0;
    for (const assinatura of r.recordset) {
      const status = await lembretes.enviar(assinatura, { titulo: 'NutritionLite', corpo: 'Funcionou! Você vai receber seus lembretes por aqui.', url: '/diario' });
      if (status === 'ok') enviados += 1;
      if (status === 'expirada') {
        await pool.request().input('id', sql.Int, assinatura.id).query('DELETE FROM lembretes WHERE id = @id');
      }
    }
    return res.status(enviados ? 200 : 502).json(enviados ? { mensagem: 'Notificação de teste enviada.' } : { mensagem: 'Não consegui entregar a notificação. Ative os lembretes de novo.' });
  } catch (err) {
    return falhar(res, err, 'lembretes testar');
  }
};

module.exports = { configuracao, estado, salvar, remover, testar, lerAssinatura };

/**
 * Foto de perfil. O navegador recorta e reduz (JPEG ~320x320); aqui validamos de novo tudo que chega:
 * tipo permitido, assinatura real do arquivo (não confia no mimeType informado) e tamanho.
 */
const { sql, poolPromise } = require('../config/db');
const logger = require('../utils/logger');
const { limparBase64 } = require('../services/ia');

const MAX_BYTES = 400 * 1024;
const TIPOS = Object.freeze({ 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/png': 'image/png', 'image/webp': 'image/webp' });

/** Confere os primeiros bytes: JPEG (FF D8 FF), PNG (89 50 4E 47) ou WebP (RIFF....WEBP). */
function tipoPelaAssinatura(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function tabelaAusente(err) {
  return Boolean(err && (err.number === 207 || err.number === 208));
}

const MSG_MIGRACAO = 'A foto de perfil ainda não foi habilitada neste servidor. Peça ao administrador para rodar "npm run migrar".';

/** PUT /api/usuarios/foto  { imagem: "data:image/jpeg;base64,..." | { base64, mimeType } } */
const salvarFoto = async (req, res) => {
  try {
    const entrada = req.body && req.body.imagem;
    const bruto = entrada && typeof entrada === 'object' ? entrada.base64 || entrada.data : entrada;
    if (!bruto || typeof bruto !== 'string') {
      return res.status(400).json({ mensagem: 'Envie a imagem da foto.' });
    }

    const { mime, data } = limparBase64(bruto);
    const informado = mime || (entrada && typeof entrada === 'object' ? String(entrada.mimeType || '').toLowerCase() : '');
    if (informado && !TIPOS[informado]) {
      return res.status(400).json({ mensagem: 'Formato não permitido. Use JPEG, PNG ou WebP.' });
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return res.status(400).json({ mensagem: 'Imagem inválida.' });
    }
    if (Math.floor((data.length * 3) / 4) > MAX_BYTES * 1.4) {
      return res.status(413).json({ mensagem: 'Imagem muito grande. Escolha uma foto menor.' });
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ mensagem: 'Imagem muito grande. Escolha uma foto menor.' });
    }
    const tipo = tipoPelaAssinatura(buffer);
    if (!tipo) {
      return res.status(400).json({ mensagem: 'O arquivo não parece ser uma imagem JPEG, PNG ou WebP.' });
    }

    const pool = await poolPromise;
    await pool
      .request()
      .input('usuario_id', sql.Int, req.usuario.id)
      .input('tipo', sql.VarChar, tipo)
      .input('dados', sql.VarBinary, buffer)
      .query(`
        MERGE fotosPerfil AS alvo
        USING (SELECT @usuario_id AS usuario_id) AS origem ON alvo.usuario_id = origem.usuario_id
        WHEN MATCHED THEN UPDATE SET tipo = @tipo, dados = @dados, atualizado_em = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (usuario_id, tipo, dados) VALUES (@usuario_id, @tipo, @dados);
      `);

    return res.status(200).json({ mensagem: 'Foto atualizada!' });
  } catch (err) {
    if (tabelaAusente(err)) return res.status(503).json({ mensagem: MSG_MIGRACAO, migracao_pendente: true });
    logger.error(`salvarFoto: ${err.message}`);
    return res.status(500).json({ mensagem: 'Erro ao salvar a foto.' });
  }
};

/** GET /api/usuarios/foto — bytes da imagem (o front usa fetch com token; <img> não envia Authorization). */
const obterFoto = async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool
      .request()
      .input('usuario_id', sql.Int, req.usuario.id)
      .query('SELECT tipo, dados FROM fotosPerfil WHERE usuario_id = @usuario_id');
    const linha = r.recordset && r.recordset[0];
    if (!linha) return res.status(204).end(); // sem foto: 204 (e não 404) para não poluir o console do navegador a cada página

    res.set('Content-Type', linha.tipo);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(Buffer.from(linha.dados));
  } catch (err) {
    // sem a tabela ainda: para o front é o mesmo que "sem foto" (mostra as iniciais)
    if (tabelaAusente(err)) return res.status(204).end();
    logger.error(`obterFoto: ${err.message}`);
    return res.status(500).json({ mensagem: 'Erro ao buscar a foto.' });
  }
};

/** DELETE /api/usuarios/foto */
const removerFoto = async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('usuario_id', sql.Int, req.usuario.id).query('DELETE FROM fotosPerfil WHERE usuario_id = @usuario_id');
    return res.status(200).json({ mensagem: 'Foto removida.' });
  } catch (err) {
    if (tabelaAusente(err)) return res.status(200).json({ mensagem: 'Foto removida.' });
    logger.error(`removerFoto: ${err.message}`);
    return res.status(500).json({ mensagem: 'Erro ao remover a foto.' });
  }
};

module.exports = { salvarFoto, obterFoto, removerFoto, tipoPelaAssinatura, MAX_BYTES };

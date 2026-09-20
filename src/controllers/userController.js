const bcrypt = require('bcrypt');
const { sql, poolPromise } = require('../config/db');
const jwt = require('jsonwebtoken');
const { enviarEmailConfirmacao, enviarEmail } = require('../utils/emailService');
const logger = require('../utils/logger');
const {
  normalizeEmail,
  hashToken,
  generateTokenPair,
  validatePasswordStrength,
} = require('../utils/security');

const MENSAGEM_RECUPERACAO_NEUTRA =
  'Se o e-mail estiver cadastrado, você receberá instruções de recuperação.';

// Cadastro com token de confirmação
const cadastrarUsuario = async (req, res) => {
  try {
    const { nome, senha } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!nome || !email || !senha) {
      return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios' });
    }

    const pwd = validatePasswordStrength(senha);
    if (!pwd.ok) {
      return res.status(400).json({ mensagem: pwd.mensagem });
    }

    const pool = await poolPromise;

    const resultUser = await pool
      .request()
      .input('email', sql.VarChar, email)
      .query('SELECT id FROM usuarios WHERE email = @email');

    // Não revela se o e-mail já existe: resposta neutra.
    if (resultUser.recordset.length > 0) {
      return res.status(201).json({
        mensagem:
          'Se o e-mail for elegível, você receberá um link de confirmação. Verifique também a caixa de Spam.',
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const { token, hash } = generateTokenPair();
    const expira = new Date(Date.now() + 60 * 60 * 1000);

    await pool
      .request()
      .input('nome', sql.VarChar, String(nome).trim().slice(0, 120))
      .input('email', sql.VarChar, email)
      .input('senha', sql.VarChar, senhaHash)
      .input('token', sql.VarChar, hash)
      .input('expira', sql.DateTime, expira)
      .query(`
        INSERT INTO usuarios (nome, email, senha_hash, data_cadastro, ultima_atualizacao, token_confirmacao, token_expira, email_confirmado)
        VALUES (@nome, @email, @senha, GETDATE(), GETDATE(), @token, @expira, 0)
      `);

    try {
      await enviarEmailConfirmacao(email, nome, token);
    } catch (err) {
      logger.error(`Erro enviando email de confirmação: ${err.message}`);
    }

    return res.status(201).json({
      mensagem:
        'Se o e-mail for elegível, você receberá um link de confirmação. Verifique também a caixa de Spam.',
    });
  } catch (error) {
    logger.error(`cadastrarUsuario: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro interno do servidor' });
  }
};

const confirmarEmail = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).send('<h2>Token ausente</h2>');

    const tokenHash = hashToken(token);
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('token', sql.VarChar, tokenHash)
      .query(
        'SELECT id FROM usuarios WHERE token_confirmacao = @token AND token_expira > GETDATE()'
      );

    if (result.recordset.length === 0) {
      return res.status(400).send('<h2>Token inválido ou expirado.</h2>');
    }

    const usuario = result.recordset[0];

    await pool
      .request()
      .input('id', sql.Int, usuario.id)
      .query(`
        UPDATE usuarios
        SET email_confirmado = 1, token_confirmacao = NULL, token_expira = NULL, ultima_atualizacao = GETDATE()
        WHERE id = @id
      `);

    return res.send(
      '<h2>E-mail confirmado com sucesso! Você já pode fazer login.</h2>'
    );
  } catch (error) {
    logger.error(`Erro confirmarEmail: ${error.message}`);
    return res.status(500).send('<h2>Erro interno ao confirmar e-mail.</h2>');
  }
};

const loginUsuario = async (req, res) => {
  try {
    const { senha } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!email || !senha) {
      return res.status(400).json({ mensagem: 'Email e senha são obrigatórios!' });
    }

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('email', sql.VarChar, email)
      .query('SELECT * FROM usuarios WHERE email = @email');

    const usuario = result.recordset[0];
    if (!usuario) {
      return res.status(401).json({ mensagem: 'Email ou senha inválidos!' });
    }

    if (usuario.email_confirmado !== 1 && usuario.email_confirmado !== true) {
      return res
        .status(403)
        .json({ mensagem: 'Confirme seu e-mail antes de fazer login.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ mensagem: 'Email ou senha inválidos!' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(200).json({
      mensagem: 'Login realizado com sucesso!',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
      },
    });
  } catch (error) {
    logger.error(`Erro loginUsuario: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro interno do servidor' });
  }
};

// Deletar usuário e todos os dados relacionados
const deletarUsuario = async (req, res) => {
  let transaction;
  try {
    const usuarioId = req.usuario.id;
    const pool = await poolPromise;

    // Verificar se o usuário existe
    const result = await pool.request()
      .input('id', sql.Int, usuarioId)
      .query('SELECT * FROM usuarios WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }

    // Dados dependentes primeiro (evita violação de FK), tudo em uma transação.
    // Tabela inexistente (erro 208) é ignorada; coluna [fich-id] é o esquema legado.
    const passos = [
      {
        query:
          'DELETE FROM fichaAlimentos WHERE ficha_id IN (SELECT id FROM fichaAlimentar WHERE usuario_id = @usuario_id)',
        legado:
          'DELETE FROM fichaAlimentos WHERE [fich-id] IN (SELECT id FROM fichaAlimentar WHERE usuario_id = @usuario_id)',
      },
      { query: 'DELETE FROM fichaAlimentar WHERE usuario_id = @usuario_id' },
      { query: 'DELETE FROM chatHistorico WHERE usuario_id = @usuario_id' },
      { query: 'DELETE FROM metasUsuario WHERE usuario_id = @usuario_id' },
    ];

    const executar = (query) =>
      new sql.Request(transaction).input('usuario_id', sql.Int, usuarioId).query(query);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const passo of passos) {
      try {
        await executar(passo.query);
      } catch (err) {
        if (passo.legado && /Invalid column name/i.test(err.message || '')) {
          await executar(passo.legado);
        } else if (err.number !== 208) {
          throw err;
        }
      }
    }

    await executar('DELETE FROM usuarios WHERE id = @usuario_id');
    await transaction.commit();

    return res.status(200).json({ mensagem: 'Usuário e todos os dados relacionados foram excluídos com sucesso!' });

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* transação já encerrada */
      }
    }
    logger.error(`Erro ao deletar usuario: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro ao excluir usuário.' });
  }
};

// Recuperação de senha - solicitar (resposta sempre neutra)
const forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ mensagem: 'Email é obrigatório.' });
    }

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('email', sql.VarChar, email)
      .query('SELECT id, email FROM usuarios WHERE email = @email');

    if (result.recordset.length > 0) {
      const { token, hash } = generateTokenPair();
      const expires = new Date(Date.now() + 3600000);

      await pool
        .request()
        .input('email', sql.VarChar, email)
        .input('token', sql.VarChar, hash)
        .input('expires', sql.DateTime, expires)
        .query(`
          UPDATE usuarios
          SET reset_token = @token, reset_expires = @expires
          WHERE email = @email
        `);

      // Mesma precedência do e-mail de confirmação (emailService).
      const baseUrl = (
        process.env.BASE_URL ||
        process.env.APP_URL ||
        'http://localhost:3000'
      ).replace(/\/$/, '');
      const resetLink = `${baseUrl}/novasenha?token=${token}`;

      try {
        await enviarEmail(
          email,
          'Recuperação de senha - NutritionLite',
          `<p>Você solicitou a redefinição de senha.</p>
           <p>Clique no link para redefinir: <a href="${resetLink}">Redefinir senha</a></p>
           <p>Este link expira em 1 hora.</p>
           <p>Se você não solicitou, ignore este e-mail.</p>`
        );
      } catch (mailErr) {
        logger.error(`Erro ao enviar email de recuperação: ${mailErr.message}`);
      }
    }

    return res.status(200).json({ mensagem: MENSAGEM_RECUPERACAO_NEUTRA });
  } catch (error) {
    logger.error(`Erro forgotPassword: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro interno ao solicitar recuperação.' });
  }
};

// Recuperação de senha - redefinir
const resetPassword = async (req, res) => {
  try {
    const { token, novaSenha } = req.body;

    if (!token || !novaSenha) {
      return res
        .status(400)
        .json({ mensagem: 'Token e nova senha são obrigatórios.' });
    }

    const pwd = validatePasswordStrength(novaSenha);
    if (!pwd.ok) {
      return res.status(400).json({ mensagem: pwd.mensagem });
    }

    const tokenHash = hashToken(token);
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('token', sql.VarChar, tokenHash)
      .query(
        'SELECT id FROM usuarios WHERE reset_token = @token AND reset_expires > GETDATE()'
      );

    if (result.recordset.length === 0) {
      return res.status(400).json({ mensagem: 'Token inválido ou expirado.' });
    }

    const usuario = result.recordset[0];
    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await pool
      .request()
      .input('id', sql.Int, usuario.id)
      .input('senha', sql.VarChar, senhaHash)
      .query(`
        UPDATE usuarios
        SET senha_hash = @senha, reset_token = NULL, reset_expires = NULL, ultima_atualizacao = GETDATE()
        WHERE id = @id
      `);

    return res.status(200).json({ mensagem: 'Senha redefinida com sucesso!' });
  } catch (error) {
    logger.error(`Erro resetPassword: ${error.message}`);
    return res.status(500).json({ mensagem: 'Erro interno ao redefinir senha.' });
  }
};

const buscarPerfil = async (req, res) => {
  try {
    const userId = req.usuario.id; // ID vindo do token JWT

    const pool = await poolPromise;
    
    // Query com LEFT JOIN para trazer dados do usuário, metas e da ficha alimentar mais recente
    const result = await pool.request()
      .input("id", sql.Int, userId)
      .query(`
        SELECT 
          u.nome, 
          u.email,
          u.peso,
          u.altura,
          u.idade,
          m.peso_alvo as pesoDesejado,
          m.foco_principal as foco,
          COALESCE(m.objetivo_atual, f.objetivo) as objetivo,
          f.total_kcal,
          f.total_proteina,
          f.total_carboidratos,
          f.total_gordura,
          f.total_fibra,
          f.data_criacao as ficha_data_criacao
        FROM usuarios u
        LEFT JOIN metasUsuario m ON u.id = m.usuario_id
        LEFT JOIN (
          SELECT 
            usuario_id,
            objetivo,
            total_kcal,
            total_proteina,
            total_carboidratos,
            total_gordura,
            total_fibra,
            data_criacao,
            ROW_NUMBER() OVER (PARTITION BY usuario_id ORDER BY data_criacao DESC) as rn
          FROM fichaAlimentar
        ) f ON u.id = f.usuario_id AND f.rn = 1
        WHERE u.id = @id
      `);

    // Se o usuário não existir na tabela (algo raro se o token é válido, mas possível)
    if (result.recordset.length === 0) {
      return res.status(404).json({ mensagem: "Perfil não encontrado." });
    }

    // Retorna o primeiro registro encontrado
    res.json(result.recordset[0]);
    
  } catch (err) {
    console.error("Erro ao buscar perfil:", err);
    res.status(500).json({ mensagem: "Erro interno do servidor." });
  }
};

const buscarDadosDashboard = async (req, res) => {
  try {
    const userId = req.usuario.id;
    const pool = await poolPromise;
    const result = await pool.request() 
      .input("id", sql.Int, userId)
      .query(`
        SELECT 
          nome, email
        FROM usuarios
        WHERE id = @id
      `); 
    if (result.recordset.length === 0) {
      return res.status(404).json({ mensagem: "Dados do dashboard não encontrados." });
    } else {
      return res.status(200).json(result.recordset[0]);
    }
  } catch (err) {
    console.error("Erro ao buscar dados do dashboard:", err);
    res.status(500).json({ mensagem: "Erro interno do servidor." });
  }
}
 
/**
 * Campo numérico opcional vindo de formulário: vazio → null; número → Number;
 * qualquer outra coisa → undefined (inválido). O front envia '' quando o campo fica em branco.
 */
const numeroOpcional = (valor) => {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

const atualizarPerfil = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
    const peso = numeroOpcional(req.body.peso);
    const altura = numeroOpcional(req.body.altura);
    const idade = numeroOpcional(req.body.idade);

    if (!nome || nome.length > 120) {
      return res.status(400).json({ mensagem: 'Informe um nome válido (até 120 caracteres).' });
    }
    if (peso === undefined || altura === undefined || idade === undefined) {
      return res.status(400).json({ mensagem: 'Peso, altura e idade devem ser números válidos.' });
    }
    if (
      (peso !== null && (peso <= 0 || peso >= 1000)) ||
      (altura !== null && (altura <= 0 || altura > 300)) ||
      (idade !== null && (idade <= 0 || idade > 150))
    ) {
      return res.status(400).json({ mensagem: 'Peso, altura ou idade fora do intervalo permitido.' });
    }

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, usuarioId)
      .input('nome', sql.VarChar, nome)
      .input('peso', sql.Decimal(5,2), peso)
      .input('altura', sql.Int, altura === null ? null : Math.round(altura))
      .input('idade', sql.Int, idade === null ? null : Math.round(idade))
      .query(`UPDATE usuarios SET nome = @nome, peso = @peso, altura = @altura, idade = @idade, ultima_atualizacao = GETDATE() WHERE id = @id`);
    res.status(200).json({ mensagem: 'Informações pessoais atualizadas!' });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ mensagem: 'Erro ao atualizar informações pessoais.' });
  }
};

const atualizarMetas = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const pesoAlvo = numeroOpcional(req.body.peso_alvo);
    const foco = typeof req.body.foco_principal === 'string' ? req.body.foco_principal.trim() : '';

    if (pesoAlvo === undefined || (pesoAlvo !== null && (pesoAlvo <= 0 || pesoAlvo >= 1000))) {
      return res.status(400).json({ mensagem: 'O peso alvo deve ser um número válido.' });
    }

    const pool = await poolPromise;
    // Upsert metasUsuario
    await pool.request()
      .input('usuario_id', sql.Int, usuarioId)
      .input('peso_alvo', sql.Decimal(5,2), pesoAlvo)
      .input('foco_principal', sql.VarChar, foco || null)
      .query(`
        IF EXISTS (SELECT 1 FROM metasUsuario WHERE usuario_id = @usuario_id)
          UPDATE metasUsuario SET peso_alvo = @peso_alvo, foco_principal = @foco_principal, data_atualizacao = GETDATE()
          WHERE usuario_id = @usuario_id
        ELSE
          INSERT INTO metasUsuario (usuario_id, peso_alvo, foco_principal) VALUES (@usuario_id, @peso_alvo, @foco_principal)
      `);
    res.status(200).json({ mensagem: 'Metas atualizadas!' });
  } catch (error) {
    console.error('Erro ao atualizar metas do usuário:', error);
    res.status(500).json({ mensagem: 'Erro ao atualizar metas.' });
  }
};
 
module.exports = {
    cadastrarUsuario,
    confirmarEmail,
    loginUsuario,
    deletarUsuario,
    forgotPassword,
    resetPassword,
    buscarPerfil,
    buscarDadosDashboard,
    atualizarPerfil,
    atualizarMetas
};
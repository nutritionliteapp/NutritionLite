// src/controllers/userController.js
const bcrypt = require('bcrypt');
const { sql, poolPromise } = require('../config/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { enviarEmailConfirmacao, enviarEmail } = require('../utils/emailService');

// Cadastro com token de confirmação
const cadastrarUsuario = async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios' });
    }

    const pool = await poolPromise;

    // Verificar se o email já está cadastrado
    const resultUser = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT * FROM usuarios WHERE email = @email');

    if (resultUser.recordset.length > 0) {
      return res.status(400).json({ mensagem: 'Email já cadastrado' });
    }

    // Cria o hash e token
    const senhaHash = await bcrypt.hash(senha, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Inserir no banco
    await pool.request()
      .input('nome', sql.VarChar, nome)
      .input('email', sql.VarChar, email)
      .input('senha', sql.VarChar, senhaHash)
      .input('token', sql.VarChar, token)
      .input('expira', sql.DateTime, expira)
      .query(`
        INSERT INTO usuarios (nome, email, senha_hash, data_cadastro, ultima_atualizacao, token_confirmacao, token_expira, email_confirmado)
        VALUES (@nome, @email, @senha, GETDATE(), GETDATE(), @token, @expira, 0)
      `);

    // Tenta enviar o email
    try {
      await enviarEmailConfirmacao(email, nome, token);
      return res.status(201).json({
        mensagem: 'Usuário cadastrado! Verifique seu e-mail para confirmar a conta. Se não encontrar, verifique a caixa de Spam.'
      });
    } catch (err) {
      console.error('Erro enviando email de confirmação:', err);
      return res.status(201).json({
        mensagem: 'Usuário criado, mas falha ao enviar email de confirmação. Tente reenviar.'
      });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
};

const confirmarEmail = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).send('<h2>Token ausente</h2>');

    const pool = await poolPromise;
    const result = await pool.request()
      .input('token', sql.VarChar, token)
      .query('SELECT * FROM usuarios WHERE token_confirmacao = @token AND token_expira > GETDATE()');

    if (result.recordset.length === 0) {
      return res.status(400).send('<h2>Token inválido ou expirado.</h2>');
    }

    const usuario = result.recordset[0];

    await pool.request()
      .input('id', sql.Int, usuario.id)
      .query(`
        UPDATE usuarios
        SET email_confirmado = 1, token_confirmacao = NULL, token_expira = NULL, ultima_atualizacao = GETDATE()
        WHERE id = @id
      `);

    return res.send('<h2>✅ E-mail confirmado com sucesso! Você já pode fazer login.</h2>');
  } catch (error) {
    console.error('Erro confirmarEmail:', error);
    return res.status(500).send('<h2>Erro interno ao confirmar e-mail.</h2>');
  }
};

// Login (bloqueia se email não confirmado)
const loginUsuario = async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ mensagem: 'Email e senha são obrigatórios!' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT * FROM usuarios WHERE email = @email');

    const usuario = result.recordset[0];
    if (!usuario) {
      return res.status(401).json({ mensagem: 'Email ou senha inválidos!' });
    }

    // verifica confirmação de email
    if (usuario.email_confirmado !== 1 && usuario.email_confirmado !== true) {
      return res.status(403).json({ mensagem: 'Confirme seu e-mail antes de fazer login.' });
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
      token: token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email
      }
    });

  } catch (error) {
    console.error('Erro loginUsuario:', error);
    return res.status(500).json({ mensagem: 'Erro interno do servidor' });
  }
};

// Deletar usuário (mantido)
const deletarUsuario = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const pool = await poolPromise;

    const result = await pool.request()
      .input('id', sql.Int, usuarioId)
      .query('SELECT * FROM usuarios WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensagem: 'Usuario não encontrado.' });
    }

    await pool.request()
      .input('id', sql.Int, usuarioId)
      .query('DELETE FROM usuarios WHERE id = @id');

    return res.status(200).json({ mensagem: 'Usuario e fichas deletado com sucesso!' });

  } catch (error) {
    console.error('Erro ao deletar usuario:', error);
    return res.status(500).json({ mensagem: 'Erro ao excluir usuário.' });
  }
};

// Recuperação de senha - solicitar
const forgotPassword = async (req, res) => {
  try {
    const {email} = req.body;
    if (!email) return res.status(400).json({ mensagem: "Email é obrigatório." });

    const pool = await poolPromise;
    const result = await pool.request()
      .input("email", sql.VarChar, email)
      .query("SELECT * FROM usuarios WHERE email = @email");

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1h

    await pool.request()
      .input("email", sql.VarChar, email)
      .input("token", sql.VarChar, token)
      .input("expires", sql.DateTime, expires)
      .query(`
        UPDATE usuarios 
        SET reset_token = @token, reset_expires = @expires 
        WHERE email = @email
      `);

    const resetLink = `${process.env.APP_URL.replace(/\/$/, '')}/novasenha?token=${token}`;

    await enviarEmail(
      email,
      "Recuperação de senha - NutritionLite",
      `<p>Você solicitou a redefinição de senha.</p>
       <p>Clique no link para redefinir: <a href="${resetLink}">${resetLink}</a></p>
       <p>Este link expira em 1 hora.</p>`
    );

    return res.status(200).json({ mensagem: "Email de recuperação enviado." });
  } catch (error) {
    console.error('Erro forgotPassword:', error);
    return res.status(500).json({ mensagem: "Erro interno ao solicitar recuperação." });
  }
};

// Recuperação de senha - redefinir
const resetPassword = async (req, res) => {
  try {
    const {token, novaSenha} = req.body;

    if (!token || !novaSenha) {
      console.log(token, novaSenha);
      return res.status(400).json({ mensagem: "Token e nova senha são obrigatórios." });
      
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input("token", sql.VarChar, token)
      .query("SELECT * FROM usuarios WHERE reset_token = @token AND reset_expires > GETDATE()");

    if (result.recordset.length === 0) {
      return res.status(400).json({ mensagem: "Token inválido ou expirado." });
    }

    const usuario = result.recordset[0];
    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await pool.request()
      .input("id", sql.Int, usuario.id)
      .input("senha", sql.VarChar, senhaHash)
      .query(`
        UPDATE usuarios 
        SET senha_hash = @senha, reset_token = NULL, reset_expires = NULL, ultima_atualizacao = GETDATE()
        WHERE id = @id
      `);

    return res.status(200).json({ mensagem: "Senha redefinida com sucesso!" });
  } catch (error) {
    console.error('Erro resetPassword:', error);
    return res.status(500).json({ mensagem: "Erro interno ao redefinir senha." });
  }
};

const buscarPerfil = async (req, res) => {
  try {
    const userId = req.usuario.id; // ID vindo do token JWT

    const pool = await poolPromise;
    const result = await pool.request()
      .input("id", sql.Int, userId)
      .query(`
        SELECT nome, email, peso, altura, idade, pesoDesejado, foco
        FROM usuarios
        WHERE id = @id
      `);

    // Se o usuário não existir na tabela (algo raro se o token é válido, mas possível)
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Perfil não encontrado." });
    }

    

    // Retorna o primeiro registro encontrado
    res.json(result.recordset[0]);
    
  } catch (err) {
    console.error("Erro ao buscar perfil:", err);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

module.exports = {
    cadastrarUsuario,
    confirmarEmail,
    loginUsuario,
    deletarUsuario,
    forgotPassword,
    resetPassword,
    buscarPerfil 
};
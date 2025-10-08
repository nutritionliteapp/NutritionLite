const bcrypt = require('bcrypt');
const {poolConnect, pool, sql} = require('../config/db');
const jwt = require('jsonwebtoken');

const cadastrarUsuario = async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        if (!nome || !email || !senha) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }

    //Verificar se o email já está cadastrado
    await poolConnect;

        const requestUser = pool.request();
        const resultUser = await requestUser 
            .input('email', sql.VarChar, email)
            .query('SELECT * FROM usuarios WHERE email = @email');

            if (resultUser.recordset.length > 0) {
                return res.status(409).json({ mensagem: 'Email já cadastrado' });
            } else {


    const senhaHash = await bcrypt.hash(senha, 10);

    //salvar no banco de dados
    await poolConnect;

    const request = pool.request();
    await request 
        .input('nome', sql.VarChar, nome)
        .input('email', sql.VarChar, email)
        .input('senha', sql.VarChar, senhaHash)
        .query(`
            INSERT INTO Usuarios (nome, email, senha_hash, data_cadastro, ultima_atualizacao )
            VALUES (@nome, @email, @senha, GETDATE(), GETDATE())
            `);

    return res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso' });
        }
}catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
}
};

const loginUsuario = async (req, res) => {
    try {
        const {email, senha } = req.body;

        if(!email || !senha ){
            return res.status(400).json({mensagem: 'Email e senha são obrigatórios!'})
        }

        await poolConnect;

        const request = pool.request();
        const result = await request 
            .input('email', sql.VarChar, email)
            .query('SELECT * FROM usuarios WHERE email = @email');

            const usuario = result.recordset[0];

            if(!usuario){
                return res.status(401).json({mensagem: 'Email ou senha inválidos!'})
            }

            const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

            if(!senhaValida){
                return res.status(401).json({mensagem: 'Email ou senha inválidos!'})
            }

            const token = jwt.sign(
                    {id: usuario.id, email: usuario.email}, 
                    process.env.JWT_SECRET, 
                    {expiresIn: '1h'
                });

            return res.status(200).json({
                mensagem: 'Login realizado com sucesso!', 
                token: token
            });            
            

        } catch (error){
            console.error(error);
            return res.status(500).json({Mensagem: 'Erro interno do servidor'})
        }
};

    const deletarUsuario = async (req, res) => {
        try{
            const usuarioId = req.usuario.id;

            await poolConnect;
            const request = pool.request();

            const result = await request
            .input('id', sql.Int, usuarioId)
            .query('SELECT * FROM usuarios WHERE id = @id');

            if (result.recordset.length === 0){
                return res.status(404).json({mensagem: 'Usuario não encontrado.'});
            }
        
            await pool.request()
            .input('id', sql.Int, usuarioId)
            .query('DELETE FROM usuarios WHERE id = @id');
        
            return res.status(200).json({mensagem: 'Usuario e fichas deletado com sucesso!'});
        
        } catch (error) {
            console.error('Erro ao deletar usuario:', error);
            return res.status(500).json({mensagem: 'Erro ao excluir usuário.'})
        }
    };

    
module.exports = {
    cadastrarUsuario,
    loginUsuario,
    deletarUsuario
};

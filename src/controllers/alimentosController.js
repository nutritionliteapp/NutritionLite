const { sql, poolPromise } = require('../config/db');

const listarAlimentos = async (req, res) => {
  try {
    const pool = await poolPromise; 
    const result = await pool.request().query('SELECT * FROM tbltacoNL');
    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Erro ao listar alimentos:', error);
    return res.status(500).json({ mensagem: 'Erro ao buscar alimentos no banco de dados.' });
  }
};

const buscarAlimentosPorNome = async (req, res) => {
  try {
    const nome = req.query.nome;

    if (!nome) {
      return res.status(400).json({ mensagem: 'Informe o nome do alimento.' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('nome', sql.VarChar, `%${nome}%`)
      .query(`
        SELECT nome_alimento, energia_kcal, proteina, carboidratos, lipideos, fibra_alimentar, sodio
        FROM tbltacoNL
        WHERE nome_alimento LIKE @nome
      `);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Erro ao buscar alimentos:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao buscar alimento' });
  }
};

module.exports = {
  listarAlimentos,
  buscarAlimentosPorNome
};

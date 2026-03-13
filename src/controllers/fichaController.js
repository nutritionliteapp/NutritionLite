const { validationResult } = require('express-validator');
const { sql, poolPromise } = require('../config/db');

const parseToFloat = (value) => {
  if (!value) return 0;
  return parseFloat(String(value).replace(',', '.'));
};

// Função auxiliar para embaralhar um array (Fisher-Yates shuffle)
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const criarFicha = async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  try {
    const { alimentos, objetivo } = req.body;
    const usuarioId = req.usuario.id;

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const request = new sql.Request(transaction);

      const nomesFormatados = alimentos.map((_, i) => `@alimento${i}`).join(', ');
      alimentos.forEach((nome, i) => {
        request.input(`alimento${i}`, sql.VarChar, nome);
      });

      const query = `SELECT * FROM tbltacoNL WHERE nome_alimento IN (${nomesFormatados})`;
      const result = await request.query(query);
      const lista = result.recordset;

      if (lista.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ mensagem: 'Nenhum alimento encontrado.' });
      }

      let total_kcal = 0,
        total_proteina = 0,
        total_carboidratos = 0,
        total_gordura = 0,
        total_fibra = 0;

      lista.forEach((item) => {
        total_kcal += parseToFloat(item.energia_kcal);
        total_proteina += parseToFloat(item.proteina);
        total_carboidratos += parseToFloat(item.carboidratos);
        total_gordura += parseToFloat(item.lipideos);
        total_fibra += parseToFloat(item.fibra_alimentar);
      });

      const insertResult = await new sql.Request(transaction)
        .input('usuario_id', sql.Int, usuarioId)
        .input('objetivo', sql.VarChar, objetivo)
        .input('total_kcal', sql.Float, total_kcal.toFixed(2))
        .input('total_proteina', sql.Float, total_proteina.toFixed(2))
        .input('total_carboidratos', sql.Float, total_carboidratos.toFixed(2))
        .input('total_gordura', sql.Float, total_gordura.toFixed(2))
        .input('total_fibra', sql.Float, total_fibra.toFixed(2))
        .query(`
          INSERT INTO fichaAlimentar
          (usuario_id, objetivo, total_kcal, total_proteina, total_carboidratos, total_gordura, total_fibra)
          OUTPUT INSERTED.id AS id
          VALUES (@usuario_id, @objetivo, @total_kcal, @total_proteina, @total_carboidratos, @total_gordura, @total_fibra)
        `);

      const fichaId = insertResult.recordset[0].id;

      const tableCheck = await new sql.Request(transaction).query(
        "SELECT CASE WHEN OBJECT_ID(N'dbo.fichaAlimentos', N'U') IS NULL THEN 0 ELSE 1 END AS existsTable"
      );
      const exists = tableCheck.recordset[0] && tableCheck.recordset[0].existsTable === 1;

      if (!exists) {
        await new sql.Request(transaction).query(`
          CREATE TABLE fichaAlimentos (
            id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            [fich-id] INT NOT NULL,
            alimento_id NVARCHAR(100) NULL,
            nome_alimento VARCHAR(255) NOT NULL
          )
        `);
      }

      // Insere um registro em fichaAlimentos para cada alimento retornado da TACO
      for (const item of lista) {
        await new sql.Request(transaction)
          .input('fich_id', sql.Int, fichaId)
          .input('alimento_id', sql.NVarChar, item.id_alimento)
          .input('nome_alimento', sql.VarChar, item.nome_alimento)
          .query(
            'INSERT INTO fichaAlimentos ([fich-id], alimento_id, nome_alimento) VALUES (@fich_id, @alimento_id, @nome_alimento)'
          );
      }

      await transaction.commit();

      return res.status(201).json({
        mensagem: 'Ficha alimentar criada com sucesso!',
        total_kcal,
        total_proteina,
        total_carboidratos,
        total_gordura,
        total_fibra,
      });
    } catch (transError) {
      await transaction.rollback();
      console.error('Erro na transação ao criar ficha alimentar:', transError);
      return res.status(400).json({ mensagem: transError.message || 'Erro ao criar ficha alimentar.' });
    }
  } catch (error) {
    console.error('Erro ao criar ficha alimentar (fora da transação):', error);
    return res.status(500).json({ mensagem: 'Erro interno ao criar a ficha alimentar.' });
  }
};

const listarFichas = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const pool = await poolPromise;
    const request = pool.request();

    const result = await request
      .input('usuario_id', sql.Int, usuarioId)
      .query('SELECT * FROM fichaAlimentar WHERE usuario_id = @usuario_id ORDER BY data_criacao DESC');

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Erro ao listar fichas:', error);
    return res.status(500).json({ mensagem: 'Erro ao buscar fichas alimentares.' });
  }
};

const deletarFicha = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ erro: 'ID da ficha não fornecido' });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query('DELETE FROM fichaAlimentar WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ erro: 'Ficha não encontrada' });
    }

    res.status(200).json({ mensagem: 'Ficha deletada com sucesso' });
  } catch (erro) {
    console.error('Erro ao deletar ficha:', erro);
    res.status(500).json({ erro: 'Erro ao deletar ficha alimentar' });
  }
};

const atualizarObjetivoFicha = async (req, res) => {
  try {
    const { objetivo } = req.body;
    const usuarioId = req.usuario.id;

    // Validação dos objetivos permitidos
    const objetivosPermitidos = ['perder_peso', 'ganhar_massa', 'manter_saude'];
    if (!objetivo || !objetivosPermitidos.includes(objetivo)) {
      return res.status(400).json({ 
        mensagem: 'Objetivo inválido. Use: perder_peso, ganhar_massa ou manter_saude' 
      });
    }

    const pool = await poolPromise;

    // Busca a ficha mais recente do usuário
    const fichaResult = await pool.request()
      .input('usuario_id', sql.Int, usuarioId)
      .query(`
        SELECT TOP 1 id 
        FROM fichaAlimentar 
        WHERE usuario_id = @usuario_id 
        ORDER BY data_criacao DESC
      `);

    if (fichaResult.recordset.length === 0) {
      return res.status(404).json({ mensagem: 'Nenhuma ficha alimentar encontrada para este usuário.' });
    }

    const fichaId = fichaResult.recordset[0].id;

    // Atualiza o objetivo da ficha mais recente
    await pool.request()
      .input('id', sql.Int, fichaId)
      .input('objetivo', sql.VarChar, objetivo)
      .query(`
        UPDATE fichaAlimentar 
        SET objetivo = @objetivo 
        WHERE id = @id
      `);

    return res.status(200).json({ 
      mensagem: 'Objetivo atualizado com sucesso!',
      objetivo 
    });
  } catch (error) {
    console.error('Erro ao atualizar objetivo da ficha:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao atualizar objetivo.' });
  }
};

const recomendarDieta = async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  const { objetivo } = req.body;

  try {
    const pool = await poolPromise;
    const request = pool.request();
    const result = await request.query('SELECT * FROM tbltacoNL');
    const alimentos = result.recordset;
    console.log('Alimentos brutos da tbltacoNL:', alimentos.length, 'itens');
    if (alimentos.length === 0) {
        console.warn('A tbltacoNL não retornou nenhum alimento.');
    }

    let recomendados = [];

    if (objetivo === 'perder_peso') {
      recomendados = alimentos
        .filter(item => parseToFloat(item.energia_kcal) < 100 && parseToFloat(item.lipideos) < 5);
      console.log('Alimentos filtrados para perder_peso:', recomendados.length, 'itens');
    } else if (objetivo === 'ganhar_massa') {
      recomendados = alimentos
        .filter(item => parseToFloat(item.proteina) > 10 && parseToFloat(item.energia_kcal) > 150);
      console.log('Alimentos filtrados para ganhar_massa:', recomendados.length, 'itens');
    } else if (objetivo === 'manter_saude') {
      recomendados = alimentos
        .filter(item => parseToFloat(item.fibra_alimentar) >= 2 && parseToFloat(item.sodio) < 500);
      console.log('Alimentos filtrados para manter_saude:', recomendados.length, 'itens');
    }

    // Embaralha os alimentos filtrados e pega os 2 primeiros
    recomendados = shuffleArray(recomendados).slice(0, 2);
    console.log('Alimentos recomendados finais:', recomendados);

    return res.status(200).json({ alimentos_recomendados: recomendados });
  } catch (error) {
    console.error('Erro ao recomendar dieta:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao recomendar dieta.' });
  }
};

module.exports = {
  criarFicha,
  listarFichas,
  deletarFicha,
  recomendarDieta,
  atualizarObjetivoFicha,
};

const atualizarFicha = async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erros: erros.array() });
  }

  try {
    const { id } = req.params;
    const { objetivo, alimentos: nomesAlimentos } = req.body;
    const usuarioId = req.usuario.id;

    const pool = await poolPromise;
    let transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // 1. Verificar se a ficha existe e pertence ao usuário
      const fichaCheck = await transaction.request()
        .input('id', sql.Int, id)
        .input('usuario_id', sql.Int, usuarioId)
        .query('SELECT id FROM fichaAlimentar WHERE id = @id AND usuario_id = @usuario_id');

      if (fichaCheck.recordset.length === 0) {
        throw new Error('Ficha não encontrada ou não pertence ao usuário.');
      }

      // 2. Obter detalhes nutricionais dos novos alimentos da tbltacoNL
      const requestAlimentos = transaction.request();
      const placeholders = nomesAlimentos.map((_, i) => `@alimento${i}`).join(', ');
      nomesAlimentos.forEach((nome, i) => {
        requestAlimentos.input(`alimento${i}`, sql.VarChar, nome);
      });

      const queryAlimentos = `SELECT * FROM tbltacoNL WHERE nome_alimento IN (${placeholders})`;
      const resultAlimentos = await requestAlimentos.query(queryAlimentos);
      const alimentosDetalhes = resultAlimentos.recordset;

      if (alimentosDetalhes.length !== nomesAlimentos.length) {
        throw new Error('Um ou mais alimentos não foram encontrados no banco de dados.');
      }

      let total_kcal = 0,
        total_proteina = 0,
        total_carboidratos = 0,
        total_gordura = 0,
        total_fibra = 0;

      alimentosDetalhes.forEach((item) => {
        total_kcal += parseToFloat(item.energia_kcal);
        total_proteina += parseToFloat(item.proteina);
        total_carboidratos += parseToFloat(item.carboidratos);
        total_gordura += parseToFloat(item.lipideos);
        total_fibra += parseToFloat(item.fibra_alimentar);
      });

      // 3. Atualizar a fichaAlimentar
      await transaction.request()
        .input('id', sql.Int, id)
        .input('objetivo', sql.VarChar, objetivo)
        .input('total_kcal', sql.Float, total_kcal.toFixed(2))
        .input('total_proteina', sql.Float, total_proteina.toFixed(2))
        .input('total_carboidratos', sql.Float, total_carboidratos.toFixed(2))
        .input('total_gordura', sql.Float, total_gordura.toFixed(2))
        .input('total_fibra', sql.Float, total_fibra.toFixed(2))
        .query(`
          UPDATE fichaAlimentar
          SET objetivo = @objetivo,
              total_kcal = @total_kcal,
              total_proteina = @total_proteina,
              total_carboidratos = @total_carboidratos,
              total_gordura = @total_gordura,
              total_fibra = @total_fibra
          WHERE id = @id
        `);

      // 4. Deletar alimentos antigos da fichaAlimentos (cria a tabela se não existir)
      try {
        // Verifica se a tabela existe
        const tableCheck = await transaction.request()
          .query("SELECT CASE WHEN OBJECT_ID(N'dbo.fichaAlimentos', N'U') IS NULL THEN 0 ELSE 1 END AS existsTable");
        const exists = tableCheck.recordset[0] && tableCheck.recordset[0].existsTable === 1;

        if (!exists) {
          // Cria uma tabela mínima para armazenar os alimentos da ficha
          await transaction.request().query(`
            CREATE TABLE fichaAlimentos (
              id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [fich-id] INT NOT NULL,
              alimento_id NVARCHAR(100) NULL,
              nome_alimento VARCHAR(255) NOT NULL
            )
          `);
        }

        await transaction.request()
          .input('fich_id', sql.Int, id)
          .query('DELETE FROM fichaAlimentos WHERE [fich-id] = @fich_id');

        // 5. Inserir novos alimentos na fichaAlimentos usando os dados da TACO
        for (const item of alimentosDetalhes) {
          await transaction.request()
            .input('fich_id', sql.Int, id)
            .input('alimento_id', sql.NVarChar, item.id_alimento)
            .input('nome_alimento', sql.VarChar, item.nome_alimento)
            .query('INSERT INTO fichaAlimentos ([fich-id], alimento_id, nome_alimento) VALUES (@fich_id, @alimento_id, @nome_alimento)');
        }
      } catch (err) {
        // Re-lança para que a transação faça rollback
        throw err;
      }

      await transaction.commit();

      return res.status(200).json({ mensagem: 'Ficha alimentar atualizada com sucesso!' });
    } catch (transError) {
      await transaction.rollback();
      console.error('Erro na transação de atualização da ficha:', transError);
      return res.status(400).json({ mensagem: transError.message || 'Erro ao atualizar ficha alimentar.' });
    }
  } catch (error) {
    console.error('Erro ao atualizar ficha alimentar (fora da transação):', error);
    return res.status(500).json({ mensagem: 'Erro interno ao atualizar a ficha alimentar.' });
  }
};

const buscarFichaPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    console.log(`Backend: Tentando buscar ficha ID: ${id} para o usuário ID: ${usuarioId}`);

    const pool = await poolPromise;
    const request = pool.request();

    // Busca a ficha principal
    const fichaResult = await request
      .input('id', sql.Int, id)
      .input('usuario_id', sql.Int, usuarioId)
      .query('SELECT * FROM fichaAlimentar WHERE id = @id AND usuario_id = @usuario_id');
    console.log('Resultado da busca da ficha principal:', fichaResult.recordset);

    if (fichaResult.recordset.length === 0) {
      console.warn(`Backend: Ficha ID ${id} não encontrada ou não pertence ao usuário ID ${usuarioId}.`);
      return res.status(404).json({ mensagem: 'Ficha não encontrada ou não pertence a este usuário.' });
    }

    const ficha = fichaResult.recordset[0];
    console.log('Ficha encontrada:', ficha);

    // Busca os alimentos associados a esta ficha
    let alimentosResult;
    try {
      alimentosResult = await pool.request()
        .input('fich_id', sql.Int, id)
        .query('SELECT nome_alimento FROM fichaAlimentos WHERE [fich-id] = @fich_id');
      console.log('Resultado da busca dos alimentos da ficha:', alimentosResult.recordset);
      ficha.alimentos = alimentosResult.recordset;
    } catch (err) {
      // Se a tabela não existir (número 208 no SQL Server), retornamos array vazio de alimentos em vez de erro interno
      if (err.number === 208) {
        console.warn('Tabela fichaAlimentos não encontrada no DB. Retornando lista de alimentos vazia.');
        ficha.alimentos = [];
      } else {
        throw err;
      }
    }

    return res.status(200).json(ficha);
  } catch (error) {
    console.error('Erro ao buscar ficha por ID (detalhes):', error);
    return res.status(500).json({ mensagem: 'Erro interno ao buscar a ficha.' });
  }
};

module.exports = {
  criarFicha,
  listarFichas,
  deletarFicha,
  recomendarDieta,
  atualizarObjetivoFicha,
  buscarFichaPorId,
  atualizarFicha, // Exportar a nova função
};

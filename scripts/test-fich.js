const { sql, poolPromise } = require('../src/config/db');

(async () => {
  try {
    const pool = await poolPromise;
    const id = 12; // ajuste se necessário

    const result = await pool.request()
      .input('fich_id', sql.Int, id)
      .query('SELECT nome_alimento FROM fichaAlimentos WHERE [fich-id] = @fich_id');

    console.log('Alimentos retornados:', result.recordset);
  } catch (err) {
    console.error('Erro no teste:', err);
    process.exit(1);
  }
})();

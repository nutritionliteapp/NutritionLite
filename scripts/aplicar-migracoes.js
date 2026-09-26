/**
 * Aplica migrations/*.sql no banco configurado no .env (todas são idempotentes).
 *
 *   npm run migrar            -> aplica só as ainda não registradas
 *   npm run migrar -- --todas -> reaplica todas
 *
 * Só roda quando você chama: a aplicação nunca cria tabelas sozinha.
 * Divide cada arquivo nas linhas "GO", como o sqlcmd faz.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const PASTA = path.join(__dirname, '..', 'migrations');

function lotes(conteudo) {
  return conteudo
    .split(/^\s*GO\s*$/gim)
    .map((l) => l.trim())
    .filter(Boolean);
}

async function main() {
  const reaplicar = process.argv.includes('--todas');
  const arquivos = fs
    .readdirSync(PASTA)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();

  const pool = await new sql.ConnectionPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    options: { encrypt: process.env.DB_ENCRYPT !== 'false', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' },
    connectionTimeout: 60000,
    requestTimeout: 60000,
  }).connect();

  await pool.request().query(`
    IF OBJECT_ID('dbo.migracoesAplicadas', 'U') IS NULL
      CREATE TABLE dbo.migracoesAplicadas (arquivo VARCHAR(200) PRIMARY KEY, aplicada_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
  `);
  const feitas = new Set(
    (await pool.request().query('SELECT arquivo FROM dbo.migracoesAplicadas')).recordset.map((r) => r.arquivo)
  );

  // 001-004 já existiam antes deste controle e podem ter sido aplicadas à mão: só as novas (005+) rodam sozinhas.
  const alvo = arquivos.filter((f) => (reaplicar ? true : !feitas.has(f) && parseInt(f, 10) >= 5));

  for (const arquivo of alvo) {
    console.log(`Aplicando ${arquivo}...`);
    for (const lote of lotes(fs.readFileSync(path.join(PASTA, arquivo), 'utf8'))) {
      await pool.request().batch(lote);
    }
    await pool
      .request()
      .input('a', sql.VarChar, arquivo)
      .query('IF NOT EXISTS (SELECT 1 FROM dbo.migracoesAplicadas WHERE arquivo=@a) INSERT INTO dbo.migracoesAplicadas(arquivo) VALUES (@a)');
  }

  console.log(alvo.length ? `Pronto: ${alvo.length} migração(ões) aplicada(s).` : 'Nada a aplicar: banco já está em dia.');
  await pool.close();
}

main().catch((err) => {
  console.error('Falha ao aplicar migrações:', err.message);
  process.exit(1);
});

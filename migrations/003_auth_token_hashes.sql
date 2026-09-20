/*
  Migration 003 — tokens de auth já são armazenados como hash SHA-256 (hex, 64 chars)
  pela aplicação. Esta migration apenas documenta e garante tamanho das colunas.

  NÃO aplicar em produção sem autorização.
*/

IF COL_LENGTH('dbo.usuarios', 'token_confirmacao') IS NOT NULL
BEGIN
  ALTER TABLE dbo.usuarios ALTER COLUMN token_confirmacao VARCHAR(128) NULL;
END
GO

IF COL_LENGTH('dbo.usuarios', 'reset_token') IS NOT NULL
BEGIN
  ALTER TABLE dbo.usuarios ALTER COLUMN reset_token VARCHAR(128) NULL;
END
GO

/*
  Nota: tokens plaintext existentes deixam de funcionar após o deploy da app
  que grava apenas hash. Usuários devem solicitar novo e-mail de confirmação/reset.
*/

/*
  Migration 001 — constraints e índice único de e-mail
  Banco: Azure SQL / SQL Server
  NÃO aplicar em produção sem autorização explícita.

  Assunção: tabela usuarios já existe com coluna email.
*/

-- Índice único em e-mail (normalizado na aplicação; idealmente dados já em lowercase)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'UQ_usuarios_email' AND object_id = OBJECT_ID('dbo.usuarios')
)
BEGIN
  -- Remova duplicatas antes de criar o índice em ambiente real
  CREATE UNIQUE INDEX UQ_usuarios_email ON dbo.usuarios(email);
END
GO

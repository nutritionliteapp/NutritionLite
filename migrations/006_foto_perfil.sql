/*
  Migration 006 — foto de perfil do usuário

  A imagem (JPEG/PNG/WebP já reduzida no navegador, até ~400 KB) fica no próprio banco, em tabela separada,
  para não engordar consultas de usuarios e para funcionar em hospedagens sem disco persistente.

  NÃO aplicar em produção sem autorização. Idempotente. Aplicar com:  npm run migrar
*/

IF OBJECT_ID('dbo.fotosPerfil', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.fotosPerfil (
    usuario_id     INT            NOT NULL PRIMARY KEY,
    tipo           VARCHAR(20)    NOT NULL,
    dados          VARBINARY(MAX) NOT NULL,
    atualizado_em  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

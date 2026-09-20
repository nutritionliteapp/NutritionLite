/*
  Migration 004 — sessões de chat por usuário (preparação Fase 5)

  NÃO aplicar em produção sem autorização.
*/

IF COL_LENGTH('dbo.chatHistorico', 'session_id') IS NULL
BEGIN
  ALTER TABLE dbo.chatHistorico ADD session_id VARCHAR(64) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_chatHistorico_usuario_session'
    AND object_id = OBJECT_ID('dbo.chatHistorico')
)
BEGIN
  CREATE INDEX IX_chatHistorico_usuario_session
    ON dbo.chatHistorico(usuario_id, session_id, id DESC);
END
GO

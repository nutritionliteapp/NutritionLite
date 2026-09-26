/*
  Migration 007 — metas mais precisas, histórico de peso e lembretes por notificação

  - usuarios.sexo / usuarios.nivel_atividade: entram no cálculo das metas (sem eles, usa-se uma estimativa média).
  - pesoHistorico: um peso por dia, para o gráfico de evolução do dashboard.
  - lembretes: assinaturas de notificação push (Web Push) e os horários escolhidos.

  NÃO aplicar em produção sem autorização. Idempotente. Aplicar com:  npm run migrar
*/

IF COL_LENGTH('dbo.usuarios', 'sexo') IS NULL
BEGIN
  ALTER TABLE dbo.usuarios ADD sexo CHAR(1) NULL;
END
GO

IF COL_LENGTH('dbo.usuarios', 'nivel_atividade') IS NULL
BEGIN
  ALTER TABLE dbo.usuarios ADD nivel_atividade VARCHAR(20) NULL;
END
GO

IF OBJECT_ID('dbo.pesoHistorico', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.pesoHistorico (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    usuario_id  INT           NOT NULL,
    data        DATE          NOT NULL,
    peso        DECIMAL(5,2)  NOT NULL,
    criado_em   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_pesoHistorico_usuario_data UNIQUE (usuario_id, data)
  );
END
GO

IF OBJECT_ID('dbo.lembretes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lembretes (
    id                 INT IDENTITY(1,1) PRIMARY KEY,
    usuario_id         INT            NOT NULL,
    endpoint_hash      CHAR(64)       NOT NULL,
    endpoint           NVARCHAR(1200) NOT NULL,
    p256dh             VARCHAR(200)   NOT NULL,
    auth               VARCHAR(100)   NOT NULL,
    horarios           VARCHAR(60)    NOT NULL DEFAULT '12:00,19:00',
    ativo              BIT            NOT NULL DEFAULT 1,
    ultimo_envio_data  DATE           NULL,
    ultimo_envio_hora  VARCHAR(5)     NULL,
    criado_em          DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_lembretes_endpoint UNIQUE (endpoint_hash)
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_lembretes_usuario' AND object_id = OBJECT_ID('dbo.lembretes')
)
BEGIN
  CREATE INDEX IX_lembretes_usuario ON dbo.lembretes(usuario_id);
END
GO

/*
  Migration 005 — diário alimentar, cardápios semanais e cota de visitantes persistida

  NÃO aplicar em produção sem autorização. Idempotente (pode rodar mais de uma vez).
  Aplicar com:  npm run migrar
*/

/* Diário: uma linha por alimento consumido. Os macros já vêm calculados para a quantidade informada. */
IF OBJECT_ID('dbo.diarioRefeicoes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.diarioRefeicoes (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    usuario_id     INT            NOT NULL,
    data           DATE           NOT NULL,
    refeicao       VARCHAR(20)    NOT NULL,
    nome_alimento  NVARCHAR(200)  NOT NULL,
    alimento_id    VARCHAR(50)    NULL,
    quantidade_g   DECIMAL(8,1)   NOT NULL,
    kcal           DECIMAL(9,2)   NOT NULL DEFAULT 0,
    proteina       DECIMAL(9,2)   NOT NULL DEFAULT 0,
    carboidratos   DECIMAL(9,2)   NOT NULL DEFAULT 0,
    gordura        DECIMAL(9,2)   NOT NULL DEFAULT 0,
    fibra          DECIMAL(9,2)   NOT NULL DEFAULT 0,
    sodio_mg       DECIMAL(9,2)   NOT NULL DEFAULT 0,
    origem         VARCHAR(20)    NOT NULL DEFAULT 'manual',
    estimado       BIT            NOT NULL DEFAULT 0,
    criado_em      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_diarioRefeicoes_usuario_data' AND object_id = OBJECT_ID('dbo.diarioRefeicoes')
)
BEGIN
  CREATE INDEX IX_diarioRefeicoes_usuario_data ON dbo.diarioRefeicoes(usuario_id, data, id);
END
GO

/* Último cardápio semanal gerado por usuário (JSON completo, com lista de compras). */
IF OBJECT_ID('dbo.cardapios', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cardapios (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    usuario_id   INT            NOT NULL,
    orcamento    DECIMAL(9,2)   NULL,
    conteudo     NVARCHAR(MAX)  NOT NULL,
    criado_em    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_cardapios_usuario' AND object_id = OBJECT_ID('dbo.cardapios')
)
BEGIN
  CREATE INDEX IX_cardapios_usuario ON dbo.cardapios(usuario_id, id DESC);
END
GO

/* Cota diária de visitantes (chat/TACO): sobrevive a reinício do servidor e a várias instâncias. */
IF OBJECT_ID('dbo.usoVisitante', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.usoVisitante (
    chave   VARCHAR(80) NOT NULL,
    dia     DATE        NOT NULL,
    usado   INT         NOT NULL DEFAULT 0,
    CONSTRAINT PK_usoVisitante PRIMARY KEY (chave, dia)
  );
END
GO

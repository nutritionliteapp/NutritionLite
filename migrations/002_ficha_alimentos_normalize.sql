/*
  Migration 002 — normalizar fichaAlimentos
  - Renomeia [fich-id] → ficha_id
  - Adiciona quantity_g, meal_type
  - FK + índices
  - Dados legados: quantity_g = 100

  NÃO aplicar em produção sem autorização.
*/

IF OBJECT_ID(N'dbo.fichaAlimentos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.fichaAlimentos (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ficha_id INT NOT NULL,
    alimento_id NVARCHAR(100) NOT NULL,
    nome_alimento VARCHAR(255) NOT NULL,
    quantity_g DECIMAL(10,2) NOT NULL CONSTRAINT DF_fichaAlimentos_qty DEFAULT (100),
    meal_type VARCHAR(40) NULL,
    CONSTRAINT FK_fichaAlimentos_ficha
      FOREIGN KEY (ficha_id) REFERENCES dbo.fichaAlimentar(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_fichaAlimentos_ficha_id ON dbo.fichaAlimentos(ficha_id);
END
ELSE
BEGIN
  -- Renomear coluna legada se existir
  IF COL_LENGTH('dbo.fichaAlimentos', 'fich-id') IS NOT NULL
     AND COL_LENGTH('dbo.fichaAlimentos', 'ficha_id') IS NULL
  BEGIN
    EXEC sp_rename 'dbo.fichaAlimentos.[fich-id]', 'ficha_id', 'COLUMN';
  END

  IF COL_LENGTH('dbo.fichaAlimentos', 'quantity_g') IS NULL
  BEGIN
    ALTER TABLE dbo.fichaAlimentos
      ADD quantity_g DECIMAL(10,2) NOT NULL
        CONSTRAINT DF_fichaAlimentos_qty DEFAULT (100);
  END

  IF COL_LENGTH('dbo.fichaAlimentos', 'meal_type') IS NULL
  BEGIN
    ALTER TABLE dbo.fichaAlimentos ADD meal_type VARCHAR(40) NULL;
  END

  -- Backfill
  UPDATE dbo.fichaAlimentos SET quantity_g = 100 WHERE quantity_g IS NULL OR quantity_g <= 0;

  -- FK (ignorar se já existir)
  IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_fichaAlimentos_ficha'
  )
  BEGIN
    ALTER TABLE dbo.fichaAlimentos WITH CHECK
      ADD CONSTRAINT FK_fichaAlimentos_ficha
      FOREIGN KEY (ficha_id) REFERENCES dbo.fichaAlimentar(id) ON DELETE CASCADE;
  END

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_fichaAlimentos_ficha_id'
      AND object_id = OBJECT_ID('dbo.fichaAlimentos')
  )
  BEGIN
    CREATE INDEX IX_fichaAlimentos_ficha_id ON dbo.fichaAlimentos(ficha_id);
  END
END
GO

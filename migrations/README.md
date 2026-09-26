# Migrations — NutritionLite

Arquivos em `migrations/` são scripts **SQL Server** versionados.

## Regras

1. **Não execute** estes scripts em Azure/produção sem autorização explícita.
2. Teste primeiro em banco local ou de staging.
3. Faça backup antes de aplicar.
4. A aplicação **não** executa `CREATE TABLE` em runtime (controllers).

## Ordem

| Arquivo | Objetivo |
|---------|----------|
| `001_usuarios_email_unique.sql` | Índice único em `usuarios.email` |
| `002_ficha_alimentos_normalize.sql` | `ficha_id`, `quantity_g`, `meal_type`, FK cascade |
| `003_auth_token_hashes.sql` | Amplia colunas de token para hashes |
| `004_chat_sessions.sql` | `session_id` em `chatHistorico` |
| `005_diario_cardapio_uso.sql` | Tabelas `diarioRefeicoes` (diário), `cardapios` (cardápio semanal) e `usoVisitante` (cota de visitantes persistida) |

## Como aplicar (exemplo local)

```bash
# Com sqlcmd (ajuste servidor/credenciais; NÃO cole senhas em tickets)
sqlcmd -S localhost -d NutritionLite -i migrations/001_usuarios_email_unique.sql
sqlcmd -S localhost -d NutritionLite -i migrations/002_ficha_alimentos_normalize.sql
sqlcmd -S localhost -d NutritionLite -i migrations/003_auth_token_hashes.sql
sqlcmd -S localhost -d NutritionLite -i migrations/004_chat_sessions.sql
```

## Dados legados

Fichas antigas sem quantidade recebem `quantity_g = 100` (porção TACO padrão).
Tokens plaintext de confirmação/reset deixam de valer após o deploy que grava hash — o usuário solicita novamente.


## Aplicar a 005 (diário, cardápio e cota persistida)

```bash
npm run migrar          # aplica só as migrations novas (005+), é idempotente
npm run migrar -- --todas
```

Sem a 005 o site continua funcionando: o diário e o cardápio respondem 503 com a instrução acima e a cota de visitantes fica só em memória.

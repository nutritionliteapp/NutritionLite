# Plano de Implementação — NutritionLite MVP

**Data:** 2026-07-19  
**Branch:** `main` (working tree limpo no início)  
**Baseline:** Node `v22.22.0` · npm `11.13.0`  
**Testes baseline:** 4 suites / 8 testes passando (inclui 2 mocks vazios em chat/ficha)  
**`npm ci` baseline:** falhou com `EPERM` ao limpar `node_modules` (lock de OS); instalação existente usada para testes

---

## Inventário rápido

### Rotas API

| Prefixo | Endpoints principais |
|---------|----------------------|
| `/api/usuarios` | cadastro, confirmar-email, login, perfil, dashboard, metas, deletar, recuperacao, novasenha |
| `/api/alimentos` | `/`, `/consulta`, `/buscar` |
| `/api/ficha` | refeicao, `/`, `/:id`, recomendar, objetivo |
| `/api/chat` | `/`, favoritar/:id |
| `/api/rotulos` | analisar |
| `/api/noticias` | feed |
| `/api/preco` | precos/auto (**público — crítico**) |
| `/api/teste` | conexao (**quebrada — poolConnect**) |

### Tabelas inferidas

`usuarios`, `metasUsuario`, `fichaAlimentar`, `fichaAlimentos` (`[fich-id]`), `tbltacoNL`, `chatHistorico`

### Variáveis de ambiente

`PORT`, `NODE_ENV`, `JWT_SECRET`, `DB_*`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SENTRY_DSN`, `APP_URL`, `BASE_URL`, `SMTP_*` / `EMAIL_*`

### Integrações

Gemini (`@google/generative-ai`), Sentry (`@sentry/node`), Nodemailer, Azure SQL (`mssql`), RSS (G1/GE)

---

## Problemas confirmados

### Segurança / privacidade

1. **IDOR** em `deletarFicha` — DELETE só por `id`, sem `usuario_id`
2. **IDOR** em favoritar chat — UPDATE sem `usuario_id`
3. Endpoint admin `/api/preco/precos/auto` **público** (atualiza preços via Gemini em massa)
4. Recuperação de senha **enumera e-mails** (404 vs 200)
5. Tokens de reset/confirmação em **plaintext** no banco; log de `token` + `novaSenha` no console
6. CORS aberto (`cors()` sem origem)
7. XSS via `innerHTML` (chat, taco, dashboard, fichas, perfil)
8. Sem Helmet/CSP
9. `JWT_SECRET` sem validação de força no boot

### Banco / rotas / erros

10. `process.exit(1)` no import de `db.js`
11. `poolConnect` / `pool` inexistentes em `chatRoutes` e `testeConexaoRoutes`
12. `errorHandler` comentado + import named incorreto
13. `PUT /objetivo` registrado **depois** de `PUT /:id` — rota morta
14. Chat importado duas vezes em `app.js`
15. `CREATE TABLE` em runtime no controller de ficha; coluna `[fich-id]`

### Cálculo nutricional

16. Soma macros TACO **sem** `quantity_g` (assume ~100 g por item)
17. Itens identificados principalmente por nome, não por `food_id` + quantidade

### Chat / IA

18. `conversationHistory` **global** (vazamento entre usuários)
19. Mensagem duplicada enviada ao modelo; sem rate limit específico chat/rótulos
20. Preços “reais” inventados pelo Gemini gravados no banco

### Instalação / dependências

21. `main: index.js` inexistente (entrypoint real: `server.js`)
22. Pacotes incorretos: `node`, `brcypt`, `crypto` (npm), `server.js`
23. Não usados: `body-parser`, `@google/genai`, `@sentry/tracing`
24. Sem scripts `start`/`dev`/`test:coverage`
25. `.gitignore` mínimo (não ignora `logs/`, `coverage/`)

### Testes / docs

26. `chat.test.js` / `ficha.test.js` com `expect(true).toBe(true)`
27. `user.test.js` aceita `[200, 401]`
28. README quase vazio; sem `.env.example`, `SECURITY.md`, CI, migrations versionadas

---

## Arquivos afetados (por fase)

| Fase | Arquivos principais |
|------|---------------------|
| 1 | `package.json`, `package-lock.json`, `.gitignore`, `server.js`, `src/app.js`, `src/config/env.js` (novo), `src/config/sentry.js`, `src/utils/logger.js` |
| 2 | `src/config/db.js`, `src/routes/chatRoutes.js`, `src/routes/testeConexaoRoutes.js`, `src/routes/fichaRoutes.js`, `src/middlewares/errorHandler.js`, `src/app.js`, `src/swagger.js` |
| 3 | Controllers/rotas de ficha/chat/user/preço, middlewares auth, frontend scripts/views, Helmet/CORS |
| 4 | `fichaController`, frontend ficha, `migrations/*.sql`, testes nutricionais |
| 5 | `chatController`, `rotulosController`, `precoController`, rate limits, schema sessão |
| 6 | `tests/*`, `.github/workflows`, `README.md`, `.env.example`, `SECURITY.md` |

---

## Ordem das correções

1. **Fase 1** — base operacional (deps, scripts, env, logs, gitignore)
2. **Fase 2** — banco, rotas quebradas, errorHandler, Swagger
3. **Fase 3** — autorização, auth/reset, CORS/Helmet/XSS
4. **Fase 4** — modelo nutricional + migrations (não aplicar remoto sem autorização)
5. **Fase 5** — chat isolado, Gemini seguro, rótulos, preços estimados
6. **Fase 6** — testes reais, CI, documentação

---

## Riscos e migrations

| Risco | Mitigação |
|-------|-----------|
| Migration altera `[fich-id]` → `ficha_id` | Migration compatível + script de dados; **não aplicar em Azure sem OK** |
| Fichas antigas sem quantidade | Assumir `quantity_g = 100` documentado + migration de dados |
| Remover `/preco/precos/auto` da API | Transformar em script admin; se mantido, exigir role admin |
| Cookie HttpOnly para sessão | Grande demais agora → documentar; manter Bearer + eliminar XSS |
| `npm ci` EPERM no Windows | Remover `node_modules` e regenerar lock; evitar `--force` cego no audit |

**Migrations planejadas (SQL Server):**

- `001_baseline_constraints.sql` — PKs/FKs/índices únicos email
- `002_ficha_alimentos_normalize.sql` — `ficha_id`, `quantity_g`, `meal_type`
- `003_auth_token_hashes.sql` — hashes de tokens; índice único email
- `004_chat_sessions.sql` — sessão por usuário (se persistir histórico)

---

## Critérios de aceite por fase

### Fase 1

- [ ] `npm ci` sucesso (sem `--ignore-scripts`)
- [ ] `npm start` sobe a API
- [ ] Sem deps obviamente não usadas (`node`, `brcypt`, `crypto` npm, `server.js`, `@google/genai`, `@sentry/tracing`, `body-parser`)
- [ ] Env inválida → erro claro sem vazar valores
- [ ] `logs/`, `coverage/` no `.gitignore`

### Fase 2

- [ ] Health/DB check usa `poolPromise`
- [ ] `PUT /api/ficha/objetivo` chega ao controller certo
- [ ] Erros async → JSON consistente; sem stack em produção
- [ ] Teste de rota específica vs parametrizada

### Fase 3

- [ ] Usuário A não acessa recursos de B
- [ ] Token inválido rejeitado
- [ ] Reset não enumera e-mails
- [ ] HTML/script exibido como texto

### Fase 4

- [ ] 100 g = base; 50 g = metade; soma de 2 alimentos; rejeita quantidade inválida
- [ ] Update recalcula; rollback em falha; isolamento de dono
- [ ] Migrations criadas (não aplicadas remotamente)

### Fase 5

- [ ] Sem histórico global
- [ ] Rate limit chat/rótulos; timeout/retry
- [ ] Schema de rótulo validado; preços como estimativa

### Fase 6

- [ ] Sem testes fake / status ambíguos
- [ ] CI GitHub Actions
- [ ] README, `.env.example`, SECURITY.md

---

## Decisões que exigem confirmação antes de executar

1. Aplicar migrations em banco Azure/remoto
2. Escolha de licença (ISC atual vs MIT/Apache/proprietária)
3. Exclusão permanente de histórico de chat / retenção
4. Migração completa de sessão Bearer → cookie HttpOnly (quebra clientes atuais)

---

## Registro de execução

| Fase | Status | Notas |
|------|--------|-------|
| Baseline | ✅ | Testes 8/8; `npm ci` EPERM no ambiente (ownership Windows) |
| Fase 1 | ✅ | `package.json` limpo; env validation; logger; Sentry v9; nodemailer 9; testes 12/12; `npm start` OK; `npm ci` OK em pasta limpa |
| Fase 2 | 🔄 | Em andamento |
| Fase 3 | ⏳ | |
| Fase 4 | ⏳ | |
| Fase 5 | ⏳ | |
| Fase 6 | ⏳ | |

### Fase 1 — registro

**Alterações:** remoção de `node`, `brcypt`, `crypto` (npm), `server.js` (pkg), `body-parser`, `@google/genai`, `@sentry/tracing`; `main: server.js`; scripts `start`/`dev`/`test`/`test:coverage`; `src/config/env.js`; logger por ambiente; `.gitignore` ampliado; nodemailer ↑ 9.0.3 (high fix).

**Pendência de ambiente:** `node_modules` em `D:\nutritionlite-api` possui ownership de outro SID Windows — substituição local falha com EPERM. Lockfile limpo validado com `npm ci` em diretório gravável. Recomenda-se recriar `node_modules` com conta dona do diretório ou `icacls`/admin.

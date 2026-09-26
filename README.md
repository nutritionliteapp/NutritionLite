# NutritionLite

Nutrição simples e educativa para brasileiros: diário alimentar com foto do prato, análise de rótulos (selos da ANVISA, classificação NOVA, código de barras), cardápio semanal dentro do orçamento, Tabela TACO e a Salus, assistente com IA.

API Node.js/Express 5 + front-end estático, Azure SQL e Google Gemini. Instalável como app (PWA).

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha as variáveis (veja o arquivo)
npm run migrar            # cria as tabelas novas (diário, cardápio, foto, lembretes…)
npm start                 # ou: npm run dev (reinicia ao salvar)
```

Abra http://localhost:3000. Testes: `npm test`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` / `npm run dev` | Sobe o servidor (o `dev` reinicia sozinho) |
| `npm run migrar` | Aplica as migrations 005+ ainda não aplicadas (idempotente) |
| `npm run segredo` | Gera um `JWT_SECRET` forte |
| `npm run vapid` | Gera as chaves dos lembretes por notificação |
| `npm test` | Roda a suíte (Jest) |

## Banco de dados

As migrations ficam em `migrations/` e **nunca rodam sozinhas**: a aplicação não cria tabelas. Sem a migration correspondente o recurso responde com uma mensagem clara (503), e o resto do site continua funcionando. Detalhes em [migrations/README.md](migrations/README.md).

Azure SQL serverless pausa quando fica ocioso: o app tenta reconectar por até 60 s ao acordar (`DB_RETRY_WINDOW_MS`).

## Publicar (checklist)

1. `NODE_ENV=production` e `PUBLIC_URL` com o endereço final (usado nas prévias de compartilhamento e nos e-mails).
2. `JWT_SECRET`: o servidor exige no mínimo 16 caracteres e avisa se tiver menos de 32. O recomendado é um segredo forte (`npm run segredo`); trocá-lo desloga todo mundo uma vez.
3. `CORS_ORIGINS` só com o seu domínio.
4. Variáveis do banco, `GEMINI_API_KEY` e e-mail (veja `.env.example`). O `.env` nunca vai para o git.
5. `npm run migrar` contra o banco de produção (faça backup antes).
6. Lembretes por notificação (opcional): `npm run vapid` e coloque as chaves no servidor.
7. Sirva por HTTPS: é obrigatório para instalar o app e para as notificações.

## Limites e custo de IA

- Visitantes: 5 usos/dia do chat e da TACO (`LIMITE_DIARIO_VISITANTE`).
- Usuários logados: teto diário de análises com IA por recurso (`LIMITE_IA_*`).
- Leitura por código de barras usa a base aberta Open Food Facts, sem IA e sem custo.

## Aviso

Conteúdo educativo. Metas, cardápios e notas de rótulos são estimativas e não substituem nutricionista ou médico. Política de privacidade em `/privacidade`.

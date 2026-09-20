# Sessão web — estado atual e migração futura

## Estado atual (MVP)

A autenticação do frontend usa **Bearer JWT** em `localStorage` / `sessionStorage`.
Isso é compatível com as páginas HTML existentes, mas é vulnerável a XSS se scripts
maliciosos rodarem no mesmo origin.

Nesta fase priorizamos:

1. Eliminar XSS (`textContent` / `escapeHtml` / CSP via Helmet)
2. Restringir CORS
3. Manter Bearer para não quebrar o cliente atual

## Migração recomendada (próximo ciclo)

1. Emitir cookie de sessão `HttpOnly`, `Secure`, `SameSite=Lax` (ou `Strict`) no login
2. Remover persistência do JWT em `localStorage`
3. Usar `credentials: 'include'` no `fetch`
4. CSRF token ou `SameSite` + origem restrita
5. Rotação / refresh token com lifetime curto no access token

**Decisão de produto:** manter Bearer temporariamente até o frontend ser atualizado
de forma coordenada.

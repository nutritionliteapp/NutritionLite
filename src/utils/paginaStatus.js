/**
 * Página HTML de status no visual do sistema, para respostas que o servidor monta
 * sozinho (link de confirmação de e-mail, 404 de página…). Antes eram um <h2> solto,
 * o texto "Bem vindo à API…" ou a tela padrão do Express, sem nenhum CSS.
 */

const ICONES = {
  sucesso:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12.5 11 15.5 16 9"></polyline></svg>',
  erro:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="7.5" x2="12" y2="13"></line><circle cx="12" cy="16.5" r="0.6" fill="currentColor"></circle></svg>',
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5"></polygon></svg>',
};

function escapeHtml(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {{ titulo: string, mensagem: string, tipo?: 'sucesso'|'erro'|'info',
 *           acoes?: Array<{ texto: string, href: string, primaria?: boolean }> }} opcoes
 * @returns {string} documento HTML completo
 */
function renderPaginaStatus({ titulo, mensagem, tipo = 'info', acoes = [] }) {
  const tipoValido = ICONES[tipo] ? tipo : 'info';
  const botoes = acoes
    .map(
      (a) =>
        `<a class="status-btn${a.primaria ? ' status-btn--primario' : ''}" href="${escapeHtml(a.href)}">${escapeHtml(a.texto)}</a>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>${escapeHtml(titulo)} - NutritionLite</title>
    <link rel="stylesheet" href="/css/tokens.css">
    <link rel="stylesheet" href="/css/status.css">
</head>
<body>
    <main class="status status--${tipoValido}">
        <a class="status-marca" href="/">
            <img src="/imgs/logos/logo.png" alt="">
            <span>NutritionLite</span>
        </a>
        <div class="status-icone">${ICONES[tipoValido]}</div>
        <h1>${escapeHtml(titulo)}</h1>
        <p>${escapeHtml(mensagem)}</p>
        <div class="status-acoes">${botoes}</div>
    </main>
</body>
</html>`;
}

module.exports = { renderPaginaStatus, escapeHtml };

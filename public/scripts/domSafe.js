/**
 * Helpers DOM seguros — evita XSS ao inserir dados de API/usuário.
 * Uso: escapeHtml(str) ou el.textContent = str
 */
(function (global) {
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(el, value) {
    if (!el) return;
    el.textContent = value === null || value === undefined ? '' : String(value);
  }

  global.NLSafe = { escapeHtml, setText };
})(typeof window !== 'undefined' ? window : globalThis);

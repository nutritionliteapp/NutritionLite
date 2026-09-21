/**
 * Modelo de e-mail no visual do NutritionLite (mint da marca + esmeralda).
 *
 * Clientes de e-mail ignoram CSS externo e <style> em muitos casos, então tudo é estilo
 * inline e o layout é em tabelas. Devolve também a versão em texto puro (melhor entrega
 * e para quem lê sem HTML). Todo conteúdo dinâmico é escapado.
 */

const FONTE = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {{ titulo: string, preheader?: string, paragrafos?: string[],
 *           botao?: { texto: string, url: string }, avisoLink?: boolean,
 *           rodape?: string }} opcoes
 * @returns {{ html: string, text: string }}
 */
function renderEmail({ titulo, preheader = '', paragrafos = [], botao, avisoLink = true, rodape = '' }) {
  const paragrafosHtml = paragrafos
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#475569;">${escapeHtml(p)}</p>`
    )
    .join('');

  const botaoHtml = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 22px;">
          <tr>
            <td style="border-radius:10px;background-color:#55e098;">
              <a href="${escapeHtml(botao.url)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONTE};font-size:15px;font-weight:700;color:#053b26;text-decoration:none;border-radius:10px;">${escapeHtml(botao.texto)}</a>
            </td>
          </tr>
        </table>`
    : '';

  const linkHtml =
    botao && avisoLink
      ? `<p style="margin:0 0 6px;font-family:${FONTE};font-size:13px;line-height:1.5;color:#64748b;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
         <p style="margin:0 0 14px;font-family:${FONTE};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(botao.url)}" target="_blank" style="color:#047857;">${escapeHtml(botao.url)}</a></p>`
      : '';

  const rodapeHtml = rodape
    ? `<p style="margin:0;font-family:${FONTE};font-size:12px;line-height:1.5;color:#64748b;">${escapeHtml(rodape)}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ecfdf5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ecfdf5;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#55e098;padding:22px 28px;font-family:${FONTE};font-size:20px;font-weight:800;letter-spacing:0.3px;color:#053b26;">NutritionLite</td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;">
              <h1 style="margin:0 0 16px;font-family:${FONTE};font-size:22px;line-height:1.3;color:#0f172a;">${escapeHtml(titulo)}</h1>
              ${paragrafosHtml}
              ${botaoHtml}
              ${linkHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 26px;border-top:1px solid #e2e8f0;">${rodapeHtml}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    titulo,
    '',
    ...paragrafos,
    ...(botao ? ['', `${botao.texto}: ${botao.url}`] : []),
    ...(rodape ? ['', rodape] : []),
    '',
    '— NutritionLite',
  ].join('\n');

  return { html, text };
}

module.exports = { renderEmail, escapeHtml };

/* Trocar a foto de perfil: escolhe, enquadra (arrastar + zoom) e envia já recortada (320x320 JPEG). */
(function () {
  'use strict';

  var token = null;
  try { token = localStorage.getItem('token'); } catch (_) { /* sem storage */ }
  if (!token) return;

  var $ = function (id) { return document.getElementById(id); };
  var VIEW = 280;   // tamanho do quadro na tela (px)
  var SAIDA = 320;  // tamanho da imagem enviada (px)
  var MAX_ORIGEM = 12 * 1024 * 1024;

  var canvas = $('fotoCanvas');
  var ctx = canvas.getContext('2d');
  var img = null;
  var s = 1, minS = 1, ox = 0, oy = 0;
  var arrastando = null;

  function tokenAtual() {
    try { return localStorage.getItem('token') || token; } catch (_) { return token; }
  }

  function limitar() {
    var w = img.width * s, h = img.height * s;
    ox = Math.min(0, Math.max(VIEW - w, ox));
    oy = Math.min(0, Math.max(VIEW - h, oy));
  }

  function desenhar() {
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.drawImage(img, ox, oy, img.width * s, img.height * s);
  }

  function centralizar() {
    minS = VIEW / Math.min(img.width, img.height);
    s = minS;
    $('fotoZoom').value = 1;
    ox = (VIEW - img.width * s) / 2;
    oy = (VIEW - img.height * s) / 2;
    limitar();
    desenhar();
  }

  function abrir() {
    $('fotoFundo').hidden = false;
    $('fotoModal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('fotoMsg').textContent = '';
    $('fotoMsg').className = 'foto-msg';
    $('fotoSalvar').disabled = false;
  }
  function fechar() {
    $('fotoFundo').hidden = true;
    $('fotoModal').hidden = true;
    document.body.style.overflow = '';
    img = null;
  }

  function carregarArquivo(arquivo) {
    if (!arquivo) return;
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) { alert('Use uma imagem JPEG, PNG ou WebP.'); return; }
    if (arquivo.size > MAX_ORIGEM) { alert('Essa imagem é muito grande. Escolha uma de até 12 MB.'); return; }
    var url = URL.createObjectURL(arquivo);
    var nova = new Image();
    nova.onload = function () {
      URL.revokeObjectURL(url);
      img = nova;
      abrir();
      centralizar();
    };
    nova.onerror = function () { URL.revokeObjectURL(url); alert('Não consegui abrir essa imagem.'); };
    nova.src = url;
  }

  /* Arrastar (mouse e toque) */
  canvas.addEventListener('pointerdown', function (e) {
    if (!img) return;
    canvas.setPointerCapture(e.pointerId);
    arrastando = { x: e.clientX, y: e.clientY, ox: ox, oy: oy };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!arrastando || !img) return;
    var f = VIEW / canvas.getBoundingClientRect().width;
    ox = arrastando.ox + (e.clientX - arrastando.x) * f;
    oy = arrastando.oy + (e.clientY - arrastando.y) * f;
    limitar();
    desenhar();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { canvas.addEventListener(ev, function () { arrastando = null; }); });

  /* Zoom mantendo o centro do quadro no mesmo ponto da imagem */
  $('fotoZoom').addEventListener('input', function (e) {
    if (!img) return;
    var cx = (VIEW / 2 - ox) / s, cy = (VIEW / 2 - oy) / s;
    s = minS * Number(e.target.value);
    ox = VIEW / 2 - cx * s;
    oy = VIEW / 2 - cy * s;
    limitar();
    desenhar();
  });
  canvas.addEventListener('wheel', function (e) {
    if (!img) return;
    e.preventDefault();
    var z = $('fotoZoom');
    z.value = Math.min(3, Math.max(1, Number(z.value) - e.deltaY * 0.002));
    z.dispatchEvent(new Event('input'));
  }, { passive: false });

  function recortar() {
    var saida = document.createElement('canvas');
    saida.width = SAIDA; saida.height = SAIDA;
    var g = saida.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SAIDA, SAIDA);
    var f = SAIDA / VIEW;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, ox * f, oy * f, img.width * s * f, img.height * s * f);
    return saida.toDataURL('image/jpeg', 0.85);
  }

  function mensagem(texto, erro) {
    var m = $('fotoMsg');
    m.textContent = texto;
    m.className = 'foto-msg' + (erro ? ' erro' : '');
  }

  function atualizarBotaoRemover(temFoto) {
    $('fotoRemover').hidden = !temFoto;
  }

  $('fotoSalvar').addEventListener('click', function () {
    if (!img) return;
    var dataUrl = recortar();
    $('fotoSalvar').disabled = true;
    mensagem('Enviando…', false);
    fetch('/api/usuarios/foto', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenAtual() },
      body: JSON.stringify({ imagem: dataUrl }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { r: r, d: d }; }); })
      .then(function (x) {
        if (!x.r.ok) { mensagem(x.d.mensagem || 'Não foi possível salvar a foto.', true); $('fotoSalvar').disabled = false; return; }
        if (window.NLAvatar) window.NLAvatar.atualizar(dataUrl);
        else $('fotoPerfil').src = dataUrl;
        atualizarBotaoRemover(true);
        fechar();
      })
      .catch(function () { mensagem('Erro de conexão. Tente de novo.', true); $('fotoSalvar').disabled = false; });
  });

  $('fotoRemover').addEventListener('click', function () {
    if (!confirm('Remover sua foto de perfil?')) return;
    fetch('/api/usuarios/foto', { method: 'DELETE', headers: { Authorization: 'Bearer ' + tokenAtual() } })
      .then(function (r) {
        if (!r.ok) throw new Error('falha');
        if (window.NLAvatar) window.NLAvatar.limpar();
        else $('fotoPerfil').src = '/icons/avatar.svg';
        atualizarBotaoRemover(false);
      })
      .catch(function () { alert('Não foi possível remover a foto agora.'); });
  });

  $('fotoEditar').addEventListener('click', function () { $('fotoArquivo').click(); });
  $('fotoPerfil').addEventListener('click', function () { $('fotoArquivo').click(); });
  $('fotoArquivo').addEventListener('change', function (e) {
    var arquivo = e.target.files && e.target.files[0];
    e.target.value = '';
    carregarArquivo(arquivo);
  });
  $('fotoCancelar').addEventListener('click', fechar);
  $('fotoFundo').addEventListener('click', fechar);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('fotoModal').hidden) fechar(); });

  // Só mostra "Remover foto" se já existe uma (o perfil-ui.js guarda no cache do aparelho)
  function checarTemFoto() {
    try {
      var c = JSON.parse(localStorage.getItem('nl-visual') || 'null');
      atualizarBotaoRemover(!!(c && c.foto));
    } catch (_) { atualizarBotaoRemover(false); }
  }
  checarTemFoto();
  setTimeout(checarTemFoto, 1500);
})();

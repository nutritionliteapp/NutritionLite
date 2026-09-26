/* Lembretes por notificação (cartão do perfil): pede permissão, inscreve o aparelho e guarda os horários. */
(function () {
  'use strict';

  var card = document.getElementById('lembretes-card');
  if (!card) return;

  var token = null;
  try { token = localStorage.getItem('token'); } catch (_) { /* sem storage */ }
  if (!token) return;

  var $ = function (id) { return document.getElementById(id); };
  function tokenAtual() {
    try { return localStorage.getItem('token') || token; } catch (_) { return token; }
  }
  function cab(json) {
    var h = { Authorization: 'Bearer ' + tokenAtual() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  function msg(texto, tipo) {
    var m = $('lembreteMsg');
    m.textContent = texto || '';
    m.className = 'lembrete-msg' + (tipo ? ' ' + tipo : '');
  }

  var suportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var estado = { chave: null, registro: null, assinatura: null, ativo: false };

  function base64ParaUint8(base64) {
    var pad = '='.repeat((4 - (base64.length % 4)) % 4);
    var bruto = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var saida = new Uint8Array(bruto.length);
    for (var i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
    return saida;
  }

  function horarios() {
    var lista = [$('lembreteH1').value, $('lembreteH2').value].filter(Boolean);
    return lista.filter(function (h, i) { return lista.indexOf(h) === i; });
  }

  function desenhar() {
    var ativo = estado.ativo;
    var botao = $('lembreteAtivar');
    botao.textContent = ativo ? 'Salvar horários' : 'Ativar lembretes';
    $('lembreteTestar').hidden = !ativo;

    var antigo = document.getElementById('lembreteDesativar');
    if (ativo && !antigo) {
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'lembreteDesativar';
      b.className = 'btn btn-edit btn-desativar';
      b.textContent = 'Desativar';
      b.addEventListener('click', desativar);
      document.querySelector('.lembrete-acoes').appendChild(b);
    } else if (!ativo && antigo) {
      antigo.remove();
    }
  }

  function salvar(assinatura) {
    return fetch('/api/lembretes', {
      method: 'PUT',
      headers: cab(true),
      body: JSON.stringify({ subscription: assinatura.toJSON(), horarios: horarios() }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.mensagem || 'Não foi possível salvar os lembretes.');
        return d;
      });
    });
  }

  function ativar() {
    var botao = $('lembreteAtivar');
    botao.disabled = true;
    msg('Ativando…');

    var passo = estado.assinatura
      ? Promise.resolve(estado.assinatura)
      : Notification.requestPermission().then(function (permissao) {
          if (permissao !== 'granted') throw new Error('Você bloqueou as notificações. Libere nas configurações do navegador para usar os lembretes.');
          return estado.registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaUint8(estado.chave) });
        });

    passo
      .then(function (assinatura) { estado.assinatura = assinatura; return salvar(assinatura); })
      .then(function (d) {
        estado.ativo = true;
        (d.horarios || []).forEach(function (h, i) { var campo = $(i === 0 ? 'lembreteH1' : 'lembreteH2'); if (campo) campo.value = h; });
        desenhar();
        msg('Lembretes ativos neste aparelho.', 'ok');
      })
      .catch(function (e) { msg(e.message, 'erro'); })
      .then(function () { botao.disabled = false; });
  }

  function desativar() {
    var alvo = estado.assinatura;
    msg('Desativando…');
    var endpoint = alvo && alvo.endpoint;
    (endpoint ? fetch('/api/lembretes', { method: 'DELETE', headers: cab(true), body: JSON.stringify({ endpoint: endpoint }) }) : Promise.resolve())
      .then(function () { return alvo ? alvo.unsubscribe() : true; })
      .then(function () {
        estado.assinatura = null;
        estado.ativo = false;
        desenhar();
        msg('Lembretes desativados.');
      })
      .catch(function () { msg('Não foi possível desativar agora.', 'erro'); });
  }

  function testar() {
    msg('Enviando teste…');
    fetch('/api/lembretes/teste', { method: 'POST', headers: cab(false) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { r: r, d: d }; }); })
      .then(function (x) { msg(x.d.mensagem || (x.r.ok ? 'Enviado.' : 'Falhou.'), x.r.ok ? 'ok' : 'erro'); })
      .catch(function () { msg('Erro de conexão.', 'erro'); });
  }

  function iniciar() {
    fetch('/api/lembretes/config', { headers: cab(false) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || !cfg.disponivel) return; // servidor sem VAPID: o cartão nem aparece
        estado.chave = cfg.chave_publica;
        card.hidden = false;

        if (!suportado) {
          $('lembreteAtivar').disabled = true;
          msg('Este navegador não suporta notificações. No iPhone, instale o app na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.', 'erro');
          return;
        }

        return navigator.serviceWorker.register('/sw.js')
          .then(function () { return navigator.serviceWorker.ready; })
          .then(function (registro) {
            estado.registro = registro;
            return registro.pushManager.getSubscription();
          })
          .then(function (assinatura) {
            estado.assinatura = assinatura;
            if (!assinatura) return null;
            return fetch('/api/lembretes/estado', { method: 'POST', headers: cab(true), body: JSON.stringify({ endpoint: assinatura.endpoint }) })
              .then(function (r) { return r.ok ? r.json() : null; });
          })
          .then(function (e) {
            if (e && e.ativo) {
              estado.ativo = true;
              (e.horarios || []).forEach(function (h, i) { var campo = $(i === 0 ? 'lembreteH1' : 'lembreteH2'); if (campo) campo.value = h; });
            }
            desenhar();
          });
      })
      .catch(function () { /* sem o cartão, o perfil segue normal */ });
  }

  $('lembreteAtivar').addEventListener('click', ativar);
  $('lembreteTestar').addEventListener('click', testar);
  iniciar();
})();

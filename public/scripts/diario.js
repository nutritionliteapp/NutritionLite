/* Diário alimentar — /diario. Sem innerHTML com dados: tudo entra por textContent. */
(function () {
  'use strict';

  var token = null;
  try { token = localStorage.getItem('token'); } catch (_) { /* sem storage */ }
  if (!token) {
    window.location.href = window.NLVoltar ? window.NLVoltar.urlLogin() : '/login';
    return;
  }

  window.fazerLogout = function () {
    if (confirm('Sair da conta?')) {
      try { localStorage.removeItem('token'); } catch (_) { /* segue */ }
      window.location.href = '/login';
    }
  };

  var CIRC = 2 * Math.PI * 58;
  var REFEICOES = [
    { chave: 'cafe_da_manha', nome: 'Café da manhã', icone: 'bx-coffee' },
    { chave: 'almoco', nome: 'Almoço', icone: 'bx-restaurant' },
    { chave: 'lanche', nome: 'Lanche', icone: 'bx-cookie' },
    { chave: 'jantar', nome: 'Jantar', icone: 'bx-bowl-hot' },
    { chave: 'ceia', nome: 'Ceia', icone: 'bx-moon' },
  ];
  var MACROS = [
    { chave: 'proteina', nome: 'Proteína', cor: 'var(--nl-emerald-600)' },
    { chave: 'carboidratos', nome: 'Carboidratos', cor: '#d97706' },
    { chave: 'gordura', nome: 'Gorduras', cor: '#7c3aed' },
    { chave: 'fibra', nome: 'Fibras', cor: '#0891b2' },
  ];

  var $ = function (id) { return document.getElementById(id); };
  var estado = { data: hojeLocal(), resumo: null, pendentes: [], abaAtiva: 'foto', refeicaoAlvo: 'almoco' };

  function hojeLocal() {
    // Brasília = UTC-3, igual ao servidor (o dia do diário não depende do fuso do aparelho)
    return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function somarDias(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function rotuloDia(iso) {
    var hoje = hojeLocal();
    if (iso === hoje) return 'Hoje';
    if (iso === somarDias(hoje, -1)) return 'Ontem';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function fmt(n, casas) {
    var v = Number(n);
    if (!isFinite(v)) return '0';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: casas === undefined ? 0 : casas });
  }
  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  function icone(nome) {
    var i = document.createElement('i');
    i.className = 'bx ' + nome;
    return i;
  }

  function api(caminho, opcoes) {
    opcoes = opcoes || {};
    var headers = { Authorization: 'Bearer ' + token };
    if (opcoes.body) headers['Content-Type'] = 'application/json';
    return fetch(caminho, {
      method: opcoes.method || 'GET',
      headers: headers,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (corpo) {
        if (!res.ok) {
          var erro = new Error(corpo.mensagem || 'Erro ao falar com o servidor.');
          erro.status = res.status;
          erro.corpo = corpo;
          throw erro;
        }
        return corpo;
      });
    });
  }

  function mostrarErro(msg) {
    var caixa = $('avisoErro');
    caixa.textContent = msg;
    caixa.hidden = !msg;
  }

  /* ---------- Resumo do dia ---------- */

  function desenharAnel(resumo) {
    var prog = resumo.progresso;
    var meta = prog ? prog.kcal.meta : 0;
    var feito = resumo.total.kcal;
    var pct = meta ? Math.min(feito / meta, 1) : 0;
    var valor = $('anelValor');
    valor.setAttribute('stroke-dasharray', (pct * CIRC).toFixed(1) + ' ' + CIRC.toFixed(1));
    valor.classList.toggle('acima', meta > 0 && feito > meta * 1.15);
    $('kcalFeito').textContent = fmt(feito);
    $('kcalMeta').textContent = meta ? 'de ' + fmt(meta) + ' kcal' : 'kcal consumidas';
    $('kcalFalta').textContent = !prog ? '' :
      prog.kcal.falta > 0 ? 'Faltam ' + fmt(prog.kcal.falta) + ' kcal para a meta' : 'Meta de calorias atingida';
  }

  function desenharMacros(resumo) {
    var lista = $('macroLista');
    lista.textContent = '';
    MACROS.forEach(function (m) {
      var p = resumo.progresso && resumo.progresso[m.chave];
      var feito = resumo.total[m.chave];
      var linha = el('div', 'macro');
      var topo = el('div', 'macro-topo');
      topo.appendChild(el('span', 'macro-nome', m.nome));
      topo.appendChild(el('strong', '', fmt(feito, 1) + (p ? ' / ' + fmt(p.meta) : '') + ' g'));
      var trilho = el('div', 'macro-trilho');
      var barra = el('div', 'macro-barra');
      barra.style.width = (p && p.meta ? Math.min(100, (feito / p.meta) * 100) : 0) + '%';
      barra.style.background = m.cor;
      trilho.appendChild(barra);
      linha.appendChild(topo);
      linha.appendChild(trilho);
      lista.appendChild(linha);
    });
  }

  function desenharRefeicoes(resumo) {
    var alvo = $('refeicoes');
    alvo.textContent = '';
    REFEICOES.forEach(function (ref) {
      var itens = resumo.itens.filter(function (i) { return i.refeicao === ref.chave; });
      var kcal = itens.reduce(function (s, i) { return s + Number(i.kcal || 0); }, 0);

      var card = el('article', 'card refeicao');
      var topo = el('div', 'refeicao-topo');
      var titulo = el('div', 'refeicao-titulo');
      titulo.appendChild(icone(ref.icone));
      var nomes = el('div');
      nomes.appendChild(el('h3', '', ref.nome));
      nomes.appendChild(el('small', '', itens.length ? fmt(kcal) + ' kcal' : 'Nada registrado'));
      titulo.appendChild(nomes);
      var add = el('button', 'btn-add');
      add.type = 'button';
      add.setAttribute('aria-label', 'Adicionar em ' + ref.nome);
      add.appendChild(icone('bx-plus'));
      add.appendChild(document.createTextNode(' Adicionar'));
      add.addEventListener('click', function () { abrirModal(ref.chave); });
      topo.appendChild(titulo);
      topo.appendChild(add);
      card.appendChild(topo);

      if (itens.length) {
        var ul = el('ul', 'itens');
        itens.forEach(function (it) {
          var li = el('li');
          var info = el('div', 'item-info');
          info.appendChild(el('span', 'item-nome', it.nome_alimento));
          var detalhe = fmt(it.quantidade_g, 0) + ' g · ' + fmt(it.kcal) + ' kcal · P ' + fmt(it.proteina, 1) + ' g';
          var meta = el('small', '', detalhe);
          if (it.estimado) {
            var tag = el('em', 'tag-estimado', 'estimado');
            meta.appendChild(document.createTextNode(' '));
            meta.appendChild(tag);
          }
          info.appendChild(meta);
          var rm = el('button', 'item-remover');
          rm.type = 'button';
          rm.setAttribute('aria-label', 'Remover ' + it.nome_alimento);
          rm.appendChild(icone('bx-trash'));
          rm.addEventListener('click', function () { remover(it.id); });
          li.appendChild(info);
          li.appendChild(rm);
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      alvo.appendChild(card);
    });
  }

  function desenhar(resumo) {
    estado.resumo = resumo;
    $('diaAtual').textContent = rotuloDia(resumo.data);
    $('diaSeguinte').disabled = resumo.data >= hojeLocal();
    $('resumo').hidden = !resumo.progresso;
    $('semMetas').hidden = !!resumo.progresso;
    if (resumo.progresso) {
      desenharAnel(resumo);
      desenharMacros(resumo);
    }
    desenharRefeicoes(resumo);
  }

  function carregarDia() {
    mostrarErro('');
    return api('/api/diario?data=' + encodeURIComponent(estado.data))
      .then(desenhar)
      .catch(function (e) {
        if (e.status === 503) {
          mostrarErro('O diário ainda não foi habilitado neste servidor (falta rodar "npm run migrar").');
        } else if (e.status !== 401) {
          mostrarErro(e.message);
        }
      });
  }

  function carregarDica() {
    if (estado.data !== hojeLocal()) { $('salusDica').hidden = true; return; }
    api('/api/diario/dica').then(function (r) {
      if (!r.dica) return;
      $('salusTexto').textContent = r.dica.texto;
      var acao = $('salusAcao');
      if (r.dica.acao) {
        acao.textContent = r.dica.acao.texto;
        acao.href = r.dica.acao.href;
        acao.hidden = false;
      } else {
        acao.hidden = true;
      }
      $('salusDica').hidden = false;
    }).catch(function () { $('salusDica').hidden = true; });
  }

  function carregarSemana() {
    api('/api/diario/semana').then(function (r) {
      var temDado = r.dias.some(function (d) { return d.kcal > 0; });
      $('semanaCard').hidden = !temDado;
      if (r.sequencia > 0) {
        $('sequenciaTexto').textContent = r.sequencia + (r.sequencia === 1 ? ' dia seguido' : ' dias seguidos');
        $('sequencia').hidden = false;
      } else {
        $('sequencia').hidden = true;
      }
      if (temDado) desenharSemana(r.dias);
    }).catch(function () { $('semanaCard').hidden = true; });
  }

  function desenharSemana(dias) {
    var meta = estado.resumo && estado.resumo.progresso ? estado.resumo.progresso.kcal.meta : 0;
    var max = Math.max.apply(null, dias.map(function (d) { return d.kcal; }).concat([meta, 1]));
    var alvo = $('semanaGrafico');
    alvo.textContent = '';
    dias.forEach(function (d) {
      var col = el('div', 'semana-col');
      var valor = el('span', 'semana-valor', d.kcal ? fmt(d.kcal) : '');
      var barraCaixa = el('div', 'semana-barra-caixa');
      var barra = el('div', 'semana-barra' + (meta && d.kcal > meta * 1.15 ? ' acima' : ''));
      barra.style.height = (d.kcal / max) * 100 + '%';
      barraCaixa.appendChild(barra);
      if (meta) {
        var linha = el('div', 'semana-meta');
        linha.style.bottom = (meta / max) * 100 + '%';
        barraCaixa.appendChild(linha);
      }
      var p = d.data.split('-');
      col.appendChild(valor);
      col.appendChild(barraCaixa);
      col.appendChild(el('span', 'semana-dia', p[2] + '/' + p[1]));
      alvo.appendChild(col);
    });
  }

  function atualizarTudo() {
    return carregarDia().then(function () { carregarDica(); carregarSemana(); });
  }

  function remover(id) {
    if (!confirm('Remover este alimento do diário?')) return;
    api('/api/diario/' + id, { method: 'DELETE' }).then(atualizarTudo).catch(function (e) { mostrarErro(e.message); });
  }

  /* ---------- Modal de adicionar ---------- */

  function abrirModal(refeicao) {
    estado.pendentes = [];
    estado.refeicaoAlvo = refeicao || 'almoco';
    $('refeicaoSelect').value = estado.refeicaoAlvo;
    $('fotoMsg').textContent = '';
    $('buscaMsg').textContent = '';
    $('salvarMsg').textContent = '';
    $('buscaInput').value = '';
    $('buscaLista').textContent = '';
    $('fotoPrevia').hidden = true;
    $('fotoZona').hidden = false;
    trocarAba('foto');
    desenharPendentes();
    $('modalFundo').hidden = false;
    $('modal').hidden = false;
    document.body.classList.add('modal-aberto');
    $('modalFechar').focus();
  }

  function fecharModal() {
    $('modalFundo').hidden = true;
    $('modal').hidden = true;
    document.body.classList.remove('modal-aberto');
  }

  function trocarAba(qual) {
    estado.abaAtiva = qual;
    $('abaFoto').classList.toggle('ativa', qual === 'foto');
    $('abaBusca').classList.toggle('ativa', qual === 'busca');
    $('abaFoto').setAttribute('aria-selected', qual === 'foto');
    $('abaBusca').setAttribute('aria-selected', qual === 'busca');
    $('painelFoto').hidden = qual !== 'foto';
    $('painelBusca').hidden = qual !== 'busca';
    if (qual === 'busca') $('buscaInput').focus();
  }

  function desenharPendentes() {
    var ul = $('pendentes');
    ul.textContent = '';
    $('pendentesWrap').hidden = estado.pendentes.length === 0;
    var total = 0;
    estado.pendentes.forEach(function (p, idx) {
      var kcal = p.kcal_por_g * p.quantidade_g;
      total += kcal;
      var li = el('li');
      var info = el('div', 'pend-info');
      info.appendChild(el('span', 'item-nome', p.nome));
      var sub = el('small', '', fmt(kcal) + ' kcal' + (p.fonte ? ' · ' + p.fonte : ''));
      if (p.confianca === 'baixa') sub.appendChild(el('em', 'tag-estimado', 'confira'));
      info.appendChild(sub);
      var qtd = el('label', 'pend-qtd');
      var input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = '5000';
      input.step = '5';
      input.inputMode = 'numeric';
      input.value = p.quantidade_g;
      input.setAttribute('aria-label', 'Quantidade em gramas de ' + p.nome);
      input.addEventListener('change', function () {
        var v = Math.round(Number(input.value));
        p.quantidade_g = v >= 1 && v <= 5000 ? v : p.quantidade_g;
        desenharPendentes();
      });
      qtd.appendChild(input);
      qtd.appendChild(document.createTextNode(' g'));
      var rm = el('button', 'item-remover');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Tirar ' + p.nome);
      rm.appendChild(icone('bx-x'));
      rm.addEventListener('click', function () { estado.pendentes.splice(idx, 1); desenharPendentes(); });
      li.appendChild(info);
      li.appendChild(qtd);
      li.appendChild(rm);
      ul.appendChild(li);
    });
    $('pendentesTotal').textContent = estado.pendentes.length ? 'Total: ' + fmt(total) + ' kcal' : '';
  }

  /* Foto: comprime no aparelho (economiza dados e custo da IA) e manda para a IA. */
  function comprimir(arquivo) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        var max = 1280, w = img.width, h = img.height;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(url);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', preview: dataUrl });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem.')); };
      img.src = url;
    });
  }

  function aoEscolherFoto(arquivo) {
    if (!arquivo) return;
    var msg = $('fotoMsg');
    msg.className = 'msg';
    msg.textContent = 'Analisando a foto…';
    comprimir(arquivo).then(function (img) {
      $('fotoImg').src = img.preview;
      $('fotoPrevia').hidden = false;
      $('fotoZona').hidden = true;
      return api('/api/diario/analisar-foto', { method: 'POST', body: { imagem: { base64: img.base64, mimeType: img.mimeType } } });
    }).then(function (r) {
      if (!r.itens.length) {
        msg.className = 'msg erro';
        msg.textContent = 'Não encontrei alimentos nessa foto. Tente outra ou use a busca.';
        return;
      }
      r.itens.forEach(function (it) {
        var base = it.estimativa_100g;
        estado.pendentes.push({
          nome: it.nome,
          alimento_id: it.alimento_id,
          quantidade_g: it.quantidade_g,
          kcal_por_g: it.quantidade_g ? it.kcal / it.quantidade_g : 0,
          estimativa_100g: base,
          confianca: it.confianca,
          fonte: it.fonte,
          origem: 'foto',
        });
      });
      if (r.refeicao_sugerida && !estado.refeicaoTravada) $('refeicaoSelect').value = r.refeicao_sugerida;
      msg.className = 'msg';
      msg.textContent = r.aviso || '';
      desenharPendentes();
    }).catch(function (e) {
      msg.className = 'msg erro';
      msg.textContent = e.message;
      $('fotoZona').hidden = false;
      $('fotoPrevia').hidden = true;
    });
  }

  /* Busca na TACO com espera (não dispara a cada tecla). */
  var temporizador = null;
  function buscar(texto) {
    var lista = $('buscaLista');
    var msg = $('buscaMsg');
    if (texto.trim().length < 2) { lista.textContent = ''; msg.textContent = ''; return; }
    api('/api/diario/alimentos?q=' + encodeURIComponent(texto.trim())).then(function (itens) {
      lista.textContent = '';
      msg.textContent = itens.length ? '' : 'Nenhum alimento encontrado.';
      itens.forEach(function (a) {
        var li = el('li');
        var b = el('button', 'busca-item');
        b.type = 'button';
        b.appendChild(el('span', 'item-nome', a.nome));
        b.appendChild(el('small', '', fmt(a.kcal_100g) + ' kcal / 100 g'));
        b.addEventListener('click', function () {
          estado.pendentes.push({ nome: a.nome, alimento_id: a.id, quantidade_g: 100, kcal_por_g: a.kcal_100g / 100, fonte: 'TACO', origem: 'manual' });
          desenharPendentes();
        });
        li.appendChild(b);
        lista.appendChild(li);
      });
    }).catch(function (e) { msg.textContent = e.message; });
  }

  function salvar() {
    var msg = $('salvarMsg');
    msg.className = 'msg';
    if (!estado.pendentes.length) return;
    var btn = $('salvarBtn');
    btn.disabled = true;
    msg.textContent = 'Salvando…';
    var corpo = {
      data: estado.data,
      refeicao: $('refeicaoSelect').value,
      itens: estado.pendentes.map(function (p) {
        var item = { nome: p.nome, quantidade_g: p.quantidade_g, origem: p.origem };
        if (p.alimento_id) item.alimento_id = p.alimento_id;
        else item.estimativa_100g = p.estimativa_100g;
        return item;
      }),
    };
    api('/api/diario', { method: 'POST', body: corpo }).then(function () {
      fecharModal();
      return atualizarTudo();
    }).catch(function (e) {
      msg.className = 'msg erro';
      msg.textContent = e.message;
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- Eventos ---------- */

  $('diaAnterior').addEventListener('click', function () { estado.data = somarDias(estado.data, -1); atualizarTudo(); });
  $('diaSeguinte').addEventListener('click', function () {
    if (estado.data < hojeLocal()) { estado.data = somarDias(estado.data, 1); atualizarTudo(); }
  });
  $('diaAtual').addEventListener('click', function () { estado.data = hojeLocal(); atualizarTudo(); });
  $('modalFechar').addEventListener('click', fecharModal);
  $('modalFundo').addEventListener('click', fecharModal);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) fecharModal(); });
  $('abaFoto').addEventListener('click', function () { trocarAba('foto'); });
  $('abaBusca').addEventListener('click', function () { trocarAba('busca'); });
  $('fotoZona').addEventListener('click', function () { $('fotoInput').click(); });
  $('fotoTrocar').addEventListener('click', function () { $('fotoInput').click(); });
  $('fotoInput').addEventListener('change', function (e) {
    var arquivo = e.target.files && e.target.files[0];
    e.target.value = '';
    aoEscolherFoto(arquivo);
  });
  $('buscaInput').addEventListener('input', function (e) {
    clearTimeout(temporizador);
    var v = e.target.value;
    temporizador = setTimeout(function () { buscar(v); }, 300);
  });
  $('refeicaoSelect').addEventListener('change', function () { estado.refeicaoTravada = true; });
  $('salvarBtn').addEventListener('click', salvar);

  // Nome no rodapé da sidebar (mesma API das outras páginas)
  fetch('/api/usuarios/dashboard', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (d) {
      var h = document.querySelector('.mini-info h4');
      if (h && d.nome) h.textContent = d.nome;
    })
    .catch(function () { /* mantém "Usuário" */ });

  atualizarTudo();
})();

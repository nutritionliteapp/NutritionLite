/* Análise de rótulos — /rotulos. Nada de innerHTML com dados: tudo entra por textContent. */
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

  var $ = function (id) { return document.getElementById(id); };
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
  function fmt(n, c) {
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: c === undefined ? 1 : c });
  }
  function moeda(n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

  // Nome no rodapé da sidebar
  fetch('/api/usuarios/dashboard', { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (d) {
      var h = document.querySelector('.mini-info h4');
      if (h && d.nome) h.textContent = d.nome;
    })
    .catch(function () { /* mantém "Usuário" */ });

  var fileInput = $('fileInput');
  var previewGrid = $('previewGrid');
  var btnAnalisar = $('btnAnalisar');
  var dropzone = $('dropzone');
  var loadingEl = $('loadingEl');
  var erroEl = $('erroEl');
  var resultadoEl = $('resultadoEl');
  var cameraPanel = $('cameraPanel');
  var cameraVideo = $('cameraVideo');

  var arquivosProcessados = [];
  var cameraStream = null;
  var ultimo = null; // { analise, produto, origem }

  function mostrarErro(msg) {
    erroEl.style.display = 'block';
    erroEl.textContent = msg;
  }
  function limparErro() {
    erroEl.style.display = 'none';
    erroEl.textContent = '';
  }

  /* ---------- Câmera (fotos) ---------- */

  function iniciarCamera() {
    limparErro();
    if (arquivosProcessados.length >= 4) { mostrarErro('Você já atingiu o limite de 4 imagens.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { mostrarErro('Seu navegador não suporta acesso à câmera.'); return; }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(function (stream) {
      cameraStream = stream;
      cameraVideo.srcObject = stream;
      cameraPanel.hidden = false;
    }).catch(function () {
      mostrarErro('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    });
  }

  function pararCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(function (t) { t.stop(); });
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
    cameraPanel.hidden = true;
  }

  function capturarFotoDaCamera() {
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) { mostrarErro('A câmera ainda não está pronta. Tente novamente em alguns segundos.'); return; }
    if (arquivosProcessados.length >= 4) { mostrarErro('Você já atingiu o limite de 4 imagens.'); return; }
    var canvas = document.createElement('canvas');
    var maxW = 1400, w = cameraVideo.videoWidth, h = cameraVideo.videoHeight;
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(cameraVideo, 0, 0, w, h);
    canvas.toBlob(function (blob) {
      if (!blob) { mostrarErro('Falha ao capturar a foto.'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        arquivosProcessados.push({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', preview: dataUrl });
        renderPreview();
      };
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.85);
  }

  function comprimirImagem(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var maxW = 1400, w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) { reject(new Error('compress')); return; }
          var reader = new FileReader();
          reader.onload = function () { resolve({ base64: reader.result.split(',')[1], mimeType: 'image/jpeg' }); };
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }

  function adicionarArquivos(files) {
    limparErro();
    var restantes = 4 - arquivosProcessados.length;
    var lista = Array.prototype.slice.call(files).slice(0, restantes).filter(function (f) { return f.type.indexOf('image/') === 0; });
    return lista.reduce(function (cadeia, f) {
      return cadeia.then(function () {
        return comprimirImagem(f).then(function (r) {
          arquivosProcessados.push({ base64: r.base64, mimeType: r.mimeType, preview: URL.createObjectURL(f) });
        }).catch(function () { mostrarErro('Não foi possível processar uma das imagens.'); });
      });
    }, Promise.resolve()).then(renderPreview);
  }

  function renderPreview() {
    previewGrid.textContent = '';
    var tem = arquivosProcessados.length > 0;
    previewGrid.hidden = !tem;
    $('previewTopo').hidden = !tem;
    $('previewContador').textContent = arquivosProcessados.length + '/4';
    arquivosProcessados.forEach(function (item, i) {
      var fig = document.createElement('figure');
      var img = document.createElement('img');
      img.src = item.preview;
      img.alt = '';
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove';
      rm.setAttribute('aria-label', 'Remover');
      rm.textContent = '×';
      rm.addEventListener('click', function () {
        if (item.preview.indexOf('blob:') === 0) URL.revokeObjectURL(item.preview);
        arquivosProcessados.splice(i, 1);
        renderPreview();
      });
      fig.appendChild(img);
      fig.appendChild(rm);
      previewGrid.appendChild(fig);
    });
    btnAnalisar.disabled = arquivosProcessados.length === 0;
  }

  fileInput.addEventListener('change', function (e) {
    if (e.target.files.length) adicionarArquivos(e.target.files);
    e.target.value = '';
  });
  $('btnAbrirCamera').addEventListener('click', iniciarCamera);
  $('btnCapturarFoto').addEventListener('click', capturarFotoDaCamera);
  $('btnFecharCamera').addEventListener('click', pararCamera);
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer.files.length) adicionarArquivos(e.dataTransfer.files);
  });

  /* ---------- Código de barras ---------- */

  var scanStream = null;
  var scanAtivo = false;

  function pararScan() {
    scanAtivo = false;
    if (scanStream) { scanStream.getTracks().forEach(function (t) { t.stop(); }); scanStream = null; }
    $('scanVideo').srcObject = null;
    $('scanPanel').hidden = true;
  }

  function iniciarScan() {
    limparErro();
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) { mostrarErro('Seu navegador não lê códigos de barras. Digite os números.'); return; }
    var detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (stream) {
      scanStream = stream;
      var v = $('scanVideo');
      v.srcObject = stream;
      $('scanPanel').hidden = false;
      scanAtivo = true;
      (function ciclo() {
        if (!scanAtivo) return;
        detector.detect(v).then(function (codigos) {
          if (codigos && codigos.length) {
            var valor = codigos[0].rawValue;
            pararScan();
            $('barrasInput').value = valor;
            buscarCodigo(valor);
          } else {
            setTimeout(ciclo, 250);
          }
        }).catch(function () { setTimeout(ciclo, 400); });
      })();
    }).catch(function () { mostrarErro('Não foi possível acessar a câmera. Verifique as permissões do navegador.'); });
  }

  if ('BarcodeDetector' in window) $('barrasEscanear').hidden = false;
  $('barrasEscanear').addEventListener('click', iniciarScan);
  $('scanFechar').addEventListener('click', pararScan);

  function buscarCodigo(codigo) {
    limparErro();
    var ean = String(codigo || '').replace(/\D/g, '');
    if (ean.length < 8 || ean.length > 14) { mostrarErro('Digite um código de 8 a 14 números (está embaixo das barras).'); return; }
    var preco = $('precoInput').value;
    loadingEl.style.display = 'inline-flex';
    resultadoEl.classList.add('hidden');
    fetch('/api/rotulos/codigo/' + ean + (preco ? '?preco=' + encodeURIComponent(preco) : ''), { headers: { Authorization: 'Bearer ' + token } })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; }); })
      .then(function (r) {
        if (!r.res.ok) { mostrarErro(r.d.mensagem || 'Não encontrei esse produto.'); return; }
        mostrarResultado(r.d.analise, r.d.produto, 'codigo');
      })
      .catch(function () { mostrarErro('Erro de conexão. Tente de novo.'); })
      .then(function () { loadingEl.style.display = 'none'; });
  }

  $('barrasForm').addEventListener('submit', function (e) { e.preventDefault(); buscarCodigo($('barrasInput').value); });

  /* ---------- Resultado ---------- */

  function classeNota(n) {
    if (n === null || n === undefined || n === '') return 'na';
    if (n >= 70) return 'bom';
    if (n >= 40) return 'medio';
    return 'ruim';
  }

  function mostrarBloco(id, visivel) { $(id).hidden = !visivel; }

  function desenharSelos(a) {
    var linha = $('selosLinha');
    linha.textContent = '';
    var selos = a.selos_anvisa && a.selos_anvisa.selos ? a.selos_anvisa.selos : [];
    selos.forEach(function (s) {
      var m = s.match(/^Alto em (.+)$/i);
      var cx = el('span', 'selo-anvisa');
      cx.appendChild(el('small', '', 'ALTO EM'));
      cx.appendChild(el('strong', '', (m ? m[1] : s).toUpperCase()));
      linha.appendChild(cx);
    });
    linha.hidden = selos.length === 0;
    $('selosNota').hidden = !(selos.length && a.selos_anvisa.aproximado);
  }

  function desenharChips(a) {
    var caixa = $('chipsInfo');
    caixa.textContent = '';
    if (a.nova) {
      var c = el('span', 'chip-info nova-' + a.nova.nivel);
      c.appendChild(icone('bx-cog'));
      c.appendChild(document.createTextNode(' NOVA ' + a.nova.grupo + ' · ' + a.nova.rotulo.split('· ')[1]));
      c.title = a.nova.justificativa || a.nova.rotulo;
      caixa.appendChild(c);
    }
    if (a.custo) {
      if (a.custo.por_100g !== null) caixa.appendChild(el('span', 'chip-info', moeda(a.custo.por_100g) + ' / 100 g'));
      if (a.custo.por_100kcal !== null) caixa.appendChild(el('span', 'chip-info', moeda(a.custo.por_100kcal) + ' / 100 kcal'));
    }
  }

  function desenharImpacto(a) {
    var lista = $('impactoLista');
    lista.textContent = '';
    var itens = a.impacto || [];
    mostrarBloco('blocoImpacto', itens.length > 0);
    var porcao = a.nutrientes && a.nutrientes.porcao_g;
    $('impactoRef').textContent = itens.length ? (ultimo && ultimo.origem === 'codigo' && !porcao ? '(por 100 g)' : porcao ? '(porção de ' + fmt(porcao, 0) + ' g)' : '(por porção)') : '';
    itens.forEach(function (i) {
      var alerta = i.pct_do_dia >= 40;
      var linha = el('div', 'impacto-linha');
      var topo = el('div', 'impacto-topo');
      topo.appendChild(el('span', '', i.rotulo));
      topo.appendChild(el('strong', alerta ? 'alerta' : '', fmt(i.valor) + ' ' + i.unidade + ' · ' + i.pct_do_dia + '% do dia'));
      var trilho = el('div', 'impacto-trilho');
      var barra = el('div', 'impacto-barra' + (alerta ? ' alerta' : ''));
      barra.style.width = Math.min(100, i.pct_do_dia) + '%';
      trilho.appendChild(barra);
      linha.appendChild(topo);
      linha.appendChild(trilho);
      if (i.restante_hoje !== null && i.restante_hoje !== undefined) {
        linha.appendChild(el('small', i.restante_hoje < 0 ? 'estourou' : '', i.restante_hoje < 0 ? 'Passa ' + fmt(-i.restante_hoje, 0) + ' ' + i.unidade + ' do limite de hoje' : 'Sobram ' + fmt(i.restante_hoje, 0) + ' ' + i.unidade + ' hoje'));
      }
      lista.appendChild(linha);
    });
  }

  function desenharPor100(a) {
    var p = a.por_100g;
    mostrarBloco('blocoPor100', !!p);
    if (!p) return;
    $('unidade100').textContent = a.nutrientes && a.nutrientes.liquido ? 'ml' : 'g';
    var grade = $('nutriGrade');
    grade.textContent = '';
    [['Calorias', p.kcal, 'kcal'], ['Açúcares', p.acucar_g, 'g'], ['Sódio', p.sodio_mg, 'mg'], ['Gord. saturada', p.gordura_saturada_g, 'g'], ['Proteína', p.proteina_g, 'g'], ['Fibra', p.fibra_g, 'g']].forEach(function (n) {
      var cx = el('div', 'nutri');
      cx.appendChild(el('span', '', n[0]));
      cx.appendChild(el('strong', '', n[1] === null || n[1] === undefined ? '—' : fmt(n[1]) + ' ' + n[2]));
      grade.appendChild(cx);
    });
  }

  function mostrarResultado(a, produto, origem) {
    ultimo = { analise: a, produto: produto || null, origem: origem };

    var cab = $('produtoCab');
    cab.hidden = !produto;
    if (produto) {
      $('produtoNome').textContent = produto.nome || 'Produto';
      $('produtoMarca').textContent = [produto.marca, produto.referencia ? 'Base: ' + produto.referencia : ''].filter(Boolean).join(' · ');
      var img = $('produtoImg');
      img.hidden = !produto.imagem;
      if (produto.imagem) img.src = produto.imagem;
    }

    var nota = a.nota_saudabilidade;
    var circ = $('scoreCircle');
    circ.textContent = nota !== null && nota !== undefined ? String(nota) : '—';
    circ.className = 'score-circle ' + classeNota(nota);
    $('nivelBadge').textContent = a.nivel || '';
    $('resumoProduto').textContent = a.resumo_produto || '';

    desenharSelos(a);
    desenharChips(a);
    desenharImpacto(a);
    desenharPor100(a);

    $('tabelaResumo').textContent = a.tabela_nutricional_resumo || '—';
    mostrarBloco('blocoTabela', !!a.tabela_nutricional_resumo && !a.por_100g);

    $('alternativaTexto').textContent = a.alternativa_saudavel || '';
    mostrarBloco('blocoAlternativa', !!a.alternativa_saudavel);

    var ul = $('listaIngredientes');
    ul.textContent = '';
    (a.ingredientes_explicados || []).forEach(function (ing) {
      var li = el('li');
      li.appendChild(el('strong', '', ing.termo_original || ''));
      li.appendChild(el('div', '', ing.explicacao_simples || ''));
      if (ing.observacao) li.appendChild(el('div', 'obs', ing.observacao));
      ul.appendChild(li);
    });
    mostrarBloco('blocoIngredientes', ul.children.length > 0);

    var pl = $('pontosLista');
    pl.textContent = '';
    (a.pontos_atencao || []).forEach(function (p) { pl.appendChild(el('li', '', p)); });
    mostrarBloco('blocoAtencao', pl.children.length > 0);

    $('ingTexto').textContent = a.ingredientes_texto || '';
    mostrarBloco('blocoIngTexto', !!a.ingredientes_texto && ul.children.length === 0);

    var disc = $('disclaimerEl');
    disc.textContent = a.disclaimer || '';
    disc.hidden = !a.disclaimer;

    var fontes = $('fontesLista');
    fontes.textContent = '';
    (a.fontes || []).forEach(function (f) { fontes.appendChild(el('li', '', f)); });
    $('fontesBox').hidden = !(a.fontes && a.fontes.length);

    // Registrar no diário: precisa de macros por 100 g
    $('btnDiario').hidden = !a.por_100g || a.por_100g.kcal === null;
    $('diarioInline').hidden = true;
    $('diarioMsg').textContent = '';
    var porcao = a.nutrientes && a.nutrientes.porcao_g;
    $('diarioQtd').value = porcao ? Math.round(porcao) : 100;
    $('diarioUn').textContent = a.nutrientes && a.nutrientes.liquido ? 'ml' : 'g';

    resultadoEl.classList.remove('hidden');
    resultadoEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Análise por foto ---------- */

  btnAnalisar.addEventListener('click', function () {
    if (!arquivosProcessados.length) return;
    limparErro();
    loadingEl.style.display = 'inline-flex';
    btnAnalisar.disabled = true;
    resultadoEl.classList.add('hidden');

    var corpo = { imagens: arquivosProcessados.map(function (x) { return { base64: x.base64, mimeType: x.mimeType }; }) };
    var preco = Number($('precoInput').value);
    if (preco > 0) corpo.preco = preco;

    fetch('/api/rotulos/analisar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(corpo),
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; }); })
      .then(function (r) {
        if (!r.res.ok) { mostrarErro(r.d.mensagem || 'Erro ao analisar.'); return; }
        if (!r.d.parseado && r.d.bruto) { mostrarErro(r.d.mensagem || 'Resposta da IA em formato inesperado.'); return; }
        mostrarResultado(r.d.analise || {}, null, 'foto');
      })
      .catch(function () { mostrarErro('Erro de conexão. Tente de novo.'); })
      .then(function () {
        loadingEl.style.display = 'none';
        btnAnalisar.disabled = arquivosProcessados.length === 0;
      });
  });

  /* ---------- Registrar no diário ---------- */

  $('btnDiario').addEventListener('click', function () { $('diarioInline').hidden = !$('diarioInline').hidden; });
  $('diarioSalvar').addEventListener('click', function () {
    if (!ultimo || !ultimo.analise.por_100g) return;
    var p = ultimo.analise.por_100g;
    var qtd = Math.round(Number($('diarioQtd').value));
    var msg = $('diarioMsg');
    if (!(qtd >= 1 && qtd <= 5000)) { msg.className = 'diario-msg erro'; msg.textContent = 'Informe uma quantidade entre 1 e 5000.'; return; }
    var nome = (ultimo.produto && ultimo.produto.nome) || 'Produto (rótulo)';
    msg.className = 'diario-msg';
    msg.textContent = 'Salvando…';
    fetch('/api/diario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        refeicao: $('diarioRefeicao').value,
        itens: [{
          nome: nome,
          quantidade_g: qtd,
          origem: 'rotulo',
          estimativa_100g: { kcal: p.kcal || 0, proteina: p.proteina_g || 0, carboidratos: p.carboidratos_g || 0, gordura: p.gordura_g || 0, fibra: p.fibra_g || 0 },
        }],
      }),
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; }); })
      .then(function (r) {
        if (!r.res.ok) { msg.className = 'diario-msg erro'; msg.textContent = r.d.mensagem || 'Não foi possível salvar.'; return; }
        msg.className = 'diario-msg ok';
        msg.textContent = 'Registrado no diário! ';
        var a = document.createElement('a');
        a.href = '/diario';
        a.textContent = 'Ver diário';
        msg.appendChild(a);
      })
      .catch(function () { msg.className = 'diario-msg erro'; msg.textContent = 'Erro de conexão.'; });
  });

  /* ---------- Comparar (até 2 produtos, na sessão) ---------- */

  var CHAVE_COMP = 'nl-comparar';
  function lerComp() { try { return JSON.parse(sessionStorage.getItem(CHAVE_COMP) || '[]') || []; } catch (_) { return []; } }
  function gravarComp(l) { try { sessionStorage.setItem(CHAVE_COMP, JSON.stringify(l)); } catch (_) { /* opcional */ } }

  function resumoParaComparar() {
    var a = ultimo.analise;
    var p = a.por_100g || {};
    return {
      nome: (ultimo.produto && ultimo.produto.nome) || (a.resumo_produto || 'Produto').split('.')[0].slice(0, 40),
      nota: a.nota_saudabilidade,
      nova: a.nova ? a.nova.grupo : null,
      selos: a.selos_anvisa ? a.selos_anvisa.selos.length : 0,
      kcal: p.kcal, acucar: p.acucar_g, sodio: p.sodio_mg, saturada: p.gordura_saturada_g, proteina: p.proteina_g, fibra: p.fibra_g,
      custo: a.custo ? a.custo.por_100kcal : null,
    };
  }

  var LINHAS = [
    ['Nota', 'nota', 'alto', ''],
    ['NOVA (1 a 4)', 'nova', 'baixo', ''],
    ['Selos de alerta', 'selos', 'baixo', ''],
    ['Calorias / 100 g', 'kcal', null, ' kcal'],
    ['Açúcares / 100 g', 'acucar', 'baixo', ' g'],
    ['Sódio / 100 g', 'sodio', 'baixo', ' mg'],
    ['Gord. saturada / 100 g', 'saturada', 'baixo', ' g'],
    ['Proteína / 100 g', 'proteina', 'alto', ' g'],
    ['Fibra / 100 g', 'fibra', 'alto', ' g'],
    ['Custo / 100 kcal', 'custo', 'baixo', ''],
  ];

  function desenharComparacao() {
    var lista = lerComp();
    $('comparacaoEl').hidden = lista.length === 0;
    var tab = $('comparacaoTabela');
    tab.textContent = '';
    if (!lista.length) return;

    var cab = el('tr');
    cab.appendChild(el('th', '', ''));
    lista.forEach(function (i) { cab.appendChild(el('th', '', i.nome)); });
    tab.appendChild(cab);

    var vitorias = [0, 0];
    LINHAS.forEach(function (l) {
      var tr = el('tr');
      tr.appendChild(el('th', '', l[0]));
      var vals = lista.map(function (i) { return i[l[1]]; });
      var melhor = -1;
      if (lista.length === 2 && l[2] && vals[0] !== null && vals[0] !== undefined && vals[1] !== null && vals[1] !== undefined && vals[0] !== vals[1]) {
        melhor = (l[2] === 'alto' ? vals[0] > vals[1] : vals[0] < vals[1]) ? 0 : 1;
        vitorias[melhor] += 1;
      }
      vals.forEach(function (v, idx) {
        var td = el('td', melhor === idx ? 'melhor' : '', v === null || v === undefined ? '—' : (l[1] === 'custo' ? moeda(v) : fmt(v) + l[3]));
        tr.appendChild(td);
      });
      tab.appendChild(tr);
    });

    var dica = $('comparacaoDica');
    if (lista.length < 2) dica.textContent = 'Analise outro produto e toque em "Comparar" para ver lado a lado.';
    else if (vitorias[0] === vitorias[1]) dica.textContent = 'Empate técnico: os dois têm perfis parecidos.';
    else dica.textContent = 'Melhor no conjunto: ' + lista[vitorias[0] > vitorias[1] ? 0 : 1].nome + ' (verde na tabela).';
  }

  $('btnComparar').addEventListener('click', function () {
    if (!ultimo) return;
    var lista = lerComp();
    lista.push(resumoParaComparar());
    if (lista.length > 2) lista = lista.slice(-2);
    gravarComp(lista);
    desenharComparacao();
    $('comparacaoEl').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('comparacaoLimpar').addEventListener('click', function () { gravarComp([]); desenharComparacao(); });
  desenharComparacao();

  /* ---------- Compartilhar (cartão em imagem) ---------- */

  function quebrar(ctx, texto, larguraMax) {
    var palavras = String(texto).split(/\s+/);
    var linhas = [], atual = '';
    palavras.forEach(function (p) {
      var teste = atual ? atual + ' ' + p : p;
      if (ctx.measureText(teste).width > larguraMax && atual) { linhas.push(atual); atual = p; } else { atual = teste; }
    });
    if (atual) linhas.push(atual);
    return linhas;
  }

  function cartaoParaBlob(a, produto) {
    var W = 1080, H = 1350;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var fonte = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    var fundo = g.createLinearGradient(0, 0, W, H);
    fundo.addColorStop(0, '#ecfdf5'); fundo.addColorStop(1, '#a7f3d0');
    g.fillStyle = fundo; g.fillRect(0, 0, W, H);

    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(6,78,59,0.25)'; g.shadowBlur = 50; g.shadowOffsetY = 18;
    g.beginPath(); g.roundRect(70, 120, W - 140, H - 300, 48); g.fill();
    g.shadowColor = 'transparent';

    g.fillStyle = '#047857'; g.font = '800 40px ' + fonte; g.textAlign = 'center';
    g.fillText('NutritionLite', W / 2, 90);

    var nome = (produto && produto.nome) || (a.resumo_produto || 'Produto analisado').split('.')[0];
    g.fillStyle = '#0f172a'; g.font = '800 54px ' + fonte;
    var y = 240;
    quebrar(g, nome, W - 260).slice(0, 2).forEach(function (l) { g.fillText(l, W / 2, y); y += 66; });

    var nota = a.nota_saudabilidade;
    var cores = { bom: ['#059669', '#047857'], medio: ['#b45309', '#92400e'], ruim: ['#dc2626', '#991b1b'], na: ['#94a3b8', '#64748b'] };
    var par = cores[classeNota(nota)];
    var cy = y + 190;
    var gr = g.createLinearGradient(W / 2 - 150, cy - 150, W / 2 + 150, cy + 150);
    gr.addColorStop(0, par[0]); gr.addColorStop(1, par[1]);
    g.fillStyle = gr; g.beginPath(); g.arc(W / 2, cy, 150, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '800 130px ' + fonte;
    g.fillText(nota !== null && nota !== undefined ? String(nota) : '—', W / 2, cy + 46);

    g.fillStyle = '#475569'; g.font = '700 36px ' + fonte;
    g.fillText('NOTA DE SAUDABILIDADE' + (a.nivel ? ' · ' + a.nivel.toUpperCase() : ''), W / 2, cy + 230);

    var yy = cy + 300;
    var etiquetas = [];
    if (a.nova) etiquetas.push({ t: 'NOVA ' + a.nova.grupo + ' · ' + a.nova.rotulo.split('· ')[1], cor: a.nova.nivel === 'ruim' ? '#991b1b' : a.nova.nivel === 'medio' ? '#92400e' : '#065f46', fundo: a.nova.nivel === 'ruim' ? '#fee2e2' : a.nova.nivel === 'medio' ? '#fef3c7' : '#d1fae5' });
    ((a.selos_anvisa && a.selos_anvisa.selos) || []).forEach(function (s) { etiquetas.push({ t: s.toUpperCase(), cor: '#fff', fundo: '#111827' }); });
    g.font = '800 36px ' + fonte;
    etiquetas.slice(0, 4).forEach(function (e) {
      var w = g.measureText(e.t).width + 64;
      g.fillStyle = e.fundo; g.beginPath(); g.roundRect(W / 2 - w / 2, yy - 44, w, 68, 16); g.fill();
      g.fillStyle = e.cor; g.fillText(e.t, W / 2, yy + 4);
      yy += 88;
    });

    var p = a.por_100g;
    if (p) {
      g.fillStyle = '#334155'; g.font = '600 34px ' + fonte;
      g.fillText('Por 100 g: ' + fmt(p.kcal, 0) + ' kcal · açúcar ' + fmt(p.acucar_g) + ' g · sódio ' + fmt(p.sodio_mg, 0) + ' mg', W / 2, Math.min(yy + 20, H - 250));
    }

    g.fillStyle = '#065f46'; g.font = '700 34px ' + fonte;
    g.fillText('Analise o seu rótulo no NutritionLite', W / 2, H - 120);
    g.fillStyle = '#475569'; g.font = '500 26px ' + fonte;
    g.fillText('Análise educativa — não substitui nutricionista', W / 2, H - 70);

    return new Promise(function (resolve) { c.toBlob(resolve, 'image/png'); });
  }

  $('btnCompartilhar').addEventListener('click', function () {
    if (!ultimo) return;
    var btn = $('btnCompartilhar');
    btn.disabled = true;
    cartaoParaBlob(ultimo.analise, ultimo.produto).then(function (blob) {
      var arquivo = new File([blob], 'rotulo-nutritionlite.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        return navigator.share({ files: [arquivo], title: 'Análise de rótulo', text: 'Veja a análise deste produto no NutritionLite' }).catch(function () { /* cancelado */ });
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'rotulo-nutritionlite.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }).catch(function () { mostrarErro('Não consegui gerar a imagem para compartilhar.'); })
      .then(function () { btn.disabled = false; });
  });

  window.addEventListener('beforeunload', function () { pararCamera(); pararScan(); });
})();

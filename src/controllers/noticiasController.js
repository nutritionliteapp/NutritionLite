const axios = require('axios');
const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 25000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (compatible; NutritionLite/1.0; +https://nutritionlite-api.onrender.com)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
});

/** Feeds públicos com notícias reais (imagens vêm do próprio feed quando disponível). */
const FEED_SAUDE = 'https://g1.globo.com/rss/g1/saude/';
const FEED_ESPORTE_GE = 'https://ge.globo.com/rss/ge/';

const CACHE_TTL_MS = 1000 * 60 * 30; // 30 min — evita sobrecarregar os sites
let cache = { payload: null, expires: 0 };

function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairImagem(item) {
  const candidatos = [];

  if (item.enclosure && item.enclosure.url) {
    const t = item.enclosure.type || '';
    if (t.startsWith('image') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(item.enclosure.url)) {
      candidatos.push(item.enclosure.url);
    }
  }

  const media = item.mediaContent || item['media:content'];
  if (media) {
    const blocos = Array.isArray(media) ? media : [media];
    for (const b of blocos) {
      if (b && b.$ && b.$.url) candidatos.push(b.$.url);
      if (b && b.url) candidatos.push(b.url);
    }
  }

  const html = item['content:encoded'] || item.content || item.summary || item.description || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) candidatos.push(m[1]);

  const primeiro = candidatos.find((u) => u && /^https?:\/\//i.test(u));
  return primeiro || null;
}

function extrairLink(item) {
  if (!item) return null;
  if (typeof item.link === 'string') return item.link;
  if (item.link && item.link.href) return item.link.href;
  if (typeof item.guid === 'string') return item.guid;
  if (item.guid && item.guid['#text']) return item.guid['#text'];
  if (item.guid && item.guid._) return item.guid._;
  return null;
}

function normalizarItem(item, categoria) {
  const href = extrairLink(item);
  // Só http(s): um feed comprometido poderia entregar "javascript:..." e o front usa o valor em <a href>.
  if (!href || !/^https?:\/\//i.test(String(href).trim()) || !item.title) return null;

  return {
    title: String(item.title).trim(),
    href: String(href).trim(),
    img: extrairImagem(item),
    excerpt: stripHtml(item.contentSnippet || item.summary || item.content || '').slice(0, 220),
    category: categoria,
    tempo: 'Atual',
  };
}

async function buscarXml(url) {
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; NutritionLite/1.0; +https://nutritionlite-api.onrender.com)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    timeout: 25000,
    responseType: 'text',
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return data;
}

function indiceDiaUtc() {
  const agora = new Date();
  return Math.floor(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()) / 86400000);
}

function escolherDestaqueEGrade(pool, diaIdx, qtdGrade) {
  const validos = pool.filter(Boolean);
  if (validos.length === 0) return { hero: null, grade: [] };
  const heroIdx = diaIdx % validos.length;
  const hero = validos[heroIdx];
  const resto = validos.filter((_, i) => i !== heroIdx);
  const grade = resto.slice(0, qtdGrade);
  return { hero, grade };
}

function escolherTreinos(pool, diaIdx, qtd) {
  const validos = pool.filter(Boolean);
  if (validos.length === 0) return [];
  const start = diaIdx % Math.max(1, validos.length);
  const saida = [];
  for (let i = 0; i < qtd; i++) {
    saida.push(validos[(start + i) % validos.length]);
  }
  return saida;
}

const buscarFeedNoticias = async (req, res) => {
  try {
    const agora = Date.now();
    if (cache.payload && agora < cache.expires) {
      return res.status(200).json(cache.payload);
    }

    const [xmlSaude, xmlGe] = await Promise.all([
      buscarXml(FEED_SAUDE),
      buscarXml(FEED_ESPORTE_GE),
    ]);

    const feedSaude = await parser.parseString(xmlSaude);
    const feedGe = await parser.parseString(xmlGe);

    const itensSaude = (feedSaude.items || [])
      .map((it) => normalizarItem(it, 'Saúde'))
      .filter(Boolean);

    const itensGe = (feedGe.items || [])
      .map((it) => normalizarItem(it, 'Esporte'))
      .filter(Boolean);

    const diaIdx = indiceDiaUtc();

    const { hero: heroNutricao, grade: gradeNutricao } = escolherDestaqueEGrade(itensSaude, diaIdx, 3);
    const treinos = escolherTreinos(itensGe, diaIdx, 3);

    const fallbackImg = '/imgs/logos/logo.png';

    const comImagem = (item) => ({
      ...item,
      img: item.img || fallbackImg,
      imgAlt: item.title,
    });

    const payload = {
      fontes: {
        saude: FEED_SAUDE,
        esporte: FEED_ESPORTE_GE,
      },
      atualizadoEm: new Date().toISOString(),
      hero: heroNutricao ? comImagem(heroNutricao) : null,
      nutricao: gradeNutricao.map(comImagem),
      treino: treinos.map(comImagem),
    };

    cache = { payload, expires: agora + CACHE_TTL_MS };
    return res.status(200).json(payload);
  } catch (err) {
    console.error('Erro ao montar feed de notícias:', err.message || err);
    return res.status(502).json({
      mensagem:
        'Não foi possível carregar as notícias agora. Tente novamente em alguns minutos.',
      detalhe: process.env.NODE_ENV !== 'production' ? String(err.message || err) : undefined,
    });
  }
};

module.exports = { buscarFeedNoticias };

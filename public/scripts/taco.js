// Script para página TACO - busca em backend
// Comportamento: debounce 500ms, indicador de loading, mensagem quando vazio, renderiza tabela.
// Visitante (sem login): cota diária de consultas (o servidor conta e informa o saldo).
// Logado: consultas ilimitadas.

const searchInput = document.getElementById('searchInput');
const tableBody = document.getElementById('tableBody');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const initialState = document.getElementById('initialState');
const foodTable = document.getElementById('foodTable');
const limiteInfo = document.getElementById('limiteInfo');

let debounceTimer = null;
let cotaEsgotada = false;

// Repetir a mesma busca não deve gastar a cota do visitante.
const cacheBuscas = new Map();

function estaLogado() {
    return Boolean(window.NLSession && window.NLSession.logado());
}

function cabecalhosAuth() {
    const token = window.NLSession && window.NLSession.token();
    return token ? { Authorization: 'Bearer ' + token } : {};
}

function mostrarSaldo(info) {
    if (!limiteInfo || !window.NLLimite) return;
    limiteInfo.replaceChildren();
    if (info) limiteInfo.appendChild(window.NLLimite.faixa(info));
}

function esconderResultados() {
    tableBody.innerHTML = '';
    foodTable.style.display = 'none';
    loadingState.style.display = 'none';
    emptyState.style.display = 'none';
    initialState.style.display = 'none';
}

function mostrarEsgotado(info) {
    cotaEsgotada = true;
    esconderResultados();
    if (limiteInfo && window.NLLimite && info) {
        limiteInfo.replaceChildren(window.NLLimite.cartao(info, 'taco'));
    }
}

// Resultado: { itens } em sucesso, { esgotado: info } quando a cota do dia acabou.
async function buscarAlimentos(termo) {
    const chave = termo.toLowerCase();
    if (cacheBuscas.has(chave)) return { itens: cacheBuscas.get(chave) };

    try {
        const q = encodeURIComponent(termo);
        const res = await fetch(`/api/alimentos/consulta?busca=${q}`, { headers: cabecalhosAuth() });

        if (res.status === 429) {
            const corpo = await res.json().catch(() => ({}));
            if (corpo && corpo.limite_diario && window.NLLimite) {
                return { esgotado: window.NLLimite.doCorpo(corpo) };
            }
            console.error('Muitas requisições:', corpo && (corpo.mensagem || corpo.message));
            return { itens: [] };
        }

        if (!res.ok) {
            console.error('Resposta inválida da API:', res.status);
            return { itens: [] };
        }

        if (window.NLLimite) mostrarSaldo(window.NLLimite.doCabecalho(res));

        const data = await res.json();
        const itens = Array.isArray(data) ? data : [];
        cacheBuscas.set(chave, itens);
        return { itens };
    } catch (err) {
        console.error('Erro ao buscar alimentos:', err);
        return { itens: [] };
    }
}

function renderTable(data) {
    tableBody.innerHTML = '';

    if (!Array.isArray(data) || data.length === 0) {
        foodTable.style.display = 'none';
        emptyState.style.display = 'flex';
        initialState.style.display = 'none';
        return;
    }

    foodTable.style.display = 'table';
    emptyState.style.display = 'none';
    initialState.style.display = 'none';

    data.forEach((item) => {
        const row = document.createElement('tr');
        const values = [
            item.nome_alimento || item.nome || '',
            item.energia_kcal ?? item.kcal ?? '',
            item.proteina ?? item.prot ?? '',
            item.lipideos ?? item.lip ?? '',
            item.carboidratos ?? item.carb ?? '',
            item.fibra_alimentar ?? item.fibra ?? '',
            item.calcio ?? '',
            item.ferro ?? '',
            item.sodio ?? '',
        ];
        values.forEach((v) => {
            const td = document.createElement('td');
            td.textContent = v === null || v === undefined ? '' : String(v);
            row.appendChild(td);
        });
        tableBody.appendChild(row);
    });
}

// Saldo inicial: visitante vê quantas consultas ainda tem (ou o aviso, se já acabaram); logado não vê nada.
if (window.NLLimite) {
    window.NLLimite.status('taco').then((info) => {
        if (!info) return;
        if (info.restantes <= 0) mostrarEsgotado(info);
        else mostrarSaldo(info);
    });
}

// Event Listener com Debounce (evita busca a cada letra)
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim();

    // Limpar estados anteriores
    clearTimeout(debounceTimer);

    // Visitante: busca de 1 letra gasta cota à toa, então pede pelo menos 2.
    const minimo = estaLogado() ? 1 : 2;

    if (term.length < minimo) {
        tableBody.innerHTML = '';
        foodTable.style.display = 'none';
        loadingState.style.display = 'none';
        emptyState.style.display = 'none';
        initialState.style.display = cotaEsgotada ? 'none' : 'flex';
        return;
    }

    // Cota do dia já esgotada e busca ainda não feita: nem tenta (o servidor recusaria).
    if (cotaEsgotada && !cacheBuscas.has(term.toLowerCase())) {
        esconderResultados();
        return;
    }

    // Mostrar Loading
    loadingState.style.display = 'flex';
    foodTable.style.display = 'none';
    emptyState.style.display = 'none';
    initialState.style.display = 'none';

    // Aguarda usuário parar de digitar por 500ms
    debounceTimer = setTimeout(async () => {
        const resultado = await buscarAlimentos(term);
        loadingState.style.display = 'none';

        if (resultado.esgotado) {
            mostrarEsgotado(resultado.esgotado);
            return;
        }
        renderTable(resultado.itens);
    }, 500);
});

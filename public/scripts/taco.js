// Script para página TACO - busca em backend
// Comportamento: debounce 500ms, indicador de loading, mensagem quando vazio, renderiza tabela

const searchInput = document.getElementById('searchInput');
const tableBody = document.getElementById('tableBody');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const initialState = document.getElementById('initialState');
const foodTable = document.getElementById('foodTable');

let debounceTimer = null;

async function buscarAlimentos(termo) {
    if (!termo) return [];
    try {
        const q = encodeURIComponent(termo);
        const res = await fetch(`/api/alimentos/consulta?busca=${q}`);
        if (!res.ok) {
            console.error('Resposta inválida da API:', res.status);
            return [];
        }
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('Erro ao buscar alimentos:', err);
        return [];
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

    const escapeHtml =
        (window.NLSafe && window.NLSafe.escapeHtml) ||
        function (value) {
            if (value === null || value === undefined) return '';
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

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

// Event Listener com Debounce (evita busca a cada letra)
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim();

    // Limpar estados anteriores
    clearTimeout(debounceTimer);
    
    if (term === '') {
        tableBody.innerHTML = '';
        foodTable.style.display = 'none';
        loadingState.style.display = 'none';
        emptyState.style.display = 'none';
        initialState.style.display = 'flex';
        return;
    }

    // Mostrar Loading
    loadingState.style.display = 'flex';
    foodTable.style.display = 'none';
    emptyState.style.display = 'none';
    initialState.style.display = 'none';

    // Aguarda usuário parar de digitar por 500ms
    debounceTimer = setTimeout(async () => {
        const results = await buscarAlimentos(term);
        loadingState.style.display = 'none';
        renderTable(results);
    }, 500);
});
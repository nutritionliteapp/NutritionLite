const foodData = [
    { name: "Abacate, polpa, crua", energy: 96, protein: 1.2, lipids: 8.4, carbs: 6.0, fiber: 6.3, calcium: 8, iron: 0.2, sodium: 3 },
    { name: "Abacaxi, polpa, crua", energy: 48, protein: 0.9, lipids: 0.1, carbs: 12.3, fiber: 1.0, calcium: 22, iron: 0.3, sodium: 1 },
    { name: "Açaí, polpa, congelada", energy: 58, protein: 0.8, lipids: 3.9, carbs: 6.2, fiber: 2.6, calcium: 35, iron: 0.4, sodium: 5 },
    { name: "Acerola, polpa, crua", energy: 33, protein: 0.9, lipids: 0.2, carbs: 8.0, fiber: 1.5, calcium: 13, iron: 0.2, sodium: 3 },
    { name: "Agrião, cru", energy: 17, protein: 2.7, lipids: 0.2, carbs: 2.1, fiber: 1.9, calcium: 133, iron: 0.8, sodium: 16 },
    { name: "Alface, crespa, crua", energy: 11, protein: 1.3, lipids: 0.2, carbs: 1.7, fiber: 1.8, calcium: 38, iron: 0.4, sodium: 4 },
    { name: "Alho, cru", energy: 113, protein: 7.0, lipids: 0.2, carbs: 23.9, fiber: 4.3, calcium: 26, iron: 0.9, sodium: 6 },
    { name: "Amendoim, grão, cru", energy: 544, protein: 27.2, lipids: 43.9, carbs: 21.9, fiber: 8.0, calcium: 65, iron: 2.1, sodium: 4 },
    { name: "Arroz, integral, cozido", energy: 124, protein: 2.6, lipids: 1.0, carbs: 25.8, fiber: 2.7, calcium: 5, iron: 0.3, sodium: 1 },
    { name: "Arroz, tipo 1, cozido", energy: 128, protein: 2.5, lipids: 0.2, carbs: 28.1, fiber: 1.6, calcium: 4, iron: 0.1, sodium: 1 },
    { name: "Aveia, flocos, crus", energy: 394, protein: 13.9, lipids: 8.5, carbs: 66.6, fiber: 9.1, calcium: 49, iron: 4.4, sodium: 3 },
    { name: "Azeite de oliva, extra virgem", energy: 884, protein: 0.0, lipids: 100.0, carbs: 0.0, fiber: 0.0, calcium: 0, iron: 0.0, sodium: 2 },
    { name: "Banana, prata, crua", energy: 98, protein: 1.3, lipids: 0.1, carbs: 26.0, fiber: 2.0, calcium: 8, iron: 0.4, sodium: 1 },
    { name: "Batata, doce, cozida", energy: 77, protein: 0.6, lipids: 0.1, carbs: 18.4, fiber: 2.2, calcium: 21, iron: 0.3, sodium: 2 },
    { name: "Batata, inglesa, cozida", energy: 52, protein: 1.2, lipids: 0.1, carbs: 11.9, fiber: 1.3, calcium: 3, iron: 0.2, sodium: 2 },
    { name: "Beterraba, cozida", energy: 32, protein: 1.3, lipids: 0.1, carbs: 7.2, fiber: 2.5, calcium: 15, iron: 0.3, sodium: 47 },
    { name: "Brócolis, cozido", energy: 25, protein: 2.1, lipids: 0.5, carbs: 4.4, fiber: 3.4, calcium: 51, iron: 0.6, sodium: 6 },
    { name: "Café, infusão 10%", energy: 0, protein: 0.1, lipids: 0.0, carbs: 0.0, fiber: 0.0, calcium: 2, iron: 0.0, sodium: 1 },
    { name: "Cajú, castanha, torrada", energy: 570, protein: 18.5, lipids: 46.3, carbs: 30.5, fiber: 3.7, calcium: 46, iron: 5.4, sodium: 14 },
    { name: "Carne, bovina, contra-filé, grelhado", energy: 216, protein: 31.7, lipids: 9.3, carbs: 0.0, fiber: 0.0, calcium: 5, iron: 2.1, sodium: 55 },
    { name: "Carne, bovina, patinho, moído, cozido", energy: 219, protein: 28.6, lipids: 11.1, carbs: 0.0, fiber: 0.0, calcium: 8, iron: 3.0, sodium: 64 },
    { name: "Cebola, crua", energy: 39, protein: 1.7, lipids: 0.1, carbs: 8.9, fiber: 2.2, calcium: 22, iron: 0.2, sodium: 2 },
    { name: "Cenoura, cozida", energy: 34, protein: 0.8, lipids: 0.2, carbs: 8.2, fiber: 3.0, calcium: 23, iron: 0.2, sodium: 43 },
    { name: "Cerveja, pilsen", energy: 41, protein: 0.4, lipids: 0.0, carbs: 3.3, fiber: 0.0, calcium: 5, iron: 0.1, sodium: 4 },
    { name: "Chocolate, ao leite", energy: 540, protein: 6.2, lipids: 31.5, carbs: 59.9, fiber: 1.8, calcium: 187, iron: 1.7, sodium: 88 },
    { name: "Couve, manteiga, cozida", energy: 17, protein: 1.7, lipids: 0.4, carbs: 2.7, fiber: 2.3, calcium: 131, iron: 0.6, sodium: 4 },
    { name: "Ervilha, em conserva", energy: 59, protein: 4.1, lipids: 0.4, carbs: 11.2, fiber: 4.7, calcium: 22, iron: 1.2, sodium: 337 },
    { name: "Espinafre, cozido", energy: 21, protein: 2.7, lipids: 0.3, carbs: 3.0, fiber: 2.5, calcium: 112, iron: 1.5, sodium: 64 },
    { name: "Feijão, carioca, cozido", energy: 76, protein: 4.8, lipids: 0.5, carbs: 13.6, fiber: 7.9, calcium: 27, iron: 0.9, sodium: 2 },
    { name: "Feijão, preto, cozido", energy: 77, protein: 4.5, lipids: 0.5, carbs: 14.0, fiber: 8.8, calcium: 37, iron: 1.1, sodium: 2 },
    { name: "Figo, cru", energy: 67, protein: 1.2, lipids: 0.2, carbs: 17.1, fiber: 2.5, calcium: 38, iron: 0.6, sodium: 2 },
    { name: "Frango, peito, sem pele, grelhado", energy: 159, protein: 32.0, lipids: 2.5, carbs: 0.0, fiber: 0.0, calcium: 4, iron: 0.4, sodium: 58 },
    { name: "Goiaba, vermelha, crua", energy: 54, protein: 1.1, lipids: 0.4, carbs: 13.0, fiber: 6.2, calcium: 6, iron: 0.2, sodium: 2 },
    { name: "Laranja, pêra, crua", energy: 37, protein: 1.0, lipids: 0.1, carbs: 8.9, fiber: 1.8, calcium: 35, iron: 0.1, sodium: 1 },
    { name: "Leite, de vaca, integral", energy: 60, protein: 3.2, lipids: 3.2, carbs: 4.8, fiber: 0.0, calcium: 113, iron: 0.0, sodium: 54 },
    { name: "Limão, suco", energy: 14, protein: 0.4, lipids: 0.1, carbs: 4.9, fiber: 0.1, calcium: 12, iron: 0.1, sodium: 1 },
    { name: "Maçã, Fuji, com casca", energy: 56, protein: 0.3, lipids: 0.0, carbs: 15.2, fiber: 2.0, calcium: 7, iron: 0.1, sodium: 1 },
    { name: "Mamão, formosa, cru", energy: 45, protein: 0.8, lipids: 0.1, carbs: 11.6, fiber: 1.8, calcium: 22, iron: 0.2, sodium: 5 },
    { name: "Manga, Haden, crua", energy: 64, protein: 0.5, lipids: 0.3, carbs: 16.7, fiber: 2.1, calcium: 11, iron: 0.1, sodium: 3 },
    { name: "Mel, de abelha", energy: 309, protein: 0.0, lipids: 0.0, carbs: 84.4, fiber: 0.0, calcium: 5, iron: 0.2, sodium: 10 },
    { name: "Melancia, polpa, crua", energy: 31, protein: 0.9, lipids: 0.2, carbs: 7.1, fiber: 0.1, calcium: 8, iron: 0.2, sodium: 1 },
    { name: "Milho, verde, cozido", energy: 98, protein: 3.2, lipids: 2.2, carbs: 20.1, fiber: 4.6, calcium: 2, iron: 0.6, sodium: 2 },
    { name: "Morango, cru", energy: 30, protein: 0.9, lipids: 0.3, carbs: 6.8, fiber: 1.7, calcium: 14, iron: 0.4, sodium: 1 },
    { name: "Ovo, de galinha, cozido", energy: 146, protein: 13.0, lipids: 9.5, carbs: 1.6, fiber: 0.0, calcium: 54, iron: 1.9, sodium: 140 },
    { name: "Pão, de forma, integral", energy: 253, protein: 10.3, lipids: 3.8, carbs: 49.9, fiber: 7.0, calcium: 133, iron: 2.9, sodium: 506 },
    { name: "Pão, francês", energy: 289, protein: 8.0, lipids: 3.0, carbs: 58.6, fiber: 2.3, calcium: 15, iron: 1.0, sodium: 646 },
    { name: "Pêra, Williams, crua", energy: 45, protein: 0.4, lipids: 0.1, carbs: 11.9, fiber: 2.2, calcium: 8, iron: 0.1, sodium: 1 },
    { name: "Pimentão, verde, cru", energy: 19, protein: 1.1, lipids: 0.2, carbs: 4.1, fiber: 2.1, calcium: 8, iron: 0.4, sodium: 2 },
    { name: "Queijo, minas, frescal", energy: 264, protein: 17.4, lipids: 20.2, carbs: 3.1, fiber: 0.0, calcium: 579, iron: 0.4, sodium: 36 },
    { name: "Salmão, com pele, grelhado", energy: 210, protein: 23.8, lipids: 12.4, carbs: 0.0, fiber: 0.0, calcium: 10, iron: 0.4, sodium: 89 },
    { name: "Tomate, com semente, cru", energy: 15, protein: 1.1, lipids: 0.2, carbs: 3.1, fiber: 1.2, calcium: 6, iron: 0.2, sodium: 1 },
    { name: "Uva, Itália, crua", energy: 53, protein: 0.6, lipids: 0.2, carbs: 13.6, fiber: 0.9, calcium: 9, iron: 0.2, sodium: 1 }
];

// Função para preencher a tabela com os dados do array
function populateTable(data) {
    const tableBody = document.getElementById("foodTableBody");
    tableBody.innerHTML = ""; // Limpa a tabela antes de preencher

    data.forEach(item => {
        let row = tableBody.insertRow();
        row.insertCell(0).textContent = item.name;
        row.insertCell(1).textContent = item.energy;
        row.insertCell(2).textContent = item.protein;
        row.insertCell(3).textContent = item.lipids;
        row.insertCell(4).textContent = item.carbs;
        row.insertCell(5).textContent = item.fiber;
        row.insertCell(6).textContent = item.calcium;
        row.insertCell(7).textContent = item.iron;
        row.insertCell(8).textContent = item.sodium;
    });
}

// Função para filtrar a tabela (agora atua sobre os dados originais)
function filterTable() {
    const input = document.getElementById("searchInput");
    const filter = input.value.toLowerCase();

    const filteredData = foodData.filter(item => {
        return item.name.toLowerCase().includes(filter);
    });

    populateTable(filteredData);
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    populateTable(foodData);
    const search = document.getElementById('searchInput');
    if (search) search.addEventListener('input', filterTable);
});

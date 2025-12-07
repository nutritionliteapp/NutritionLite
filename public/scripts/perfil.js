function toggleEdit(btn) {
        // Encontra o card pai do botão
        const card = btn.closest('.card');
        if (!card) return;

        // Encontra os modos de visualização e edição dentro do card
        const viewMode = card.querySelector('.view-mode');
        const editMode = card.querySelector('.edit-mode');

        if (viewMode && editMode) {
          // Verifica se está no modo de edição
          const isEditing = editMode.style.display !== "none";

          if (isEditing) {
            // Se está editando, volta para o modo de visualização
            viewMode.style.display = "";
            editMode.style.display = "none";
            btn.textContent = "Editar";
          } else {
            // Se está visualizando, vai para o modo de edição
            viewMode.style.display = "none";
            editMode.style.display = "";
            btn.textContent = "Cancelar";
          }
        }
      }

// SUBMIT INFORMAÇÕES PESSOAIS

document.querySelector('#info-card form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");
  if (!token) {
    alert('É necessário estar logado.');
    return;
  }
  const nome = document.getElementById('input-nome').value;
  const peso = document.getElementById('input-peso').value;
  const altura = document.getElementById('input-altura').value;
  const idade = document.getElementById('input-idade').value;

  try {
    const res = await fetch('/api/usuarios/perfil', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ nome, peso, altura, idade })
    });
    if (!res.ok) throw new Error((await res.json()).mensagem || 'Erro ao atualizar');
    // Volta ao modo visualização
    toggleEdit(document.querySelector('#info-card .btn-edit'));
    // Recarrega dados
    window.location.reload();
  } catch(err) {
    alert('Erro: ' + err.message);
  }
});

// SUBMIT METAS

document.querySelector('#goals-card form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");
  if (!token) {
    alert('É necessário estar logado.');
    return;
  }
  const peso_alvo = document.getElementById('input-pesoDesejado').value;
  const foco_principal = document.getElementById('input-foco').value;
  try {
    const res = await fetch('/api/usuarios/metas', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ peso_alvo, foco_principal })
    });
    if (!res.ok) throw new Error((await res.json()).mensagem || 'Erro ao atualizar');
    toggleEdit(document.querySelector('#goals-card .btn-edit'));
    window.location.reload();
  } catch(err) {
    alert('Erro: ' + err.message);
  }
});
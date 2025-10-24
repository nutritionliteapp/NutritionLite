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
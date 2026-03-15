document.addEventListener('DOMContentLoaded', function () {
  // Suavizar rolagem para âncoras
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      if (this.getAttribute('id') === 'showLogin' || this.getAttribute('id') === 'showCadastro') return;

      e.preventDefault();
      const alvo = document.querySelector(this.getAttribute('href'));
      if (alvo) {
        alvo.scrollIntoView({
          behavior: 'smooth'
        });
      }
    });
  });

  // Efeito de digitação no título (protege caso o elemento não exista)
  const title = document.querySelector('.text-content h1');
  if (title) {
    const originalText = title.textContent;
    title.textContent = '';

    let i = 0;
    const typingEffect = setInterval(() => {
      if (i < originalText.length) {
        title.textContent += originalText.charAt(i);
        i++;
      } else {
        clearInterval(typingEffect);
      }
    }, 50);
  }

  //3 tracinhos no menu responsivo
  const btn = document.getElementById('menu-toggle');
  const nav = document.querySelector('nav ul');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      nav.classList.toggle('active');
    });

    // Fecha o menu após clicar em um link (sem impedir o redirecionamento)
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        setTimeout(() => {
          nav.classList.remove('active');
        }, 200);
      });
    });
  }

  // Componente de busca só é ativado se existir na página
  const searchToggle = document.getElementById('search-toggle');
  const searchBar = document.querySelector('.search-bar');
  const searchInput = searchBar && searchBar.querySelector('input[type="text"]');

  if (searchToggle && searchBar && searchInput) {
    searchToggle.addEventListener('click', function (e) {
      e.preventDefault();
      searchBar.classList.toggle('active');
      if (searchBar.classList.contains('active')) {
        searchInput.focus();
      }
    });
  }
});

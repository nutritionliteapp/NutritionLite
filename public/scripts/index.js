// Suavizar rolagem para âncoras
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        if(this.getAttribute('id') === 'showLogin' || this.getAttribute('id') === 'showCadastro') return;
        
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
          behavior: 'smooth'
        });
      });
    });
    
    // Efeito de digitação no título
    const title = document.querySelector('.text-content h1');
    const originalText = title.textContent;
    title.textContent = '';
    
    let i = 0;
    const typingEffect = setInterval(() => {
      if(i < originalText.length) {
        title.textContent += originalText.charAt(i);
        i++;
      } else {
        clearInterval(typingEffect);
      }
    }, 50);
    //3 tracinhos no menu responsivo
    document.addEventListener('DOMContentLoaded', function() {
      const btn = document.getElementById('menu-toggle');
      const nav = document.querySelector('nav ul');
      btn.addEventListener('click', function() {
        nav.classList.toggle('active');
      });

      // Fecha o menu após clicar em um link (sem impedir o redirecionamento)
      nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          setTimeout(() => {
            nav.classList.remove('active');
          }, 200); // tempo suficiente para o navegador processar o clique
        });
      });
    });
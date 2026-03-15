document.addEventListener('DOMContentLoaded', function() {
    const container = document.querySelector('.container');
    const registerBtn = document.querySelector('.register-btn');
    const loginBtn = document.querySelector('.login-btn');

    if (container && registerBtn && loginBtn) {
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            container.classList.add('active');
        });

        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            container.classList.remove('active');
        });
    }

    // Adicionar funcionalidade para alternar visibilidade de senhas
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        const icon = input.nextElementSibling;
        icon.addEventListener('click', () => {
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('bxs-lock-alt', 'bxs-lock-open-alt');
            } else {
                input.type = 'password';
                icon.classList.replace('bxs-lock-open-alt', 'bxs-lock-alt');
            }
        });
    });

    const searchToggle = document.getElementById('search-toggle');
    const searchBar = document.querySelector('.search-bar');
    const searchInput = searchBar && searchBar.querySelector('input');

    if (searchToggle && searchBar && searchInput) {
        searchToggle.onclick = function () {
            searchBar.classList.toggle('active');
            if (searchBar.classList.contains('active')) {
                searchInput.focus();
            }
        };
    }
});
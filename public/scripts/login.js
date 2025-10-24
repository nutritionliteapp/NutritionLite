document.addEventListener('DOMContentLoaded', function() {
    const container = document.querySelector('.container');
    const registerBtn = document.querySelector('.register-btn');
    const loginBtn = document.querySelector('.login-btn');

    registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        container.classList.add('active');
    });

    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        container.classList.remove('active');
    });

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
<<<<<<< HEAD

    document.getElementById('search-toggle').onclick = function() {
        document.querySelector('.search-bar').classList.toggle('active');
        const input = document.querySelector('.search-bar input');
        if (document.querySelector('.search-bar').classList.contains('active')) {
            input.focus();
        }
    };
=======
>>>>>>> 950a12fb089d73fb26bc43df74781d2e80b33f5b
});
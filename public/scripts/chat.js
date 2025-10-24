document.addEventListener('DOMContentLoaded', function() {
            // Centralizado
            const centeredInput = document.getElementById('centered-message-input');
            const centeredSend = document.getElementById('centered-send-button');
            const centeredForm = document.getElementById('centered-input-form');
            // Rodapé
            const inputContainer = document.getElementById('input-container');
            const messageInput = document.getElementById('message-input');
            const sendButton = document.getElementById('send-button');
            // Geral
            const chatContainer = document.getElementById('chat-container');
            const inputWrap = document.getElementById('input-wrap');
            let userHasSentMessage = false;

            // Habilita botão centralizado
            centeredInput.addEventListener('input', function () {
                centeredSend.disabled = centeredInput.value.trim() === '';
            });
            // Envio com enter centralizado
            centeredInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey && !centeredSend.disabled) {
                    e.preventDefault();
                    sendMessageCentered();
                }
            });
            centeredForm.addEventListener('submit', sendMessageCentered);
            centeredSend.addEventListener('click', sendMessageCentered);

            function sendMessageCentered() {
                const text = centeredInput.value.trim();
                if (!text) return;
                appendUserMessage(text);
                centeredInput.value = '';
                centeredSend.disabled = true;

                // Troca para input de rodapé
                if (!userHasSentMessage) {
                    userHasSentMessage = true;
                    inputWrap.style.display = 'none';
                    inputContainer.style.display = '';
                    messageInput.focus();
                }
            }

            // Habilita botão rodapé
            messageInput.addEventListener('input', function () {
                sendButton.disabled = messageInput.value.trim() === '';
            });
            // Envio com enter rodapé
            messageInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey && !sendButton.disabled) {
                    e.preventDefault();
                    sendMessageFooter();
                }
            });
            sendButton.addEventListener('click', sendMessageFooter);

            function sendMessageFooter() {
                const text = messageInput.value.trim();
                if (!text) return;
                appendUserMessage(text);
                messageInput.value = '';
                sendButton.disabled = true;
            }

            // Função para adicionar mensagem do usuário e do assistente
            function appendUserMessage(text) {
                const userMessageDiv = document.createElement('div');
                userMessageDiv.className = 'message user-message';
                userMessageDiv.innerHTML = `
                    <div class="avatar user-avatar">
                        <img src="https://cdn-icons-png.flaticon.com/512/616/616589.png" alt="Macaco" style="width: 36px; height: 36px; object-fit: cover; border-radius: 50%;">
                    </div>
                    <div class="message-content"><p>${text.replace(/\n/g, '<br>')}</p></div>
                `;
                chatContainer.appendChild(userMessageDiv);
                setTimeout(() => {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }, 50);

                // Simula resposta do assistente
                setTimeout(() => {
                    const botMessage = document.createElement('div');
                    botMessage.className = 'message assistant-message';
                    botMessage.innerHTML = `
                        <div class="avatar">
<<<<<<< HEAD
                            <img src="/imgs/logos/logo com borda.png" alt="NutritionLite" style="width: 36px; height: 36px; object-fit: cover; border-radius: 50%;">
=======
                            <img src="src/assets/imgs/logos/logo com borda.png" alt="NutritionLite" style="width: 36px; height: 36px; object-fit: cover; border-radius: 50%;">
>>>>>>> 950a12fb089d73fb26bc43df74781d2e80b33f5b
                        </div>
                        <div class="message-content"><p>Recebi sua mensagem: <strong>${text}</strong></p></div>
                    `;
                    chatContainer.appendChild(botMessage);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }, 600);
            }

            document.getElementById('new-chat').addEventListener('click', function () {
                // Limpa as mensagens do chat
                chatContainer.innerHTML = `
                    <div class="message assistant-message">
                        <div class="avatar">
                            <img src="src/assets/imgs/logos/logo com borda.png" alt="NutritionLite" style="width: 36px; height: 36px; object-fit: cover; border-radius: 50%;">
                        </div>
                        <div class="message-content">
                            <p>Olá! Sou o assistente virtual da NutritionLite. Posso te ajudar com:</p>
                            <ul style="margin: 15px 0 15px 20px;">
                                <li>🥗 Planos alimentares personalizados</li>
                                <li>📌 Dicas de nutrição</li>
                                <li>🧠 Orientações sobre hábitos saudáveis</li>
                                <li>🍲 Receitas balanceadas</li>
                            </ul>
                            <p>Como posso te ajudar hoje?</p>
                        </div>
                    </div>
                `;
                // Mostra o input centralizado e esconde o do rodapé
                inputWrap.style.display = '';
                inputContainer.style.display = 'none';
                userHasSentMessage = false;
                centeredInput.value = '';
                centeredSend.disabled = true;
                centeredInput.focus();
            });
        });
// public/guest-script.js
document.addEventListener("DOMContentLoaded", () => {
    
    // --- SELEÇÃO DOS ELEMENTOS DO DOM ---
    const chatBox = document.getElementById("chat-box");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    // Não precisamos dos elementos de histórico aqui

    // --- VARIÁVEIS DE ESTADO ---
    const API_URL = "/api/chat"; // Usa caminho relativo
    let clientHistory = []; // O histórico existe apenas enquanto a página está aberta
    let currentSessionId = null; // A sessão é sempre nova para visitantes

    // --- FUNÇÕES PRINCIPAIS DO CHAT (Idênticas ao script.js) ---
    function addMessage(message, sender) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("message", `${sender}-message`);
        messageDiv.innerText = message;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function showTypingIndicator(show = true) {
        const existingIndicator = document.getElementById("typing");
        if (existingIndicator) existingIndicator.remove();

        if (show) {
            const typingDiv = document.createElement("div");
            typingDiv.classList.add("message", "bot-message", "typing-indicator");
            typingDiv.textContent = "Meditando...";
            typingDiv.id = "typing";
            chatBox.appendChild(typingDiv);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage(message, "user");
        clientHistory.push({ role: "user", parts: [{ text: message }] });
        userInput.value = "";
        sendButton.disabled = true;
        showTypingIndicator();

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    // IMPORTANTE: NENHUM token de autenticação é enviado
                },
                body: JSON.stringify({ prompt: message, sessionId: currentSessionId }),
            });

            showTypingIndicator(false);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Erro do Servidor: ${response.status}`);
            }

            const data = await response.json();

            if (data.reply) {
                addMessage(data.reply, "bot");
                clientHistory.push({ role: "model", parts: [{ text: data.reply }] });
                currentSessionId = data.sessionId;
                // IMPORTANTE: NÃO chama a função para salvar o histórico
            } else {
                addMessage("Recebi uma resposta vazia do bot.", "bot");
            }
        } catch (error) {
            showTypingIndicator(false);
            console.error("Erro ao enviar mensagem:", error);
            addMessage(`Ocorreu um erro de conexão: ${error.message}`, "bot");
        } finally {
            sendButton.disabled = false;
            userInput.focus();
        }
    }
    
    // --- INICIALIZAÇÃO DA PÁGINA E EVENT LISTENERS ---
    function inicializarPagina() {
        // ... (Você pode copiar a mesma função de inicialização do seu script.js se quiser
        //      preencher os dados do bot como Nome, Slogan, etc.)
        const NOME_DO_BOT = "Musashi Miyamoto";
        // ... etc ...
        document.getElementById("nome-bot-display").textContent = NOME_DO_BOT;


        // Adiciona os listeners para o envio de mensagens
        sendButton.addEventListener("click", sendMessage);
        userInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") sendMessage();
        });
    }

    // Inicia tudo!
    inicializarPagina();

});
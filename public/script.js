document.addEventListener("DOMContentLoaded", () => {
    // --- VERIFICAÇÃO DE AUTENTICAÇÃO ---
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');
    const username = localStorage.getItem('username');

    // Redireciona para login se não estiver autenticado
    if (!token || !userId) {
        window.location.href = '/login.html';
        return;
    }

    // Exibe nome do usuário
    const userDisplay = document.getElementById('user-display');
    if (userDisplay && username) {
        userDisplay.textContent = username;
    }

    // --- SELEÇÃO DOS ELEMENTOS DO DOM ---
    const chatBox = document.getElementById("chat-box");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const listaSessoes = document.getElementById("lista-sessoes");
    const visualizacaoConversaDetalhada = document.getElementById("visualizacao-conversa-detalhada");
    const logoutBtn = document.getElementById("logout-btn");

    // --- FUNÇÃO DE LOGOUT ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Deseja realmente sair?')) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
                localStorage.removeItem('username');
                localStorage.removeItem('currentChatSessionId');
                window.location.href = '/login.html';
            }
        });
    }

    // --- VARIÁVEIS GLOBAIS E DE ESTADO ---
    const API_URL = "/api/chat";
    let clientHistory = [];
    let currentSessionId = localStorage.getItem("currentChatSessionId") || null;
    const currentUserId = userId;

    // --- FUNÇÃO PARA FAZER REQUISIÇÕES AUTENTICADAS ---
    async function authenticatedFetch(url, options = {}) {
        const token = localStorage.getItem('authToken');
        
        if (!options.headers) {
            options.headers = {};
        }
        
        options.headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(url, options);
        
        // Se token inválido, redireciona para login
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/login.html';
            return null;
        }
        
        return response;
    }

    // --- FUNÇÕES PRINCIPAIS DO CHAT ---
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
            const response = await authenticatedFetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: message, sessionId: currentSessionId }),
            });

            showTypingIndicator(false);

            if (!response || !response.ok) {
                const errorData = await response?.json().catch(() => ({}));
                throw new Error(errorData.error || `Erro do Servidor: ${response?.status}`);
            }

            const data = await response.json();

            if (data.reply) {
                addMessage(data.reply, "bot");
                clientHistory.push({ role: "model", parts: [{ text: data.reply }] });
                currentSessionId = data.sessionId;
                await salvarHistorico(currentSessionId, "Musashi Miyamoto", clientHistory, currentUserId);
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

    // --- FUNÇÕES DE GERENCIAMENTO DE HISTÓRICO ---
    async function carregarHistoricoSessoes() {
        if (!listaSessoes) {
            console.warn("Elemento 'lista-sessoes' não encontrado no DOM.");
            return;
        }

        try {
            const response = await authenticatedFetch(`/api/chat/historicos?userId=${currentUserId}`);
            
            if (!response || !response.ok) {
                throw new Error(`Erro ao carregar histórico: ${response?.statusText}`);
            }
            
            const historicos = await response.json();

            listaSessoes.innerHTML = "";
            
            if (historicos.length === 0) {
                listaSessoes.innerHTML = "<li style='text-align: center; color: #666;'>Nenhuma conversa ainda</li>";
                return;
            }

            historicos.forEach(sessao => {
                const li = document.createElement("li");
                const dataHora = new Date(sessao.startTime).toLocaleString("pt-BR");
                li.innerHTML = `
                    <span>${sessao.titulo || `Conversa de ${dataHora}`}</span>
                    <div>
                        <button class="btn-gerar-titulo" data-id="${sessao._id}" title="Editar Título">✏️</button>
                        <button class="btn-excluir" data-id="${sessao._id}" title="Excluir Conversa">🗑️</button>
                    </div>
                `;
                li.addEventListener("click", (event) => {
                    if (!event.target.closest("button")) {
                        exibirConversaDetalhada(sessao.messages);
                    }
                });
                listaSessoes.appendChild(li);
            });
            
            adicionarListenersAosBotoesDeHistorico();

        } catch (error) {
            console.error("Erro ao carregar histórico de sessões:", error);
            if (listaSessoes) {
                listaSessoes.innerHTML = "<li style='color: #c33;'>Erro ao carregar histórico</li>";
            }
        }
    }

    function adicionarListenersAosBotoesDeHistorico() {
        document.querySelectorAll(".btn-gerar-titulo").forEach(button => {
            button.addEventListener("click", async (event) => {
                event.stopPropagation();
                const sessionId = event.target.dataset.id;
                const liElement = event.target.closest("li");
                await obterESalvarTitulo(sessionId, liElement);
            });
        });

        document.querySelectorAll(".btn-excluir").forEach(button => {
            button.addEventListener("click", async (event) => {
                event.stopPropagation();
                const sessionId = event.target.dataset.id;
                await excluirSessao(sessionId);
            });
        });
    }

    function exibirConversaDetalhada(mensagens) {
        if (!visualizacaoConversaDetalhada) return;
        visualizacaoConversaDetalhada.innerHTML = "";
        mensagens.forEach(msg => {
            const messageDiv = document.createElement("div");
            messageDiv.classList.add("message", `${msg.role === 'model' ? 'bot' : msg.role}-message`);
            messageDiv.innerText = msg.parts[0].text;
            visualizacaoConversaDetalhada.appendChild(messageDiv);
        });
        visualizacaoConversaDetalhada.scrollTop = visualizacaoConversaDetalhada.scrollHeight;
    }

    async function excluirSessao(sessionId) {
        if (confirm("Tem certeza que deseja excluir esta conversa?\nEsta ação não pode ser desfeita.")) {
            try {
                const response = await authenticatedFetch(`/api/chat/historicos/${sessionId}`, { 
                    method: "DELETE" 
                });
                
                if (!response || !response.ok) {
                    const errorData = await response?.json();
                    throw new Error(errorData?.error || "Erro ao excluir conversa.");
                }
                
                alert("Conversa excluída com sucesso!");
                carregarHistoricoSessoes();
            } catch (error) {
                console.error("Erro ao excluir sessão:", error);
                alert(`Erro ao excluir conversa: ${error.message}`);
            }
        }
    }

    async function obterESalvarTitulo(sessionId, liElement) {
        try {
            const responseGerar = await authenticatedFetch(`/api/chat/historicos/${sessionId}/gerar-titulo`, { 
                method: "POST" 
            });
            
            if (!responseGerar || !responseGerar.ok) {
                throw new Error("Erro ao gerar sugestão de título.");
            }
            
            const dataGerar = await responseGerar.json();
            const tituloSugerido = dataGerar.tituloSugerido.replace(/"/g, "").trim();
            const novoTitulo = prompt("Edite ou confirme o título da conversa:", tituloSugerido);

            if (!novoTitulo || novoTitulo.trim() === "") return;

            const responseSalvar = await authenticatedFetch(`/api/chat/historicos/${sessionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ titulo: novoTitulo }),
            });
            
            if (!responseSalvar || !responseSalvar.ok) {
                throw new Error("Erro ao salvar o título.");
            }

            alert("Título atualizado com sucesso!");
            liElement.querySelector("span").textContent = novoTitulo;
        } catch (error) {
            console.error("Erro ao obter e salvar título:", error);
            alert(`Erro na titulação da conversa: ${error.message}`);
        }
    }

    async function salvarHistorico(sessionId, botId, messages, userId) {
        try {
            const response = await authenticatedFetch("/api/chat/salvar-historico", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, botId, messages, userId }),
            });
            
            if (!response || !response.ok) {
                throw new Error("Erro ao salvar histórico no DB.");
            }
            
            console.log("Histórico salvo com sucesso no DB.");
            localStorage.setItem("currentChatSessionId", sessionId);
            carregarHistoricoSessoes();
        } catch (error) {
            console.error("Erro ao salvar histórico:", error);
        }
    }
    
    // --- INICIALIZAÇÃO DA PÁGINA E EVENT LISTENERS ---
    function inicializarPagina() {
        const NOME_DO_BOT = "Musashi Miyamoto";
        const SLOGAN_DO_BOT = "Seu companheiro inteligente para dúvidas e aprendizado!";
        const DESCRICAO_BOT_PARAGRAFO1 = "Musashi Miyamoto é um bot forjado no espírito do lendário guerreiro samurai. Se procuras os grandes ensinamentos do Caminho da Estratégia, basta falar comigo.";
        const DESCRICAO_BOT_PARAGRAFO2 = "Com a lâmina da sabedoria e o escudo da honra, guiarei tua mente e teu espírito pelos caminhos dos Samurais, até que alcances a verdadeira maestria no Caminho da Espada. Este bot utiliza a poderosa API Gemini para fornecer respostas inteligentes e relevantes.";
        const AUTORES = ["Carlos Eduardo"];

        const nomeBotEl = document.getElementById("nome-bot-display");
        const sloganBotEl = document.getElementById("slogan-bot-display");
        const descricaoBotEl = document.getElementById("descricao-bot-display");
        const autoriaList = document.querySelector("#autoria-bot ul");

        if (nomeBotEl) nomeBotEl.textContent = NOME_DO_BOT;
        if (sloganBotEl) sloganBotEl.textContent = SLOGAN_DO_BOT;
        if (descricaoBotEl) {
            descricaoBotEl.innerHTML = `<p>${DESCRICAO_BOT_PARAGRAFO1}</p><p>${DESCRICAO_BOT_PARAGRAFO2}</p>`;
        }
        
        if (autoriaList) {
            autoriaList.innerHTML = "";
            AUTORES.forEach(autor => {
                const li = document.createElement("li");
                li.textContent = autor;
                autoriaList.appendChild(li);
            });
        }

        // Event listeners
        if (sendButton) {
            sendButton.addEventListener("click", sendMessage);
        }
        
        if (userInput) {
            userInput.addEventListener("keypress", (event) => {
                if (event.key === "Enter") sendMessage();
            });
        }

        carregarHistoricoSessoes();
    }

    inicializarPagina();
});
// public/perfil.js
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('custom-instruction-textarea');
    const saveButton = document.getElementById('save-personality-btn');
    const statusMessage = document.getElementById('status-message');

    const token = localStorage.getItem('authToken');

    if (!token) {
        document.body.innerHTML = '<h1>Acesso Negado. <a href="/login.html">Por favor, faça login primeiro.</a></h1>';
        return;
    }

    async function loadUserPreference() {
        try {
            const response = await fetch('/api/user/preferences', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Não foi possível carregar sua configuração.');
            const data = await response.json();
            textarea.value = data.customSystemInstruction;
        } catch (error) {
            showStatus(error.message, 'error');
        }
    }

    async function saveUserPreference() {
        const customInstruction = textarea.value;
        showStatus('Salvando...', 'loading');

        try {
            const response = await fetch('/api/user/preferences', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ customInstruction })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Erro ao salvar.');
            showStatus(result.message, 'success');
        } catch (error) {
            showStatus(error.message, 'error');
        }
    }
    
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
    }

    saveButton.addEventListener('click', saveUserPreference);
    loadUserPreference();
});

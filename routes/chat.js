import express from 'express';
import SessaoChat from '../models/SessaoChat.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

// Middleware de autenticação (opcional para algumas rotas)
const getUserIdIfExists = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            const jwt = await import('jsonwebtoken');
            req.user = { id: jwt.default.verify(token, process.env.JWT_SECRET).userId };
        } catch { 
            req.user = null; 
        }
    }
    next();
};

// Middleware de proteção de rota
const protectRoute = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            const jwt = await import('jsonwebtoken');
            req.user = { id: jwt.default.verify(token, process.env.JWT_SECRET).userId };
            next();
        } catch { 
            res.status(401).json({ message: 'Token inválido.' }); 
        }
    } else { 
        res.status(401).json({ message: 'Acesso negado, token não fornecido.' }); 
    }
};

// --- ROTA: Buscar históricos ---
router.get("/historicos", protectRoute, async (req, res) => {
    try {
        const historicos = await SessaoChat.find({ 
            userId: req.user.id 
        })
        .sort({ startTime: -1 })
        .limit(50)
        .select('sessionId botId titulo startTime messageCount lastUpdate');
        
        res.json(historicos);
    } catch (error) {
        console.error("Erro ao buscar históricos:", error);
        res.status(500).json({ error: "Erro ao buscar históricos." });
    }
});

// --- ROTA: Buscar uma sessão específica ---
router.get("/historicos/:sessionId", protectRoute, async (req, res) => {
    try {
        const sessao = await SessaoChat.findOne({ 
            sessionId: req.params.sessionId,
            userId: req.user.id 
        });
        
        if (!sessao) {
            return res.status(404).json({ error: "Sessão não encontrada." });
        }
        
        res.json(sessao);
    } catch (error) {
        console.error("Erro ao buscar sessão:", error);
        res.status(500).json({ error: "Erro ao buscar sessão." });
    }
});

// --- ROTA: Excluir histórico ---
router.delete("/historicos/:id", protectRoute, async (req, res) => {
    try {
        const resultado = await SessaoChat.findOneAndDelete({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (!resultado) {
            return res.status(404).json({ error: "Histórico não encontrado." });
        }
        
        res.status(200).json({ message: "Histórico excluído com sucesso." });
    } catch (error) {
        console.error("Erro ao excluir histórico:", error);
        res.status(500).json({ error: "Erro ao excluir histórico." });
    }
});

// --- ROTA: Gerar título automático ---
router.post("/historicos/:id/gerar-titulo", protectRoute, async (req, res) => {
    try {
        const sessao = await SessaoChat.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (!sessao) {
            return res.status(404).json({ error: "Sessão não encontrada." });
        }
        
        // Pega as primeiras mensagens para gerar o título
        const primeiras3Mensagens = sessao.messages
            .slice(0, 6)
            .map(m => `${m.role}: ${m.parts[0].text}`)
            .join('\n');
        
        // Usa a API Gemini para gerar título
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `Com base nesta conversa, gere um título curto e descritivo (máximo 50 caracteres):

${primeiras3Mensagens}

Responda APENAS com o título, sem aspas ou formatação adicional.`;
        
        const result = await model.generateContent(prompt);
        const tituloSugerido = result.response.text().trim().replace(/["']/g, '');
        
        res.json({ tituloSugerido });
        
    } catch (error) {
        console.error("Erro ao gerar título:", error);
        res.status(500).json({ error: "Erro ao gerar título." });
    }
});

// --- ROTA: Atualizar título ---
router.put("/historicos/:id", protectRoute, async (req, res) => {
    try {
        const { titulo } = req.body;
        
        if (!titulo || titulo.trim() === '') {
            return res.status(400).json({ error: "Título não pode ser vazio." });
        }
        
        const sessao = await SessaoChat.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { titulo: titulo.trim() },
            { new: true }
        );
        
        if (!sessao) {
            return res.status(404).json({ error: "Sessão não encontrada." });
        }
        
        res.json({ 
            message: "Título atualizado com sucesso.", 
            sessao 
        });
        
    } catch (error) {
        console.error("Erro ao atualizar título:", error);
        res.status(500).json({ error: "Erro ao atualizar título." });
    }
});

// --- ROTA: Salvar histórico ---
router.post("/salvar-historico", protectRoute, async (req, res) => {
    try {
        const { sessionId, botId, messages, userId } = req.body;
        
        // Verifica se o userId do token corresponde ao userId do corpo
        if (req.user.id !== userId) {
            return res.status(403).json({ error: "Não autorizado." });
        }
        
        if (!sessionId || !messages || messages.length === 0) {
            return res.status(400).json({ error: "Dados incompletos." });
        }
        
        // Verifica se já existe uma sessão
        let sessao = await SessaoChat.findOne({ sessionId, userId });
        
        if (sessao) {
            // Atualiza sessão existente
            sessao.messages = messages;
            sessao.lastUpdate = new Date();
            sessao.messageCount = messages.length;
            await sessao.save();
        } else {
            // Cria nova sessão
            sessao = await SessaoChat.create({
                sessionId,
                userId,
                botId: botId || 'Musashi Miyamoto',
                messages,
                messageCount: messages.length
            });
        }
        
        res.json({ 
            message: "Histórico salvo com sucesso.", 
            sessao 
        });
        
    } catch (error) {
        console.error("Erro ao salvar histórico:", error);
        res.status(500).json({ error: "Erro ao salvar histórico." });
    }
});

// --- ROTA: Limpar históricos antigos (opcional - manutenção) ---
router.delete("/historicos/limpar/antigos", protectRoute, async (req, res) => {
    try {
        // Remove conversas com mais de 90 dias
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - 90);
        
        const resultado = await SessaoChat.deleteMany({
            userId: req.user.id,
            lastUpdate: { $lt: dataLimite }
        });
        
        res.json({ 
            message: "Históricos antigos removidos.", 
            removidos: resultado.deletedCount 
        });
        
    } catch (error) {
        console.error("Erro ao limpar históricos:", error);
        res.status(500).json({ error: "Erro ao limpar históricos." });
    }
});

// --- ROTA: Estatísticas do usuário ---
router.get("/estatisticas", protectRoute, async (req, res) => {
    try {
        const totalConversas = await SessaoChat.countDocuments({ 
            userId: req.user.id 
        });
        
        const totalMensagens = await SessaoChat.aggregate([
            { $match: { userId: mongoose.Types.ObjectId(req.user.id) } },
            { $group: { _id: null, total: { $sum: "$messageCount" } } }
        ]);
        
        const conversaMaisRecente = await SessaoChat.findOne({ 
            userId: req.user.id 
        })
        .sort({ lastUpdate: -1 })
        .select('lastUpdate titulo');
        
        res.json({
            totalConversas,
            totalMensagens: totalMensagens[0]?.total || 0,
            ultimaConversa: conversaMaisRecente
        });
        
    } catch (error) {
        console.error("Erro ao buscar estatísticas:", error);
        res.status(500).json({ error: "Erro ao buscar estatísticas." });
    }
});

export default router;

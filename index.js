import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import crypto from 'crypto';
import mongoose from 'mongoose';
import cors from 'cors';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import jwt from 'jsonwebtoken';

// --- Imports dos Modelos e Rotas ---
import SessaoChat from './models/SessaoChat.js';
import User from './models/User.js';
import authRoutes from './routes/auth.js';

// --- Configuração Express ---
const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Configuração da API Gemini ---
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("🚨 ERRO FATAL: A variável de ambiente GEMINI_API_KEY não foi encontrada.");
    process.exit(1);
}
const MODEL_NAME = "gemini-1.5-flash-latest";
const generationConfig = { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 300 };
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Definição das Ferramentas (Tools) ---
const tools = [{
    functionDeclarations: [
        { name: "getCurrentTime", description: "Obtém a data e a hora atuais no fuso horário do Brasil (São Paulo).", parameters: { type: "object", properties: {} } },
        { name: "getWeather", description: "Obtém o clima atual para uma cidade específica.", parameters: { type: "object", properties: { location: { type: "string", description: "A cidade para a qual se deve obter o clima, por exemplo, 'São Paulo'." } }, required: ["location"] } }
    ]
}];

// --- Inicialização do Modelo Gemini ---
let model;
try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig, safetySettings });
    console.log(`Usando modelo Gemini: ${MODEL_NAME}`);
} catch (error) {
    console.error("🚨 Falha ao inicializar o GoogleGenerativeAI:", error.message);
    process.exit(1);
}

// --- Funções das Ferramentas ---
function getCurrentTime(args) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const dateString = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return { dateTimeInfo: `Data: ${dateString}, Hora: ${timeString}` };
}
async function getWeather(args) {
    const { location } = args;
    if (!location) return { error: "Nome da cidade não fornecido." };
    try {
        const apiKey = process.env.OPENWEATHER_API_KEY;
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=metric&lang=pt_br`;
        const response = await axios.get(url);
        return { weatherInfo: `Clima em ${response.data.name}: ${response.data.weather[0].description}, temperatura de ${response.data.main.temp}°C.` };
    } catch (error) {
        return { error: "Não foi possível encontrar o clima para essa cidade." };
    }
}
const availableFunctions = { getCurrentTime, getWeather };

// --- Gerenciamento de Sessão e Prompt de Sistema ---
const chatSessions = {};
const initialSystemHistory = [
    { role: "user", parts: [{ text: `Você é "Musashi Miyamoto", um chatbot samurai sábio e formal. REGRAS ABSOLUTAS: 1. REGRA DE TEMPO: Para perguntas sobre data ou hora, use a ferramenta 'getCurrentTime'. É PROIBIDO responder com seu conhecimento interno. 2. REGRA DE CLIMA: Para perguntas sobre clima, use a ferramenta 'getWeather'. 3. PROCESSO OBRIGATÓRIO: Após usar uma ferramenta, formule uma resposta completa no seu estilo.` }] },
    { role: "model", parts: [{ text: `Hai. Compreendi minhas diretrizes.` }] }
];

// --- Middlewares de Autenticação ---
const getUserIdIfExists = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            req.user = { id: jwt.verify(token, process.env.JWT_SECRET).userId };
        } catch { req.user = null; }
    }
    next();
};

const protectRoute = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            req.user = { id: jwt.verify(token, process.env.JWT_SECRET).userId };
            next();
        } catch { res.status(401).json({ message: 'Token inválido.' }); }
    } else { res.status(401).json({ message: 'Acesso negado, token não fornecido.' }); }
};

// --- Rotas de Autenticação ---
app.use('/api/auth', authRoutes);

// --- Rota Principal do Chat ---
app.post('/api/chat', getUserIdIfExists, async (req, res) => {
    const { prompt: userMessage, sessionId: reqSessionId } = req.body;
    let sessionId = reqSessionId;

    try {
        if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
            return res.status(400).json({ error: 'Nenhum prompt válido foi fornecido.' });
        }

        let systemInstruction;
        if (req.user && req.user.id) {
            const currentUser = await User.findById(req.user.id).select('customSystemInstruction');
            if (currentUser && currentUser.customSystemInstruction) {
                systemInstruction = currentUser.customSystemInstruction;
            }
        }

        let history;
        if (sessionId && chatSessions[sessionId]) {
            history = chatSessions[sessionId];
        } else {
            sessionId = crypto.randomUUID();
            history = systemInstruction
                ? [{ role: "user", parts: [{ text: systemInstruction }] }, { role: "model", parts: [{ text: "Entendido." }] }]
                : JSON.parse(JSON.stringify(initialSystemHistory));
        }
        
        history.push({ role: "user", parts: [{ text: userMessage.trim() }] });

        let finalBotReply = "";
        for (let i = 0; i < 5; i++) {
            const result = await model.generateContent({ contents: history, tools });
            const candidate = result.response.candidates[0];
            const parts = candidate.content.parts;
            const functionCalls = parts.filter(p => p.functionCall);
            const textParts = parts.filter(p => p.text);

            if (functionCalls.length > 0) {
                history.push(candidate.content);
                const functionResponses = await Promise.all(functionCalls.map(async call => {
                    const { name, args } = call.functionCall;
                    const functionResult = await availableFunctions[name](args);
                    return { functionResponse: { name, response: functionResult } };
                }));
                history.push({ role: "model", parts: functionResponses });
            } else if (textParts.length > 0) {
                finalBotReply = textParts.map(p => p.text).join(" ");
                history.push({ role: "model", parts: textParts });
                break;
            } else {
                finalBotReply = "Não consegui formular uma resposta.";
                break;
            }
        }
        
        chatSessions[sessionId] = history;
        res.json({ reply: finalBotReply, sessionId });
    } catch (error) {
        console.error(`[Sessão: ${sessionId || 'indefinida'}] ERRO GERAL:`, error);
        res.status(500).json({ error: 'Uma perturbação inesperada ocorreu.' });
    }
});

// --- Conexão com MongoDB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB conectado!'))
    .catch(err => console.error('Erro de conexão com MongoDB:', err));

// --- Endpoints de Histórico (AGORA PROTEGIDOS) ---
app.get("/api/chat/historicos", protectRoute, async (req, res) => {
    try {
        const historicos = await SessaoChat.find({ userId: req.user.id }).sort({ startTime: -1 }).limit(20);
        res.json(historicos);
    } catch { res.status(500).json({ error: "Erro ao buscar históricos." }); }
});

app.delete("/api/chat/historicos/:id", protectRoute, async (req, res) => {
    try {
        await SessaoChat.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        res.status(200).json({ message: "Histórico excluído." });
    } catch { res.status(500).json({ error: "Erro ao excluir." }); }
});

// ... Adicione aqui suas outras rotas de histórico (`gerar-titulo`, `salvar-historico`) também com `protectRoute`

// --- Inicia o Servidor ---
app.listen(port, () => console.log(`\n🚀 Servidor rodando em http://localhost:${port}\n`));

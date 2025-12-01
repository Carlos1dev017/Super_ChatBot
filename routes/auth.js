import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

// --- ROTA DE REGISTRO ---
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validações básicas
        if (!username || !email || !password) {
            return res.status(400).json({ 
                message: 'Por favor, preencha todos os campos (username, email, password).' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                message: 'A senha deve ter no mínimo 6 caracteres.' 
            });
        }

        // Verifica se o usuário já existe
        const userExists = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (userExists) {
            return res.status(400).json({ 
                message: 'Usuário ou email já cadastrado.' 
            });
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Cria o novo usuário
        const newUser = await User.create({
            username,
            email,
            password: hashedPassword
        });

        // Gera o token JWT
        const token = jwt.sign(
            { userId: newUser._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Usuário criado com sucesso!',
            token,
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email
            }
        });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ 
            message: 'Erro ao criar usuário. Tente novamente.' 
        });
    }
});

// --- ROTA DE LOGIN ---
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validações básicas
        if (!email || !password) {
            return res.status(400).json({ 
                message: 'Por favor, preencha email e senha.' 
            });
        }

        // Busca o usuário pelo email
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ 
                message: 'Email ou senha incorretos.' 
            });
        }

        // Verifica a senha
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ 
                message: 'Email ou senha incorretos.' 
            });
        }

        // Gera o token JWT
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login realizado com sucesso!',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ 
            message: 'Erro ao fazer login. Tente novamente.' 
        });
    }
});

// --- ROTA PARA VERIFICAR TOKEN (OPCIONAL) ---
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Token não fornecido.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        res.json({
            valid: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Erro na verificação:', error);
        res.status(401).json({ 
            valid: false, 
            message: 'Token inválido ou expirado.' 
        });
    }
});


export default router;

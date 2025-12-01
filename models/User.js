// models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Nome de usuário é obrigatório'],
        unique: true,
        trim: true,
        minlength: [3, 'Nome de usuário deve ter no mínimo 3 caracteres'],
        maxlength: [30, 'Nome de usuário deve ter no máximo 30 caracteres'],
        index: true
    },
    email: {
        type: String,
        required: [true, 'Email é obrigatório'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Email inválido'],
        index: true
    },
    password: {
        type: String,
        required: [true, 'Senha é obrigatória'],
        minlength: [6, 'Senha deve ter no mínimo 6 caracteres']
    },
    customSystemInstruction: {
        type: String,
        default: null,
        maxlength: [2000, 'Instrução personalizada deve ter no máximo 2000 caracteres']
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Método para atualizar último login
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};

export default mongoose.model('User', userSchema);

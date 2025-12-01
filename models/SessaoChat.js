import mongoose from 'mongoose';

const sessaoChatSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    botId: {
        type: String,
        required: true,
        default: 'Musashi Miyamoto'
    },
    titulo: {
        type: String,
        default: 'Nova Conversa',
        maxlength: 200
    },
    messages: [{
        role: {
            type: String,
            enum: ['user', 'model'],
            required: true
        },
        parts: [{
            text: {
                type: String,
                required: true
            }
        }],
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    startTime: {
        type: Date,
        default: Date.now
    },
    lastUpdate: {
        type: Date,
        default: Date.now
    },
    messageCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Índices compostos para otimizar queries
sessaoChatSchema.index({ userId: 1, startTime: -1 });
sessaoChatSchema.index({ sessionId: 1, userId: 1 });

// Middleware para atualizar messageCount antes de salvar
sessaoChatSchema.pre('save', function(next) {
    if (this.messages) {
        this.messageCount = this.messages.length;
        this.lastUpdate = new Date();
    }
    next();
});

// Método para adicionar mensagem
sessaoChatSchema.methods.addMessage = function(role, text) {
    this.messages.push({
        role,
        parts: [{ text }],
        timestamp: new Date()
    });
    this.lastUpdate = new Date();
    this.messageCount = this.messages.length;
    return this.save();
};

export default mongoose.model('SessaoChat', sessaoChatSchema);
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // Campo para personalidade customizada
  customSystemInstruction: { 
    type: String, 
    default: null,  // null = usar instrução global do admin
    maxlength: 2000 // Limite de caracteres
  },
  
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);

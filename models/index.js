// ─────────────────────────────────────────────
//  models/index.js — All MongoDB Schemas
// ─────────────────────────────────────────────
const mongoose = require('mongoose')
const { Schema } = mongoose

// ══ USER ══
const userSchema = new Schema({
  name:        { type: String, required: true, trim: true, maxlength: 50 },
  email:       { type: String, required: true, unique: true, lowercase: true },
  password:    { type: String, required: true, minlength: 6 },
  streak:      { type: Number, default: 0 },
  lastCheckIn: { type: Date, default: null },
  moodScore:   { type: Number, default: 0 },   // running average
  totalEntries:{ type: Number, default: 0 },
  safeActions: { type: Number, default: 0 },   // completed safe actions
  createdAt:   { type: Date, default: Date.now }
})

// ══ JOURNAL ENTRY ══
const journalSchema = new Schema({
  userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  timestamp:   { type: Date, default: Date.now, index: true },
  mood:        { type: String, required: true, enum: ['เครียด','กังวล','โกรธ','เหนื่อย','สับสน','หมดไฟ','โอเค','ดีใจ'] },
  intensity:   { type: Number, required: true, min: 1, max: 10 },
  tags:        [{ type: String, enum: ['💼 งาน','💰 เงิน','❤️ ความรัก','👨‍👩‍👧 ครอบครัว','🌱 อนาคต','🏥 สุขภาพ','🤝 เพื่อน'] }],
  text:        { type: String, required: true, maxlength: 500 },
  // AI outputs
  aiReflection:{ type: String, default: '' },
  safeActions: [{ type: String }],
  // Risk assessment
  riskLevel:   { type: String, enum: ['low','medium','high'], default: 'low' },
  riskKeywords:[ String ]
})

// ══ CHAT MESSAGE ══
const chatSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  role:      { type: String, enum: ['user','assistant'], required: true },
  content:   { type: String, required: true, maxlength: 2000 },
  isAlert:   { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
})

// ══ DECISION PAUSE ══
const pauseSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, default: Date.now },
  input:     { type: String, required: true },
  riskLevel: { type: String, enum: ['low','medium','high'], default: 'low' },
  saferAlts: [{ type: String }],
  aiAdvice:  { type: String, default: '' },
  resolved:  { type: Boolean, default: false }
})

module.exports = {
  User:          mongoose.model('User', userSchema),
  JournalEntry:  mongoose.model('JournalEntry', journalSchema),
  ChatMessage:   mongoose.model('ChatMessage', chatSchema),
  DecisionPause: mongoose.model('DecisionPause', pauseSchema)
}

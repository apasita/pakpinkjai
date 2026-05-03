// ─────────────────────────────────────────────
//  Pak Pink Jai — Backend Server
//  Entry point: server.js
// ─────────────────────────────────────────────
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const mongoose = require('mongoose')
const rateLimit = require('express-rate-limit')

const app = express()
const PORT = process.env.PORT || 3001

// ── Security Middleware ──
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}))
app.use(express.json({ limit: '10kb' }))
app.use(morgan('dev'))

// ── Rate Limiting ──
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later.' }
})
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { error: 'AI rate limit reached. Wait 1 minute.' }
})
app.use(globalLimiter)

// ── Routes ──
app.use('/api/auth',      require('./routes/auth'))
app.use('/api/journal',   aiLimiter, require('./routes/journal'))
app.use('/api/chat',      aiLimiter, require('./routes/chat'))
app.use('/api/analytics', require('./routes/analytics'))
app.use('/api/user',      require('./routes/user'))

// ── Health Check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  })
})

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message)
  const status = err.status || 500
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  })
})

// ── Connect DB & Start ──
async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ MongoDB connected')
    app.listen(PORT, () => {
      console.log(`🌿 Pak Pink Jai API running on port ${PORT}`)
      console.log(`   Health: http://localhost:${PORT}/health`)
    })
  } catch (err) {
    console.error('❌ Failed to start:', err.message)
    process.exit(1)
  }
}

start()

// ─────────────────────────────────────────────
//  routes/chat.js
//  POST /api/chat/message   — ส่ง message + รับ AI reply
//  GET  /api/chat/history   — ดึง chat history
//  POST /api/chat/session   — เริ่ม session ใหม่
// ─────────────────────────────────────────────
const router = require('express').Router()
const { v4: uuid } = require('crypto').randomUUID ? { v4: () => require('crypto').randomUUID() } : require('crypto')
const auth   = require('../middleware/auth')
const { ChatMessage } = require('../models')
const { assessRisk, getHighRiskResponse } = require('../services/guardrail')
const { chatReply } = require('../services/ai')

// ─────────────────────────────
//  POST /api/chat/message
// ─────────────────────────────
router.post('/message', auth, async (req, res) => {
  const { message, sessionId } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'No message' })

  const sid = sessionId || require('crypto').randomUUID()

  // 1. Guardrail check
  const risk = assessRisk(message)
  if (risk.level === 'high') {
    // บันทึก flag message
    await ChatMessage.create({
      userId: req.user.id, sessionId: sid,
      role: 'user', content: message, isAlert: true
    })
    const highRiskRes = getHighRiskResponse()
    await ChatMessage.create({
      userId: req.user.id, sessionId: sid,
      role: 'assistant', content: highRiskRes.reply, isAlert: true
    })
    return res.json({ ...highRiskRes, sessionId: sid })
  }

  // 2. ดึง history ของ session นี้ (12 messages ล่าสุด)
  const history = await ChatMessage.find({ userId: req.user.id, sessionId: sid })
    .sort({ timestamp: -1 }).limit(12).select('role content')
  const orderedHistory = history.reverse()

  // 3. เรียก Claude AI
  let reply = 'ขอโทษนะ เกิดข้อผิดพลาดชั่วคราว ลองพิมพ์ใหม่ได้เลย 💙'
  try {
    reply = await chatReply(message, orderedHistory)
  } catch (err) {
    console.error('AI chat error:', err.message)
  }

  // 4. บันทึก user + assistant messages
  await ChatMessage.insertMany([
    { userId: req.user.id, sessionId: sid, role: 'user', content: message },
    { userId: req.user.id, sessionId: sid, role: 'assistant', content: reply }
  ])

  res.json({ reply, sessionId: sid, riskLevel: risk.level })
})

// ─────────────────────────────
//  GET /api/chat/history
// ─────────────────────────────
router.get('/history', auth, async (req, res) => {
  const { sessionId, limit = 30 } = req.query

  const filter = { userId: req.user.id }
  if (sessionId) filter.sessionId = sessionId

  const messages = await ChatMessage.find(filter)
    .sort({ timestamp: -1 })
    .limit(+limit)
    .select('role content isAlert timestamp sessionId')

  res.json({ messages: messages.reverse() })
})

// ─────────────────────────────
//  POST /api/chat/session
// ─────────────────────────────
router.post('/session', auth, (req, res) => {
  res.json({ sessionId: require('crypto').randomUUID() })
})

module.exports = router

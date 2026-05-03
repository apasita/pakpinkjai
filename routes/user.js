// ─────────────────────────────────────────────
//  routes/user.js
//  GET  /api/user/profile         — ดึงข้อมูล user
//  POST /api/user/pause           — Decision Pause
//  POST /api/user/safe-action     — บันทึก safe action สำเร็จ
// ─────────────────────────────────────────────
const router = require('express').Router()
const auth   = require('../middleware/auth')
const { User, DecisionPause } = require('../models')
const { assessRisk, getHighRiskResponse } = require('../services/guardrail')
const { analyzePause } = require('../services/ai')

// GET /api/user/profile
router.get('/profile', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password')
  res.json({ user })
})

// POST /api/user/pause — Decision Pause
router.post('/pause', auth, async (req, res) => {
  const { input } = req.body
  if (!input?.trim()) return res.status(400).json({ error: 'No input' })

  // Guardrail
  const risk = assessRisk(input)
  if (risk.level === 'high') {
    return res.json({ riskAlert: true, ...getHighRiskResponse() })
  }

  // AI analysis
  let aiData = { saferAlts: [], advice: '' }
  try { aiData = await analyzePause(input) } catch {}

  // บันทึก
  const pause = await DecisionPause.create({
    userId: req.user.id, input,
    riskLevel: risk.level,
    saferAlts: aiData.saferAlts,
    aiAdvice: aiData.advice
  })

  res.json({ success: true, pause, ai: aiData, riskAlert: false })
})

// POST /api/user/safe-action — นับ safe action สำเร็จ
router.post('/safe-action', auth, async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { $inc: { safeActions: 1 } })
  res.json({ success: true })
})

module.exports = router

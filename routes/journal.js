// ─────────────────────────────────────────────
//  routes/journal.js
//  POST   /api/journal          — บันทึก entry + รับ AI reflection
//  GET    /api/journal          — ดึงรายการทั้งหมด
//  GET    /api/journal/:id      — ดึง entry เดียว
//  DELETE /api/journal/:id      — ลบ entry
// ─────────────────────────────────────────────
const router = require('express').Router()
const auth   = require('../middleware/auth')
const { JournalEntry, User } = require('../models')
const { assessRisk, getHighRiskResponse } = require('../services/guardrail')
const { generateReflection } = require('../services/ai')

// ── Helper: อัปเดต streak ──
async function updateStreak(userId) {
  const user = await User.findById(userId)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const lastCI = user.lastCheckIn ? new Date(user.lastCheckIn) : null
  if (lastCI) lastCI.setHours(0, 0, 0, 0)

  const isToday = lastCI && lastCI.getTime() === today.getTime()
  const isYesterday = lastCI && (today - lastCI) === 86400000

  if (!isToday) {
    await User.findByIdAndUpdate(userId, {
      streak: isYesterday ? user.streak + 1 : 1,
      lastCheckIn: new Date(),
      $inc: { totalEntries: 1 }
    })
  }
}

// ── Helper: คำนวณ mood score ──
const MOOD_SCORES = {
  'ดีใจ': 95, 'โอเค': 75, 'สับสน': 55, 'กังวล': 45,
  'เหนื่อย': 40, 'เครียด': 35, 'โกรธ': 30, 'หมดไฟ': 25
}

// ─────────────────────────────
//  POST /api/journal
// ─────────────────────────────
router.post('/', auth, async (req, res) => {
  const { mood, intensity, tags, text } = req.body

  if (!mood || !text || text.trim().length < 5) {
    return res.status(400).json({ error: 'ต้องใส่อารมณ์และข้อความ' })
  }

  // 1. Guardrail check
  const risk = assessRisk(text, mood, intensity)
  if (risk.level === 'high') {
    // บันทึก entry แต่ไม่เรียก AI
    await JournalEntry.create({
      userId: req.user.id, mood, intensity: intensity || 5,
      tags: tags || [], text, riskLevel: 'high',
      riskKeywords: risk.keywords, aiReflection: '', safeActions: []
    })
    return res.json({ success: true, riskAlert: true, ...getHighRiskResponse() })
  }

  // 2. เรียก AI สำหรับ reflection
  let aiData = { reflection: '', safeActions: [], insight: '' }
  try {
    aiData = await generateReflection({ mood, intensity, tags, text })
  } catch (err) {
    console.error('AI error:', err.message)
    // fallback — ยังบันทึก entry ได้
    aiData = {
      reflection: 'ขอบคุณที่เล่าให้ฟังนะ 💚 วันนี้รู้สึกอย่างไรก็ไม่เป็นไร ที่นี่ปลอดภัย',
      safeActions: ['หายใจลึกๆ 5 ครั้ง', 'พัก 10 นาที', 'ดื่มน้ำสักแก้ว'],
      insight: 'ที่นี่รับฟังคุณเสมอ 🌿'
    }
  }

  // 3. บันทึกลง DB
  const entry = await JournalEntry.create({
    userId: req.user.id, mood, intensity: intensity || 5,
    tags: tags || [], text,
    aiReflection: aiData.reflection,
    safeActions: aiData.safeActions,
    riskLevel: risk.level
  })

  // 4. อัปเดต streak + mood score
  await updateStreak(req.user.id)
  const moodScore = MOOD_SCORES[mood] || 50
  await User.findByIdAndUpdate(req.user.id, { moodScore })

  res.status(201).json({
    success: true,
    entry,
    ai: aiData,
    riskAlert: false
  })
})

// ─────────────────────────────
//  GET /api/journal
// ─────────────────────────────
router.get('/', auth, async (req, res) => {
  const { limit = 20, skip = 0, mood, tag } = req.query
  const filter = { userId: req.user.id }
  if (mood) filter.mood = mood
  if (tag)  filter.tags = { $in: [tag] }

  const [entries, total] = await Promise.all([
    JournalEntry.find(filter)
      .sort({ timestamp: -1 })
      .limit(+limit).skip(+skip)
      .select('-__v'),
    JournalEntry.countDocuments(filter)
  ])

  res.json({ entries, total, hasMore: skip + entries.length < total })
})

// ─────────────────────────────
//  GET /api/journal/:id
// ─────────────────────────────
router.get('/:id', auth, async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, userId: req.user.id })
  if (!entry) return res.status(404).json({ error: 'Not found' })
  res.json({ entry })
})

// ─────────────────────────────
//  DELETE /api/journal/:id
// ─────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const entry = await JournalEntry.findOneAndDelete({ _id: req.params.id, userId: req.user.id })
  if (!entry) return res.status(404).json({ error: 'Not found' })
  await User.findByIdAndUpdate(req.user.id, { $inc: { totalEntries: -1 } })
  res.json({ success: true })
})

module.exports = router

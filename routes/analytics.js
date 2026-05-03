// ─────────────────────────────────────────────
//  routes/analytics.js
//  GET /api/analytics/weekly   — รายงานสัปดาห์
//  GET /api/analytics/heatmap  — heatmap 30 วัน
//  GET /api/analytics/score    — mood score ปัจจุบัน
// ─────────────────────────────────────────────
const router = require('express').Router()
const auth   = require('../middleware/auth')
const { JournalEntry, User } = require('../models')
const { generateWeeklyInsight } = require('../services/ai')

const MOOD_SCORES = {
  'ดีใจ': 95, 'โอเค': 75, 'สับสน': 55, 'กังวล': 45,
  'เหนื่อย': 40, 'เครียด': 35, 'โกรธ': 30, 'หมดไฟ': 25
}
const MOOD_EMOJI = {
  'เครียด': '😤', 'กังวล': '😰', 'โกรธ': '😠', 'เหนื่อย': '😔',
  'สับสน': '😵', 'หมดไฟ': '🪫', 'โอเค': '😌', 'ดีใจ': '🥰'
}

// ─────────────────────────────
//  GET /api/analytics/weekly
// ─────────────────────────────
router.get('/weekly', auth, async (req, res) => {
  const userId = req.user.id
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [entries, user, prevEntries] = await Promise.all([
    JournalEntry.find({ userId, timestamp: { $gte: weekAgo } })
      .sort({ timestamp: -1 }),
    User.findById(userId).select('streak moodScore totalEntries safeActions'),
    JournalEntry.find({
      userId,
      timestamp: { $gte: new Date(weekAgo - 7 * 24 * 60 * 60 * 1000), $lt: weekAgo }
    })
  ])

  // คำนวณ mood score สัปดาห์นี้
  const weekScore = entries.length
    ? Math.round(entries.reduce((s, e) => s + (MOOD_SCORES[e.mood] || 50), 0) / entries.length)
    : user.moodScore || 0

  // เปรียบเทียบกับสัปดาห์ที่แล้ว
  const prevScore = prevEntries.length
    ? Math.round(prevEntries.reduce((s, e) => s + (MOOD_SCORES[e.mood] || 50), 0) / prevEntries.length)
    : weekScore
  const scoreDiff = weekScore - prevScore
  const scoreTrend = scoreDiff > 0 ? `↑ ดีขึ้น ${scoreDiff}%` : scoreDiff < 0 ? `↓ ลดลง ${Math.abs(scoreDiff)}%` : 'เท่าเดิม'

  // นับ mood frequency
  const moodCount = {}
  entries.forEach(e => { moodCount[e.mood] = (moodCount[e.mood] || 0) + 1 })
  const moodRanking = Object.entries(moodCount)
    .sort((a, b) => b[1] - a[1])
    .map(([mood, count]) => ({ mood, emoji: MOOD_EMOJI[mood], count }))

  // AI Pattern Insight
  let patternInsight = 'เริ่ม check-in เพื่อรับ insight ส่วนตัวนะ 🌱'
  if (entries.length >= 2) {
    try { patternInsight = await generateWeeklyInsight(entries) } catch {}
  }

  res.json({
    period: { from: weekAgo.toISOString(), to: now.toISOString() },
    score: weekScore,
    scoreTrend,
    checkInCount: entries.length,
    streak: user.streak,
    totalEntries: user.totalEntries,
    safeActionsCompleted: user.safeActions || 4,
    moodRanking,
    patternInsight
  })
})

// ─────────────────────────────
//  GET /api/analytics/heatmap
// ─────────────────────────────
router.get('/heatmap', auth, async (req, res) => {
  const userId = req.user.id
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const entries = await JournalEntry.find({ userId, timestamp: { $gte: thirtyDaysAgo } })
    .select('timestamp mood intensity')

  // สร้าง map วันที่ → level (0-3)
  const dayMap = {}
  entries.forEach(e => {
    const day = e.timestamp.toISOString().split('T')[0]
    const score = MOOD_SCORES[e.mood] || 50
    const level = score >= 75 ? 3 : score >= 55 ? 2 : 1
    dayMap[day] = Math.max(dayMap[day] || 0, level)
  })

  // สร้าง array 30 วัน
  const heatmap = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = d.toISOString().split('T')[0]
    heatmap.push({ date: key, level: dayMap[key] || 0 })
  }

  res.json({ heatmap })
})

// ─────────────────────────────
//  GET /api/analytics/score
// ─────────────────────────────
router.get('/score', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('moodScore streak lastCheckIn')
  const latest = await JournalEntry.findOne({ userId: req.user.id }).sort({ timestamp: -1 })
  res.json({
    moodScore: user.moodScore || 0,
    streak: user.streak || 0,
    lastCheckIn: user.lastCheckIn,
    latestMood: latest?.mood || null
  })
})

module.exports = router

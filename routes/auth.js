// ─────────────────────────────────────────────
//  routes/auth.js — Register & Login
// ─────────────────────────────────────────────
const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { body, validationResult } = require('express-validator')
const { User } = require('../models')

function makeToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  )
}

// POST /api/auth/register
router.post('/register', [
  body('name').trim().notEmpty().withMessage('ต้องใส่ชื่อ'),
  body('email').isEmail().withMessage('อีเมลไม่ถูกต้อง'),
  body('password').isLength({ min: 6 }).withMessage('รหัสผ่านต้องมีอย่างน้อย 6 ตัว')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

  const { name, email, password } = req.body

  try {
    const exists = await User.findOne({ email })
    if (exists) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' })

    const hashed = await bcrypt.hash(password, 12)
    const user = await User.create({ name, email, password: hashed })
    const token = makeToken(user)

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, streak: 0 }
    })
  } catch (err) {
    res.status(500).json({ error: 'Register failed: ' + err.message })
  }
})

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

  const { email, password } = req.body

  try {
    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })

    const token = makeToken(user)

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        streak: user.streak,
        moodScore: user.moodScore,
        totalEntries: user.totalEntries
      }
    })
  } catch (err) {
    res.status(500).json({ error: 'Login failed' })
  }
})

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password')
    res.json({ user })
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

module.exports = router

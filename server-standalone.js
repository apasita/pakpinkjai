// ═══════════════════════════════════════════════════════
//  Pak Pink Jai — Standalone Server (Zero Dependencies)
//  รันได้เลย: node server-standalone.js
//  ต้องการแค่: Node.js 18+ และ ANTHROPIC_API_KEY
// ═══════════════════════════════════════════════════════

const http = require('http')
const { URL }  = require('url')
const crypto   = require('crypto')
const fs       = require('fs')
const path     = require('path')

const PORT = process.env.PORT || 3001
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const JWT_SECRET = process.env.JWT_SECRET || 'pakpinkjai-secret-2026'

// ── In-Memory Database (ใช้แทน MongoDB สำหรับ demo) ──
const DB = {
  users:   [],
  journals:[],
  chats:   [],
  pauses:  []
}

// ── Load saved data if exists ──
const DATA_FILE = path.join(__dirname, '.data.json')
try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    Object.assign(DB, saved)
    console.log('📂 Loaded saved data:', Object.entries(DB).map(([k,v])=>`${k}:${v.length}`).join(', '))
  }
} catch {}

// ── Auto-save every 30s ──
setInterval(() => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DB), 'utf8')
}, 30000)

process.on('SIGINT', () => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DB), 'utf8')
  console.log('\n💾 Data saved. Goodbye!')
  process.exit(0)
})

// ────────────────────────────────
//  HELPERS
// ────────────────────────────────
function uid() { return crypto.randomUUID() }

function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, email: user.email, name: user.name, exp: Date.now() + 30*24*3600*1000 })).toString('base64')
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex')
  return payload + '.' + sig
}

function verifyToken(token) {
  try {
    const [payload, sig] = token.split('.')
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex')
    if (sig !== expected) return null
    const data = JSON.parse(Buffer.from(payload, 'base64').toString())
    if (data.exp < Date.now()) return null
    return data
  } catch { return null }
}

function hashPwd(pwd) {
  return crypto.pbkdf2Sync(pwd, JWT_SECRET, 100000, 64, 'sha512').toString('hex')
}

function readBody(req) {
  return new Promise((res, rej) => {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => { try { res(JSON.parse(body || '{}')) } catch { res({}) } })
    req.on('error', rej)
  })
}

function send(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  })
  res.end(body)
}

function getUser(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return verifyToken(token)
}

function timeSince(ts) {
  const s = (Date.now() - new Date(ts)) / 1000
  if (s < 3600) return Math.round(s/60) + ' นาที'
  if (s < 86400) return Math.round(s/3600) + ' ชม.'
  return Math.round(s/86400) + ' วัน'
}

// ────────────────────────────────
//  GUARDRAIL
// ────────────────────────────────
const HIGH_RISK = ['ทำร้ายตัวเอง','ฆ่าตัวตาย','อยากตาย','ไม่อยากอยู่','จบชีวิต','โดดตึก','แขวนคอ','กรีด']
const MED_RISK  = ['หมดหวัง','สิ้นหวัง','ไม่มีทางออก','ทนไม่ไหว','อยากหายไป']

function assessRisk(text='', intensity=5) {
  const t = text.toLowerCase()
  if (HIGH_RISK.some(w=>t.includes(w)) || (intensity>=9 && MED_RISK.some(w=>t.includes(w)))) return 'high'
  if (MED_RISK.some(w=>t.includes(w)) || intensity>=8) return 'medium'
  return 'low'
}

// ────────────────────────────────
//  CLAUDE API
// ────────────────────────────────
async function callClaude(system, userMsg, history=[]) {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your-key-here') {
    return getFallback(userMsg)
  }
  try {
    const messages = [
      ...history.slice(-10).map(h=>({role:h.role,content:h.content})),
      {role:'user', content:userMsg}
    ]
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:500, system, messages })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.content[0].text
  } catch(e) {
    console.error('Claude API error:', e.message)
    return getFallback(userMsg)
  }
}

const COACH_SYSTEM = `คุณเป็น AI โค้ชสุขภาพจิตชื่อ "ปุ้ม" ของแอป Pak Pink Jai
พูดภาษาไทยเป็นกันเอง อบอุ่น ไม่ judgemental สไตล์มูเตลู
ตอบสั้น 2-3 ประโยค มี safe action เล็กๆ เสมอ`

function getFallback(msg='') {
  const m = msg.toLowerCase()
  if(m.includes('เครียด')) return 'ฟังอยู่นะ 💚 เครียดแบบนี้มันหนักมากเลย ลองหายใจลึกๆ 5 ครั้ง แล้วเล่าให้ฟังได้เลยว่าเครียดเรื่องอะไร'
  if(m.includes('หมดไฟ')) return 'หมดไฟไม่ใช่ความผิดพลาดเลย 🕯️ วันนี้โฟกัสแค่ 1 งานที่สำคัญที่สุดพอนะ'
  if(m.includes('ลาออก')) return 'ก่อนตัดสินใจใหญ่ ลองรอ 24 ชั่วโมงก่อนได้ไหม? เดี๋ยวค่อยคิดด้วยกัน 🌿'
  if(m.includes('กังวล')) return 'กังวลแล้วมันหนักมากจริงๆ 💙 ลองเขียนออกมาว่ากังวลเรื่องอะไร แล้วแยกว่าอันไหนควบคุมได้จริง'
  if(m.includes('กำลังใจ')) return 'อยู่นี่นะ 💚 แค่คุณยังพยายามต่อไปก็เก่งมากแล้ว ชวนไปดูสิ่งที่คุณทำได้ดีวันนี้หน่อยได้ไหม?'
  return 'ฟังอยู่นะ 🌿 ขอบคุณที่เล่าให้ฟัง เล่าต่อได้เลย หรืออยากให้ช่วยเรื่องไหนเป็นพิเศษ?'
}

const MOOD_SCORES = { 'ดีใจ':95,'โอเค':75,'สับสน':55,'กังวล':45,'เหนื่อย':40,'เครียด':35,'โกรธ':30,'หมดไฟ':25 }

// ────────────────────────────────
//  ROUTER
// ────────────────────────────────
async function router(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname
  const method = req.method

  // CORS preflight
  if (method === 'OPTIONS') return send(res, 200, {})

  // ── Health ──
  if (pathname === '/health' && method === 'GET') {
    return send(res, 200, { status:'ok', users:DB.users.length, journals:DB.journals.length, timestamp:new Date().toISOString(), ai: ANTHROPIC_API_KEY ? 'connected' : 'demo-mode' })
  }

  // ── Static frontend ──
  if (pathname === '/' || pathname === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8')
    res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' })
    return res.end(html)
  }

  const body = ['POST','PUT'].includes(method) ? await readBody(req) : {}

  // ════ AUTH ════
  if (pathname === '/api/auth/register' && method === 'POST') {
    const { name, email, password } = body
    if (!name || !email || !password) return send(res, 400, { error:'กรอกข้อมูลให้ครบ' })
    if (DB.users.find(u=>u.email===email)) return send(res, 409, { error:'อีเมลนี้ถูกใช้แล้ว' })
    const user = { id:uid(), name, email, password:hashPwd(password), streak:0, moodScore:0, totalEntries:0, safeActions:0, lastCheckIn:null, createdAt:new Date().toISOString() }
    DB.users.push(user)
    const token = makeToken(user)
    return send(res, 201, { token, user:{ id:user.id, name, email, streak:0, moodScore:0 } })
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const { email, password } = body
    const user = DB.users.find(u=>u.email===email)
    if (!user || user.password !== hashPwd(password)) return send(res, 401, { error:'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    const token = makeToken(user)
    return send(res, 200, { token, user:{ id:user.id, name:user.name, email, streak:user.streak, moodScore:user.moodScore, totalEntries:user.totalEntries } })
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const me = getUser(req)
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const user = DB.users.find(u=>u.id===me.id)
    if (!user) return send(res, 404, { error:'User not found' })
    const { password:_, ...safe } = user
    return send(res, 200, { user:safe })
  }

  // All routes below need auth
  const me = getUser(req)

  // ════ JOURNAL ════
  if (pathname === '/api/journal' && method === 'POST') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const { mood, intensity=5, tags=[], text } = body
    if (!mood || !text) return send(res, 400, { error:'ต้องใส่อารมณ์และข้อความ' })

    const risk = assessRisk(text, intensity)
    if (risk === 'high') {
      return send(res, 200, { success:true, riskAlert:true, reply:'ฉันเป็นห่วงคุณมากเลยนะ 💚 กรุณาโทร 1323 ได้เลย มีผู้เชี่ยวชาญรับสายตลอด 24 ชม.', showHotline:true })
    }

    // Call AI
    const prompt = `ผู้ใช้บันทึกความรู้สึก:\n- อารมณ์: ${mood} ระดับ ${intensity}/10\n- เรื่อง: ${tags.join(', ')||'ทั่วไป'}\n- ข้อความ: "${text}"\n\nให้ตอบเป็น JSON เท่านั้น: {"reflection":"...","safeActions":["...","...","..."],"insight":"..."}`
    const aiRaw = await callClaude(COACH_SYSTEM+'\nตอบเป็น JSON เท่านั้น ห้ามมี text อื่น', prompt)
    let ai = { reflection:'', safeActions:[], insight:'' }
    try { ai = JSON.parse(aiRaw) } catch { ai.reflection = aiRaw; ai.safeActions = ['หายใจลึกๆ 5 ครั้ง','พัก 10 นาที','ดื่มน้ำสักแก้ว']; ai.insight='วันนี้ให้ใจตัวเองพัก 🌿' }

    const entry = { id:uid(), userId:me.id, mood, intensity, tags, text, aiReflection:ai.reflection, safeActions:ai.safeActions, riskLevel:risk, timestamp:new Date().toISOString() }
    DB.journals.push(entry)

    // Update user streak
    const user = DB.users.find(u=>u.id===me.id)
    if (user) {
      const today = new Date().toDateString()
      const lastCI = user.lastCheckIn ? new Date(user.lastCheckIn).toDateString() : null
      const yesterday = new Date(Date.now()-864e5).toDateString()
      if (lastCI !== today) {
        user.streak = lastCI === yesterday ? user.streak+1 : 1
        user.lastCheckIn = new Date().toISOString()
        user.totalEntries = (user.totalEntries||0)+1
        user.moodScore = MOOD_SCORES[mood] || 50
      }
    }
    return send(res, 201, { success:true, entry, ai, riskAlert:false })
  }

  if (pathname === '/api/journal' && method === 'GET') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const limit = parseInt(url.searchParams.get('limit')||'20')
    const skip  = parseInt(url.searchParams.get('skip')||'0')
    const entries = DB.journals.filter(j=>j.userId===me.id).reverse().slice(skip, skip+limit)
    return send(res, 200, { entries, total:DB.journals.filter(j=>j.userId===me.id).length })
  }

  if (pathname.startsWith('/api/journal/') && method === 'DELETE') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const id = pathname.split('/').pop()
    const idx = DB.journals.findIndex(j=>j.id===id && j.userId===me.id)
    if (idx===-1) return send(res, 404, { error:'Not found' })
    DB.journals.splice(idx, 1)
    return send(res, 200, { success:true })
  }

  // ════ CHAT ════
  if (pathname === '/api/chat/message' && method === 'POST') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const { message, sessionId } = body
    if (!message) return send(res, 400, { error:'No message' })
    const sid = sessionId || uid()

    const risk = assessRisk(message)
    if (risk === 'high') {
      DB.chats.push({ userId:me.id, sessionId:sid, role:'user', content:message, isAlert:true, timestamp:new Date().toISOString() })
      return send(res, 200, { reply:'ฉันเป็นห่วงคุณมากเลยนะ 💚 กรุณาโทร 1323 ได้เลย', sessionId:sid, showHotline:true })
    }

    const history = DB.chats.filter(c=>c.userId===me.id && c.sessionId===sid).slice(-12)
    const reply = await callClaude(COACH_SYSTEM, message, history)

    DB.chats.push({ userId:me.id, sessionId:sid, role:'user', content:message, timestamp:new Date().toISOString() })
    DB.chats.push({ userId:me.id, sessionId:sid, role:'assistant', content:reply, timestamp:new Date().toISOString() })
    return send(res, 200, { reply, sessionId:sid, riskLevel:risk })
  }

  if (pathname === '/api/chat/history' && method === 'GET') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const sid = url.searchParams.get('sessionId')
    const limit = parseInt(url.searchParams.get('limit')||'30')
    let msgs = DB.chats.filter(c=>c.userId===me.id)
    if (sid) msgs = msgs.filter(c=>c.sessionId===sid)
    return send(res, 200, { messages:msgs.slice(-limit) })
  }

  if (pathname === '/api/chat/session' && method === 'POST') {
    return send(res, 200, { sessionId:uid() })
  }

  // ════ ANALYTICS ════
  if (pathname === '/api/analytics/weekly' && method === 'GET') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const user = DB.users.find(u=>u.id===me.id)
    const weekAgo = Date.now() - 7*864e5
    const entries = DB.journals.filter(j=>j.userId===me.id && new Date(j.timestamp)>=weekAgo)
    const prevEntries = DB.journals.filter(j=>j.userId===me.id && new Date(j.timestamp)>=weekAgo-7*864e5 && new Date(j.timestamp)<weekAgo)

    const score = entries.length ? Math.round(entries.reduce((s,e)=>s+(MOOD_SCORES[e.mood]||50),0)/entries.length) : (user?.moodScore||0)
    const prevScore = prevEntries.length ? Math.round(prevEntries.reduce((s,e)=>s+(MOOD_SCORES[e.mood]||50),0)/prevEntries.length) : score
    const diff = score - prevScore
    const scoreTrend = diff>0?`↑ ดีขึ้น ${diff}%`:diff<0?`↓ ลดลง ${Math.abs(diff)}%`:'เท่าเดิม'

    const moodCount = {}
    entries.forEach(e=>{ moodCount[e.mood]=(moodCount[e.mood]||0)+1 })
    const MOOD_EMOJI = { 'เครียด':'😤','กังวล':'😰','โกรธ':'😠','เหนื่อย':'😔','สับสน':'😵','หมดไฟ':'🪫','โอเค':'😌','ดีใจ':'🥰' }
    const moodRanking = Object.entries(moodCount).sort((a,b)=>b[1]-a[1]).map(([mood,count])=>({ mood, emoji:MOOD_EMOJI[mood]||'😊', count }))

    let patternInsight = 'เริ่ม check-in เพื่อรับ insight ส่วนตัวนะ 🌱'
    if (entries.length>=2) {
      const summary = entries.map(e=>`${e.mood}(${e.tags?.join(',')||''}) intensity:${e.intensity}`).join(', ')
      patternInsight = await callClaude(COACH_SYSTEM, `วิเคราะห์อารมณ์สั้นๆ 2 ประโยค: ${summary}`)
    }

    return send(res, 200, { score, scoreTrend, checkInCount:entries.length, streak:user?.streak||0, totalEntries:user?.totalEntries||0, safeActionsCompleted:user?.safeActions||0, moodRanking, patternInsight })
  }

  if (pathname === '/api/analytics/heatmap' && method === 'GET') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const dayMap = {}
    DB.journals.filter(j=>j.userId===me.id && new Date(j.timestamp)>=Date.now()-30*864e5).forEach(e=>{
      const day = e.timestamp.split('T')[0]
      const score = MOOD_SCORES[e.mood]||50
      const level = score>=75?3:score>=55?2:1
      dayMap[day] = Math.max(dayMap[day]||0, level)
    })
    const heatmap = []
    for(let i=29;i>=0;i--) {
      const d = new Date(Date.now()-i*864e5)
      const key = d.toISOString().split('T')[0]
      heatmap.push({ date:key, level:dayMap[key]||0 })
    }
    return send(res, 200, { heatmap })
  }

  if (pathname === '/api/analytics/score' && method === 'GET') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const user = DB.users.find(u=>u.id===me.id)
    const latest = DB.journals.filter(j=>j.userId===me.id).at(-1)
    return send(res, 200, { moodScore:user?.moodScore||0, streak:user?.streak||0, lastCheckIn:user?.lastCheckIn, latestMood:latest?.mood||null })
  }

  // ════ USER ════
  if (pathname === '/api/user/profile' && method === 'GET') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const user = DB.users.find(u=>u.id===me.id)
    const { password:_, ...safe } = user||{}
    return send(res, 200, { user:safe })
  }

  if (pathname === '/api/user/pause' && method === 'POST') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const { input } = body
    if (!input) return send(res, 400, { error:'No input' })
    const risk = assessRisk(input)
    if (risk === 'high') return send(res, 200, { riskAlert:true, reply:'กรุณาโทร 1323', showHotline:true })

    const aiRaw = await callClaude(COACH_SYSTEM+'\nตอบเป็น JSON: {"saferAlts":["...","...","..."],"advice":"..."}', `ผู้ใช้อยากจะ: "${input}" แนะนำทางเลือกปลอดภัยกว่า`)
    let ai = { saferAlts:['รอ 24 ชม.','เขียน pros/cons','คุยกับคนที่ไว้ใจ'], advice:'ลองหยุดคิดก่อนนะ 🌿' }
    try { ai = JSON.parse(aiRaw) } catch {}

    DB.pauses.push({ id:uid(), userId:me.id, input, riskLevel:risk, ...ai, timestamp:new Date().toISOString() })
    return send(res, 200, { success:true, ai, riskAlert:false })
  }

  if (pathname === '/api/user/safe-action' && method === 'POST') {
    if (!me) return send(res, 401, { error:'Unauthorized' })
    const user = DB.users.find(u=>u.id===me.id)
    if (user) user.safeActions = (user.safeActions||0)+1
    return send(res, 200, { success:true })
  }

  // 404
  send(res, 404, { error:'Route not found: '+pathname })
}

// ────────────────────────────────
//  START SERVER
// ────────────────────────────────
const server = http.createServer(async (req, res) => {
  try { await router(req, res) }
  catch(e) { console.error('Server error:', e.message); send(res, 500, { error:e.message }) }
})

server.listen(PORT, () => {
  console.log('')
  console.log('  🌿 Pak Pink Jai Server')
  console.log('  ─────────────────────────────────────')
  console.log(`  🚀 API:      http://localhost:${PORT}`)
  console.log(`  🌐 Frontend: http://localhost:${PORT}/`)
  console.log(`  💚 Health:   http://localhost:${PORT}/health`)
  console.log(`  🤖 AI Mode:  ${ANTHROPIC_API_KEY ? 'Claude API ✅' : 'Demo fallback (ใส่ ANTHROPIC_API_KEY เพื่อใช้ AI จริง)'}`)
  console.log('  ─────────────────────────────────────')
  console.log('  กด Ctrl+C เพื่อหยุด (data จะถูก save อัตโนมัติ)')
  console.log('')
})

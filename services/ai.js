// ─────────────────────────────────────────────
//  services/ai.js — Anthropic Claude Integration
// ─────────────────────────────────────────────
const Anthropic = require('@anthropic-ai/sdk')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const COACH_SYSTEM = `คุณเป็น AI โค้ชสุขภาพจิตชื่อ "ปุ้ม" ของแอป Pak Pink Jai
สำหรับคนทำงานไทยอายุ 20-40 ปี

สไตล์การตอบ:
- พูดภาษาไทยเป็นกันเอง อบอุ่น ไม่ judgemental
- ตอบสั้น 2-4 ประโยค อ่านง่าย
- ไม่ฟันธงอนาคต ไม่ทำนาย
- มี safe action เล็กๆ ที่ทำได้จริงเสมอ
- ถ้ามีคำเสี่ยง ให้ mention สาย 1323 ทันที
- สไตล์มูเตลู: ให้กำลังใจแบบนุ่มนวล ไม่กดดัน`

/**
 * สร้าง Reflection + Safe Actions จาก journal entry
 */
async function generateReflection({ mood, intensity, tags, text }) {
  const prompt = `ผู้ใช้บันทึกความรู้สึก:
- อารมณ์: ${mood} ระดับ ${intensity}/10
- เรื่องที่เกี่ยวข้อง: ${tags.join(', ') || 'ทั่วไป'}
- ข้อความ: "${text}"

ให้ตอบเป็น JSON เท่านั้น รูปแบบ:
{
  "reflection": "ข้อความ reflection สั้น 2-3 ประโยค สไตล์มูเตลู",
  "safeActions": ["action 1", "action 2", "action 3"],
  "insight": "ประโยคสั้นๆ สำหรับหน้าแรก"
}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    system: COACH_SYSTEM + '\nตอบเป็น JSON เท่านั้น ห้ามมี text อื่น',
    messages: [{ role: 'user', content: prompt }]
  })

  try {
    return JSON.parse(response.content[0].text)
  } catch {
    // fallback ถ้า parse ไม่ได้
    return {
      reflection: response.content[0].text,
      safeActions: ['หายใจลึกๆ 5 ครั้ง', 'พัก 10 นาที', 'ดื่มน้ำสักแก้ว'],
      insight: 'วันนี้ให้ใจตัวเองพักบ้างนะ 🌿'
    }
  }
}

/**
 * ตอบ chat message
 */
async function chatReply(userMessage, history = []) {
  const messages = [
    ...history.slice(-12).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ]

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: COACH_SYSTEM,
    messages
  })

  return response.content[0].text
}

/**
 * วิเคราะห์ Decision Pause
 */
async function analyzePause(input) {
  const prompt = `ผู้ใช้กำลังจะตัดสินใจ: "${input}"

ช่วยวิเคราะห์และให้:
1. ทางเลือกที่ปลอดภัยกว่า 3 ข้อ
2. คำแนะนำสั้นๆ

ตอบเป็น JSON:
{
  "saferAlts": ["alt 1", "alt 2", "alt 3"],
  "advice": "คำแนะนำ 2 ประโยค"
}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 250,
    system: COACH_SYSTEM + '\nตอบเป็น JSON เท่านั้น',
    messages: [{ role: 'user', content: prompt }]
  })

  try {
    return JSON.parse(response.content[0].text)
  } catch {
    return {
      saferAlts: ['รอ 24 ชั่วโมงก่อน', 'คุยกับคนที่ไว้ใจ', 'เขียน pros/cons'],
      advice: 'ลองหยุดคิดก่อนนะ การรอไม่เคยทำให้เสียหาย 🌿'
    }
  }
}

/**
 * สร้าง Weekly Pattern Insight
 */
async function generateWeeklyInsight(entries) {
  if (!entries.length) return 'เริ่ม check-in เพื่อรับ insight ส่วนตัวนะ 🌱'

  const summary = entries.map(e =>
    `${e.mood} (${e.tags.join(',')}) intensity:${e.intensity}`
  ).join('\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: COACH_SYSTEM,
    messages: [{
      role: 'user',
      content: `วิเคราะห์อารมณ์สัปดาห์ที่ผ่านมาและให้ insight สั้นๆ 2 ประโยค:\n${summary}`
    }]
  })

  return response.content[0].text
}

module.exports = { generateReflection, chatReply, analyzePause, generateWeeklyInsight }

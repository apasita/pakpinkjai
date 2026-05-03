// ─────────────────────────────────────────────
//  services/guardrail.js
//  ตรวจจับคำเสี่ยง / ความเสี่ยงสูง
// ─────────────────────────────────────────────

// คำที่บ่งบอกความเสี่ยงสูง → ต้องส่งสาย 1323
const HIGH_RISK_KEYWORDS = [
  'ทำร้ายตัวเอง','ฆ่าตัวตาย','อยากตาย','ไม่อยากอยู่',
  'จบชีวิต','สิ้นชีวิต','เลือด','กินยาตาย','โดดตึก',
  'แขวนคอ','ผูกคอ','กรีด','ตัดข้อมือ'
]

// คำที่บ่งบอกความเสี่ยงปานกลาง → ใช้ supportive mode
const MEDIUM_RISK_KEYWORDS = [
  'หมดหวัง','สิ้นหวัง','ไม่มีทางออก','ทนไม่ไหวแล้ว',
  'เหนื่อยมากๆ','อยากหายไป','ไม่มีใครเข้าใจ',
  'โดดเดี่ยวมาก','ทุกข์ทรมาน'
]

/**
 * ประเมินระดับความเสี่ยงจากข้อความ + อารมณ์ + ความหนัก
 * @returns {{ level: 'low'|'medium'|'high', keywords: string[], message: string }}
 */
function assessRisk(text = '', mood = '', intensity = 5) {
  const combined = (text + ' ' + mood).toLowerCase()
  const foundHigh = HIGH_RISK_KEYWORDS.filter(k => combined.includes(k))
  const foundMed  = MEDIUM_RISK_KEYWORDS.filter(k => combined.includes(k))

  if (foundHigh.length > 0 || (intensity >= 9 && foundMed.length > 0)) {
    return {
      level: 'high',
      keywords: foundHigh,
      message: '🚨 ตรวจพบความเสี่ยงสูง — กรุณาติดต่อสายด่วนสุขภาพจิต 1323 ได้ทันที ตลอด 24 ชั่วโมง'
    }
  }

  if (foundMed.length > 0 || intensity >= 8) {
    return {
      level: 'medium',
      keywords: foundMed,
      message: 'ฉันได้ยินคุณนะ 💚 ตอนนี้รู้สึกหนักมากเลย ลองเล่าให้ฟังต่อได้เลย'
    }
  }

  return { level: 'low', keywords: [], message: '' }
}

/**
 * ข้อความ AI สำหรับกรณีเสี่ยงสูง
 */
function getHighRiskResponse() {
  return {
    reply: `ฉันเป็นห่วงคุณมากเลยนะ 💚

สิ่งที่คุณรู้สึกอยู่ตอนนี้มันหนักมาก และคุณไม่ต้องเผชิญกับมันคนเดียวนะ

กรุณาโทรหา **สายด่วนสุขภาพจิต 1323** ได้เลย มีผู้เชี่ยวชาญพร้อมรับสายตลอด 24 ชั่วโมง ไม่มีค่าใช้จ่าย

คุณมีคุณค่านะ 💚`,
    showHotline: true,
    hotlineNumber: '1323'
  }
}

module.exports = { assessRisk, getHighRiskResponse }

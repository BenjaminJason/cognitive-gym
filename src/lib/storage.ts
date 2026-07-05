import { get, set } from 'idb-keyval'

/* ---------------- types ---------------- */
export interface NBackSession {
  ts: number            // 结束时间戳
  n: number             // 本场 N
  trials: number
  visAcc: number        // 位置通道正确率 0-1
  audAcc: number        // 声音通道正确率 0-1
  acc: number           // 双通道平均
  visHits: number; visFA: number   // 命中 / 误报
  audHits: number; audFA: number
  meanRT: number        // 平均反应时 ms（命中的）
  durationSec: number
  nextN: number         // 自适应后的下一场 N
  note?: string         // 认知日志备注
}

export interface Settings {
  interval: number      // 刺激间隔 ms
  strict: boolean       // 严格模式：场内不显示对错
  audioSet: 'en' | 'zh' // 字母 or 中文数字
  startN: number        // 下一场使用的 N（自适应更新）
}

export const DEFAULT_SETTINGS: Settings = { interval: 3000, strict: false, audioSet: 'en', startN: 2 }

/* ---------------- persistence ---------------- */
const K_SESSIONS = 'nback_sessions'
const K_SETTINGS = 'settings'

export async function loadSessions(): Promise<NBackSession[]> {
  return (await get(K_SESSIONS)) ?? []
}
export async function saveSession(s: NBackSession) {
  const all = await loadSessions()
  all.push(s)
  await set(K_SESSIONS, all)
}
export async function updateLastNote(note: string) {
  if (!note.trim()) return
  const all = await loadSessions()
  if (!all.length) return
  all[all.length - 1].note = note.trim()
  await set(K_SESSIONS, all)
}
export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await get(K_SETTINGS)) ?? {}) }
}
export async function saveSettings(s: Settings) {
  await set(K_SETTINGS, s)
}

/* ---------------- export / import ---------------- */
export async function exportJSON(): Promise<string> {
  const data = { version: 1, exportedAt: new Date().toISOString(), sessions: await loadSessions(), settings: await loadSettings() }
  return JSON.stringify(data, null, 2)
}
export async function importJSON(text: string): Promise<number> {
  const data = JSON.parse(text)
  if (!Array.isArray(data.sessions)) throw new Error('无效备份文件')
  await set(K_SESSIONS, data.sessions)
  if (data.settings) await set(K_SETTINGS, data.settings)
  return data.sessions.length
}

/* ---------------- derived stats ---------------- */
export function dayKey(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeStats(sessions: NBackSession[]) {
  const byDay = new Map<string, NBackSession[]>()
  for (const s of sessions) {
    const k = dayKey(s.ts)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(s)
  }
  // 连续打卡
  let streak = 0
  const today = new Date()
  for (let i = 0; ; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const k = dayKey(d.getTime())
    if (byDay.has(k)) streak++
    else if (i === 0) continue // 今天还没练不打断昨天开始的连击
    else break
  }
  const todayKey = dayKey(Date.now())
  const todays = byDay.get(todayKey) ?? []
  const todayMin = todays.reduce((a, s) => a + s.durationSec, 0) / 60
  // 最近14天曲线
  const days: { day: string; maxN: number; avgN: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const k = dayKey(d.getTime())
    const ss = byDay.get(k) ?? []
    days.push({
      day: k.slice(5),
      maxN: ss.length ? Math.max(...ss.map(s => s.n)) : 0,
      avgN: ss.length ? ss.reduce((a, s) => a + s.n, 0) / ss.length : 0,
    })
  }
  return { streak, todaySessions: todays.length, todayMin, days, total: sessions.length }
}

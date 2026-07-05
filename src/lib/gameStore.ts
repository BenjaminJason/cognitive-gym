import { get, set } from 'idb-keyval'
import type { Color } from './go'

/* ---------------- 围棋 ---------------- */
export interface GoGame {
  ts: number
  level: number          // AI 强度 1-5
  playerColor: Color
  moves: { pos: number; color: Color }[]
  result: string         // 'B+5' / 'W+2.5' / 'B+R'
  playerWon: boolean
  sgf: string
  durationSec: number
}

/** 段位:数值 18..1 = 18级..1级,0 = 1段 */
export interface GoRank { rank: number; lossStreak: number; wins: number; losses: number }

const K_GAMES = 'go_games', K_RANK = 'go_rank'

export async function loadGames(): Promise<GoGame[]> { return (await get(K_GAMES)) ?? [] }
export async function saveGame(g: GoGame) {
  const all = await loadGames(); all.push(g); await set(K_GAMES, all)
}
export async function loadRank(): Promise<GoRank> {
  return (await get(K_RANK)) ?? { rank: 18, lossStreak: 0, wins: 0, losses: 0 }
}
export async function updateRank(won: boolean): Promise<GoRank> {
  const r = await loadRank()
  if (won) { r.wins++; r.lossStreak = 0; r.rank = Math.max(0, r.rank - 1) }
  else {
    r.losses++; r.lossStreak++
    if (r.lossStreak >= 3) { r.rank = Math.min(18, r.rank + 1); r.lossStreak = 0 }
  }
  await set(K_RANK, r)
  return r
}
export function rankName(rank: number) { return rank === 0 ? '1段' : `${rank}级` }
/** 按段位推荐 AI 强度 */
export function suggestLevel(rank: number): number {
  if (rank >= 15) return 1
  if (rank >= 11) return 2
  if (rank >= 7) return 3
  if (rank >= 3) return 4
  return 5
}

/* ---------------- 死活题进度 ---------------- */
const K_SOLVED = 'go_solved'
export async function loadSolved(): Promise<string[]> { return (await get(K_SOLVED)) ?? [] }
export async function markSolved(id: string) {
  const s = await loadSolved()
  if (!s.includes(id)) { s.push(id); await set(K_SOLVED, s) }
}

/* ---------------- 费米 ---------------- */
export interface FermiAttempt {
  ts: number
  qid: string
  cat: string
  estimate: number
  answer: number
  logDiff: number        // |log10(est/ans)|
  verdict: '优秀' | '合格' | '重做'
}
const K_FERMI = 'fermi_attempts'
export async function loadFermi(): Promise<FermiAttempt[]> { return (await get(K_FERMI)) ?? [] }
export async function saveFermi(a: FermiAttempt) {
  const all = await loadFermi(); all.push(a); await set(K_FERMI, all)
}

/* ---------------- AI 设置(可降级) ---------------- */
export interface AIConfig { apiKey: string; model: string }
const K_AI = 'ai_config'
export async function loadAI(): Promise<AIConfig> {
  return (await get(K_AI)) ?? { apiKey: '', model: 'claude-sonnet-5' }
}
export async function saveAI(c: AIConfig) { await set(K_AI, c) }

export async function askClaude(system: string, user: string): Promise<string> {
  const cfg = await loadAI()
  if (!cfg.apiKey) throw new Error('未配置 API Key(设置页可填),此功能已降级')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model, max_tokens: 500, system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text ?? '(无回复)'
}

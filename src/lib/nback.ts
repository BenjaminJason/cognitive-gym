/* 双重 N-back 序列生成与判分（Jaeggi 2008 协议） */

export interface Trial {
  pos: number      // 0-8 九宫格位置
  aud: number      // 音频索引 0-7(en) / 0-8(zh)
  visMatch: boolean // 与 N 步前位置相同
  audMatch: boolean
}

/** 生成 20+N 回合序列，每通道约 6 次匹配（部分重叠），其余随机 */
export function genSequence(n: number, audCount: number): Trial[] {
  const len = 20 + n
  const pos: number[] = []
  const aud: number[] = []
  for (let i = 0; i < len; i++) {
    pos.push(Math.floor(Math.random() * 9))
    aud.push(Math.floor(Math.random() * audCount))
  }
  // 强制植入匹配：从可选下标(≥n)里抽 6 个设为匹配
  const plant = (arr: number[], count: number) => {
    const idxs = shuffle(range(n, len))
    let planted = 0
    for (const i of idxs) {
      if (planted >= count) break
      arr[i] = arr[i - n]
      planted++
    }
  }
  plant(pos, 6)
  plant(aud, 6)
  // 避免"过多的偶然匹配"让难度漂移：不强改，只统计真实匹配
  return range(0, len).map(i => ({
    pos: pos[i],
    aud: aud[i],
    visMatch: i >= n && pos[i] === pos[i - n],
    audMatch: i >= n && aud[i] === aud[i - n],
  }))
}

export interface ChannelResult { hits: number; misses: number; fa: number; cr: number; acc: number }

/** 通道判分：可判定回合 = i>=n 的回合。acc = (hit+cr)/可判定回合 */
export function scoreChannel(trials: Trial[], pressed: boolean[], isMatch: (t: Trial) => boolean, n: number): ChannelResult {
  let hits = 0, misses = 0, fa = 0, cr = 0
  trials.forEach((t, i) => {
    if (i < n) return
    const m = isMatch(t), p = pressed[i]
    if (m && p) hits++
    else if (m && !p) misses++
    else if (!m && p) fa++
    else cr++
  })
  const total = hits + misses + fa + cr
  return { hits, misses, fa, cr, acc: total ? (hits + cr) / total : 0 }
}

/** Jaeggi 自适应：≥80% 升 N，<50% 降 N（最低 1） */
export function nextN(n: number, acc: number): number {
  if (acc >= 0.8) return n + 1
  if (acc < 0.5) return Math.max(1, n - 1)
  return n
}

export const EN_LETTERS = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T']
export const ZH_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

function range(a: number, b: number) { return Array.from({ length: b - a }, (_, i) => a + i) }
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

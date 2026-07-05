/* 9路围棋规则引擎 · 中国规则(数子法) · 贴3.25子(=6.5点面积差) */

export const SIZE = 9
export const EMPTY = 0, BLACK = 1, WHITE = 2
export type Color = 1 | 2
export type Board = number[]

export const idx = (x: number, y: number) => y * SIZE + x
export const xy = (i: number) => [i % SIZE, Math.floor(i / SIZE)] as const
export const opp = (c: Color): Color => (c === BLACK ? WHITE : BLACK)

export function emptyBoard(): Board { return new Array(SIZE * SIZE).fill(EMPTY) }

export function neighbors(i: number): number[] {
  const [x, y] = xy(i); const r: number[] = []
  if (x > 0) r.push(i - 1)
  if (x < SIZE - 1) r.push(i + 1)
  if (y > 0) r.push(i - SIZE)
  if (y < SIZE - 1) r.push(i + SIZE)
  return r
}

/** 找 i 所在棋串,返回 {stones, libs} */
export function group(board: Board, i: number): { stones: number[]; libs: number } {
  const color = board[i]
  const seen = new Set<number>([i])
  const stack = [i]
  const libSet = new Set<number>()
  while (stack.length) {
    const p = stack.pop()!
    for (const n of neighbors(p)) {
      if (board[n] === EMPTY) libSet.add(n)
      else if (board[n] === color && !seen.has(n)) { seen.add(n); stack.push(n) }
    }
  }
  return { stones: [...seen], libs: libSet.size }
}

export interface PlayResult { board: Board; captured: number; ko: number }

/** 落子。非法返回 null。ko: 劫点(-1 无) */
export function play(board: Board, pos: number, color: Color, ko: number): PlayResult | null {
  if (pos === ko) return null
  if (board[pos] !== EMPTY) return null
  const b = board.slice()
  b[pos] = color
  let captured = 0
  let capturedPos = -1
  for (const n of neighbors(pos)) {
    if (b[n] === opp(color)) {
      const g = group(b, n)
      if (g.libs === 0) {
        captured += g.stones.length
        capturedPos = g.stones[0]
        for (const s of g.stones) b[s] = EMPTY
      }
    }
  }
  const own = group(b, pos)
  if (own.libs === 0) return null // 禁自杀
  // 简单劫:提1子且己方是单子1气 → 对方下一手不能立即回提
  const newKo = (captured === 1 && own.stones.length === 1 && own.libs === 1) ? capturedPos : -1
  return { board: b, captured, ko: newKo }
}

/** 是否为 color 的"真眼"(所有邻点都是己方,防止模拟中填眼) */
export function isEye(board: Board, pos: number, color: Color): boolean {
  if (board[pos] !== EMPTY) return false
  for (const n of neighbors(pos)) if (board[n] !== color) return false
  return true
}

export function legalMoves(board: Board, color: Color, ko: number, skipEyes = false): number[] {
  const r: number[] = []
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] !== EMPTY) continue
    if (skipEyes && isEye(board, i, color)) continue
    if (play(board, i, color, ko)) r.push(i)
  }
  return r
}

/** 数子(面积法)。deadSet:被标记为死子的点集合(移除后计算) */
export function score(board: Board, deadSet: Set<number> = new Set()) {
  const b = board.slice()
  for (const d of deadSet) b[d] = EMPTY
  let black = 0, white = 0
  const seen = new Set<number>()
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (b[i] === BLACK) black++
    else if (b[i] === WHITE) white++
    else if (!seen.has(i)) {
      // 空区域 flood,看边界颜色
      const region: number[] = [i]; seen.add(i)
      const stack = [i]
      let touchB = false, touchW = false
      while (stack.length) {
        const p = stack.pop()!
        for (const n of neighbors(p)) {
          if (b[n] === EMPTY && !seen.has(n)) { seen.add(n); region.push(n); stack.push(n) }
          else if (b[n] === BLACK) touchB = true
          else if (b[n] === WHITE) touchW = true
        }
      }
      if (touchB && !touchW) black += region.length
      else if (touchW && !touchB) white += region.length
    }
  }
  const margin = black - white - 6.5 // 贴3.25子
  return { black, white, margin, blackWins: margin > 0 }
}

/** SGF 导出 */
export function toSGF(moves: { pos: number; color: Color }[], result: string): string {
  const L = 'abcdefghi'
  let s = `(;GM[1]FF[4]SZ[9]RU[Chinese]KM[6.5]RE[${result}]`
  for (const m of moves) {
    const tag = m.color === BLACK ? 'B' : 'W'
    if (m.pos === -1) s += `;${tag}[]`
    else { const [x, y] = xy(m.pos); s += `;${tag}[${L[x]}${L[y]}]` }
  }
  return s + ')'
}

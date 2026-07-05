/* MCTS 引擎 Web Worker · 纯前端,无神经网络 */
import { BLACK, type Board, type Color, opp, play, legalMoves, score, group, neighbors, SIZE } from './go'

interface GenmoveMsg { id: number; cmd: 'genmove'; board: Board; toPlay: Color; ko: number; level: number }
interface EvalMsg { id: number; cmd: 'eval'; board: Board; toPlay: Color; ko: number; playouts: number }
type Msg = GenmoveMsg | EvalMsg

const LEVEL_PLAYOUTS: Record<number, number> = { 3: 300, 4: 1500, 5: 5000 }
const TIME_CAP_MS = 4500

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data
  if (m.cmd === 'genmove') {
    const move = genmove(m.board, m.toPlay, m.ko, m.level)
    ;(self as unknown as Worker).postMessage({ id: m.id, move })
  } else {
    const wr = evalPosition(m.board, m.toPlay, m.ko, m.playouts)
    ;(self as unknown as Worker).postMessage({ id: m.id, blackWinrate: wr })
  }
}

/* ---------------- levels ---------------- */
function genmove(board: Board, c: Color, ko: number, level: number): number {
  const moves = legalMoves(board, c, ko, true)
  if (!moves.length) return -1 // pass
  if (level <= 1) return moves[Math.floor(Math.random() * moves.length)]
  if (level === 2) return greedyMove(board, c, ko, moves)
  return mcts(board, c, ko, LEVEL_PLAYOUTS[level] ?? 300)
}

/** L2:优先提子 > 逃叫吃 > 随机 */
function greedyMove(board: Board, c: Color, ko: number, moves: number[]): number {
  // 提子
  for (const mv of moves) {
    const r = play(board, mv, c, ko)
    if (r && r.captured > 0) return mv
  }
  // 己方被叫吃的棋串 → 找延气点
  const inAtari = new Set<number>()
  const seen = new Set<number>()
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] === c && !seen.has(i)) {
      const g = group(board, i)
      g.stones.forEach(s => seen.add(s))
      if (g.libs === 1) g.stones.forEach(s => inAtari.add(s))
    }
  }
  if (inAtari.size) {
    for (const mv of moves) {
      const r = play(board, mv, c, ko)
      if (!r) continue
      let saves = false
      for (const n of neighbors(mv)) {
        if (inAtari.has(n) && group(r.board, n).libs > 1) { saves = true; break }
      }
      if (saves) return mv
    }
  }
  return moves[Math.floor(Math.random() * moves.length)]
}

/* ---------------- MCTS(UCT) ---------------- */
interface Node {
  move: number
  parent: Node | null
  children: Node[]
  untried: number[]
  wins: number
  visits: number
  toPlay: Color   // 在此节点轮到谁走
  board: Board
  ko: number
}

function mcts(board: Board, c: Color, ko: number, playouts: number): number {
  const t0 = Date.now()
  const root: Node = {
    move: -2, parent: null, children: [],
    untried: legalMoves(board, c, ko, true),
    wins: 0, visits: 0, toPlay: c, board, ko,
  }
  if (!root.untried.length) return -1
  let n = 0
  while (n < playouts && Date.now() - t0 < TIME_CAP_MS) {
    n++
    // 1. select
    let node = root
    while (!node.untried.length && node.children.length) {
      node = bestUCT(node)
    }
    // 2. expand
    if (node.untried.length) {
      const i = Math.floor(Math.random() * node.untried.length)
      const mv = node.untried.splice(i, 1)[0]
      const r = play(node.board, mv, node.toPlay, node.ko)
      if (!r) continue
      const child: Node = {
        move: mv, parent: node, children: [],
        untried: legalMoves(r.board, opp(node.toPlay), r.ko, true),
        wins: 0, visits: 0, toPlay: opp(node.toPlay), board: r.board, ko: r.ko,
      }
      node.children.push(child)
      node = child
    }
    // 3. rollout
    const blackWon = rollout(node.board, node.toPlay, node.ko)
    // 4. backprop:节点的 wins 记「刚走完那手的一方」的胜场
    let cur: Node | null = node
    while (cur) {
      cur.visits++
      const moverIsBlack = opp(cur.toPlay) === BLACK
      if (moverIsBlack === blackWon) cur.wins++
      cur = cur.parent
    }
  }
  let best: Node | null = null
  for (const ch of root.children) if (!best || ch.visits > best.visits) best = ch
  return best ? best.move : -1
}

function bestUCT(node: Node): Node {
  const logN = Math.log(node.visits + 1)
  let best = node.children[0], bestV = -Infinity
  for (const ch of node.children) {
    const v = ch.wins / (ch.visits + 1e-9) + 1.4 * Math.sqrt(logN / (ch.visits + 1e-9))
    if (v > bestV) { bestV = v; best = ch }
  }
  return best
}

/** 随机模拟到双 pass 或步数上限,返回黑是否胜 */
function rollout(board: Board, toPlay: Color, ko: number): boolean {
  let b = board, c = toPlay, k = ko
  let passes = 0, steps = 0
  while (passes < 2 && steps < 140) {
    steps++
    const moves = legalMoves(b, c, k, true)
    if (!moves.length) { passes++; c = opp(c); k = -1; continue }
    passes = 0
    const mv = moves[Math.floor(Math.random() * moves.length)]
    const r = play(b, mv, c, k)
    if (!r) { passes++; c = opp(c); continue }
    b = r.board; k = r.ko; c = opp(c)
  }
  return score(b).blackWins
}

/** 局面评估:随机模拟 N 次,返回黑胜率 */
function evalPosition(board: Board, toPlay: Color, ko: number, playouts: number): number {
  let blackWins = 0
  const t0 = Date.now()
  let n = 0
  while (n < playouts && Date.now() - t0 < 2500) {
    n++
    if (rollout(board, toPlay, ko)) blackWins++
  }
  return n ? blackWins / n : 0.5
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { Shell, Card, ACCENT } from '../components/ui'
import GoBoard from '../components/GoBoard'
import { emptyBoard, play, score, group, toSGF, BLACK, WHITE, EMPTY, SIZE, neighbors, type Board, type Color } from '../lib/go'
import { loadRank, updateRank, saveGame, rankName, suggestLevel, loadSolved, markSolved, askClaude, type GoRank } from '../lib/gameStore'
import { LESSONS, TSUMEGO, type GoProblem } from '../data/problems'

const LEVEL_NAMES = ['', '入门(随机)', '初学(贪吃)', '业余低段(MCTS·浅)', '业余中段(MCTS·中)', '道场主(MCTS·深)']

/* 领地染色(计分显示用) */
function territoryMap(board: Board, dead: Set<number>): Map<number, number> {
  const b = board.slice()
  for (const d of dead) b[d] = EMPTY
  const m = new Map<number, number>()
  const seen = new Set<number>()
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (b[i] !== EMPTY || seen.has(i)) continue
    const region = [i]; seen.add(i)
    const stack = [i]
    let tB = false, tW = false
    while (stack.length) {
      const p = stack.pop()!
      for (const n of neighbors(p)) {
        if (b[n] === EMPTY && !seen.has(n)) { seen.add(n); region.push(n); stack.push(n) }
        else if (b[n] === BLACK) tB = true
        else if (b[n] === WHITE) tW = true
      }
    }
    if (tB !== tW) region.forEach(p => m.set(p, tB ? BLACK : WHITE))
  }
  for (const d of dead) m.set(d, board[d] === BLACK ? WHITE : BLACK)
  return m
}

export default function GoPage() {
  const [tab, setTab] = useState<'play' | 'lesson' | 'tsumego'>('play')
  return (
    <Shell>
      <div className="max-w-md mx-auto px-5 pt-8">
        <h1 className="text-2xl font-bold text-white mb-4">9路围棋道场</h1>
        <div className="flex gap-2 mb-5">
          {([['play', '⚔️ 对弈'], ['lesson', '📖 教学'], ['tsumego', '🧩 死活题']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-full text-sm border transition ${
                tab === k ? 'border-[#5eead4] bg-[#5eead4]/10 text-white' : 'border-white/10 text-white/45'}`}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'play' && <PlayTab />}
        {tab === 'lesson' && <ProblemsTab list={LESSONS} intro="从零开始的 6 关新手引导" />}
        {tab === 'tsumego' && <ProblemsTab list={TSUMEGO} intro="经典死活题 · 按难度分级" />}
      </div>
    </Shell>
  )
}

/* ================= 对弈 ================= */
function PlayTab() {
  const [rank, setRank] = useState<GoRank | null>(null)
  const [level, setLevel] = useState(1)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'scoring' | 'over'>('idle')
  const [board, setBoard] = useState<Board>(emptyBoard())
  const [toPlay, setToPlay] = useState<Color>(BLACK)
  const [lastMove, setLastMove] = useState(-1)
  const [thinking, setThinking] = useState(false)
  const [dead, setDead] = useState<Set<number>>(new Set())
  const [result, setResult] = useState('')
  const [msg, setMsg] = useState('')
  const [replayIdx, setReplayIdx] = useState(-1)
  const [winrates, setWinrates] = useState<number[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiExplain, setAiExplain] = useState('')

  const g = useRef({ ko: -1, passes: 0, moves: [] as { pos: number; color: Color }[], startTs: 0, boards: [] as Board[] })
  const workerRef = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const pending = useRef(new Map<number, (v: { move?: number; blackWinrate?: number }) => void>())

  useEffect(() => {
    loadRank().then(r => { setRank(r); setLevel(suggestLevel(r.rank)) })
    const w = new Worker(new URL('../lib/mcts.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = e => { pending.current.get(e.data.id)?.(e.data); pending.current.delete(e.data.id) }
    workerRef.current = w
    return () => w.terminate()
  }, [])

  const call = useCallback((payload: object): Promise<{ move?: number; blackWinrate?: number }> => {
    return new Promise(res => {
      const id = ++reqId.current
      pending.current.set(id, res)
      workerRef.current!.postMessage({ id, ...payload })
    })
  }, [])

  function newGame() {
    g.current = { ko: -1, passes: 0, moves: [], startTs: Date.now(), boards: [emptyBoard()] }
    setBoard(emptyBoard()); setToPlay(BLACK); setLastMove(-1)
    setDead(new Set()); setResult(''); setMsg(''); setPhase('playing')
    setReplayIdx(-1); setWinrates(null); setAiExplain('')
  }

  async function humanMove(pos: number) {
    if (phase !== 'playing' || toPlay !== BLACK || thinking) return
    const r = play(board, pos, BLACK, g.current.ko)
    if (!r) { setMsg('此处不能落子'); setTimeout(() => setMsg(''), 1200); return }
    applyMove(pos, BLACK, r.board, r.ko)
    await aiTurn(r.board, r.ko)
  }

  function applyMove(pos: number, color: Color, nb: Board, ko: number) {
    g.current.moves.push({ pos, color })
    g.current.boards.push(nb)
    g.current.ko = ko
    g.current.passes = pos === -1 ? g.current.passes + 1 : 0
    setBoard(nb); setLastMove(pos); setToPlay(color === BLACK ? WHITE : BLACK)
  }

  async function aiTurn(b: Board, ko: number) {
    setThinking(true)
    const { move } = await call({ cmd: 'genmove', board: b, toPlay: WHITE, ko, level })
    setThinking(false)
    if (move === undefined || move === -1) {
      applyMove(-1, WHITE, b, -1)
      setMsg('白棋停一手(Pass)')
      if (g.current.passes >= 2) enterScoring()
      return
    }
    const r = play(b, move, WHITE, ko)
    if (!r) { applyMove(-1, WHITE, b, -1); if (g.current.passes >= 2) enterScoring(); return }
    applyMove(move, WHITE, r.board, r.ko)
  }

  async function humanPass() {
    if (phase !== 'playing' || toPlay !== BLACK || thinking) return
    applyMove(-1, BLACK, board, -1)
    if (g.current.passes >= 2) { enterScoring(); return }
    await aiTurn(board, -1)
  }

  function enterScoring() { setPhase('scoring'); setMsg('点击棋子标记死子,然后确认') }

  function toggleDead(pos: number) {
    if (board[pos] === EMPTY) return
    const stones = group(board, pos).stones
    const nd = new Set(dead)
    const isDead = nd.has(stones[0])
    stones.forEach(s => isDead ? nd.delete(s) : nd.add(s))
    setDead(nd)
  }

  async function confirmScore() {
    const s = score(board, dead)
    const res = s.margin > 0 ? `B+${Math.abs(s.margin).toFixed(1)}` : `W+${Math.abs(s.margin).toFixed(1)}`
    finishGame(res, s.blackWins)
  }

  async function resign() { finishGame('W+R', false) }

  async function finishGame(res: string, playerWon: boolean) {
    setResult(res); setPhase('over')
    const nr = await updateRank(playerWon)
    setRank(nr)
    await saveGame({
      ts: Date.now(), level, playerColor: BLACK,
      moves: g.current.moves, result: res, playerWon,
      sgf: toSGF(g.current.moves, res),
      durationSec: Math.round((Date.now() - g.current.startTs) / 1000),
    })
    setMsg(playerWon ? `🎉 执黑胜!升至 ${rankName(nr.rank)}` : `惜败。当前 ${rankName(nr.rank)}(连败3局降级)`)
  }

  function downloadSGF() {
    const blob = new Blob([toSGF(g.current.moves, result)], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `go-${new Date().toISOString().slice(0, 10)}.sgf`
    a.click()
  }

  /* 复盘分析:逐位置评估黑胜率 */
  async function analyze() {
    setAnalyzing(true)
    const wrs: number[] = []
    const { boards } = g.current
    for (let i = 0; i < boards.length; i++) {
      const tp = i % 2 === 0 ? BLACK : WHITE
      const { blackWinrate } = await call({ cmd: 'eval', board: boards[i], toPlay: tp, ko: -1, playouts: 250 })
      wrs.push(blackWinrate ?? 0.5)
      setWinrates([...wrs])
    }
    setAnalyzing(false)
  }

  async function whyMove() {
    if (replayIdx < 0) return
    setAiExplain('思考中…')
    try {
      const mv = g.current.moves[replayIdx]
      const movesTxt = g.current.moves.slice(0, replayIdx + 1)
        .map((m, i) => `${i + 1}.${m.color === BLACK ? '黑' : '白'}${m.pos === -1 ? 'pass' : `(${m.pos % SIZE},${Math.floor(m.pos / SIZE)})`}`).join(' ')
      const wrTxt = winrates ? `该手前后黑胜率:${Math.round((winrates[replayIdx] ?? 0.5) * 100)}%→${Math.round((winrates[replayIdx + 1] ?? 0.5) * 100)}%` : ''
      const text = await askClaude(
        '你是围棋教练,用简洁中文(≤120字)点评9路棋局中指定的一手棋,指出好坏和更好的选点。坐标(x,y)左上为origin。',
        `棋谱:${movesTxt}\n请点评第${replayIdx + 1}手 ${mv.color === BLACK ? '黑' : '白'}棋。${wrTxt}`)
      setAiExplain(text)
    } catch (e) {
      setAiExplain(`(AI 讲解不可用:${(e as Error).message})`)
    }
  }

  if (!rank) return <div className="text-white/40 text-center py-8">加载中…</div>

  const replayBoard = replayIdx >= 0 ? g.current.boards[replayIdx + 1] : board
  const showBoard = phase === 'over' && replayIdx >= 0 ? replayBoard : board

  return (
    <>
      {/* 段位条 */}
      <Card className="p-4 mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-white/40">当前段位</div>
          <div className="text-xl font-bold" style={{ color: ACCENT }}>{rankName(rank.rank)}</div>
        </div>
        <div className="text-right text-xs text-white/40">
          <div>{rank.wins} 胜 {rank.losses} 负</div>
          <div>连败 {rank.lossStreak}/3</div>
        </div>
      </Card>

      {phase === 'idle' && (
        <>
          <Card className="p-5 mb-4">
            <div className="text-sm text-white/70 mb-3">AI 强度(推荐 L{suggestLevel(rank.rank)})</div>
            {[1, 2, 3, 4, 5].map(l => (
              <button key={l} onClick={() => setLevel(l)}
                className={`w-full text-left px-4 py-3 rounded-xl mb-2 border text-sm transition ${
                  level === l ? 'border-[#5eead4] bg-[#5eead4]/10 text-white' : 'border-white/10 text-white/50'}`}>
                L{l} · {LEVEL_NAMES[l]}
              </button>
            ))}
          </Card>
          <button onClick={newGame} className="w-full py-4 rounded-2xl font-bold text-lg text-[#0b0e11]"
            style={{ background: ACCENT }}>
            执黑开局(中国规则 · 贴3.25子)
          </button>
        </>
      )}

      {phase !== 'idle' && (
        <>
          <GoBoard board={showBoard} lastMove={phase === 'over' && replayIdx >= 0 ? (g.current.moves[replayIdx]?.pos ?? -1) : lastMove}
            dead={phase === 'scoring' ? dead : undefined}
            territory={phase === 'scoring' ? territoryMap(board, dead) : undefined}
            onTap={phase === 'playing' ? humanMove : phase === 'scoring' ? toggleDead : undefined}
            disabled={thinking || phase === 'over'} />

          <div className="text-center text-sm text-white/50 h-6 mt-2">
            {thinking ? 'AI 思考中…' : msg || (phase === 'playing' ? (toPlay === BLACK ? '轮到你(黑)' : '') : '')}
          </div>

          {phase === 'playing' && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button onClick={humanPass} className="py-3 rounded-xl border border-white/15 text-white/70 text-sm">停一手 Pass</button>
              <button onClick={resign} className="py-3 rounded-xl border border-white/15 text-white/70 text-sm">认输</button>
            </div>
          )}

          {phase === 'scoring' && (
            <div className="mt-2">
              <div className="text-center text-sm mb-3 text-white/70">
                {(() => { const s = score(board, dead); return `黑 ${s.black} · 白 ${s.white} + 贴6.5 → ${s.margin > 0 ? '黑胜' : '白胜'} ${Math.abs(s.margin).toFixed(1)}` })()}
              </div>
              <button onClick={confirmScore} className="w-full py-3 rounded-xl font-bold text-[#0b0e11]" style={{ background: ACCENT }}>
                确认计分
              </button>
            </div>
          )}

          {phase === 'over' && (
            <div className="mt-2">
              <Card className="p-4 text-center mb-3">
                <div className="text-2xl font-black" style={{ color: result.startsWith('B') ? ACCENT : '#f0a3b5' }}>{result}</div>
                <div className="text-xs text-white/40 mt-1">{msg}</div>
              </Card>

              {/* 复盘 */}
              <Card className="p-4 mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-white/80">复盘 ({replayIdx + 1}/{g.current.moves.length})</span>
                  <div className="flex gap-2">
                    <button onClick={() => setReplayIdx(i => Math.max(-1, i - 1))} className="w-9 h-9 rounded-lg border border-white/15">←</button>
                    <button onClick={() => setReplayIdx(i => Math.min(g.current.moves.length - 1, i + 1))} className="w-9 h-9 rounded-lg border border-white/15">→</button>
                  </div>
                </div>
                {winrates ? (
                  <WinrateBar wrs={winrates} idx={replayIdx} onPick={setReplayIdx} />
                ) : (
                  <button onClick={analyze} disabled={analyzing}
                    className="w-full py-2.5 rounded-lg border border-[#5eead4]/40 text-[#5eead4] text-sm">
                    {analyzing ? `分析中…(${(winrates as number[] | null)?.length ?? 0})` : '📊 引擎分析全局胜率'}
                  </button>
                )}
                {replayIdx >= 0 && (
                  <button onClick={whyMove} className="w-full mt-2 py-2.5 rounded-lg border border-white/15 text-white/70 text-sm">
                    🤔 为什么?(AI 讲解这一手)
                  </button>
                )}
                {aiExplain && <div className="text-xs text-white/60 leading-5 mt-2 p-3 rounded-lg bg-white/[0.04]">{aiExplain}</div>}
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={newGame} className="py-3 rounded-xl font-bold text-[#0b0e11]" style={{ background: ACCENT }}>再来一局</button>
                <button onClick={downloadSGF} className="py-3 rounded-xl border border-white/15 text-white/70">导出 SGF</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

/** 胜率条形图,标红恶手 */
function WinrateBar({ wrs, idx, onPick }: { wrs: number[]; idx: number; onPick: (i: number) => void }) {
  return (
    <div>
      <div className="flex items-end gap-[2px] h-16">
        {wrs.slice(1).map((wr, i) => {
          const prev = wrs[i]
          const mover = i % 2 === 0 ? 'B' : 'W'
          const drop = mover === 'B' ? prev - wr : wr - prev
          const blunder = drop > 0.2
          return (
            <button key={i} onClick={() => onPick(i)}
              className="flex-1 rounded-t transition"
              style={{
                height: `${Math.max(6, wr * 100)}%`,
                background: blunder ? '#e0564f' : i === idx ? '#fff' : '#5eead4',
                opacity: i === idx ? 1 : 0.65,
              }} />
          )
        })}
      </div>
      <div className="text-[10px] text-white/35 mt-1">柱高=黑胜率 · <span className="text-[#e0564f]">红</span>=胜率暴跌的恶手 · 点击跳转</div>
    </div>
  )
}

/* ================= 教学 / 死活题 ================= */
function ProblemsTab({ list, intro }: { list: GoProblem[]; intro: string }) {
  const [solved, setSolved] = useState<string[]>([])
  const [open, setOpen] = useState<GoProblem | null>(null)
  useEffect(() => { loadSolved().then(setSolved) }, [])

  if (open) return <ProblemPlayer p={open} onBack={() => { setOpen(null); loadSolved().then(setSolved) }} />

  const cats = [...new Set(list.map(p => p.cat))]
  return (
    <>
      <p className="text-sm text-white/40 mb-4">{intro} · 已解 {list.filter(p => solved.includes(p.id)).length}/{list.length}</p>
      {cats.map(cat => (
        <div key={cat} className="mb-4">
          {cats.length > 1 && <div className="text-xs text-white/35 mb-2">{cat}</div>}
          {list.filter(p => p.cat === cat).map(p => (
            <button key={p.id} onClick={() => setOpen(p)}
              className="w-full mb-2 p-4 rounded-xl border border-white/10 bg-white/[0.03] text-left flex justify-between items-center active:scale-[.98] transition">
              <div>
                <div className="text-sm font-semibold text-white">{p.title}</div>
                <div className="text-xs text-white/40 mt-0.5 line-clamp-1">{p.desc}</div>
              </div>
              {solved.includes(p.id) && <span className="text-[#5eead4]">✓</span>}
            </button>
          ))}
        </div>
      ))}
    </>
  )
}

function ProblemPlayer({ p, onBack }: { p: GoProblem; onBack: () => void }) {
  const initBoard = () => {
    const b = emptyBoard()
    p.B.forEach(([x, y]) => { b[y * SIZE + x] = BLACK })
    p.W.forEach(([x, y]) => { b[y * SIZE + x] = WHITE })
    return b
  }
  const [board, setBoard] = useState<Board>(initBoard)
  const [state, setState] = useState<'try' | 'right' | 'wrong'>('try')
  const [fails, setFails] = useState(0)
  const [last, setLast] = useState(-1)

  function tap(pos: number) {
    if (state === 'right') return
    const ok = p.sol.some(([x, y]) => y * SIZE + x === pos)
    if (ok) {
      const r = play(board, pos, BLACK, -1)
      if (r) { setBoard(r.board); setLast(pos) }
      setState('right')
      markSolved(p.id)
    } else {
      setState('wrong'); setFails(f => f + 1)
      const r = play(board, pos, BLACK, -1)
      if (r) {
        setBoard(r.board); setLast(pos)
        setTimeout(() => { setBoard(initBoard()); setLast(-1); setState('try') }, 900)
      } else {
        setTimeout(() => setState('try'), 600)
      }
    }
  }

  return (
    <>
      <button onClick={onBack} className="text-sm text-white/50 mb-3">← 返回题目列表</button>
      <div className="text-lg font-bold text-white">{p.title} <span className="text-xs text-white/35 font-normal">· {p.cat}</span></div>
      <p className="text-sm text-white/50 mt-1 mb-3">{p.desc}</p>
      <GoBoard board={board} lastMove={last} onTap={tap} disabled={state === 'right'} />
      <div className="mt-3 min-h-[70px]">
        {state === 'right' && (
          <Card className="p-4 border-[#5eead4]/40">
            <div className="font-bold text-[#5eead4] mb-1">✓ 正解!</div>
            <div className="text-sm text-white/60 leading-6">{p.explain}</div>
          </Card>
        )}
        {state === 'wrong' && <div className="text-center text-[#f0a3b5] text-sm">不对,再想想…</div>}
        {state === 'try' && fails >= 2 && (
          <div className="text-center text-white/40 text-sm">💡 提示:{p.explain.slice(0, 20)}…</div>
        )}
      </div>
    </>
  )
}

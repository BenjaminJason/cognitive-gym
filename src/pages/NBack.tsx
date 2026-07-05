import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shell, Card, Stat, ACCENT } from '../components/ui'
import { genSequence, scoreChannel, nextN, EN_LETTERS, ZH_DIGITS, type Trial } from '../lib/nback'
import { loadSettings, saveSettings, saveSession, updateLastNote, type Settings } from '../lib/storage'

type Phase = 'setup' | 'countdown' | 'running' | 'done'

export default function NBack() {
  const nav = useNavigate()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [phase, setPhase] = useState<Phase>('setup')
  const [count, setCount] = useState(3)
  const [trialIdx, setTrialIdx] = useState(-1)
  const [litCell, setLitCell] = useState(-1)
  const [visFlash, setVisFlash] = useState<'ok' | 'bad' | null>(null)
  const [audFlash, setAudFlash] = useState<'ok' | 'bad' | null>(null)
  const [result, setResult] = useState<null | {
    n: number; visAcc: number; audAcc: number; acc: number
    visHits: number; visFA: number; audHits: number; audFA: number
    meanRT: number; nn: number
  }>(null)
  const [note, setNote] = useState('')

  // mutable game state
  const g = useRef({
    trials: [] as Trial[],
    n: 2,
    pressedVis: [] as boolean[],
    pressedAud: [] as boolean[],
    rts: [] as number[],
    trialStart: 0,
    startTime: 0,
    timers: [] as number[],
    audios: new Map<string, HTMLAudioElement>(),
  })

  useEffect(() => {
    loadSettings().then(s => {
      setSettings(s)
      // 预加载音频
      const list = s.audioSet === 'en' ? EN_LETTERS.map(l => `en_${l}`) : ZH_DIGITS.map((_, i) => `zh_${i + 1}`)
      list.forEach(name => {
        const a = new Audio(`audio/${name}.m4a`)
        a.preload = 'auto'
        g.current.audios.set(name, a)
      })
    })
    const cur = g.current
    return () => { cur.timers.forEach(clearTimeout) }
  }, [])

  if (!settings) return <Shell><div className="p-10 text-center text-white/40">加载中…</div></Shell>

  const audNames = settings.audioSet === 'en' ? EN_LETTERS.map(l => `en_${l}`) : ZH_DIGITS.map((_, i) => `zh_${i + 1}`)
  const audCount = audNames.length

  /* ---------- game control ---------- */
  function start() {
    const n = settings!.startN
    g.current.trials = genSequence(n, audCount)
    g.current.n = n
    g.current.pressedVis = new Array(g.current.trials.length).fill(false)
    g.current.pressedAud = new Array(g.current.trials.length).fill(false)
    g.current.rts = []
    setPhase('countdown'); setCount(3)
    const t1 = window.setTimeout(() => setCount(2), 1000)
    const t2 = window.setTimeout(() => setCount(1), 2000)
    const t3 = window.setTimeout(() => { setPhase('running'); g.current.startTime = Date.now(); runTrial(0) }, 3000)
    g.current.timers.push(t1, t2, t3)
  }

  function runTrial(i: number) {
    const { trials } = g.current
    if (i >= trials.length) { finish(); return }
    setTrialIdx(i)
    setVisFlash(null); setAudFlash(null)
    const t = trials[i]
    setLitCell(t.pos)
    g.current.trialStart = Date.now()
    // 播声音
    const a = g.current.audios.get(audNames[t.aud])
    if (a) { a.currentTime = 0; a.play().catch(() => {}) }
    // 700ms 后熄灭方块
    g.current.timers.push(window.setTimeout(() => setLitCell(-1), 700))
    // interval 后进入下一回合
    g.current.timers.push(window.setTimeout(() => runTrial(i + 1), settings!.interval))
  }

  function press(channel: 'vis' | 'aud') {
    const i = trialIdx
    const { trials, n } = g.current
    if (phase !== 'running' || i < 0) return
    const arr = channel === 'vis' ? g.current.pressedVis : g.current.pressedAud
    if (arr[i]) return // 本回合已按过
    arr[i] = true
    const isMatch = i >= n && (channel === 'vis' ? trials[i].visMatch : trials[i].audMatch)
    if (isMatch) g.current.rts.push(Date.now() - g.current.trialStart)
    if (!settings!.strict) {
      const fb = isMatch ? 'ok' : 'bad'
      if (channel === 'vis') setVisFlash(fb); else setAudFlash(fb)
    }
  }

  function finish() {
    const { trials, n, pressedVis, pressedAud, rts, startTime } = g.current
    const vis = scoreChannel(trials, pressedVis, t => t.visMatch, n)
    const aud = scoreChannel(trials, pressedAud, t => t.audMatch, n)
    const acc = (vis.acc + aud.acc) / 2
    const nn = nextN(n, acc)
    setResult({
      n, visAcc: vis.acc, audAcc: aud.acc, acc,
      visHits: vis.hits, visFA: vis.fa, audHits: aud.hits, audFA: aud.fa,
      meanRT: rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0,
      nn,
    })
    setPhase('done')
    // 保存 session + 更新下一场 N
    saveSession({
      ts: Date.now(), n, trials: trials.length,
      visAcc: vis.acc, audAcc: aud.acc, acc,
      visHits: vis.hits, visFA: vis.fa, audHits: aud.hits, audFA: aud.fa,
      meanRT: rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0,
      durationSec: Math.round((Date.now() - startTime) / 1000),
      nextN: nn,
    })
    const ns = { ...settings!, startN: nn }
    setSettings(ns); saveSettings(ns)
  }

  /* ---------- render ---------- */
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <Shell>
      <div className="max-w-md mx-auto px-5 pt-8">

        {phase === 'setup' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">双重 N-back</h1>
            <p className="text-sm text-white/40 mb-6">同时追踪 <b className="text-white/70">位置</b> 和 <b className="text-white/70">声音</b>,判断是否与 {settings.startN} 步之前相同。</p>
            <Card className="p-6 text-center mb-4">
              <div className="text-white/40 text-xs mb-2">本场难度</div>
              <div className="text-6xl font-black" style={{ color: ACCENT }}>N = {settings.startN}</div>
              <div className="text-white/40 text-xs mt-3">{20 + settings.startN} 回合 · 间隔 {(settings.interval / 1000).toFixed(1)}s · {settings.strict ? '严格模式' : '即时反馈'}</div>
            </Card>
            <button onClick={start}
              className="w-full py-4 rounded-2xl font-bold text-lg text-[#0b0e11] active:scale-[.98] transition"
              style={{ background: ACCENT }}>
              开始训练
            </button>
            <p className="text-xs text-white/30 text-center mt-4 leading-5">
              规则:方块位置与 N 步前相同 → 按左「位置」;<br />声音与 N 步前相同 → 按右「声音」。都同就都按。
            </p>
          </>
        )}

        {phase === 'countdown' && (
          <div className="h-[70vh] flex items-center justify-center">
            <div className="text-8xl font-black" style={{ color: ACCENT }}>{count}</div>
          </div>
        )}

        {phase === 'running' && (
          <>
            <div className="flex justify-between text-xs text-white/40 mb-4">
              <span>N = {g.current.n}</span>
              <span>{Math.max(0, trialIdx + 1)} / {g.current.trials.length}</span>
            </div>
            {/* 3x3 grid */}
            <div className="grid grid-cols-3 gap-2.5 aspect-square mb-8">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="rounded-xl border transition-all duration-150"
                  style={{
                    borderColor: 'rgba(255,255,255,.07)',
                    background: litCell === i ? ACCENT : 'rgba(255,255,255,.03)',
                    boxShadow: litCell === i ? `0 0 30px ${ACCENT}66` : 'none',
                  }} />
              ))}
            </div>
            {/* dual thumb buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button onPointerDown={() => press('vis')}
                className="py-7 rounded-2xl font-bold text-lg border-2 active:scale-95 transition select-none"
                style={{
                  borderColor: visFlash === 'ok' ? '#4ade80' : visFlash === 'bad' ? '#f87171' : 'rgba(255,255,255,.15)',
                  background: visFlash === 'ok' ? '#4ade8022' : visFlash === 'bad' ? '#f8717122' : 'rgba(255,255,255,.04)',
                }}>
                ⬛ 位置匹配
              </button>
              <button onPointerDown={() => press('aud')}
                className="py-7 rounded-2xl font-bold text-lg border-2 active:scale-95 transition select-none"
                style={{
                  borderColor: audFlash === 'ok' ? '#4ade80' : audFlash === 'bad' ? '#f87171' : 'rgba(255,255,255,.15)',
                  background: audFlash === 'ok' ? '#4ade8022' : audFlash === 'bad' ? '#f8717122' : 'rgba(255,255,255,.04)',
                }}>
                🔊 声音匹配
              </button>
            </div>
          </>
        )}

        {phase === 'done' && result && (
          <>
            <h1 className="text-2xl font-bold text-white mb-6">本场结果</h1>
            <Card className="p-6 mb-4">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Stat value={pct(result.acc)} label="总正确率" accent />
                <Stat value={pct(result.visAcc)} label="位置通道" />
                <Stat value={pct(result.audAcc)} label="声音通道" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Stat value={`${result.visHits}/${result.visFA}`} label="位置 命中/误报" />
                <Stat value={`${result.audHits}/${result.audFA}`} label="声音 命中/误报" />
                <Stat value={result.meanRT ? `${result.meanRT}ms` : '—'} label="平均反应时" />
              </div>
            </Card>
            <Card className="p-5 text-center mb-4">
              {result.nn > result.n && <div className="text-lg font-bold text-[#4ade80]">🎉 升级!下一场 N = {result.nn}</div>}
              {result.nn < result.n && <div className="text-lg font-bold text-[#f87171]">回落一级,下一场 N = {result.nn}</div>}
              {result.nn === result.n && <div className="text-lg font-bold text-white/70">保持,下一场 N = {result.nn}</div>}
              <div className="text-xs text-white/35 mt-2">规则:≥80% 升级 · &lt;50% 降级(Jaeggi 2008)</div>
            </Card>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="认知日志(可选):睡眠/咖啡因/时段…"
              className="w-full mb-4 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm outline-none focus:border-[#5eead4]/50" />
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { updateLastNote(note); setNote(''); setPhase('setup'); setResult(null) }}
                className="py-4 rounded-2xl font-bold text-[#0b0e11]" style={{ background: ACCENT }}>
                再来一场
              </button>
              <button onClick={() => { updateLastNote(note); nav('/') }}
                className="py-4 rounded-2xl font-bold border border-white/15 text-white/80">
                回仪表盘
              </button>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

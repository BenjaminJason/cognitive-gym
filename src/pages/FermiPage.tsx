import { useEffect, useMemo, useState } from 'react'
import { Shell, Card, ACCENT } from '../components/ui'
import { FERMI, FERMI_CATS, type FermiQ } from '../data/fermi'
import { loadFermi, saveFermi, askClaude, type FermiAttempt } from '../lib/gameStore'

interface Step { desc: string; value: string }

const fmtNum = (n: number) => {
  if (!isFinite(n)) return '—'
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e12 || abs < 0.01) return n.toExponential(2)
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return (n / 1e4).toFixed(2) + '万'
  return String(Math.round(n * 100) / 100)
}

export default function FermiPage() {
  const [cat, setCat] = useState<string>('全部')
  const [q, setQ] = useState<FermiQ | null>(null)
  const [steps, setSteps] = useState<Step[]>([{ desc: '', value: '' }])
  const [submitted, setSubmitted] = useState<null | { est: number; logDiff: number; verdict: FermiAttempt['verdict'] }>(null)
  const [history, setHistory] = useState<FermiAttempt[]>([])
  const [aiReview, setAiReview] = useState('')

  useEffect(() => { loadFermi().then(setHistory) }, [])

  const doneIds = useMemo(() => new Set(history.map(h => h.qid)), [history])

  function pick() {
    const pool = FERMI.filter(x => (cat === '全部' || x.cat === cat) && !doneIds.has(x.id))
    const pool2 = pool.length ? pool : FERMI.filter(x => cat === '全部' || x.cat === cat)
    const next = pool2[Math.floor(Math.random() * pool2.length)]
    setQ(next); setSteps([{ desc: '', value: '' }]); setSubmitted(null); setAiReview('')
  }

  const estimate = useMemo(() => {
    let prod = 1, any = false
    for (const s of steps) {
      const v = parseFloat(s.value)
      if (!isNaN(v)) { prod *= v; any = true }
    }
    return any ? prod : NaN
  }, [steps])

  async function submit() {
    if (!q || !isFinite(estimate) || estimate <= 0) return
    const logDiff = Math.abs(Math.log10(estimate / q.a))
    const verdict = logDiff <= 1 ? '优秀' : logDiff <= 2 ? '合格' : '重做'
    setSubmitted({ est: estimate, logDiff, verdict })
    const attempt: FermiAttempt = { ts: Date.now(), qid: q.id, cat: q.cat, estimate, answer: q.a, logDiff, verdict }
    await saveFermi(attempt)
    setHistory(h => [...h, attempt])
  }

  async function reviewByAI() {
    if (!q || !submitted) return
    setAiReview('分析中…')
    try {
      const mySteps = steps.filter(s => s.desc || s.value).map(s => `${s.desc}: ${s.value}`).join('; ')
      const text = await askClaude(
        '你是费米估算教练。用简洁中文(≤150字)点评用户的拆解路径:哪一步的假设偏差最大?是否有系统性遗漏?给一条改进建议。',
        `题目:${q.q}\n参考答案:${q.a} ${q.unit}\n标准拆解:${q.path.join(' → ')}\n用户拆解:${mySteps}\n用户结果:${submitted.est}(偏差 ${submitted.logDiff.toFixed(1)} 个数量级)`)
      setAiReview(text)
    } catch (e) {
      setAiReview(`(AI 点评不可用:${(e as Error).message})`)
    }
  }

  /* 分类雷达数据:各类平均得分 0-1 */
  const radar = useMemo(() => {
    return FERMI_CATS.map(c => {
      const hs = history.filter(h => h.cat === c)
      if (!hs.length) return { cat: c, score: 0, n: 0 }
      const avg = hs.reduce((a, h) => a + Math.max(0, 3 - h.logDiff) / 3, 0) / hs.length
      return { cat: c, score: avg, n: hs.length }
    })
  }, [history])

  return (
    <Shell>
      <div className="max-w-md mx-auto px-5 pt-8">
        <h1 className="text-2xl font-bold text-white mb-1">费米估算竞技场</h1>
        <p className="text-sm text-white/40 mb-5">拆解 → 估算 → 对比量级。已做 {doneIds.size}/{FERMI.length} 题</p>

        {!q && (
          <>
            <div className="flex gap-2 flex-wrap mb-4">
              {['全部', ...FERMI_CATS].map(c => (
                <button key={c} onClick={() => setCat(c)}
                  className={`px-4 py-2 rounded-full text-sm border ${cat === c ? 'border-[#5eead4] bg-[#5eead4]/10 text-white' : 'border-white/10 text-white/45'}`}>
                  {c}
                </button>
              ))}
            </div>
            <button onClick={pick} className="w-full py-4 rounded-2xl font-bold text-lg text-[#0b0e11] mb-6" style={{ background: ACCENT }}>
              抽一道题
            </button>
            {history.length > 0 && (
              <Card className="p-5">
                <div className="text-sm font-semibold text-white/80 mb-3">分类强弱雷达</div>
                <Radar data={radar} />
                <div className="text-xs text-white/35 mt-2">得分 = 量级准确度(3个量级内线性计分) · 找到你的盲区类别</div>
              </Card>
            )}
          </>
        )}

        {q && (
          <>
            <button onClick={() => setQ(null)} className="text-sm text-white/50 mb-3">← 返回</button>
            <Card className="p-5 mb-4">
              <div className="text-xs text-[#5eead4] mb-1">{q.cat}类</div>
              <div className="text-lg font-bold text-white leading-7">{q.q}</div>
            </Card>

            {!submitted && (
              <>
                <div className="text-sm text-white/60 mb-2">你的拆解(每步一个因子,自动连乘):</div>
                {steps.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input value={s.desc} placeholder={`第${i + 1}步估什么`}
                      onChange={e => setSteps(ss => ss.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                      className="flex-1 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm outline-none focus:border-[#5eead4]/50" />
                    <input value={s.value} placeholder="数值" inputMode="decimal"
                      onChange={e => setSteps(ss => ss.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                      className="w-28 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm outline-none focus:border-[#5eead4]/50 tabular-nums" />
                  </div>
                ))}
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setSteps(s => [...s, { desc: '', value: '' }])}
                    className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm">+ 加一步</button>
                  {steps.length > 1 && (
                    <button onClick={() => setSteps(s => s.slice(0, -1))}
                      className="py-2.5 px-4 rounded-xl border border-white/15 text-white/60 text-sm">−</button>
                  )}
                </div>
                <Card className="p-4 mb-4 flex justify-between items-center">
                  <span className="text-sm text-white/50">连乘结果</span>
                  <span className="text-xl font-bold tabular-nums" style={{ color: ACCENT }}>
                    {fmtNum(estimate)} <span className="text-xs text-white/40">{q.unit}</span>
                  </span>
                </Card>
                <button onClick={submit} disabled={!isFinite(estimate) || estimate <= 0}
                  className="w-full py-4 rounded-2xl font-bold text-lg text-[#0b0e11] disabled:opacity-30" style={{ background: ACCENT }}>
                  提交估算
                </button>
              </>
            )}

            {submitted && (
              <>
                <Card className={`p-5 mb-4 text-center border ${submitted.verdict === '优秀' ? 'border-[#5eead4]/50' : submitted.verdict === '合格' ? 'border-yellow-500/40' : 'border-red-400/40'}`}>
                  <div className="text-3xl font-black mb-1"
                    style={{ color: submitted.verdict === '优秀' ? ACCENT : submitted.verdict === '合格' ? '#eab308' : '#f87171' }}>
                    {submitted.verdict}
                  </div>
                  <div className="text-sm text-white/60">
                    你:{fmtNum(submitted.est)} · 参考:{fmtNum(q.a)} {q.unit}
                  </div>
                  <div className="text-xs text-white/40 mt-1">偏差 {submitted.logDiff.toFixed(1)} 个数量级(≤1优秀 · ≤2合格)</div>
                </Card>

                <Card className="p-5 mb-4">
                  <div className="text-sm font-semibold text-white/80 mb-3">标准拆解路径</div>
                  {q.path.map((p, i) => (
                    <div key={i} className="flex gap-2 text-sm text-white/60 mb-1.5">
                      <span className="text-[#5eead4]">{i + 1}.</span><span>{p}</span>
                    </div>
                  ))}
                  <div className="text-xs text-white/30 mt-2">来源:{q.src}</div>
                </Card>

                <button onClick={reviewByAI} className="w-full py-3 rounded-xl border border-white/15 text-white/70 text-sm mb-2">
                  🤖 AI 点评我的拆解(可选)
                </button>
                {aiReview && <div className="text-xs text-white/60 leading-5 p-3 rounded-lg bg-white/[0.04] mb-3">{aiReview}</div>}

                <button onClick={pick} className="w-full py-4 rounded-2xl font-bold text-lg text-[#0b0e11]" style={{ background: ACCENT }}>
                  下一题
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Shell>
  )
}

/** 四角雷达图 */
function Radar({ data }: { data: { cat: string; score: number; n: number }[] }) {
  const S = 260, C = S / 2, R = 88
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / data.length
  const pt = (i: number, r: number) => [C + r * Math.cos(angle(i)), C + r * Math.sin(angle(i))]
  const poly = data.map((d, i) => pt(i, Math.max(0.06, d.score) * R).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[280px] mx-auto block">
      {[0.33, 0.66, 1].map(f => (
        <polygon key={f} points={data.map((_, i) => pt(i, R * f).join(',')).join(' ')}
          fill="none" stroke="rgba(255,255,255,.08)" />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, R)
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="rgba(255,255,255,.08)" />
      })}
      <polygon points={poly} fill="rgba(94,234,212,.25)" stroke="#5eead4" strokeWidth="2" />
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 20)
        return (
          <text key={d.cat} x={x} y={y} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,.7)">
            {d.cat}{d.n ? `(${Math.round(d.score * 100)})` : ''}
          </text>
        )
      })}
    </svg>
  )
}

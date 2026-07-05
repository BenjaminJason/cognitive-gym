import { useEffect, useState } from 'react'
import { Shell, Card, Stat } from '../components/ui'
import { loadSessions, type NBackSession } from '../lib/storage'
import { loadGames, loadFermi, type GoGame, type FermiAttempt } from '../lib/gameStore'

function weekRange(offset: number): [number, number] {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // 周一=0
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - day - offset * 7)
  const end = new Date(monday); end.setDate(monday.getDate() + 7)
  return [monday.getTime(), end.getTime()]
}

function delta(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '↑ 新增' : '—'
  const d = ((cur - prev) / prev) * 100
  return d >= 0 ? `↑${d.toFixed(0)}%` : `↓${Math.abs(d).toFixed(0)}%`
}

export default function WeeklyPage() {
  const [nb, setNb] = useState<NBackSession[]>([])
  const [go, setGo] = useState<GoGame[]>([])
  const [fm, setFm] = useState<FermiAttempt[]>([])
  useEffect(() => {
    loadSessions().then(setNb); loadGames().then(setGo); loadFermi().then(setFm)
  }, [])

  const [w0s, w0e] = weekRange(0), [w1s, w1e] = weekRange(1)
  const inW = <T extends { ts: number }>(arr: T[], s: number, e: number) => arr.filter(x => x.ts >= s && x.ts < e)

  const nb0 = inW(nb, w0s, w0e), nb1 = inW(nb, w1s, w1e)
  const go0 = inW(go, w0s, w0e), go1 = inW(go, w1s, w1e)
  const fm0 = inW(fm, w0s, w0e), fm1 = inW(fm, w1s, w1e)

  const min0 = nb0.reduce((a, s) => a + s.durationSec, 0) / 60 + go0.reduce((a, g) => a + g.durationSec, 0) / 60
  const min1 = nb1.reduce((a, s) => a + s.durationSec, 0) / 60 + go1.reduce((a, g) => a + g.durationSec, 0) / 60
  const avgN0 = nb0.length ? nb0.reduce((a, s) => a + s.n, 0) / nb0.length : 0
  const avgN1 = nb1.length ? nb1.reduce((a, s) => a + s.n, 0) / nb1.length : 0
  const goWin0 = go0.length ? go0.filter(g => g.playerWon).length / go0.length : 0
  const fmGood0 = fm0.length ? fm0.filter(f => f.verdict === '优秀').length / fm0.length : 0
  const fmGood1 = fm1.length ? fm1.filter(f => f.verdict === '优秀').length / fm1.length : 0

  /* 认知日志分析:按备注关键词分组看 N-back 表现 */
  const buckets: { key: string; label: string }[] = [
    { key: '咖啡', label: '☕ 有咖啡因' }, { key: '睡', label: '😴 提到睡眠' },
    { key: '早', label: '🌅 早晨' }, { key: '晚', label: '🌙 晚上' },
  ]
  const noteAnalysis = buckets.map(b => {
    const withKey = nb.filter(s => s.note?.includes(b.key))
    if (withKey.length < 2) return null
    const acc = withKey.reduce((a, s) => a + s.acc, 0) / withKey.length
    return { label: b.label, n: withKey.length, acc }
  }).filter(Boolean) as { label: string; n: number; acc: number }[]
  const baseAcc = nb.length ? nb.reduce((a, s) => a + s.acc, 0) / nb.length : 0

  return (
    <Shell>
      <div className="max-w-md mx-auto px-5 pt-8">
        <h1 className="text-2xl font-bold text-white mb-1">本周报告</h1>
        <p className="text-sm text-white/40 mb-5">本周(周一起) vs 上周环比</p>

        <Card className="p-5 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={`${min0.toFixed(0)}′`} label={`训练时长 ${delta(min0, min1)}`} accent />
            <Stat value={`${nb0.length}`} label={`N-back场次 ${delta(nb0.length, nb1.length)}`} />
            <Stat value={avgN0 ? avgN0.toFixed(1) : '—'} label={`平均N ${avgN1 ? delta(avgN0, avgN1) : ''}`} />
          </div>
        </Card>

        <Card className="p-5 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={`${go0.length}`} label={`围棋对局 ${delta(go0.length, go1.length)}`} />
            <Stat value={go0.length ? `${Math.round(goWin0 * 100)}%` : '—'} label="围棋胜率" accent />
            <Stat value={`${fm0.length}`} label={`费米题数 ${delta(fm0.length, fm1.length)}`} />
          </div>
          {fm0.length > 0 && (
            <div className="text-xs text-white/40 mt-3 text-center">
              费米"优秀"率 {Math.round(fmGood0 * 100)}% {fm1.length ? delta(fmGood0, fmGood1) : ''}
            </div>
          )}
        </Card>

        <Card className="p-5 mb-4">
          <div className="text-sm font-semibold text-white/80 mb-3">🧪 状态 × 表现(来自认知日志)</div>
          {noteAnalysis.length === 0 ? (
            <p className="text-xs text-white/35 leading-5">
              训练后在结果页写一句备注(如"喝了咖啡""睡得差""早上练"),积累 2 条以上同类记录后,这里会告诉你在什么状态下表现最好。
            </p>
          ) : (
            <>
              {noteAnalysis.map(a => (
                <div key={a.label} className="flex justify-between items-center py-2 border-b border-white/5 text-sm">
                  <span className="text-white/60">{a.label} <span className="text-white/30">×{a.n}</span></span>
                  <span className={a.acc >= baseAcc ? 'text-[#5eead4]' : 'text-[#f0a3b5]'}>
                    {Math.round(a.acc * 100)}% {a.acc >= baseAcc ? '↑' : '↓'}
                  </span>
                </div>
              ))}
              <div className="text-xs text-white/35 mt-2">对比你的总平均 {Math.round(baseAcc * 100)}%</div>
            </>
          )}
        </Card>
      </div>
    </Shell>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Shell, Card, Ring, Stat, MiniChart, ACCENT } from '../components/ui'
import { loadSessions, computeStats, type NBackSession } from '../lib/storage'
import { loadRank, loadGames, loadFermi, rankName, type GoRank } from '../lib/gameStore'

const DAILY_GOAL_MIN = 20

export default function Dashboard() {
  const [sessions, setSessions] = useState<NBackSession[] | null>(null)
  const [rank, setRank] = useState<GoRank | null>(null)
  const [goCount, setGoCount] = useState(0)
  const [fermiCount, setFermiCount] = useState(0)
  useEffect(() => {
    loadSessions().then(setSessions)
    loadRank().then(setRank)
    loadGames().then(g => setGoCount(g.length))
    loadFermi().then(f => setFermiCount(f.length))
  }, [])

  if (!sessions) return <Shell><div className="p-10 text-center text-white/40">加载中…</div></Shell>
  const st = computeStats(sessions)
  const latest = sessions[sessions.length - 1]

  return (
    <Shell>
      <div className="max-w-md mx-auto px-5 pt-8">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">认知健身房</h1>
          <span className="text-xs text-white/35">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</span>
        </div>

        {/* 今日环 + 关键数字 */}
        <Card className="p-6 mb-4">
          <div className="flex items-center gap-6">
            <Ring pct={st.todayMin / DAILY_GOAL_MIN} label={`${st.todayMin.toFixed(0)}′`} sub={`目标 ${DAILY_GOAL_MIN}′`} />
            <div className="flex-1 grid grid-cols-2 gap-y-5">
              <Stat value={`${st.streak}`} label="连续天数 🔥" accent />
              <Stat value={`${st.todaySessions}`} label="今日场次" />
              <Stat value={latest ? `N=${latest.nextN}` : 'N=2'} label="当前难度" accent />
              <Stat value={`${st.total}`} label="累计场次" />
            </div>
          </div>
        </Card>

        {/* 14天曲线 */}
        <Card className="p-5 mb-4">
          <div className="text-sm font-semibold text-white/80 mb-3">近 14 天 N 值曲线</div>
          {st.total > 0
            ? <MiniChart data={st.days} />
            : <div className="text-center text-white/30 text-sm py-8">还没有训练记录,先来第一场</div>}
        </Card>

        {/* 模块入口 */}
        <Link to="/nback">
          <Card className="p-5 mb-3 flex items-center justify-between active:scale-[.98] transition border-[#5eead4]/30">
            <div>
              <div className="font-bold text-white">🧠 双重 N-back</div>
              <div className="text-xs text-white/40 mt-1">工作记忆 · 每天 20 分钟 ≈ 15 场</div>
            </div>
            <div className="text-2xl font-black" style={{ color: ACCENT }}>→</div>
          </Card>
        </Link>
        <Link to="/go">
          <Card className="p-5 mb-3 flex items-center justify-between active:scale-[.98] transition">
            <div>
              <div className="font-bold text-white">⚫ 9路围棋道场</div>
              <div className="text-xs text-white/40 mt-1">
                {rank ? `${rankName(rank.rank)} · ${rank.wins}胜${rank.losses}负 · ${goCount} 局` : 'MCTS 引擎 · 教学 · 死活题'}
              </div>
            </div>
            <div className="text-2xl font-black" style={{ color: ACCENT }}>→</div>
          </Card>
        </Link>
        <Link to="/fermi">
          <Card className="p-5 mb-3 flex items-center justify-between active:scale-[.98] transition">
            <div>
              <div className="font-bold text-white">🔢 费米估算竞技场</div>
              <div className="text-xs text-white/40 mt-1">量级思维 · 80 题 · 已做 {fermiCount} 次</div>
            </div>
            <div className="text-2xl font-black" style={{ color: ACCENT }}>→</div>
          </Card>
        </Link>
        <Link to="/weekly">
          <Card className="p-5 flex items-center justify-between active:scale-[.98] transition border-white/15">
            <div>
              <div className="font-bold text-white">📈 本周报告</div>
              <div className="text-xs text-white/40 mt-1">三模块环比 · 状态×表现分析</div>
            </div>
            <div className="text-2xl font-black text-white/40">→</div>
          </Card>
        </Link>
      </div>
    </Shell>
  )
}

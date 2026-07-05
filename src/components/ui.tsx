import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

export const ACCENT = '#5eead4'

export function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const tabs = [
    { to: '/', label: '仪表盘', icon: '📊' },
    { to: '/nback', label: 'N-back', icon: '🧠' },
    { to: '/go', label: '围棋', icon: '⚫' },
    { to: '/fermi', label: '费米', icon: '🔢' },
    { to: '/settings', label: '设置', icon: '⚙️' },
  ]
  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#e6edf3] flex flex-col">
      <main className="flex-1 pb-24">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 border-t border-white/5 bg-[#0b0e11]/90 backdrop-blur-xl z-50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-md mx-auto flex">
          {tabs.map(t => (
            <Link key={t.to} to={t.to}
              className={`flex-1 py-3 text-center text-xs transition ${
                loc.pathname === t.to ? 'text-[#5eead4]' : 'text-white/40'
              }`}>
              <div className="text-lg leading-none mb-1">{t.icon}</div>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/8 bg-white/[0.03] ${className}`}>{children}</div>
}

/** 环形进度 */
export function Ring({ pct, size = 120, stroke = 10, label, sub }: {
  pct: number; size?: number; stroke?: number; label: string; sub: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, pct))
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ACCENT} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1)' }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-xl font-bold text-white">{label}</div>
        <div className="text-[10px] text-white/40 mt-0.5">{sub}</div>
      </div>
    </div>
  )
}

export function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold tabular-nums ${accent ? 'text-[#5eead4]' : 'text-white'}`}>{value}</div>
      <div className="text-[11px] text-white/40 mt-1">{label}</div>
    </div>
  )
}

/** 迷你折线图（14 天 N 值曲线） */
export function MiniChart({ data, height = 140 }: { data: { day: string; maxN: number; avgN: number }[]; height?: number }) {
  const W = 340, H = height, P = 24
  const maxV = Math.max(3, ...data.map(d => d.maxN)) + 0.5
  const x = (i: number) => P + (i / (data.length - 1)) * (W - P * 2)
  const y = (v: number) => H - P - (v / maxV) * (H - P * 2)
  const line = (get: (d: typeof data[0]) => number) =>
    data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(get(d)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[1, 2, 3, 4, 5].filter(v => v < maxV).map(v => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.05)" />
          <text x={6} y={y(v) + 3} fontSize="9" fill="rgba(255,255,255,.3)">{v}</text>
        </g>
      ))}
      <path d={line(d => d.maxN)} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
      <path d={line(d => d.avgN)} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" strokeDasharray="4 4" />
      {data.map((d, i) => d.maxN > 0 && (
        <circle key={i} cx={x(i)} cy={y(d.maxN)} r="3" fill={ACCENT} />
      ))}
      <text x={P} y={12} fontSize="9" fill="rgba(255,255,255,.35)">— 每日最高 N   ┄ 平均 N</text>
    </svg>
  )
}

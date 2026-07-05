import { SIZE, BLACK, WHITE, type Board } from '../lib/go'

/** SVG 9路棋盘。cell=40,边距=28 */
export default function GoBoard({ board, lastMove = -1, dead, territory, onTap, disabled }: {
  board: Board
  lastMove?: number
  dead?: Set<number>
  territory?: Map<number, number>   // pos -> BLACK/WHITE 的领地染色
  onTap?: (pos: number) => void
  disabled?: boolean
}) {
  const C = 40, M = 28, W = M * 2 + C * (SIZE - 1)
  const px = (v: number) => M + v * C
  const stars = [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="w-full touch-none select-none"
      style={{ background: '#c8a24e', borderRadius: 12 }}
      onClick={e => {
        if (disabled || !onTap) return
        const svg = e.currentTarget
        const pt = svg.createSVGPoint()
        pt.x = e.clientX; pt.y = e.clientY
        const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
        const x = Math.round((p.x - M) / C), y = Math.round((p.y - M) / C)
        if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) onTap(y * SIZE + x)
      }}>
      {/* 网格 */}
      {Array.from({ length: SIZE }, (_, i) => (
        <g key={i} stroke="#5a4318" strokeWidth="1.2">
          <line x1={px(0)} y1={px(i)} x2={px(SIZE - 1)} y2={px(i)} />
          <line x1={px(i)} y1={px(0)} x2={px(i)} y2={px(SIZE - 1)} />
        </g>
      ))}
      {/* 星位 */}
      {stars.map(([x, y]) => <circle key={`${x}${y}`} cx={px(x)} cy={px(y)} r="4" fill="#5a4318" />)}
      {/* 领地染色 */}
      {territory && [...territory.entries()].map(([pos, c]) => (
        <rect key={`t${pos}`} x={px(pos % SIZE) - 7} y={px(Math.floor(pos / SIZE)) - 7} width="14" height="14" rx="3"
          fill={c === BLACK ? '#111' : '#fff'} opacity="0.55" />
      ))}
      {/* 棋子 */}
      {board.map((v, i) => {
        if (v === 0) return null
        const x = px(i % SIZE), y = px(Math.floor(i / SIZE))
        const isDead = dead?.has(i)
        return (
          <g key={i} opacity={isDead ? 0.35 : 1}>
            <circle cx={x} cy={y} r={C * 0.46}
              fill={v === BLACK ? '#1a1a1a' : '#f5f5f0'}
              stroke={v === BLACK ? '#000' : '#bbb'} strokeWidth="1" />
            {v === WHITE && <circle cx={x - 5} cy={y - 6} r={C * 0.13} fill="#fff" opacity=".8" />}
            {i === lastMove && <circle cx={x} cy={y} r={C * 0.16} fill="none"
              stroke={v === BLACK ? '#5eead4' : '#e0564f'} strokeWidth="2.5" />}
            {isDead && <line x1={x - 8} y1={y - 8} x2={x + 8} y2={y + 8} stroke="#e0564f" strokeWidth="3" />}
          </g>
        )
      })}
    </svg>
  )
}

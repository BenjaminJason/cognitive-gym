import { useEffect, useRef, useState } from 'react'
import { Shell, Card } from '../components/ui'
import { loadSettings, saveSettings, exportJSON, importJSON, type Settings } from '../lib/storage'
import { loadAI, saveAI, type AIConfig } from '../lib/gameStore'

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [ai, setAi] = useState<AIConfig>({ apiKey: '', model: 'claude-sonnet-5' })
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSettings().then(setS); loadAI().then(setAi) }, [])
  if (!s) return <Shell><div className="p-10 text-center text-white/40">加载中…</div></Shell>

  const upd = (patch: Partial<Settings>) => {
    const ns = { ...s, ...patch }
    setS(ns); saveSettings(ns)
  }

  const doExport = async () => {
    const text = await exportJSON()
    const blob = new Blob([text], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cognitive-gym-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setMsg('✅ 已导出备份')
  }

  const doImport = async (f: File) => {
    try {
      const n = await importJSON(await f.text())
      setMsg(`✅ 已恢复 ${n} 条训练记录,刷新后生效`)
    } catch (e) {
      setMsg('❌ ' + (e as Error).message)
    }
  }

  return (
    <Shell>
      <div className="max-w-md mx-auto px-5 pt-8">
        <h1 className="text-2xl font-bold text-white mb-6">设置</h1>

        <Card className="p-5 mb-4">
          <div className="text-sm font-semibold text-white/80 mb-4">N-back 训练</div>

          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-white/60">刺激间隔</span>
            <span className="text-sm font-bold text-[#5eead4]">{(s.interval / 1000).toFixed(1)} 秒</span>
          </div>
          <input type="range" min={2500} max={3500} step={100} value={s.interval}
            onChange={e => upd({ interval: Number(e.target.value) })} className="w-full mb-5" />

          <div className="flex justify-between items-center py-3 border-t border-white/5">
            <div>
              <div className="text-sm text-white/80">严格模式</div>
              <div className="text-xs text-white/35">场内不显示对错,场末统一揭晓</div>
            </div>
            <button onClick={() => upd({ strict: !s.strict })}
              className={`w-12 h-7 rounded-full transition relative ${s.strict ? 'bg-[#5eead4]' : 'bg-white/15'}`}>
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${s.strict ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div className="flex justify-between items-center py-3 border-t border-white/5">
            <div>
              <div className="text-sm text-white/80">听觉刺激</div>
              <div className="text-xs text-white/35">英文字母 或 中文数字</div>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-white/15">
              {(['en', 'zh'] as const).map(v => (
                <button key={v} onClick={() => upd({ audioSet: v })}
                  className={`px-4 py-1.5 text-sm ${s.audioSet === v ? 'bg-[#5eead4] text-[#0b0e11] font-bold' : 'text-white/50'}`}>
                  {v === 'en' ? 'ABC' : '一二三'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center py-3 border-t border-white/5">
            <div>
              <div className="text-sm text-white/80">当前难度 N</div>
              <div className="text-xs text-white/35">自适应调整,也可手动重置</div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => upd({ startN: Math.max(1, s.startN - 1) })}
                className="w-8 h-8 rounded-lg border border-white/15 text-white/70">−</button>
              <span className="font-bold text-[#5eead4] w-6 text-center">{s.startN}</span>
              <button onClick={() => upd({ startN: s.startN + 1 })}
                className="w-8 h-8 rounded-lg border border-white/15 text-white/70">+</button>
            </div>
          </div>
        </Card>

        <Card className="p-5 mb-4">
          <div className="text-sm font-semibold text-white/80 mb-4">数据</div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={doExport}
              className="py-3 rounded-xl border border-white/15 text-sm text-white/80">📤 导出备份</button>
            <button onClick={() => fileRef.current?.click()}
              className="py-3 rounded-xl border border-white/15 text-sm text-white/80">📥 导入恢复</button>
          </div>
          <input ref={fileRef} type="file" accept=".json" className="hidden"
            onChange={e => e.target.files?.[0] && doImport(e.target.files[0])} />
          {msg && <div className="text-xs text-white/50 mt-3 text-center">{msg}</div>}
        </Card>

        <Card className="p-5 mb-4">
          <div className="text-sm font-semibold text-white/80 mb-2">AI 增强(可选)</div>
          <p className="text-xs text-white/35 mb-3">用于围棋"为什么"讲解和费米拆解点评。不填也不影响任何核心训练。Key 只存在你本机。</p>
          <input value={ai.apiKey} type="password" placeholder="Anthropic API Key (sk-ant-…)"
            onChange={e => { const c = { ...ai, apiKey: e.target.value }; setAi(c); saveAI(c) }}
            className="w-full mb-2 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm outline-none focus:border-[#5eead4]/50" />
          <input value={ai.model} placeholder="模型 (默认 claude-sonnet-5)"
            onChange={e => { const c = { ...ai, model: e.target.value }; setAi(c); saveAI(c) }}
            className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm outline-none focus:border-[#5eead4]/50" />
        </Card>

        <p className="text-[11px] text-white/25 leading-5 px-1">
          科学说明:双重 N-back 采用 Jaeggi 2008 训练协议(20+N 回合,≥80% 升级 / &lt;50% 降级)。
          确定的收益是工作记忆容量与任务表现;对流体智力的远迁移在后续研究中存在争议。
          本应用只呈现真实指标,不承诺"变聪明"。
        </p>
      </div>
    </Shell>
  )
}

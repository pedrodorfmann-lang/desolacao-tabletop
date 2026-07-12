import { useEffect } from 'react'
import { useGmStore } from './store'
import { GmStage } from './GmStage'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { TokenPanel } from './components/TokenPanel'
import { HelpModal, SettingsModal } from './components/Modals'

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

export function App(): React.JSX.Element {
  const ready = useGmStore((s) => s.ready)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useGmStore.getState()
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        st.setUi({ activeTab: 'maps' })
        setTimeout(() => document.getElementById('map-search')?.focus(), 0)
        return
      }
      if (isTypingTarget(e)) return
      switch (e.key) {
        case 'b':
        case 'B':
          st.toggleBlackout()
          break
        case 'g':
        case 'G':
          st.setGrid({ enabled: !st.scene.grid.enabled })
          break
        case 'f':
        case 'F':
          st.fitView()
          break
        case 'h':
        case 'H':
          if (st.selectedTokenId) st.toggleHidden(st.selectedTokenId)
          break
        case 'Delete':
        case 'Backspace':
          if (st.selectedTokenId) st.removeToken(st.selectedTokenId)
          break
        case 'd':
        case 'D':
          if (e.ctrlKey && st.selectedTokenId) {
            e.preventDefault()
            st.duplicateToken(st.selectedTokenId)
          }
          break
        case 'Escape':
          st.setUi({ selectedTokenId: null, tool: 'select', showHelp: false, showSettings: false })
          break
        case 'PageUp':
          e.preventDefault()
          st.cycleScene(-1)
          break
        case 'PageDown':
          e.preventDefault()
          st.cycleScene(1)
          break
        case '+':
        case '=':
          st.zoomBy(1.2)
          break
        case '-':
          st.zoomBy(1 / 1.2)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-2)',
          fontFamily: 'var(--font-head)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase'
        }}
      >
        Carregando…
      </div>
    )
  }

  return (
    <div className="gm-root">
      <Header />
      <div className="gm-main">
        <Sidebar />
        <div className="stage-wrap">
          <Toolbar />
          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
            <GmStage />
            <TokenPanel />
            <MapPreparing />
          </div>
          <StatusBar />
        </div>
      </div>
      <SettingsModal />
      <HelpModal />
    </div>
  )
}

/** Aviso discreto enquanto o mapa selecionado ainda não tem cache de exibição */
function MapPreparing(): React.JSX.Element | null {
  const entry = useGmStore((s) => (s.scene.mapId ? s.library[s.scene.mapId] : undefined))
  if (!entry || entry.displayPath || entry.missing) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        background: 'rgba(18,18,18,0.92)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--text-1)',
        zIndex: 25,
        pointerEvents: 'none'
      }}
    >
      <span className="spinner" style={{ width: 12, height: 12 }} />
      Preparando mapa… {entry.name}
    </div>
  )
}

function StatusBar(): React.JSX.Element {
  const scene = useGmStore((s) => s.scene)
  const library = useGmStore((s) => s.library)
  const scenes = useGmStore((s) => s.scenes)
  const currentSceneId = useGmStore((s) => s.currentSceneId)
  const mapName = scene.mapId ? (library[scene.mapId]?.name ?? '—') : 'nenhum mapa'
  const sceneName = scenes.find((s) => s.id === currentSceneId)?.name ?? '—'
  return (
    <div className="statusbar">
      <span>
        Cena: <b style={{ color: 'var(--text-1)' }}>{sceneName}</b>
      </span>
      <span>
        Mapa: <b style={{ color: 'var(--text-1)' }}>{mapName}</b>
      </span>
      <span>{scene.tokens.length} tokens</span>
      <span>zoom {Math.round(scene.camera.scale * 100)}%</span>
      <div className="grow" />
      <span>salvamento automático ativo</span>
    </div>
  )
}

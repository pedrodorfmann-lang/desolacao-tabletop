import { useEffect, useRef, useState } from 'react'
import {
  mediaUrl,
  type HudCorner,
  type Settings,
  type StagePayload
} from '@shared/types'
import { MapStage } from '@/stage/MapStage'

const HUD_POS: Record<HudCorner, React.CSSProperties> = {
  tl: { top: 16, left: 16 },
  tr: { top: 16, right: 16 },
  bl: { bottom: 16, left: 16 },
  br: { bottom: 16, right: 16 }
}

export function PlayerApp(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const fadeRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<MapStage | null>(null)
  const [payload, setPayload] = useState<StagePayload | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // fila para aplicar payloads em ordem (troca de mapa é assíncrona)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const lastMapKeyRef = useRef<string>('')
  const settingsRef = useRef<Settings | null>(null)
  settingsRef.current = settings

  useEffect(() => {
    let disposed = false
    const stage = new MapStage({ mode: 'player' })
    stageRef.current = stage
    void stage.init(hostRef.current!).then(() => {
      if (disposed) return
      window.api.playerReady()
    })

    void window.api.getSettings().then(setSettings)
    void window.api.getLogoUrl().then(setLogoUrl)
    const unsubSettings = window.api.onSettings(setSettings)
    const unsubPing = window.api.onPing((p) => stage.ping(p.x, p.y))

    const fadeTo = (opacity: number, ms: number): Promise<void> =>
      new Promise((resolve) => {
        const el = fadeRef.current
        if (!el || ms <= 0) {
          if (el) el.style.opacity = String(opacity)
          resolve()
          return
        }
        el.style.transition = `opacity ${ms}ms ease`
        // força reflow para a transição valer a partir do estado atual
        void el.offsetWidth
        el.style.opacity = String(opacity)
        setTimeout(resolve, ms + 30)
      })

    const applyPayload = async (p: StagePayload): Promise<void> => {
      if (stage.destroyed) return
      const entry = p.scene.mapId ? (p.assets[p.scene.mapId] ?? null) : null
      const mapKey = entry ? `${entry.id}|${entry.displayPath ?? ''}` : ''
      const mapChanged = mapKey !== lastMapKeyRef.current

      if (mapChanged) {
        lastMapKeyRef.current = mapKey
        const fadeMs = settingsRef.current?.fadeMs ?? 400
        if (entry) {
          // mapa anterior permanece visível até o novo estar carregado
          const ok = await stage.preloadMap(entry)
          if (stage.destroyed) return
          if (ok && fadeMs > 0) await fadeTo(1, fadeMs / 2)
          await stage.setMap(entry)
          stage.setCamera(p.scene.camera)
          stage.drawGrid(p.scene.grid)
          stage.redrawFog(p.scene.fog)
          stage.setDrawings(p.scene.drawings)
          stage.syncTokens(p.scene.tokens, p.assets, null)
          if (ok && fadeMs > 0) await fadeTo(0, fadeMs / 2)
          return
        }
        await stage.setMap(null)
      }

      stage.setCamera(p.scene.camera)
      stage.drawGrid(p.scene.grid)
      stage.redrawFog(p.scene.fog)
      stage.setDrawings(p.scene.drawings)
      stage.syncTokens(p.scene.tokens, p.assets, null)
    }

    const unsubScene = window.api.onScene((p) => {
      setPayload(p)
      queueRef.current = queueRef.current.then(() => applyPayload(p)).catch(console.error)
    })

    return () => {
      disposed = true
      unsubScene()
      unsubSettings()
      unsubPing()
      stage.destroy()
    }
  }, [])

  const blackout = payload?.overlay.blackout ?? false
  const hud = payload?.overlay.hud
  const splashLogo = settings?.splashMode === 'logo'

  return (
    <div className="player-root">
      <div ref={hostRef} className="player-canvas-host" />
      <div ref={fadeRef} className="fade-overlay" />
      {hud?.enabled && hud.path && !blackout && (
        <div
          className="hud-widget"
          style={{ ...HUD_POS[hud.corner], width: `${hud.widthPct}%` }}
        >
          <img src={mediaUrl(hud.path)} alt="" />
        </div>
      )}
      <div className={`blackout-overlay ${blackout ? 'visible' : ''}`}>
        {splashLogo && (
          <div className="splash-inner">
            {logoUrl ? (
              <img src={logoUrl} alt="" />
            ) : (
              <div className="splash-fallback">Desolação</div>
            )}
            <div className="splash-vignette" />
            <div className="splash-grain" />
          </div>
        )}
      </div>
    </div>
  )
}

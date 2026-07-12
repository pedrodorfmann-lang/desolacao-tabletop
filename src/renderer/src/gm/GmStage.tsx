import { useEffect, useRef } from 'react'
import { nanoid } from 'nanoid'
import type { Camera, Drawing, FogStroke } from '@shared/types'
import { MapStage } from '@/stage/MapStage'
import { snapPoint, useGmStore, type Tool } from './store'

type DragState =
  | { type: 'pan'; sx: number; sy: number; cam: Camera }
  | { type: 'token'; id: string; offX: number; offY: number }
  | { type: 'brush'; mode: 'hide' | 'reveal'; size: number; points: number[] }
  | { type: 'rect'; mode: 'hide' | 'reveal' | 'calibrate'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'draw'; d: Drawing }

const TOOL_CURSORS: Record<Tool, string> = {
  select: 'default',
  fogHide: 'crosshair',
  fogReveal: 'crosshair',
  fogRectHide: 'crosshair',
  fogRectReveal: 'crosshair',
  draw: 'crosshair',
  ping: 'pointer',
  calibrate: 'crosshair'
}

export function GmStage(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<MapStage | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const tool = useGmStore((s) => s.tool)

  useEffect(() => {
    const host = hostRef.current!
    let disposed = false
    const stage = new MapStage({ mode: 'gm' })
    stageRef.current = stage

    const drawOverlayRect = (): void => {
      const st = useGmStore.getState()
      stage.overlayG.clear()
      if (st.playerInfo.open && st.playerInfo.width > 0 && st.scene.mapId) {
        const w = st.playerInfo.width
        const h = st.playerInfo.height
        const x = (stage.viewWidth - w) / 2
        const y = (stage.viewHeight - h) / 2
        stage.overlayG
          .rect(x, y, w, h)
          .stroke({ width: 1, color: 0xf2c200, alpha: 0.35 })
      }
    }

    let lastMapKey = ''
    const syncMap = async (): Promise<void> => {
      const st = useGmStore.getState()
      const entry = st.scene.mapId ? (st.library[st.scene.mapId] ?? null) : null
      const key = entry ? `${entry.id}|${entry.displayPath ?? ''}` : ''
      if (key === lastMapKey) return
      lastMapKey = key
      const ok = await stage.setMap(entry)
      if (ok && !stage.destroyed) {
        const cur = useGmStore.getState()
        stage.drawGrid(cur.scene.grid)
        stage.redrawFog(cur.scene.fog)
        stage.setDrawings(cur.scene.drawings)
        drawOverlayRect()
      }
    }

    const fullSync = (): void => {
      const st = useGmStore.getState()
      stage.setCamera(st.scene.camera)
      stage.syncTokens(st.scene.tokens, st.library, st.selectedTokenId)
      stage.drawGrid(st.scene.grid)
      stage.redrawFog(st.scene.fog)
      stage.setDrawings(st.scene.drawings)
      drawOverlayRect()
      void syncMap()
    }

    void stage.init(host).then(() => {
      if (disposed) return
      useGmStore.setState({
        gmView: { width: stage.viewWidth, height: stage.viewHeight }
      })
      stage.app.renderer.on('resize', () => {
        useGmStore.setState({
          gmView: { width: stage.viewWidth, height: stage.viewHeight }
        })
        const st = useGmStore.getState()
        stage.setCamera(st.scene.camera)
        drawOverlayRect()
      })
      fullSync()
    })

    const unsub = useGmStore.subscribe((state, prev) => {
      if (stage.destroyed) return
      if (state.scene.camera !== prev.scene.camera) {
        stage.setCamera(state.scene.camera)
        drawOverlayRect()
      }
      if (
        state.scene.tokens !== prev.scene.tokens ||
        state.selectedTokenId !== prev.selectedTokenId ||
        state.library !== prev.library
      ) {
        stage.syncTokens(state.scene.tokens, state.library, state.selectedTokenId)
      }
      if (state.scene.grid !== prev.scene.grid) stage.drawGrid(state.scene.grid)
      if (state.scene.fog !== prev.scene.fog) stage.redrawFog(state.scene.fog)
      if (state.scene.drawings !== prev.scene.drawings) stage.setDrawings(state.scene.drawings)
      if (state.playerInfo !== prev.playerInfo) drawOverlayRect()
      if (state.scene.mapId !== prev.scene.mapId || state.library !== prev.library) {
        void syncMap()
      }
    })

    return () => {
      disposed = true
      unsub()
      stage.destroy()
      stageRef.current = null
    }
  }, [])

  // ── Entrada de mouse ──────────────────────────────────────────────────────

  const localPos = (e: React.PointerEvent | React.DragEvent | React.WheelEvent): { sx: number; sy: number } => {
    const rect = hostRef.current!.getBoundingClientRect()
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }

  const doPing = (wx: number, wy: number): void => {
    stageRef.current?.ping(wx, wy)
    window.api.sendPing({ x: wx, y: wy })
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    const stage = stageRef.current
    if (!stage) return
    const st = useGmStore.getState()
    const { sx, sy } = localPos(e)
    const w = stage.screenToWorld(sx, sy)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    if (e.altKey || st.tool === 'ping') {
      doPing(w.x, w.y)
      return
    }
    if (e.button === 1) {
      dragRef.current = { type: 'pan', sx, sy, cam: { ...st.scene.camera } }
      return
    }
    if (e.button !== 0) return

    switch (st.tool) {
      case 'select': {
        const hit = stage.hitTestToken(sx, sy, st.scene.tokens, st.library)
        if (hit) {
          const tk = st.scene.tokens.find((t) => t.id === hit)!
          st.setUi({ selectedTokenId: hit })
          dragRef.current = { type: 'token', id: hit, offX: w.x - tk.x, offY: w.y - tk.y }
        } else {
          st.setUi({ selectedTokenId: null })
          dragRef.current = { type: 'pan', sx, sy, cam: { ...st.scene.camera } }
        }
        break
      }
      case 'fogHide':
      case 'fogReveal':
        dragRef.current = {
          type: 'brush',
          mode: st.tool === 'fogHide' ? 'hide' : 'reveal',
          size: st.brushSize,
          points: [w.x, w.y]
        }
        break
      case 'fogRectHide':
      case 'fogRectReveal':
        dragRef.current = {
          type: 'rect',
          mode: st.tool === 'fogRectHide' ? 'hide' : 'reveal',
          x0: w.x,
          y0: w.y,
          x1: w.x,
          y1: w.y
        }
        break
      case 'calibrate':
        dragRef.current = { type: 'rect', mode: 'calibrate', x0: w.x, y0: w.y, x1: w.x, y1: w.y }
        break
      case 'draw':
        dragRef.current = {
          type: 'draw',
          d: { id: nanoid(6), color: st.drawColor, size: st.brushSize / 3, points: [w.x, w.y] }
        }
        break
    }
    updatePreview()
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const stage = stageRef.current
    const drag = dragRef.current
    if (!stage || !drag) return
    const st = useGmStore.getState()
    const { sx, sy } = localPos(e)
    const w = stage.screenToWorld(sx, sy)

    switch (drag.type) {
      case 'pan': {
        const scale = drag.cam.scale
        st.setCamera({
          cx: drag.cam.cx - (sx - drag.sx) / scale,
          cy: drag.cam.cy - (sy - drag.sy) / scale,
          scale
        })
        break
      }
      case 'token': {
        const p = snapPoint(w.x - drag.offX, w.y - drag.offY, st.scene.grid)
        st.updateToken(drag.id, { x: p.x, y: p.y })
        break
      }
      case 'brush': {
        const n = drag.points.length
        const dx = w.x - drag.points[n - 2]
        const dy = w.y - drag.points[n - 1]
        if (dx * dx + dy * dy > (drag.size * 0.15) ** 2) {
          drag.points.push(w.x, w.y)
          updatePreview()
        }
        break
      }
      case 'rect':
        drag.x1 = w.x
        drag.y1 = w.y
        updatePreview()
        break
      case 'draw': {
        drag.d.points.push(w.x, w.y)
        updatePreview()
        break
      }
    }
  }

  const onPointerUp = (): void => {
    const drag = dragRef.current
    dragRef.current = null
    const stage = stageRef.current
    if (!stage) return
    stage.setPreview(null)
    if (!drag) return
    const st = useGmStore.getState()

    switch (drag.type) {
      case 'brush':
        st.addFogStroke({ kind: 'brush', mode: drag.mode, size: drag.size, points: drag.points })
        break
      case 'rect': {
        const x = Math.min(drag.x0, drag.x1)
        const y = Math.min(drag.y0, drag.y1)
        const rw = Math.abs(drag.x1 - drag.x0)
        const rh = Math.abs(drag.y1 - drag.y0)
        if (rw < 4 || rh < 4) break
        if (drag.mode === 'calibrate') {
          const size = Math.round((rw + rh) / 2)
          st.setGrid({
            enabled: true,
            size,
            offsetX: ((x % size) + size) % size,
            offsetY: ((y % size) + size) % size
          })
          st.setUi({ tool: 'select' })
        } else {
          st.addFogStroke({ kind: 'rect', mode: drag.mode, x, y, w: rw, h: rh })
        }
        break
      }
      case 'draw':
        if (drag.d.points.length >= 4) st.addDrawing(drag.d)
        break
    }
  }

  const updatePreview = (): void => {
    const stage = stageRef.current
    const drag = dragRef.current
    if (!stage) return
    if (!drag || drag.type === 'pan' || drag.type === 'token') {
      stage.setPreview(null)
      return
    }
    stage.setPreview((g) => {
      if (drag.type === 'brush') {
        const color = drag.mode === 'hide' ? 0x2a2f38 : 0xf2c200
        const pts = drag.points
        g.circle(pts[0], pts[1], drag.size / 2).fill({ color, alpha: 0.35 })
        if (pts.length >= 4) {
          g.moveTo(pts[0], pts[1])
          for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
          g.stroke({ width: drag.size, color, alpha: 0.35, cap: 'round', join: 'round' })
        }
      } else if (drag.type === 'rect') {
        const color =
          drag.mode === 'calibrate' ? 0xf2c200 : drag.mode === 'hide' ? 0x2a2f38 : 0xf2c200
        g.rect(
          Math.min(drag.x0, drag.x1),
          Math.min(drag.y0, drag.y1),
          Math.abs(drag.x1 - drag.x0),
          Math.abs(drag.y1 - drag.y0)
        )
          .fill({ color, alpha: 0.25 })
          .stroke({ width: 2 / stage.camera.scale, color: 0xf2c200, alpha: 0.9 })
      } else if (drag.type === 'draw') {
        const color = parseInt(drag.d.color.replace('#', ''), 16)
        const pts = drag.d.points
        if (pts.length >= 4) {
          g.moveTo(pts[0], pts[1])
          for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
          g.stroke({ width: drag.d.size, color, cap: 'round', join: 'round' })
        }
      }
    })
  }

  const onWheel = (e: React.WheelEvent): void => {
    const stage = stageRef.current
    if (!stage) return
    const st = useGmStore.getState()
    const { sx, sy } = localPos(e)

    // Ctrl+roda: escala do token selecionado · Alt+roda: rotação
    if (st.selectedTokenId && (e.ctrlKey || e.altKey)) {
      const tk = st.scene.tokens.find((t) => t.id === st.selectedTokenId)
      if (!tk) return
      if (e.ctrlKey) {
        const f = e.deltaY < 0 ? 1.08 : 1 / 1.08
        st.updateToken(tk.id, { scale: Math.min(50, Math.max(0.005, tk.scale * f)) })
      } else {
        const step = ((e.deltaY < 0 ? 15 : -15) * Math.PI) / 180
        st.updateToken(tk.id, { rotation: tk.rotation + step })
      }
      return
    }

    const cam = st.scene.camera
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const newScale = Math.min(8, Math.max(0.02, cam.scale * f))
    const wx = cam.cx + (sx - stage.viewWidth / 2) / cam.scale
    const wy = cam.cy + (sy - stage.viewHeight / 2) / cam.scale
    st.setCamera({
      cx: wx - (sx - stage.viewWidth / 2) / newScale,
      cy: wy - (sy - stage.viewHeight / 2) / newScale,
      scale: newScale
    })
  }

  // ── Drop de tokens / arquivos ────────────────────────────────────────────

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const st = useGmStore.getState()
    const assetId = e.dataTransfer.getData('application/x-asset-id')
    if (assetId) {
      const { sx, sy } = localPos(e)
      const w = stage.screenToWorld(sx, sy)
      st.addTokenAt(assetId, w.x, w.y)
      return
    }
    // arquivos do SO soltos no stage → importa como mapas
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(jpe?g|png|webp)$/i.test(f.name)
    )
    if (files.length) {
      st.importPaths(
        'map',
        files.map((f) => ({ path: window.api.getPathForFile(f), folder: '' }))
      )
    }
  }

  return (
    <div
      ref={hostRef}
      className="stage-canvas-host"
      style={{ cursor: TOOL_CURSORS[tool] }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    />
  )
}

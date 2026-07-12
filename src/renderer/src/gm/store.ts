import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  DEFAULT_SETTINGS,
  defaultOverlay,
  defaultScene,
  type AssetEntry,
  type AssetKind,
  type Camera,
  type Drawing,
  type FogStroke,
  type GridState,
  type OverlayState,
  type PlayerInfo,
  type Scene,
  type SceneState,
  type Settings,
  type StagePayload,
  type TokenInstance
} from '@shared/types'
import { generateCache, makeEntry, pairVariants } from './pipeline'

export type Tool =
  | 'select'
  | 'fogHide'
  | 'fogReveal'
  | 'fogRectHide'
  | 'fogRectReveal'
  | 'draw'
  | 'ping'
  | 'calibrate'

export type SidebarTab = 'maps' | 'tokens' | 'scenes'

interface GmStore {
  ready: boolean
  settings: Settings
  logoUrl: string | null
  library: Record<string, AssetEntry>
  scene: SceneState
  scenes: Scene[]
  currentSceneId: string | null
  overlay: OverlayState
  playerInfo: PlayerInfo
  gmView: { width: number; height: number }

  // UI
  activeTab: SidebarTab
  search: string
  tagFilter: string | null
  selectedTokenId: string | null
  tool: Tool
  brushSize: number
  drawColor: string
  showSettings: boolean
  showHelp: boolean
  cachePending: number

  init: () => Promise<void>
  setUi: (
    patch: Partial<
      Pick<
        GmStore,
        | 'activeTab'
        | 'search'
        | 'tagFilter'
        | 'selectedTokenId'
        | 'tool'
        | 'brushSize'
        | 'drawColor'
        | 'showSettings'
        | 'showHelp'
      >
    >
  ) => void
  applySettings: (patch: Partial<Settings>) => Promise<void>

  // cena
  updateScene: (patch: Partial<SceneState>) => void
  setCamera: (cam: Camera) => void
  zoomBy: (factor: number) => void
  fitView: () => void
  oneToOne: () => void
  switchMap: (mapId: string, opts?: { preserve?: boolean }) => void
  swapVariant: () => void

  // tokens
  addTokenAt: (assetId: string, x: number, y: number) => void
  updateToken: (id: string, patch: Partial<TokenInstance>) => void
  removeToken: (id: string) => void
  duplicateToken: (id: string) => void
  moveTokenZ: (id: string, dir: 'front' | 'back') => void
  toggleHidden: (id: string) => void

  // fog / desenhos / grid
  addFogStroke: (s: FogStroke) => void
  undoFog: () => void
  setFogEnabled: (b: boolean) => void
  coverAll: () => void
  revealAll: () => void
  addDrawing: (d: Drawing) => void
  clearDrawings: () => void
  setGrid: (patch: Partial<GridState>) => void

  // overlay
  toggleBlackout: () => void
  setOverlay: (patch: Partial<OverlayState>) => void
  setHud: (patch: Partial<OverlayState['hud']>) => void

  // cenas salvas
  createScene: (name?: string) => void
  activateScene: (id: string) => void
  renameScene: (id: string, name: string) => void
  deleteScene: (id: string) => void
  cycleScene: (dir: 1 | -1) => void

  // biblioteca
  updateAsset: (id: string, patch: Partial<AssetEntry>) => void
  importPaths: (kind: AssetKind, files: { path: string; folder: string }[]) => void
  linkVariants: (aId: string, bId: string) => void
  unlinkVariant: (id: string) => void
  removeAsset: (id: string) => void

  // bookmarks
  addBookmark: (name: string) => void
  gotoBookmark: (bookmarkId: string) => void
  deleteBookmark: (bookmarkId: string) => void
}

function snap(v: number, size: number, offset: number): number {
  return Math.round((v - offset - size / 2) / size) * size + size / 2 + offset
}

export function snapPoint(
  x: number,
  y: number,
  grid: GridState
): { x: number; y: number } {
  if (!grid.snap || !grid.enabled || grid.size < 4) return { x, y }
  return { x: snap(x, grid.size, grid.offsetX), y: snap(y, grid.size, grid.offsetY) }
}

export const useGmStore = create<GmStore>()((set, get) => ({
  ready: false,
  settings: { ...DEFAULT_SETTINGS },
  logoUrl: null,
  library: {},
  scene: defaultScene(),
  scenes: [],
  currentSceneId: null,
  overlay: defaultOverlay(),
  playerInfo: { open: false, width: 0, height: 0 },
  gmView: { width: 1200, height: 700 },

  activeTab: 'maps',
  search: '',
  tagFilter: null,
  selectedTokenId: null,
  tool: 'select',
  brushSize: 160,
  drawColor: '#F2C200',
  showSettings: false,
  showHelp: false,
  cachePending: 0,

  init: async () => {
    const [settings, logoUrl, libFile, scenesFile] = await Promise.all([
      window.api.getSettings(),
      window.api.getLogoUrl(),
      window.api.getLibrary(),
      window.api.getScenes()
    ])
    const library: Record<string, AssetEntry> = {}
    for (const a of libFile.assets) library[a.id] = a

    let scenes = scenesFile.scenes
    let currentSceneId = scenesFile.currentSceneId
    if (scenes.length === 0) {
      const first: Scene = {
        id: nanoid(8),
        name: 'Sessão',
        state: defaultScene(),
        createdAt: Date.now()
      }
      scenes = [first]
      currentSceneId = first.id
    }
    if (!currentSceneId || !scenes.some((s) => s.id === currentSceneId)) {
      currentSceneId = scenes[0].id
    }
    const scene = structuredClone(scenes.find((s) => s.id === currentSceneId)!.state)

    set({ settings, logoUrl, library, scenes, currentSceneId, scene, ready: true })

    // reconcilia pastas assistidas
    await reconcileFolder('map')
    await reconcileFolder('token')

    window.api.onFsEvent((ev) => {
      const st = get()
      if (ev.type === 'add') {
        const dir = ev.kind === 'map' ? st.settings.mapsDir : st.settings.tokensDir
        let folder = ''
        if (dir && ev.path.startsWith(dir)) {
          const rel = ev.path.slice(dir.length).replace(/^[\\/]+/, '').replace(/\\/g, '/')
          folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
        }
        get().importPaths(ev.kind, [{ path: ev.path, folder }])
      } else {
        const entry = Object.values(st.library).find((a) => a.path === ev.path)
        if (entry) get().updateAsset(entry.id, { missing: true })
      }
    })
    window.api.onPlayerInfo((info) => set({ playerInfo: info }))
    window.api.onSettings((s) => set({ settings: s }))
    window.api.onShowHelp(() => set({ showHelp: true }))

    kickCacheQueue()
    schedulePublish()
  },

  setUi: (patch) => set(patch),

  applySettings: async (patch) => {
    const s = await window.api.setSettings(patch)
    set({ settings: s })
    if (patch.mapsDir !== undefined) await reconcileFolder('map')
    if (patch.tokensDir !== undefined) await reconcileFolder('token')
    kickCacheQueue()
  },

  // ── Cena ──
  updateScene: (patch) => set((s) => ({ scene: { ...s.scene, ...patch } })),
  setCamera: (camera) => set((s) => ({ scene: { ...s.scene, camera } })),
  zoomBy: (factor) => {
    const { scene } = get()
    const scale = Math.min(8, Math.max(0.02, scene.camera.scale * factor))
    get().setCamera({ ...scene.camera, scale })
  },
  fitView: () => {
    const st = get()
    const entry = st.scene.mapId ? st.library[st.scene.mapId] : null
    if (!entry || !entry.width) return
    const target = st.playerInfo.open ? st.playerInfo : st.gmView
    if (!target.width || !target.height) return
    const scale = Math.min(target.width / entry.width, target.height / entry.height)
    get().setCamera({ cx: entry.width / 2, cy: entry.height / 2, scale })
  },
  oneToOne: () => {
    const { scene } = get()
    get().setCamera({ ...scene.camera, scale: 1 })
  },
  switchMap: (mapId, opts) => {
    const st = get()
    if (st.scene.mapId === mapId) return
    if (opts?.preserve) {
      set((s) => ({ scene: { ...s.scene, mapId } }))
      return
    }
    const entry = st.library[mapId]
    let camera = st.scene.camera
    if (entry && entry.width) {
      const target = st.playerInfo.open ? st.playerInfo : st.gmView
      const scale =
        target.width && target.height
          ? Math.min(target.width / entry.width, target.height / entry.height)
          : 1
      camera = { cx: entry.width / 2, cy: entry.height / 2, scale }
    }
    set((s) => ({
      scene: {
        ...s.scene,
        mapId,
        camera,
        fog: { ...s.scene.fog, strokes: [] },
        drawings: []
      },
      selectedTokenId: null
    }))
    kickCacheQueue()
  },
  swapVariant: () => {
    const st = get()
    const entry = st.scene.mapId ? st.library[st.scene.mapId] : null
    if (entry?.variantId && st.library[entry.variantId]) {
      get().switchMap(entry.variantId, { preserve: true })
    }
  },

  // ── Tokens ──
  addTokenAt: (assetId, x, y) => {
    const st = get()
    const entry = st.library[assetId]
    if (!entry) return
    const grid = st.scene.grid
    const p = snapPoint(x, y, grid)
    // largura inicial: 1 célula do grid (se ativo) ou ~1/10 do mapa
    const mapEntry = st.scene.mapId ? st.library[st.scene.mapId] : null
    const targetW =
      grid.enabled && grid.size >= 4
        ? grid.size
        : mapEntry?.width
          ? mapEntry.width / 10
          : 300
    const scale = entry.width ? targetW / entry.width : 1
    const maxZ = st.scene.tokens.reduce((m, t) => Math.max(m, t.z), 0)
    const token: TokenInstance = {
      id: nanoid(8),
      assetId,
      x: p.x,
      y: p.y,
      scale,
      rotation: 0,
      z: maxZ + 1,
      hidden: false,
      label: entry.name,
      showLabelOnTV: false
    }
    set((s) => ({
      scene: { ...s.scene, tokens: [...s.scene.tokens, token] },
      selectedTokenId: token.id
    }))
  },
  updateToken: (id, patch) =>
    set((s) => ({
      scene: {
        ...s.scene,
        tokens: s.scene.tokens.map((t) => (t.id === id ? { ...t, ...patch } : t))
      }
    })),
  removeToken: (id) =>
    set((s) => ({
      scene: { ...s.scene, tokens: s.scene.tokens.filter((t) => t.id !== id) },
      selectedTokenId: s.selectedTokenId === id ? null : s.selectedTokenId
    })),
  duplicateToken: (id) => {
    const st = get()
    const src = st.scene.tokens.find((t) => t.id === id)
    if (!src) return
    const offset = st.scene.grid.enabled ? st.scene.grid.size : 60
    const maxZ = st.scene.tokens.reduce((m, t) => Math.max(m, t.z), 0)
    const copy: TokenInstance = { ...src, id: nanoid(8), x: src.x + offset, y: src.y, z: maxZ + 1 }
    set((s) => ({
      scene: { ...s.scene, tokens: [...s.scene.tokens, copy] },
      selectedTokenId: copy.id
    }))
  },
  moveTokenZ: (id, dir) => {
    const st = get()
    const zs = st.scene.tokens.map((t) => t.z)
    const target = dir === 'front' ? Math.max(...zs, 0) + 1 : Math.min(...zs, 0) - 1
    get().updateToken(id, { z: target })
  },
  toggleHidden: (id) => {
    const t = get().scene.tokens.find((t) => t.id === id)
    if (t) get().updateToken(id, { hidden: !t.hidden })
  },

  // ── Fog / desenhos / grid ──
  addFogStroke: (stroke) =>
    set((s) => ({
      scene: {
        ...s.scene,
        fog: { ...s.scene.fog, enabled: true, strokes: [...s.scene.fog.strokes, stroke] }
      }
    })),
  undoFog: () =>
    set((s) => ({
      scene: { ...s.scene, fog: { ...s.scene.fog, strokes: s.scene.fog.strokes.slice(0, -1) } }
    })),
  setFogEnabled: (b) =>
    set((s) => ({ scene: { ...s.scene, fog: { ...s.scene.fog, enabled: b } } })),
  coverAll: () => get().addFogStroke({ kind: 'fill', mode: 'hide' }),
  revealAll: () =>
    set((s) => ({ scene: { ...s.scene, fog: { ...s.scene.fog, strokes: [] } } })),
  addDrawing: (d) =>
    set((s) => ({ scene: { ...s.scene, drawings: [...s.scene.drawings, d] } })),
  clearDrawings: () => set((s) => ({ scene: { ...s.scene, drawings: [] } })),
  setGrid: (patch) =>
    set((s) => ({ scene: { ...s.scene, grid: { ...s.scene.grid, ...patch } } })),

  // ── Overlay ──
  toggleBlackout: () =>
    set((s) => ({ overlay: { ...s.overlay, blackout: !s.overlay.blackout } })),
  setOverlay: (patch) => set((s) => ({ overlay: { ...s.overlay, ...patch } })),
  setHud: (patch) =>
    set((s) => ({ overlay: { ...s.overlay, hud: { ...s.overlay.hud, ...patch } } })),

  // ── Cenas salvas ──
  createScene: (name) => {
    const st = get()
    const scene: Scene = {
      id: nanoid(8),
      name: name || `Cena ${st.scenes.length + 1}`,
      state: structuredClone(st.scene),
      createdAt: Date.now()
    }
    set((s) => ({
      scenes: [...syncCurrentSceneInto(s.scenes, s.currentSceneId, s.scene), scene],
      currentSceneId: scene.id
    }))
  },
  activateScene: (id) => {
    const st = get()
    if (id === st.currentSceneId) return
    const target = st.scenes.find((s) => s.id === id)
    if (!target) return
    set((s) => ({
      scenes: syncCurrentSceneInto(s.scenes, s.currentSceneId, s.scene),
      currentSceneId: id,
      scene: structuredClone(target.state),
      selectedTokenId: null
    }))
    kickCacheQueue()
  },
  renameScene: (id, name) =>
    set((s) => ({ scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, name } : sc)) })),
  deleteScene: (id) => {
    const st = get()
    if (st.scenes.length <= 1) return
    const remaining = st.scenes.filter((s) => s.id !== id)
    if (st.currentSceneId === id) {
      const next = remaining[0]
      set({
        scenes: remaining,
        currentSceneId: next.id,
        scene: structuredClone(next.state),
        selectedTokenId: null
      })
    } else {
      set({ scenes: remaining })
    }
  },
  cycleScene: (dir) => {
    const st = get()
    if (st.scenes.length < 2) return
    const idx = st.scenes.findIndex((s) => s.id === st.currentSceneId)
    const next = st.scenes[(idx + dir + st.scenes.length) % st.scenes.length]
    get().activateScene(next.id)
  },

  // ── Biblioteca ──
  updateAsset: (id, patch) =>
    set((s) => {
      const cur = s.library[id]
      if (!cur) return {}
      return { library: { ...s.library, [id]: { ...cur, ...patch } } }
    }),
  importPaths: (kind, files) => {
    const st = get()
    const byPath = new Map(Object.values(st.library).map((a) => [a.path, a]))
    const additions: AssetEntry[] = []
    for (const f of files) {
      const existing = byPath.get(f.path)
      if (existing) {
        if (existing.missing) get().updateAsset(existing.id, { missing: false })
        continue
      }
      additions.push(makeEntry(kind, f.path, f.folder))
    }
    if (additions.length === 0) return
    set((s) => {
      const library = { ...s.library }
      for (const a of additions) library[a.id] = a
      for (const changed of pairVariants(Object.values(library))) {
        library[changed.id] = changed
      }
      return { library }
    })
    kickCacheQueue()
  },
  linkVariants: (aId, bId) => {
    get().updateAsset(aId, { variantId: bId })
    get().updateAsset(bId, { variantId: aId })
  },
  unlinkVariant: (id) => {
    const other = get().library[id]?.variantId
    get().updateAsset(id, { variantId: undefined })
    if (other) get().updateAsset(other, { variantId: undefined })
  },
  removeAsset: (id) =>
    set((s) => {
      const library = { ...s.library }
      delete library[id]
      for (const a of Object.values(library)) {
        if (a.variantId === id) library[a.id] = { ...a, variantId: undefined }
      }
      return { library }
    }),

  // ── Bookmarks ──
  addBookmark: (name) => {
    const st = get()
    if (!st.scene.mapId) return
    const entry = st.library[st.scene.mapId]
    if (!entry) return
    const bookmarks = [
      ...(entry.bookmarks ?? []),
      { id: nanoid(6), name, camera: { ...st.scene.camera } }
    ]
    get().updateAsset(entry.id, { bookmarks })
  },
  gotoBookmark: (bookmarkId) => {
    const st = get()
    const entry = st.scene.mapId ? st.library[st.scene.mapId] : null
    const bm = entry?.bookmarks?.find((b) => b.id === bookmarkId)
    if (bm) get().setCamera({ ...bm.camera })
  },
  deleteBookmark: (bookmarkId) => {
    const st = get()
    const entry = st.scene.mapId ? st.library[st.scene.mapId] : null
    if (!entry) return
    get().updateAsset(entry.id, {
      bookmarks: (entry.bookmarks ?? []).filter((b) => b.id !== bookmarkId)
    })
  }
}))

function syncCurrentSceneInto(
  scenes: Scene[],
  currentSceneId: string | null,
  liveState: SceneState
): Scene[] {
  return scenes.map((sc) =>
    sc.id === currentSceneId ? { ...sc, state: structuredClone(liveState) } : sc
  )
}

// ── Reconciliação de pastas assistidas ───────────────────────────────────────

async function reconcileFolder(kind: AssetKind): Promise<void> {
  const st = useGmStore.getState()
  const dir = kind === 'map' ? st.settings.mapsDir : st.settings.tokensDir
  if (!dir) return
  const scanned = await window.api.scanFolder(kind)
  const scannedPaths = new Set(scanned.map((f) => f.path))
  st.importPaths(kind, scanned)
  // marca como ausentes os que sumiram (apenas dentro da pasta assistida)
  const after = useGmStore.getState()
  for (const a of Object.values(after.library)) {
    if (a.kind !== kind) continue
    if (a.path.startsWith(dir) && !scannedPaths.has(a.path) && !a.missing) {
      after.updateAsset(a.id, { missing: true })
    }
  }
}

// ── Fila de geração de cache ─────────────────────────────────────────────────

let cacheRunning = false
/** falhas permanentes de codificação — não reprocessa nesta sessão */
const cacheFailed = new Set<string>()
/** falhas transitórias (OneDrive hidratando) — reprocessa após um tempo */
const cacheRetry = new Set<string>()
let retryTimer: ReturnType<typeof setTimeout> | null = null

export function kickCacheQueue(): void {
  if (cacheRunning) return
  cacheRunning = true
  void (async () => {
    try {
      for (;;) {
        const st = useGmStore.getState()
        if (!st.ready) break
        const pending = Object.values(st.library).filter(
          (a) => !a.displayPath && !a.missing && !cacheFailed.has(a.id) && !cacheRetry.has(a.id)
        )
        useGmStore.setState({ cachePending: pending.length + cacheRetry.size })
        if (pending.length === 0) break
        // prioriza o mapa atual, depois mapas, depois tokens
        pending.sort((a, b) => {
          const cur = st.scene.mapId
          const pa = a.id === cur ? 0 : a.kind === 'map' ? 1 : 2
          const pb = b.id === cur ? 0 : b.kind === 'map' ? 1 : 2
          return pa - pb || a.addedAt - b.addedAt
        })
        const entry = pending[0]
        const result = await generateCache(entry, st.settings.displayMaxEdge)
        if (result.patch) {
          cacheRetry.delete(entry.id)
          st.updateAsset(entry.id, result.patch)
        } else if (result.retry) {
          // arquivo provavelmente somente-online (OneDrive) → tenta de novo depois
          cacheRetry.add(entry.id)
        } else {
          cacheFailed.add(entry.id)
          const exists = await window.api.fileExists(entry.path)
          if (!exists) st.updateAsset(entry.id, { missing: true })
        }
      }
    } finally {
      cacheRunning = false
      const st = useGmStore.getState()
      useGmStore.setState({
        cachePending:
          Object.values(st.library).filter(
            (a) => !a.displayPath && !a.missing && !cacheFailed.has(a.id) && !cacheRetry.has(a.id)
          ).length + cacheRetry.size
      })
      // reagenda os que falharam por hidratação (OneDrive baixa em segundo plano)
      if (cacheRetry.size > 0 && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null
          for (const id of cacheRetry) cacheRetry.delete(id)
          kickCacheQueue()
        }, 30000)
      }
    }
  })()
}

// ── Publicação (GM → Player) e persistência ──────────────────────────────────

function buildPayload(st: GmStore): StagePayload {
  const assets: Record<string, AssetEntry> = {}
  if (st.scene.mapId && st.library[st.scene.mapId]) {
    assets[st.scene.mapId] = st.library[st.scene.mapId]
  }
  for (const t of st.scene.tokens) {
    if (st.library[t.assetId]) assets[t.assetId] = st.library[t.assetId]
  }
  return { scene: st.scene, overlay: st.overlay, assets }
}

let publishTimer: ReturnType<typeof setTimeout> | null = null
export function schedulePublish(): void {
  if (publishTimer) return
  publishTimer = setTimeout(() => {
    publishTimer = null
    const st = useGmStore.getState()
    if (!st.ready) return
    window.api.publishScene(buildPayload(st))
  }, 33)
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const st = useGmStore.getState()
    if (!st.ready) return
    window.api.saveScenes({
      scenes: syncCurrentSceneInto(st.scenes, st.currentSceneId, st.scene),
      currentSceneId: st.currentSceneId
    })
  }, 700)
}

let persistLibTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersistLibrary(): void {
  if (persistLibTimer) clearTimeout(persistLibTimer)
  persistLibTimer = setTimeout(() => {
    persistLibTimer = null
    const st = useGmStore.getState()
    if (!st.ready) return
    window.api.saveLibrary({ assets: Object.values(st.library) })
  }, 700)
}

useGmStore.subscribe((state, prev) => {
  if (state.scene !== prev.scene || state.overlay !== prev.overlay) {
    schedulePublish()
    schedulePersist()
  }
  if (state.library !== prev.library) {
    schedulePublish()
    schedulePersistLibrary()
  }
  if (state.scenes !== prev.scenes || state.currentSceneId !== prev.currentSceneId) {
    schedulePersist()
  }
})

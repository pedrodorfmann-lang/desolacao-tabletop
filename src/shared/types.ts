// ── Tipos compartilhados entre main, preload e renderers ──────────────────────

export type AssetKind = 'map' | 'token'

export interface AssetEntry {
  id: string
  kind: AssetKind
  name: string
  /** Caminho absoluto do arquivo original no disco */
  path: string
  tags: string[]
  /** Subpasta relativa dentro da pasta assistida (vira "pasta" na UI) */
  folder: string
  /** id do asset vinculado como variante (ex.: DIA ↔ NOITE) */
  variantId?: string
  width: number
  height: number
  /** Dimensões da versão de exibição em cache (espaço de coordenadas da cena) */
  displayWidth: number
  displayHeight: number
  /** Caminhos absolutos das versões em cache (userData/cache) */
  thumbPath?: string
  displayPath?: string
  /** Arquivo original sumiu do disco */
  missing?: boolean
  addedAt: number
  /** Bookmarks de câmera (apenas mapas) */
  bookmarks?: CameraBookmark[]
}

export interface CameraBookmark {
  id: string
  name: string
  camera: Camera
}

export interface Camera {
  /** Centro da câmera em coordenadas do mapa (espaço da versão de exibição) */
  cx: number
  cy: number
  /** Pixels de tela por pixel de mapa */
  scale: number
}

export interface TokenInstance {
  id: string
  assetId: string
  x: number
  y: number
  scale: number
  rotation: number
  z: number
  hidden: boolean
  label: string
  showLabelOnTV: boolean
}

export type FogStroke =
  | { kind: 'brush'; mode: 'hide' | 'reveal'; size: number; points: number[] }
  | { kind: 'rect'; mode: 'hide' | 'reveal'; x: number; y: number; w: number; h: number }
  | { kind: 'fill'; mode: 'hide' | 'reveal' }

export interface FogState {
  enabled: boolean
  strokes: FogStroke[]
}

export interface GridState {
  enabled: boolean
  size: number
  color: string
  opacity: number
  offsetX: number
  offsetY: number
  snap: boolean
}

export interface Drawing {
  id: string
  color: string
  size: number
  points: number[]
}

export interface SceneState {
  mapId: string | null
  camera: Camera
  tokens: TokenInstance[]
  fog: FogState
  grid: GridState
  drawings: Drawing[]
}

export interface Scene {
  id: string
  name: string
  state: SceneState
  createdAt: number
}

export interface ScenesFile {
  scenes: Scene[]
  currentSceneId: string | null
}

export type HudCorner = 'tl' | 'tr' | 'bl' | 'br'

export interface OverlayState {
  blackout: boolean
  hud: {
    enabled: boolean
    /** Caminho absoluto da imagem do HUD */
    path: string | null
    corner: HudCorner
    /** Largura em % da tela do player */
    widthPct: number
  }
}

/** Payload completo publicado do GM para o Player */
export interface StagePayload {
  scene: SceneState
  overlay: OverlayState
  /** Dados dos assets referenciados (mapa atual + tokens), para o player resolver texturas */
  assets: Record<string, AssetEntry>
}

export interface PingEvent {
  x: number
  y: number
  color?: string
}

export interface Settings {
  mapsDir: string | null
  tokensDir: string | null
  playerDisplayId: number | null
  fadeMs: number
  splashMode: 'black' | 'logo'
  displayMaxEdge: number
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
  current: boolean
}

export interface FsEvent {
  kind: AssetKind
  type: 'add' | 'unlink'
  path: string
}

export interface PlayerInfo {
  width: number
  height: number
  open: boolean
}

export interface LibraryFile {
  assets: AssetEntry[]
}

export const IMG_EXT_RE = /\.(jpe?g|png|webp)$/i

export function mediaUrl(absPath: string): string {
  const segments = absPath.replace(/\\/g, '/').split('/').map(encodeURIComponent)
  return 'media://local/' + segments.join('/')
}

export const DEFAULT_SETTINGS: Settings = {
  mapsDir: null,
  tokensDir: null,
  playerDisplayId: null,
  fadeMs: 400,
  splashMode: 'logo',
  displayMaxEdge: 4096
}

export function defaultScene(): SceneState {
  return {
    mapId: null,
    camera: { cx: 0, cy: 0, scale: 1 },
    tokens: [],
    fog: { enabled: false, strokes: [] },
    grid: {
      enabled: false,
      size: 100,
      color: '#F2C200',
      opacity: 0.25,
      offsetX: 0,
      offsetY: 0,
      snap: false
    },
    drawings: []
  }
}

export function defaultOverlay(): OverlayState {
  return {
    blackout: false,
    hud: { enabled: false, path: null, corner: 'br', widthPct: 18 }
  }
}

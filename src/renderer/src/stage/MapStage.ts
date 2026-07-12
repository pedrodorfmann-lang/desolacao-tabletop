import {
  Application,
  Assets,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Text,
  TextStyle,
  Texture,
  TilingSprite
} from 'pixi.js'
import {
  mediaUrl,
  type AssetEntry,
  type Camera,
  type Drawing,
  type FogState,
  type GridState,
  type TokenInstance
} from '@shared/types'

export interface MapStageOptions {
  mode: 'gm' | 'player'
  onTokenPointerDown?: (tokenId: string, e: PointerLikeEvent) => void
}

export interface PointerLikeEvent {
  globalX: number
  globalY: number
  button: number
}

interface TokenNode {
  root: Container
  sprite: Sprite
  ring: Graphics
  label: Text
  labelBg: Graphics
  badge: Text
  badgeBg: Graphics
  textureUrl: string | null
  /** tamanho-alvo do sprite em px de mundo (reaplicado quando a textura carrega) */
  desiredW: number
  desiredH: number
  rotation: number
}

interface ActivePing {
  x: number
  y: number
  t0: number
  color: number
}

const FOG_RT_CAP = 4096
const PING_DURATION = 1400

/**
 * Mapas SEMPRE renderizam da versão de exibição em cache (WebP reduzido):
 * o original pode ser grande demais para o WebGL (>16384 px) e, se for um
 * arquivo "somente online" do OneDrive, sua leitura trava. Só é considerado
 * pronto quando o cache existe. Tokens podem usar o original (são pequenos).
 */
export function isMapReady(entry: AssetEntry): boolean {
  return entry.kind !== 'map' || !!entry.displayPath
}

export function textureUrlFor(entry: AssetEntry): string {
  return mediaUrl(entry.displayPath ?? entry.path)
}

/**
 * Motor Pixi compartilhado entre GM e Player.
 * Coordenadas de cena = pixels da imagem ORIGINAL do mapa.
 */
export class MapStage {
  app: Application
  world: Container
  private mapLayer: Container
  private mapSprite: Sprite | null = null
  private gridG: Graphics
  private drawingsG: Graphics
  private previewG: Graphics
  private fogSprite: Sprite
  private fogRT: RenderTexture | null = null
  /** camada de "fumaça" recortada pela forma da névoa (visual temático) */
  private fogSmoke: TilingSprite | null = null
  private fogMask: Sprite | null = null
  private smokeTexture: Texture | null = null
  private tokensLayer: Container
  private pingsG: Graphics
  /** overlay em espaço de tela (retângulo da TV no GM) */
  overlayG: Graphics

  private opts: MapStageOptions
  private tokenNodes = new Map<string, TokenNode>()
  private tokenTextures = new Map<string, Texture | 'loading' | 'error'>()
  private pings: ActivePing[] = []
  private currentMapUrl: string | null = null
  private mapGeneration = 0

  camera: Camera = { cx: 0, cy: 0, scale: 1 }
  mapW = 0
  mapH = 0
  destroyed = false

  constructor(opts: MapStageOptions) {
    this.opts = opts
    this.app = new Application()
    this.world = new Container()
    this.mapLayer = new Container()
    this.gridG = new Graphics()
    this.drawingsG = new Graphics()
    this.previewG = new Graphics()
    this.fogSprite = new Sprite()
    this.fogSprite.visible = false
    this.tokensLayer = new Container()
    this.tokensLayer.sortableChildren = true
    this.pingsG = new Graphics()
    this.overlayG = new Graphics()
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      background: this.opts.mode === 'player' ? '#000000' : '#050505',
      resizeTo: host,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgl'
    })
    if (this.destroyed) return
    host.appendChild(this.app.canvas)

    this.world.addChild(this.mapLayer)
    this.world.addChild(this.gridG)
    this.world.addChild(this.drawingsG)
    this.world.addChild(this.tokensLayer)
    this.world.addChild(this.fogSprite)
    this.world.addChild(this.previewG)
    this.world.addChild(this.pingsG)
    this.app.stage.addChild(this.world)
    this.app.stage.addChild(this.overlayG)

    this.app.stage.eventMode = 'static'
    this.app.stage.hitArea = this.app.screen

    this.app.ticker.add(() => this.tick())
    this.app.renderer.on('resize', () => this.applyCamera())
  }

  get viewWidth(): number {
    return this.app.screen.width
  }
  get viewHeight(): number {
    return this.app.screen.height
  }

  // ── Câmera ──────────────────────────────────────────────────────────────

  setCamera(cam: Camera): void {
    this.camera = cam
    this.applyCamera()
  }

  private applyCamera(): void {
    const { cx, cy, scale } = this.camera
    this.world.scale.set(scale)
    this.world.position.set(
      this.viewWidth / 2 - cx * scale,
      this.viewHeight / 2 - cy * scale
    )
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { cx, cy, scale } = this.camera
    return {
      x: cx + (sx - this.viewWidth / 2) / scale,
      y: cy + (sy - this.viewHeight / 2) / scale
    }
  }

  // ── Mapa ────────────────────────────────────────────────────────────────

  /** Pré-carrega a textura do mapa sem trocar o sprite (para o fade do player) */
  async preloadMap(entry: AssetEntry): Promise<boolean> {
    if (!isMapReady(entry)) return false
    try {
      await Assets.load<Texture>(textureUrlFor(entry))
      return true
    } catch {
      return false
    }
  }

  /**
   * Carrega a textura do mapa e troca o sprite quando pronta.
   * Retorna false se a troca foi abortada, ou se o mapa ainda não tem cache
   * de exibição (nesse caso mantém o mapa atual visível).
   */
  async setMap(entry: AssetEntry | null): Promise<boolean> {
    const gen = ++this.mapGeneration
    if (!entry) {
      this.swapMapSprite(null, null, 0, 0)
      return true
    }
    // sem cache de exibição ainda → não carrega o original; mantém o mapa atual
    if (!isMapReady(entry)) return false
    const url = textureUrlFor(entry)
    if (url === this.currentMapUrl) return true
    let texture: Texture
    try {
      texture = await Assets.load<Texture>(url)
    } catch (err) {
      console.error('Falha ao carregar mapa:', url, err)
      return false
    }
    if (this.destroyed || gen !== this.mapGeneration) return false
    const origW = entry.width || texture.width
    const origH = entry.height || texture.height
    this.swapMapSprite(texture, url, origW, origH)
    return true
  }

  private swapMapSprite(
    texture: Texture | null,
    url: string | null,
    origW: number,
    origH: number
  ): void {
    const oldUrl = this.currentMapUrl
    if (this.mapSprite) {
      this.mapLayer.removeChild(this.mapSprite)
      this.mapSprite.destroy()
      this.mapSprite = null
    }
    if (texture) {
      this.mapSprite = new Sprite(texture)
      this.mapSprite.scale.set(origW / texture.width, origH / texture.height)
      this.mapLayer.addChild(this.mapSprite)
    }
    this.mapW = origW
    this.mapH = origH
    this.currentMapUrl = url
    if (oldUrl && oldUrl !== url) {
      Assets.unload(oldUrl).catch(() => {})
    }
  }

  // ── Grid ────────────────────────────────────────────────────────────────

  drawGrid(grid: GridState): void {
    this.gridG.clear()
    if (!grid.enabled || !this.mapW || grid.size < 4) return
    const color = parseInt(grid.color.replace('#', ''), 16)
    const ox = ((grid.offsetX % grid.size) + grid.size) % grid.size
    const oy = ((grid.offsetY % grid.size) + grid.size) % grid.size
    const lineW = Math.max(1, this.mapW / 2400)
    for (let x = ox; x <= this.mapW; x += grid.size) {
      this.gridG.moveTo(x, 0).lineTo(x, this.mapH)
    }
    for (let y = oy; y <= this.mapH; y += grid.size) {
      this.gridG.moveTo(0, y).lineTo(this.mapW, y)
    }
    this.gridG.stroke({ width: lineW, color, alpha: grid.opacity })
  }

  // ── Fog of War ──────────────────────────────────────────────────────────

  /** Textura de fumaça procedural (nuvens suaves, tileável), gerada uma vez */
  private getSmokeTexture(): Texture {
    if (this.smokeTexture) return this.smokeTexture
    const size = 256
    const canvas = new OffscreenCanvas(size, size)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    // manchas radiais brancas e suaves; cópias deslocadas para ficar tileável
    const offsets = [
      [0, 0],
      [size, 0],
      [-size, 0],
      [0, size],
      [0, -size]
    ]
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 22 + Math.random() * 70
      const a = 0.1 + Math.random() * 0.22
      for (const [dx, dy] of offsets) {
        const grad = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
        grad.addColorStop(0, `rgba(255,255,255,${a})`)
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, size, size)
      }
    }
    this.smokeTexture = Texture.from(canvas)
    return this.smokeTexture
  }

  redrawFog(fog: FogState): void {
    if (!fog.enabled || !this.mapW || !this.mapH || fog.strokes.length === 0) {
      this.fogSprite.visible = false
      if (this.fogSmoke) this.fogSmoke.visible = false
      return
    }
    const fs = Math.min(1, FOG_RT_CAP / Math.max(this.mapW, this.mapH))
    const rtW = Math.max(2, Math.round(this.mapW * fs))
    const rtH = Math.max(2, Math.round(this.mapH * fs))
    if (!this.fogRT || this.fogRT.width !== rtW || this.fogRT.height !== rtH) {
      this.fogRT?.destroy(true)
      this.fogRT = RenderTexture.create({ width: rtW, height: rtH })
      this.fogSprite.texture = this.fogRT
    }
    const container = new Container()
    for (const stroke of fog.strokes) {
      const g = new Graphics()
      if (stroke.mode === 'reveal') g.blendMode = 'erase'
      if (stroke.kind === 'fill') {
        g.rect(0, 0, rtW, rtH).fill({ color: 0xffffff })
      } else if (stroke.kind === 'rect') {
        g.rect(stroke.x * fs, stroke.y * fs, stroke.w * fs, stroke.h * fs).fill({
          color: 0xffffff
        })
      } else {
        const pts = stroke.points
        const w = stroke.size * fs
        if (pts.length >= 2) {
          g.circle(pts[0] * fs, pts[1] * fs, w / 2).fill({ color: 0xffffff })
          if (pts.length >= 4) {
            g.moveTo(pts[0] * fs, pts[1] * fs)
            for (let i = 2; i < pts.length; i += 2) {
              g.lineTo(pts[i] * fs, pts[i + 1] * fs)
            }
            g.stroke({ width: w, color: 0xffffff, cap: 'round', join: 'round' })
          }
        }
      }
      container.addChild(g)
    }
    this.app.renderer.render({ container, target: this.fogRT, clear: true })
    container.destroy({ children: true })

    const player = this.opts.mode === 'player'
    // Base opaca (garante que a área fique escondida na TV mesmo que a camada
    // de fumaça falhe). Cinza claramente perceptível (não preto) — como fumaça.
    this.fogSprite.visible = true
    this.fogSprite.scale.set(this.mapW / rtW, this.mapH / rtH)
    this.fogSprite.position.set(0, 0)
    this.fogSprite.tint = 0x3c414a
    this.fogSprite.alpha = player ? 1 : 0.5

    // Camada de fumaça por cima, recortada pela mesma forma da névoa.
    try {
      if (!this.fogSmoke) {
        this.fogSmoke = new TilingSprite({
          texture: this.getSmokeTexture(),
          width: 10,
          height: 10
        })
        this.fogMask = new Sprite()
        this.fogMask.renderable = false // usado só como máscara, nunca desenhado
        // inserida logo acima da base de névoa
        const idx = this.world.getChildIndex(this.fogSprite) + 1
        this.world.addChildAt(this.fogSmoke, idx)
        this.world.addChild(this.fogMask)
        this.fogSmoke.mask = this.fogMask
      }
      this.fogMask!.texture = this.fogRT!
      this.fogMask!.scale.set(this.mapW / rtW, this.mapH / rtH)
      this.fogMask!.position.set(0, 0)
      this.fogSmoke.visible = true
      this.fogSmoke.width = this.mapW
      this.fogSmoke.height = this.mapH
      const tile = Math.max(this.mapW, this.mapH) / 5 / 256
      this.fogSmoke.tileScale.set(tile, tile)
      // nuvens claras bem visíveis sobre a base cinza → aparência de fumaça
      this.fogSmoke.tint = 0xd2d7df
      this.fogSmoke.alpha = player ? 0.75 : 0.4
    } catch (err) {
      console.warn('Falha na camada de fumaça (usando névoa lisa):', err)
      if (this.fogSmoke) this.fogSmoke.visible = false
    }
  }

  // ── Desenhos livres ─────────────────────────────────────────────────────

  setDrawings(drawings: Drawing[]): void {
    this.drawingsG.clear()
    for (const d of drawings) {
      this.strokePolyline(this.drawingsG, d.points, d.size, parseInt(d.color.replace('#', ''), 16))
    }
  }

  private strokePolyline(g: Graphics, pts: number[], size: number, color: number): void {
    if (pts.length < 2) return
    g.circle(pts[0], pts[1], size / 2).fill({ color })
    if (pts.length >= 4) {
      g.moveTo(pts[0], pts[1])
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
      g.stroke({ width: size, color, cap: 'round', join: 'round' })
    }
  }

  /** Pré-visualização (fog/desenho/retângulos) enquanto o mestre arrasta */
  setPreview(fn: ((g: Graphics) => void) | null): void {
    this.previewG.clear()
    if (fn) fn(this.previewG)
  }

  // ── Tokens ──────────────────────────────────────────────────────────────

  syncTokens(
    tokens: TokenInstance[],
    assets: Record<string, AssetEntry>,
    selectedId: string | null
  ): void {
    const isGm = this.opts.mode === 'gm'
    const seen = new Set<string>()
    for (const tk of tokens) {
      if (!isGm && tk.hidden) continue
      seen.add(tk.id)
      const entry = assets[tk.assetId]
      if (!entry) continue
      let node = this.tokenNodes.get(tk.id)
      if (!node) {
        node = this.createTokenNode(tk.id)
        this.tokenNodes.set(tk.id, node)
      }
      this.updateTokenNode(node, tk, entry, selectedId === tk.id)
    }
    for (const [id, node] of this.tokenNodes) {
      if (!seen.has(id)) {
        node.root.destroy({ children: true })
        this.tokenNodes.delete(id)
      }
    }
  }

  private createTokenNode(tokenId: string): TokenNode {
    const root = new Container()
    const ring = new Graphics()
    const sprite = new Sprite(Texture.EMPTY)
    sprite.anchor.set(0.5)
    const labelStyle = new TextStyle({
      fontFamily: 'Barlow Condensed, sans-serif',
      fontSize: 28,
      fontWeight: '600',
      fill: 0xeeeeee,
      letterSpacing: 1
    })
    const label = new Text({ text: '', style: labelStyle })
    label.anchor.set(0.5, 0)
    label.resolution = 2
    const labelBg = new Graphics()
    const badgeStyle = new TextStyle({
      fontFamily: 'Barlow Condensed, sans-serif',
      fontSize: 22,
      fontWeight: '700',
      fill: 0xffffff,
      letterSpacing: 2
    })
    const badge = new Text({ text: 'OCULTO', style: badgeStyle })
    badge.anchor.set(0.5, 1)
    badge.resolution = 2
    const badgeBg = new Graphics()
    root.addChild(ring, sprite, labelBg, label, badgeBg, badge)

    if (this.opts.mode === 'gm') {
      root.eventMode = 'static'
      root.cursor = 'pointer'
      root.on('pointerdown', (e) => {
        this.opts.onTokenPointerDown?.(tokenId, {
          globalX: e.global.x,
          globalY: e.global.y,
          button: e.button
        })
        e.stopPropagation()
      })
    }
    this.tokensLayer.addChild(root)
    return {
      root,
      sprite,
      ring,
      label,
      labelBg,
      badge,
      badgeBg,
      textureUrl: null,
      desiredW: 0,
      desiredH: 0,
      rotation: 0
    }
  }

  /** Aplica escala/rotação do sprite conforme a textura atual (px reais dela) */
  private applyTokenSprite(node: TokenNode): void {
    const tex = node.sprite.texture
    const texW = tex && tex !== Texture.EMPTY ? tex.width : 0
    const texH = tex && tex !== Texture.EMPTY ? tex.height : 0
    if (texW > 0 && texH > 0 && node.desiredW > 0) {
      node.sprite.scale.set(node.desiredW / texW, node.desiredH / texH)
    }
    node.sprite.rotation = node.rotation
  }

  private updateTokenNode(
    node: TokenNode,
    tk: TokenInstance,
    entry: AssetEntry,
    selected: boolean
  ): void {
    const isGm = this.opts.mode === 'gm'
    node.root.position.set(tk.x, tk.y)
    node.root.zIndex = tk.z

    // tamanho-alvo em px de mundo (tk.scale = px do mapa por px da imagem original)
    const curTex = node.sprite.texture
    const curTexW = curTex && curTex !== Texture.EMPTY ? curTex.width : 0
    const origW = entry.width || curTexW || 100
    const origH = entry.height || origW
    const w = origW * tk.scale
    const h = origH * tk.scale
    node.desiredW = w
    node.desiredH = h
    node.rotation = tk.rotation

    // textura (lazy) — ao carregar, REAPLICA o tamanho (senão o token aparece
    // no tamanho nativo da textura, ex.: ao reabrir a janela da TV)
    const url = textureUrlFor(entry)
    if (node.textureUrl !== url) {
      node.textureUrl = url
      this.loadTokenTexture(url).then((tex) => {
        if (tex && !node.sprite.destroyed && node.textureUrl === url) {
          node.sprite.texture = tex
          this.applyTokenSprite(node)
        }
      })
    }
    this.applyTokenSprite(node)

    node.sprite.alpha = isGm && tk.hidden ? 0.45 : 1

    // anel de seleção (GM)
    node.ring.clear()
    if (isGm && selected) {
      const r = (Math.max(w, h) / 2) * 1.12
      node.ring.circle(0, 0, r).stroke({ width: Math.max(2, r * 0.04), color: 0xf2c200 })
    }

    // rótulo
    const showLabel = tk.label && (isGm || tk.showLabelOnTV)
    node.label.visible = !!showLabel
    node.labelBg.clear()
    if (showLabel) {
      node.label.text = tk.label
      const fs = Math.max(16, Math.min(40, w * 0.16))
      node.label.style.fontSize = fs
      node.label.position.set(0, h / 2 + fs * 0.35)
      const lw = node.label.width
      const lh = node.label.height
      node.labelBg
        .roundRect(-lw / 2 - 6, h / 2 + fs * 0.35 - 2, lw + 12, lh + 4, 4)
        .fill({ color: 0x000000, alpha: 0.65 })
      node.labelBg.visible = true
    } else {
      node.labelBg.visible = false
    }

    // badge OCULTO (GM)
    const showBadge = isGm && tk.hidden
    node.badge.visible = showBadge
    node.badgeBg.clear()
    if (showBadge) {
      const fs = Math.max(14, Math.min(30, w * 0.13))
      node.badge.style.fontSize = fs
      node.badge.position.set(0, -h / 2 - fs * 0.3)
      const bw = node.badge.width
      const bh = node.badge.height
      node.badgeBg
        .roundRect(-bw / 2 - 6, -h / 2 - fs * 0.3 - bh - 2, bw + 12, bh + 4, 4)
        .fill({ color: 0xc1121f, alpha: 0.9 })
      node.badgeBg.visible = true
    } else {
      node.badgeBg.visible = false
    }
  }

  private async loadTokenTexture(url: string): Promise<Texture | null> {
    const cached = this.tokenTextures.get(url)
    if (cached instanceof Texture) return cached
    if (cached === 'error') return null
    try {
      const tex = await Assets.load<Texture>(url)
      this.tokenTextures.set(url, tex)
      return tex
    } catch {
      this.tokenTextures.set(url, 'error')
      return null
    }
  }

  /** Retorna o id do token sob o ponto de tela, ou null */
  hitTestToken(sx: number, sy: number, tokens: TokenInstance[], assets: Record<string, AssetEntry>): string | null {
    const w = this.screenToWorld(sx, sy)
    const sorted = [...tokens].sort((a, b) => b.z - a.z)
    for (const tk of sorted) {
      const entry = assets[tk.assetId]
      if (!entry) continue
      const halfW = ((entry.width || 100) * tk.scale) / 2
      const halfH = ((entry.height || 100) * tk.scale) / 2
      const r = Math.max(halfW, halfH)
      const dx = w.x - tk.x
      const dy = w.y - tk.y
      if (dx * dx + dy * dy <= r * r) return tk.id
    }
    return null
  }

  // ── Pings ───────────────────────────────────────────────────────────────

  ping(x: number, y: number, color = 0xf2c200): void {
    this.pings.push({ x, y, t0: performance.now(), color })
  }

  private tick(): void {
    if (this.pings.length === 0) {
      if (this.pingsG.children.length || this.pingsG.context) this.pingsG.clear()
      return
    }
    const now = performance.now()
    this.pingsG.clear()
    this.pings = this.pings.filter((p) => now - p.t0 < PING_DURATION)
    const baseR = Math.max(this.mapW, 800) * 0.02
    for (const p of this.pings) {
      const t = (now - p.t0) / PING_DURATION
      const alpha = 1 - t
      const r = baseR * (0.4 + t * 1.6)
      const lw = Math.max(2 / this.camera.scale, baseR * 0.08)
      this.pingsG.circle(p.x, p.y, r).stroke({ width: lw, color: p.color, alpha })
      this.pingsG.circle(p.x, p.y, baseR * 0.15).fill({ color: p.color, alpha })
    }
  }

  destroy(): void {
    this.destroyed = true
    try {
      this.app.destroy(true, { children: true, texture: false })
    } catch {
      /* ignore */
    }
  }
}

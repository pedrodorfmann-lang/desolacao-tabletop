import { useState } from 'react'
import { useGmStore, type Tool } from '../store'

function ToolButton({
  tool,
  title,
  children
}: {
  tool: Tool
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  const active = useGmStore((s) => s.tool === tool)
  const setUi = useGmStore((s) => s.setUi)
  return (
    <button
      className={`icon ${active ? 'active' : ''}`}
      title={title}
      onClick={() => setUi({ tool, selectedTokenId: null })}
    >
      {children}
    </button>
  )
}

export function Toolbar(): React.JSX.Element {
  const scene = useGmStore((s) => s.scene)
  const library = useGmStore((s) => s.library)
  const brushSize = useGmStore((s) => s.brushSize)
  const drawColor = useGmStore((s) => s.drawColor)
  const setUi = useGmStore((s) => s.setUi)
  const undoFog = useGmStore((s) => s.undoFog)
  const coverAll = useGmStore((s) => s.coverAll)
  const revealAll = useGmStore((s) => s.revealAll)
  const setFogEnabled = useGmStore((s) => s.setFogEnabled)
  const clearDrawings = useGmStore((s) => s.clearDrawings)
  const setGrid = useGmStore((s) => s.setGrid)
  const zoomBy = useGmStore((s) => s.zoomBy)
  const fitView = useGmStore((s) => s.fitView)
  const oneToOne = useGmStore((s) => s.oneToOne)
  const swapVariant = useGmStore((s) => s.swapVariant)
  const [showGridPop, setShowGridPop] = useState(false)
  const [showBmPop, setShowBmPop] = useState(false)
  const [showHudPop, setShowHudPop] = useState(false)

  const mapEntry = scene.mapId ? library[scene.mapId] : null
  const variant = mapEntry?.variantId ? library[mapEntry.variantId] : null

  return (
    <div className="toolbar" style={{ position: 'relative' }}>
      <ToolButton tool="select" title="Selecionar / mover / pan (Esc)">
        ➤
      </ToolButton>
      <ToolButton tool="ping" title="Ping — clique para chamar atenção (ou Alt+clique)">
        ◎
      </ToolButton>
      <ToolButton tool="draw" title="Desenho livre temporário">
        ✎
      </ToolButton>
      <input
        type="color"
        value={drawColor}
        title="Cor do desenho"
        onChange={(e) => setUi({ drawColor: e.target.value })}
      />
      <button className="ghost" title="Limpar todos os desenhos" onClick={clearDrawings}>
        limpar
      </button>

      <div className="sep" />

      <span className="micro-label">Névoa</span>
      <ToolButton tool="fogHide" title="Pincel: ocultar área">
        ▓
      </ToolButton>
      <ToolButton tool="fogReveal" title="Pincel: revelar área">
        ░
      </ToolButton>
      <ToolButton tool="fogRectHide" title="Retângulo: ocultar">
        ■
      </ToolButton>
      <ToolButton tool="fogRectReveal" title="Retângulo: revelar">
        □
      </ToolButton>
      <input
        type="range"
        min={30}
        max={800}
        value={brushSize}
        title={`Tamanho do pincel: ${brushSize}px`}
        style={{ width: 70 }}
        onChange={(e) => setUi({ brushSize: Number(e.target.value) })}
      />
      <button className="ghost" title="Desfazer última pincelada" onClick={undoFog}>
        ↩
      </button>
      <button className="ghost" title="Cobrir o mapa inteiro" onClick={coverAll}>
        cobrir
      </button>
      <button className="ghost" title="Revelar tudo (limpa a névoa)" onClick={revealAll}>
        revelar
      </button>
      <button
        className={`ghost ${scene.fog.enabled ? 'active' : ''}`}
        title="Ativar/desativar névoa"
        onClick={() => setFogEnabled(!scene.fog.enabled)}
      >
        {scene.fog.enabled ? 'on' : 'off'}
      </button>

      <div className="sep" />

      <span className="micro-label">Grid</span>
      <button
        className={`icon ${scene.grid.enabled ? 'active' : ''}`}
        title="Mostrar/ocultar grid (G)"
        onClick={() => setGrid({ enabled: !scene.grid.enabled })}
      >
        ⊞
      </button>
      <button className="ghost" title="Opções do grid" onClick={() => setShowGridPop((v) => !v)}>
        opções
      </button>

      <div className="sep" />

      <button className="icon" title="Afastar" onClick={() => zoomBy(1 / 1.25)}>
        −
      </button>
      <span style={{ fontSize: 11, color: 'var(--text-1)', minWidth: 42, textAlign: 'center' }}>
        {Math.round(scene.camera.scale * 100)}%
      </span>
      <button className="icon" title="Aproximar" onClick={() => zoomBy(1.25)}>
        +
      </button>
      <button title="Ajustar à tela da TV (F)" onClick={fitView}>
        Ajustar
      </button>
      <button title="1:1 pixels" onClick={oneToOne}>
        1:1
      </button>
      <button className="ghost" title="Bookmarks de câmera" onClick={() => setShowBmPop((v) => !v)}>
        ⭐
      </button>

      {variant && (
        <>
          <div className="sep" />
          <button className="primary" title={`Trocar para: ${variant.name}`} onClick={swapVariant}>
            ⇄ {variant.name.length > 18 ? variant.name.slice(0, 18) + '…' : variant.name}
          </button>
        </>
      )}

      <div className="grow" />
      <button className="ghost" title="Widget de HUD na TV" onClick={() => setShowHudPop((v) => !v)}>
        HUD
      </button>

      {showGridPop && <GridPopover onClose={() => setShowGridPop(false)} />}
      {showBmPop && <BookmarksPopover onClose={() => setShowBmPop(false)} />}
      {showHudPop && <HudPopover onClose={() => setShowHudPop(false)} />}
    </div>
  )
}

function GridPopover({ onClose }: { onClose: () => void }): React.JSX.Element {
  const grid = useGmStore((s) => s.scene.grid)
  const setGrid = useGmStore((s) => s.setGrid)
  const setUi = useGmStore((s) => s.setUi)
  return (
    <div className="popover" style={{ top: 40, left: 340 }}>
      <span className="micro-label">Grid</span>
      <div className="field">
        <span>Célula</span>
        <input
          type="number"
          min={8}
          value={grid.size}
          style={{ width: 70 }}
          onChange={(e) => setGrid({ size: Math.max(8, Number(e.target.value) || 8) })}
        />
        <span>px do mapa</span>
      </div>
      <div className="field">
        <span>Opacidade</span>
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(grid.opacity * 100)}
          onChange={(e) => setGrid({ opacity: Number(e.target.value) / 100 })}
        />
      </div>
      <div className="field">
        <span>Cor</span>
        <input type="color" value={grid.color} onChange={(e) => setGrid({ color: e.target.value })} />
      </div>
      <div className="field">
        <span>Origem X/Y</span>
        <input
          type="number"
          value={Math.round(grid.offsetX)}
          style={{ width: 58 }}
          onChange={(e) => setGrid({ offsetX: Number(e.target.value) || 0 })}
        />
        <input
          type="number"
          value={Math.round(grid.offsetY)}
          style={{ width: 58 }}
          onChange={(e) => setGrid({ offsetY: Number(e.target.value) || 0 })}
        />
      </div>
      <label className="row">
        <input
          type="checkbox"
          checked={grid.snap}
          onChange={(e) => setGrid({ snap: e.target.checked })}
        />
        Encaixar tokens no grid
      </label>
      <button
        onClick={() => {
          setUi({ tool: 'calibrate' })
          onClose()
        }}
      >
        Calibrar — arraste sobre 1 quadrado do mapa
      </button>
      <button className="ghost" onClick={onClose}>
        Fechar
      </button>
    </div>
  )
}

function BookmarksPopover({ onClose }: { onClose: () => void }): React.JSX.Element {
  const scene = useGmStore((s) => s.scene)
  const library = useGmStore((s) => s.library)
  const addBookmark = useGmStore((s) => s.addBookmark)
  const gotoBookmark = useGmStore((s) => s.gotoBookmark)
  const deleteBookmark = useGmStore((s) => s.deleteBookmark)
  const [name, setName] = useState('')
  const entry = scene.mapId ? library[scene.mapId] : null
  const bookmarks = entry?.bookmarks ?? []

  return (
    <div className="popover" style={{ top: 40, right: 120 }}>
      <span className="micro-label">Bookmarks de câmera</span>
      {!entry && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Nenhum mapa ativo.</div>}
      {bookmarks.map((b) => (
        <div key={b.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            style={{ flex: 1, textAlign: 'left' }}
            onClick={() => {
              gotoBookmark(b.id)
              onClose()
            }}
          >
            {b.name}
          </button>
          <button className="ghost icon" title="Excluir" onClick={() => deleteBookmark(b.id)}>
            ×
          </button>
        </div>
      ))}
      {entry && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Nome (ex.: Entrada)"
            value={name}
            style={{ flex: 1 }}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => {
              addBookmark(name.trim())
              setName('')
            }}
          >
            Salvar vista
          </button>
        </div>
      )}
      <button className="ghost" onClick={onClose}>
        Fechar
      </button>
    </div>
  )
}

function HudPopover({ onClose }: { onClose: () => void }): React.JSX.Element {
  const hud = useGmStore((s) => s.overlay.hud)
  const setHud = useGmStore((s) => s.setHud)
  return (
    <div className="popover" style={{ top: 40, right: 8 }}>
      <span className="micro-label">HUD na TV</span>
      <label className="row">
        <input
          type="checkbox"
          checked={hud.enabled}
          onChange={(e) => setHud({ enabled: e.target.checked })}
        />
        Mostrar widget
      </label>
      <div className="field">
        <span>Imagem</span>
        <button
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
          onClick={() => {
            void window.api.chooseImage().then((p) => {
              if (p) setHud({ path: p, enabled: true })
            })
          }}
        >
          {hud.path ? hud.path.split(/[\\/]/).pop() : 'Escolher imagem…'}
        </button>
      </div>
      <div className="field">
        <span>Canto</span>
        <select value={hud.corner} onChange={(e) => setHud({ corner: e.target.value as never })}>
          <option value="tl">Superior esquerdo</option>
          <option value="tr">Superior direito</option>
          <option value="bl">Inferior esquerdo</option>
          <option value="br">Inferior direito</option>
        </select>
      </div>
      <div className="field">
        <span>Tamanho</span>
        <input
          type="range"
          min={8}
          max={40}
          value={hud.widthPct}
          onChange={(e) => setHud({ widthPct: Number(e.target.value) })}
        />
      </div>
      <button className="ghost" onClick={onClose}>
        Fechar
      </button>
    </div>
  )
}

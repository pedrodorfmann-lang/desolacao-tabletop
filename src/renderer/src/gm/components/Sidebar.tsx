import { useMemo, useState } from 'react'
import { mediaUrl, type AssetEntry, type AssetKind } from '@shared/types'
import { useGmStore } from '../store'

export function Sidebar(): React.JSX.Element {
  const activeTab = useGmStore((s) => s.activeTab)
  const setUi = useGmStore((s) => s.setUi)
  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={activeTab === 'maps' ? 'active' : ''}
          onClick={() => setUi({ activeTab: 'maps', tagFilter: null })}
        >
          Mapas
        </button>
        <button
          className={activeTab === 'tokens' ? 'active' : ''}
          onClick={() => setUi({ activeTab: 'tokens', tagFilter: null })}
        >
          Tokens
        </button>
        <button
          className={activeTab === 'scenes' ? 'active' : ''}
          onClick={() => setUi({ activeTab: 'scenes' })}
        >
          Cenas
        </button>
      </div>
      <div className="rule-y" />
      <div className="sidebar-body">
        {activeTab === 'maps' && <AssetPanel kind="map" />}
        {activeTab === 'tokens' && <AssetPanel kind="token" />}
        {activeTab === 'scenes' && <ScenesPanel />}
      </div>
    </aside>
  )
}

// ── Painel de assets (mapas / tokens) ────────────────────────────────────────

function AssetPanel({ kind }: { kind: AssetKind }): React.JSX.Element {
  const library = useGmStore((s) => s.library)
  const search = useGmStore((s) => s.search)
  const tagFilter = useGmStore((s) => s.tagFilter)
  const mapId = useGmStore((s) => s.scene.mapId)
  const setUi = useGmStore((s) => s.setUi)
  const switchMap = useGmStore((s) => s.switchMap)
  const importPaths = useGmStore((s) => s.importPaths)
  const [editingId, setEditingId] = useState<string | null>(null)

  const assets = useMemo(() => {
    const list = Object.values(library).filter((a) => a.kind === kind)
    const q = search.trim().toLowerCase()
    return list
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .filter((a) => (tagFilter ? a.tags.includes(tagFilter) : true))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [library, kind, search, tagFilter])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const a of Object.values(library)) if (a.kind === kind) a.tags.forEach((t) => s.add(t))
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [library, kind])

  const onDropFiles = (e: React.DragEvent): void => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(jpe?g|png|webp)$/i.test(f.name)
    )
    if (files.length) {
      importPaths(
        kind,
        files.map((f) => ({ path: window.api.getPathForFile(f), folder: '' }))
      )
    }
  }

  return (
    <>
      <div className="panel-search">
        <input
          id={kind === 'map' ? 'map-search' : 'token-search'}
          type="text"
          placeholder={kind === 'map' ? 'Buscar mapas…  (Ctrl+K)' : 'Buscar tokens…'}
          value={search}
          onChange={(e) => setUi({ search: e.target.value })}
        />
      </div>
      {allTags.length > 0 && (
        <div className="tag-row">
          {allTags.map((t) => (
            <span
              key={t}
              className={`tag-chip ${tagFilter === t ? 'active' : ''}`}
              onClick={() => setUi({ tagFilter: tagFilter === t ? null : t })}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="asset-grid" onDrop={onDropFiles} onDragOver={(e) => e.preventDefault()}>
        {assets.length === 0 && (
          <div className="empty-hint" style={{ gridColumn: '1 / -1' }}>
            {kind === 'map' ? (
              <>
                Nenhum mapa.
                <br />
                Configure a pasta de mapas em ⚙ ou arraste imagens para cá.
              </>
            ) : (
              <>
                Nenhum token.
                <br />
                Configure a pasta de tokens em ⚙ ou arraste imagens para cá.
              </>
            )}
          </div>
        )}
        {assets.map((a) => (
          <AssetCard
            key={a.id}
            asset={a}
            isCurrent={kind === 'map' && a.id === mapId}
            editing={editingId === a.id}
            onEdit={(v) => setEditingId(v ? a.id : null)}
            onActivate={() => {
              if (kind === 'map') switchMap(a.id)
            }}
          />
        ))}
      </div>
    </>
  )
}

function AssetCard({
  asset,
  isCurrent,
  editing,
  onEdit,
  onActivate
}: {
  asset: AssetEntry
  isCurrent: boolean
  editing: boolean
  onEdit: (v: boolean) => void
  onActivate: () => void
}): React.JSX.Element {
  const library = useGmStore((s) => s.library)
  const switchMap = useGmStore((s) => s.switchMap)
  const variant = asset.variantId ? library[asset.variantId] : undefined

  return (
    <div
      className={`asset-card ${asset.kind === 'token' ? 'token-card' : ''} ${
        isCurrent ? 'current' : ''
      } ${asset.missing ? 'missing' : ''}`}
      title={asset.name}
      draggable={asset.kind === 'token'}
      onDragStart={(e) => {
        if (asset.kind === 'token') {
          e.dataTransfer.setData('application/x-asset-id', asset.id)
        }
      }}
      onClick={() => !asset.missing && onActivate()}
    >
      <div className={`thumb-box ${asset.kind === 'token' ? 'token-thumb' : ''}`}>
        {asset.thumbPath ? (
          <img src={mediaUrl(asset.thumbPath)} loading="lazy" alt="" draggable={false} />
        ) : asset.missing ? (
          <span className="thumb-icon">⚠</span>
        ) : (
          <span className="spinner" title="Gerando miniatura…" />
        )}
      </div>
      <div className="name">{asset.name}</div>
      <div className="badges">
        {variant && <span className="badge">⇄</span>}
        {!asset.displayPath && !asset.missing && <span className="badge">…</span>}
      </div>
      <div className="card-actions">
        {variant && asset.kind === 'map' && (
          <button
            title={`Trocar para variante: ${variant.name}`}
            onClick={(e) => {
              e.stopPropagation()
              if (isCurrent) {
                useGmStore.getState().swapVariant()
              } else {
                switchMap(variant.id)
              }
            }}
          >
            ⇄
          </button>
        )}
        <button
          title="Editar"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(!editing)
          }}
        >
          ⋯
        </button>
      </div>
      {editing && <AssetEditPopover asset={asset} onClose={() => onEdit(false)} />}
    </div>
  )
}

function AssetEditPopover({
  asset,
  onClose
}: {
  asset: AssetEntry
  onClose: () => void
}): React.JSX.Element {
  const library = useGmStore((s) => s.library)
  const updateAsset = useGmStore((s) => s.updateAsset)
  const linkVariants = useGmStore((s) => s.linkVariants)
  const unlinkVariant = useGmStore((s) => s.unlinkVariant)
  const removeAsset = useGmStore((s) => s.removeAsset)
  const [name, setName] = useState(asset.name)
  const [tags, setTags] = useState(asset.tags.join(', '))

  const candidates = Object.values(library).filter(
    (a) => a.kind === asset.kind && a.id !== asset.id
  )

  const save = (): void => {
    updateAsset(asset.id, {
      name: name.trim() || asset.name,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    })
    onClose()
  }

  return (
    <div
      className="popover"
      style={{ top: '10%', left: '4%', right: '4%' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="field">
        <span>Nome</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="field">
        <span>Tags</span>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Dia, Hospital…"
          style={{ flex: 1 }}
        />
      </div>
      {asset.kind === 'map' && (
        <div className="field">
          <span>Variante</span>
          <select
            style={{ flex: 1 }}
            value={asset.variantId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v) linkVariants(asset.id, v)
              else unlinkVariant(asset.id)
            }}
          >
            <option value="">— nenhuma —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
        <button
          className="danger"
          onClick={() => {
            removeAsset(asset.id)
            onClose()
          }}
        >
          Remover
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={save}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Painel de cenas ──────────────────────────────────────────────────────────

function ScenesPanel(): React.JSX.Element {
  const scenes = useGmStore((s) => s.scenes)
  const currentSceneId = useGmStore((s) => s.currentSceneId)
  const activateScene = useGmStore((s) => s.activateScene)
  const renameScene = useGmStore((s) => s.renameScene)
  const deleteScene = useGmStore((s) => s.deleteScene)
  const createScene = useGmStore((s) => s.createScene)
  const library = useGmStore((s) => s.library)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  return (
    <>
      <div className="scene-list">
        {scenes.map((sc) => {
          const mapName = sc.state.mapId ? (library[sc.state.mapId]?.name ?? '') : 'sem mapa'
          return (
            <div
              key={sc.id}
              className={`scene-item ${sc.id === currentSceneId ? 'active' : ''}`}
              onClick={() => activateScene(sc.id)}
            >
              {editingId === sc.id ? (
                <input
                  type="text"
                  autoFocus
                  value={editName}
                  style={{ flex: 1 }}
                  onChange={(e) => setEditName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameScene(sc.id, editName.trim() || sc.name)
                      setEditingId(null)
                    }
                    if (e.key === 'Escape') setEditingId(null)
                    e.stopPropagation()
                  }}
                  onBlur={() => {
                    renameScene(sc.id, editName.trim() || sc.name)
                    setEditingId(null)
                  }}
                />
              ) : (
                <span className="scene-name">
                  {sc.name}
                  <span style={{ color: 'var(--text-2)', marginLeft: 6, fontSize: 10.5 }}>
                    {mapName}
                  </span>
                </span>
              )}
              <div className="scene-actions">
                <button
                  title="Renomear"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingId(sc.id)
                    setEditName(sc.name)
                  }}
                >
                  ✎
                </button>
                <button
                  className="danger"
                  title="Excluir cena"
                  disabled={scenes.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteScene(sc.id)
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="panel-footer">
        <button className="primary" onClick={() => createScene()}>
          + Nova cena (a partir da atual)
        </button>
      </div>
    </>
  )
}

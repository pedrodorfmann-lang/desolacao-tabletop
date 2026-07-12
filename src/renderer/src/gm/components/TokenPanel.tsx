import { useGmStore } from '../store'

export function TokenPanel(): React.JSX.Element | null {
  const selectedId = useGmStore((s) => s.selectedTokenId)
  const token = useGmStore((s) => s.scene.tokens.find((t) => t.id === s.selectedTokenId))
  const updateToken = useGmStore((s) => s.updateToken)
  const removeToken = useGmStore((s) => s.removeToken)
  const duplicateToken = useGmStore((s) => s.duplicateToken)
  const moveTokenZ = useGmStore((s) => s.moveTokenZ)
  const toggleHidden = useGmStore((s) => s.toggleHidden)

  if (!selectedId || !token) return null

  return (
    <div className="token-panel">
      <span className="micro-label">Token selecionado</span>
      <input
        type="text"
        value={token.label}
        placeholder="Nome"
        onChange={(e) => updateToken(token.id, { label: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <label className="row">
        <input
          type="checkbox"
          checked={token.showLabelOnTV}
          onChange={(e) => updateToken(token.id, { showLabelOnTV: e.target.checked })}
        />
        Mostrar nome na TV
      </label>
      <label className="row" style={{ color: token.hidden ? 'var(--danger)' : undefined }}>
        <input type="checkbox" checked={token.hidden} onChange={() => toggleHidden(token.id)} />
        Oculto dos jogadores (H)
      </label>
      <div className="field">
        <span>Tamanho</span>
        <button
          className="icon"
          onClick={() => updateToken(token.id, { scale: Math.max(0.005, token.scale / 1.15) })}
        >
          −
        </button>
        <button
          className="icon"
          onClick={() => updateToken(token.id, { scale: Math.min(50, token.scale * 1.15) })}
        >
          +
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-2)' }}>Ctrl+roda</span>
      </div>
      <div className="field">
        <span>Rotação</span>
        <input
          type="range"
          min={-180}
          max={180}
          value={Math.round((token.rotation * 180) / Math.PI)}
          onChange={(e) =>
            updateToken(token.id, { rotation: (Number(e.target.value) * Math.PI) / 180 })
          }
        />
      </div>
      <div className="btn-row">
        <button onClick={() => moveTokenZ(token.id, 'front')}>Frente</button>
        <button onClick={() => moveTokenZ(token.id, 'back')}>Trás</button>
      </div>
      <div className="btn-row">
        <button onClick={() => duplicateToken(token.id)}>Duplicar</button>
        <button className="danger" onClick={() => removeToken(token.id)}>
          Excluir
        </button>
      </div>
    </div>
  )
}

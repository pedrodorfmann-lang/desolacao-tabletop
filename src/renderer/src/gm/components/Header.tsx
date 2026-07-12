import { useGmStore } from '../store'

export function Header(): React.JSX.Element {
  const logoUrl = useGmStore((s) => s.logoUrl)
  const blackout = useGmStore((s) => s.overlay.blackout)
  const playerOpen = useGmStore((s) => s.playerInfo.open)
  const cachePending = useGmStore((s) => s.cachePending)
  const toggleBlackout = useGmStore((s) => s.toggleBlackout)
  const setUi = useGmStore((s) => s.setUi)

  return (
    <header className="gm-header">
      {logoUrl && <img className="logo" src={logoUrl} alt="" />}
      <div className="title">
        Desolação <span>Tabletop</span>
      </div>
      <div className="spacer" />
      {cachePending > 0 && (
        <div className="cache-progress" title="Gerando miniaturas e versões otimizadas">
          <div className="spinner" />
          preparando {cachePending} {cachePending === 1 ? 'imagem' : 'imagens'}
        </div>
      )}
      <div className="player-status">
        <div className={`dot ${playerOpen ? 'on' : ''}`} />
        {playerOpen ? 'TV conectada' : 'TV fechada'}
        <button onClick={() => void window.api.togglePlayer()}>
          {playerOpen ? 'Fechar TV' : 'Abrir TV'}
        </button>
      </div>
      <button
        className={`blackout-btn ${blackout ? 'primary' : 'danger'}`}
        title="Blackout (B)"
        onClick={toggleBlackout}
      >
        {blackout ? '● Restaurar' : 'Blackout'}
      </button>
      <button className="ghost icon" title="Configurações" onClick={() => setUi({ showSettings: true })}>
        ⚙
      </button>
      <button className="ghost icon" title="Atalhos (Ajuda)" onClick={() => setUi({ showHelp: true })}>
        ?
      </button>
    </header>
  )
}

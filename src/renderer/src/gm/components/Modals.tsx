import { useEffect, useState } from 'react'
import type { DisplayInfo } from '@shared/types'
import { useGmStore } from '../store'

export function SettingsModal(): React.JSX.Element | null {
  const show = useGmStore((s) => s.showSettings)
  const settings = useGmStore((s) => s.settings)
  const applySettings = useGmStore((s) => s.applySettings)
  const setUi = useGmStore((s) => s.setUi)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  useEffect(() => {
    if (show) {
      void window.api.listDisplays().then(setDisplays)
    }
  }, [show])

  if (!show) return null
  const close = (): void => setUi({ showSettings: false })

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Configurações</h2>

        <div className="field-block">
          <span className="micro-label">Pasta de mapas</span>
          <div className="folder-row">
            <input type="text" readOnly value={settings.mapsDir ?? ''} placeholder="— não configurada —" />
            <button
              onClick={() => {
                void window.api.chooseFolder().then((p) => {
                  if (p) void applySettings({ mapsDir: p })
                })
              }}
            >
              Escolher…
            </button>
          </div>
          <span className="hint">A pasta é monitorada: novas imagens entram na biblioteca automaticamente.</span>
        </div>

        <div className="field-block">
          <span className="micro-label">Pasta de tokens</span>
          <div className="folder-row">
            <input type="text" readOnly value={settings.tokensDir ?? ''} placeholder="— não configurada —" />
            <button
              onClick={() => {
                void window.api.chooseFolder().then((p) => {
                  if (p) void applySettings({ tokensDir: p })
                })
              }}
            >
              Escolher…
            </button>
          </div>
        </div>

        <div className="field-block">
          <span className="micro-label">Display da janela do jogador (TV)</span>
          <select
            value={settings.playerDisplayId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v) void applySettings({ playerDisplayId: Number(v) })
            }}
          >
            <option value="" disabled>
              — escolher display —
            </option>
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
                {d.primary ? ' (principal)' : ''}
              </option>
            ))}
          </select>
          <span className="hint">
            Com um único display, a janela abre em modo janela para testes. Na TV, abre em tela
            cheia sem bordas.
          </span>
        </div>

        <div className="field-block">
          <span className="micro-label">Transição de mapa (fade para preto)</span>
          <div className="folder-row">
            <input
              type="number"
              min={0}
              max={3000}
              step={100}
              value={settings.fadeMs}
              onChange={(e) => void applySettings({ fadeMs: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span style={{ color: 'var(--text-2)', fontSize: 11 }}>ms (0 = sem fade)</span>
          </div>
        </div>

        <div className="field-block">
          <span className="micro-label">Tela de blackout</span>
          <select
            value={settings.splashMode}
            onChange={(e) => void applySettings({ splashMode: e.target.value as 'black' | 'logo' })}
          >
            <option value="black">Preto puro</option>
            <option value="logo">Splash com logo da campanha</option>
          </select>
          <span className="hint">
            A logo é lida de <code>assets/logo/</code> na pasta do app.
          </span>
        </div>

        <div className="field-block">
          <span className="micro-label">Resolução máxima de exibição dos mapas</span>
          <select
            value={settings.displayMaxEdge}
            onChange={(e) => void applySettings({ displayMaxEdge: Number(e.target.value) })}
          >
            <option value={4096}>4K (4096 px) — recomendado</option>
            <option value={2560}>1440p (2560 px) — intermediário</option>
            <option value={1920}>1080p (1920 px) — mais leve</option>
          </select>
          <span className="hint">
            Mapas maiores que o limite são reduzidos apenas para exibição; o original não é
            alterado. Resoluções menores carregam e trocam mais rápido.
          </span>
        </div>

        <div className="modal-footer">
          <button className="primary" onClick={close}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl+K', 'Buscar mapas'],
  ['B', 'Blackout na TV (liga/desliga)'],
  ['G', 'Mostrar/ocultar grid'],
  ['F', 'Ajustar mapa à tela da TV'],
  ['H', 'Ocultar/revelar token selecionado'],
  ['Del', 'Excluir token selecionado'],
  ['Ctrl+D', 'Duplicar token selecionado'],
  ['PgUp / PgDn', 'Cena anterior / próxima'],
  ['+ / −', 'Zoom'],
  ['Esc', 'Desselecionar / ferramenta padrão'],
  ['Alt+clique', 'Ping (chamar atenção)'],
  ['Ctrl+roda', 'Redimensionar token selecionado'],
  ['Alt+roda', 'Girar token selecionado'],
  ['Roda do mouse', 'Zoom no cursor'],
  ['Arrastar (botão do meio)', 'Pan']
]

export function HelpModal(): React.JSX.Element | null {
  const show = useGmStore((s) => s.showHelp)
  const setUi = useGmStore((s) => s.setUi)
  if (!show) return null
  return (
    <div className="modal-backdrop" onClick={() => setUi({ showHelp: false })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Atalhos de teclado</h2>
        <table className="shortcut-table">
          <tbody>
            {SHORTCUTS.map(([k, desc]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-footer">
          <button className="primary" onClick={() => setUi({ showHelp: false })}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

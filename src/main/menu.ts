import { Menu, screen, type MenuItemConstructorOptions } from 'electron'
import { getSettings } from './settings'
import { getGmWindow, getPlayerWindow, movePlayerToDisplay, togglePlayerWindow } from './windows'

export function buildMenu(): void {
  const displays = screen.getAllDisplays()
  const settings = getSettings()
  const playerOpen = !!getPlayerWindow()

  const displayItems: MenuItemConstructorOptions[] = displays.map((d, i) => ({
    label: `Display ${i + 1} — ${d.bounds.width}×${d.bounds.height}${
      d.id === screen.getPrimaryDisplay().id ? ' (principal)' : ''
    }`,
    type: 'radio',
    checked: settings.playerDisplayId === d.id,
    click: (): void => {
      movePlayerToDisplay(d.id)
      buildMenu()
    }
  }))

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [{ role: 'quit', label: 'Sair' }]
    },
    {
      label: 'Janela do Jogador',
      submenu: [
        {
          label: playerOpen ? 'Fechar janela do jogador' : 'Abrir janela do jogador',
          click: (): void => {
            togglePlayerWindow()
            setTimeout(buildMenu, 300)
          }
        },
        { type: 'separator' },
        { label: 'Exibir no display:', enabled: false },
        ...displayItems
      ]
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'toggleDevTools', label: 'DevTools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom padrão' },
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Atalhos de teclado',
          click: (): void => {
            getGmWindow()?.webContents.send('ui:show-help')
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from './util'
import { getSettings, setSettings } from './settings'
import type { StagePayload } from '@shared/types'

let gmWindow: BrowserWindow | null = null
let playerWindow: BrowserWindow | null = null

/** Último payload publicado — reenviado quando o player (re)abre */
let lastPayload: StagePayload | null = null

export function setLastPayload(p: StagePayload): void {
  lastPayload = p
}

export function getGmWindow(): BrowserWindow | null {
  return gmWindow
}

export function getPlayerWindow(): BrowserWindow | null {
  return playerWindow
}

/** Ícone da janela (barra de tarefas em dev; no pacote o exe já traz o ícone) */
function windowIcon(): string | undefined {
  const p = join(app.getAppPath(), 'build', 'icon.ico')
  return existsSync(p) ? p : undefined
}

/** Encaminha erros/avisos do console do renderer para o stdout do processo main */
function pipeConsole(win: BrowserWindow, tag: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  win.webContents.on('console-message', ((...args: any[]) => {
    const d = args[0]
    if (d && typeof d === 'object' && 'message' in d) {
      if (d.level === 'error' || d.level === 'warning') {
        console.log(`[${tag}] ${d.level}: ${d.message}`)
      }
    } else if (typeof args[1] === 'number' && args[1] >= 2) {
      console.log(`[${tag}] ${args[2]}`)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any)
}

function loadPage(win: BrowserWindow, page: 'gm' | 'player'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}.html`)
  } else {
    win.loadFile(join(__dirname, `../renderer/${page}.html`))
  }
}

export function createGmWindow(): BrowserWindow {
  gmWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'Desolação Tabletop — Mestre',
    icon: windowIcon(),
    backgroundColor: '#0A0A0A',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  gmWindow.on('ready-to-show', () => gmWindow?.show())
  pipeConsole(gmWindow, 'GM')
  gmWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  gmWindow.on('closed', () => {
    gmWindow = null
    playerWindow?.close()
  })
  loadPage(gmWindow, 'gm')
  return gmWindow
}

function pickPlayerDisplay(): { display: Electron.Display; dedicated: boolean } {
  const displays = screen.getAllDisplays()
  const settings = getSettings()
  const gmBounds = gmWindow?.getBounds()
  const gmDisplay = gmBounds ? screen.getDisplayMatching(gmBounds) : screen.getPrimaryDisplay()

  let target = displays.find((d) => d.id === settings.playerDisplayId)
  if (!target) {
    // sem escolha salva: prefere um display que não seja o do GM
    target = displays.find((d) => d.id !== gmDisplay.id)
  }
  if (target && target.id !== gmDisplay.id) {
    return { display: target, dedicated: true }
  }
  // único display (ou mesmo do GM): janela normal para não cobrir o GM
  return { display: target ?? gmDisplay, dedicated: false }
}

export function createPlayerWindow(): BrowserWindow {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.focus()
    return playerWindow
  }
  const { display, dedicated } = pickPlayerDisplay()

  playerWindow = new BrowserWindow({
    x: dedicated ? display.bounds.x : display.bounds.x + 60,
    y: dedicated ? display.bounds.y : display.bounds.y + 60,
    width: dedicated ? display.bounds.width : 1024,
    height: dedicated ? display.bounds.height : 600,
    frame: !dedicated,
    fullscreen: dedicated,
    show: false,
    title: 'Desolação Tabletop — Mesa',
    icon: windowIcon(),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  playerWindow.setMenuBarVisibility(false)
  playerWindow.on('ready-to-show', () => playerWindow?.show())
  pipeConsole(playerWindow, 'Player')
  playerWindow.webContents.on('did-finish-load', () => {
    if (lastPayload) playerWindow?.webContents.send('scene:state', lastPayload)
    notifyGmPlayerInfo()
  })
  playerWindow.on('resize', () => notifyGmPlayerInfo())
  playerWindow.on('closed', () => {
    playerWindow = null
    notifyGmPlayerInfo()
  })
  loadPage(playerWindow, 'player')
  return playerWindow
}

export function notifyGmPlayerInfo(): void {
  const open = !!playerWindow && !playerWindow.isDestroyed()
  const size = open ? playerWindow!.getContentBounds() : null
  gmWindow?.webContents.send('player:info', {
    open,
    width: size?.width ?? 0,
    height: size?.height ?? 0
  })
}

export function togglePlayerWindow(): void {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.close()
  } else {
    createPlayerWindow()
  }
}

export function movePlayerToDisplay(displayId: number): void {
  setSettings({ playerDisplayId: displayId })
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.close()
    // pequeno delay para o 'closed' processar antes de recriar
    setTimeout(() => createPlayerWindow(), 150)
  }
}

export function broadcastToPlayer(channel: string, payload: unknown): void {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send(channel, payload)
  }
}

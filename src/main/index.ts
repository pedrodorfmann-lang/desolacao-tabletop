import { app, BrowserWindow, dialog, ipcMain, protocol, screen } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import {
  IMG_EXT_RE,
  mediaUrl,
  type FsEvent,
  type LibraryFile,
  type ScenesFile,
  type Settings,
  type StagePayload
} from '@shared/types'
import { getSettings, setSettings } from './settings'
import {
  cacheHas,
  cacheWrite,
  closeWatchers,
  getLibrary,
  getScenes,
  saveLibrary,
  saveScenes,
  scanDir,
  watchDir
} from './library'
import {
  broadcastToPlayer,
  createGmWindow,
  createPlayerWindow,
  getGmWindow,
  getPlayerWindow,
  movePlayerToDisplay,
  notifyGmPlayerInfo,
  setLastPayload,
  togglePlayerWindow
} from './windows'
import { buildMenu } from './menu'
import { is } from './util'

// Protocolo media:// — serve arquivos locais (originais + cache) para os renderers
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

function assetsLogoDir(): string {
  return is.dev
    ? join(app.getAppPath(), 'assets', 'logo')
    : join(process.resourcesPath, 'assets', 'logo')
}

function findLogoPath(): string | null {
  const dir = assetsLogoDir()
  if (!existsSync(dir)) return null
  try {
    const file = readdirSync(dir).find((f) => IMG_EXT_RE.test(f))
    return file ? join(dir, file) : null
  } catch {
    return null
  }
}

function startWatchers(): void {
  const s = getSettings()
  const forward = (ev: FsEvent): void => {
    getGmWindow()?.webContents.send('fs:event', ev)
  }
  watchDir('map', s.mapsDir, forward)
  watchDir('token', s.tokensDir, forward)
}

function registerIpc(): void {
  // ── Settings ──
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const before = getSettings()
    const after = setSettings(patch)
    if (before.mapsDir !== after.mapsDir || before.tokensDir !== after.tokensDir) {
      startWatchers()
    }
    if (patch.playerDisplayId !== undefined && patch.playerDisplayId !== before.playerDisplayId) {
      movePlayerToDisplay(patch.playerDisplayId!)
      buildMenu()
    }
    getGmWindow()?.webContents.send('settings:changed', after)
    broadcastToPlayer('settings:changed', after)
    return after
  })

  // ── Displays / janela do jogador ──
  ipcMain.handle('displays:list', () => {
    const gmWin = getGmWindow()
    const gmDisplay = gmWin
      ? screen.getDisplayMatching(gmWin.getBounds())
      : screen.getPrimaryDisplay()
    const chosen = getSettings().playerDisplayId
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Display ${i + 1} — ${d.bounds.width}×${d.bounds.height}`,
      bounds: d.bounds,
      primary: d.id === screen.getPrimaryDisplay().id,
      current: chosen != null ? d.id === chosen : d.id !== gmDisplay.id
    }))
  })
  ipcMain.handle('player:toggle', () => {
    togglePlayerWindow()
    setTimeout(buildMenu, 300)
  })
  ipcMain.handle('player:isOpen', () => !!getPlayerWindow())
  ipcMain.on('player:ready', () => notifyGmPlayerInfo())

  // ── Diálogos ──
  ipcMain.handle('dialog:chooseFolder', async () => {
    const win = getGmWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle('dialog:chooseImage', async () => {
    const win = getGmWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    return res.canceled ? null : res.filePaths[0]
  })

  // ── Biblioteca / cenas / cache ──
  ipcMain.handle('library:get', () => getLibrary())
  ipcMain.on('library:save', (_e, lib: LibraryFile) => saveLibrary(lib))
  ipcMain.handle('scenes:get', () => getScenes())
  ipcMain.on('scenes:save', (_e, scenes: ScenesFile) => saveScenes(scenes))
  ipcMain.on('data:flush', (e, lib: LibraryFile, scenes: ScenesFile) => {
    try {
      saveLibrary(lib)
      saveScenes(scenes)
    } catch (err) {
      console.error('flush falhou:', err)
    }
    e.returnValue = true
  })
  ipcMain.handle('scan:folder', (_e, kind: 'map' | 'token') => {
    const s = getSettings()
    const dir = kind === 'map' ? s.mapsDir : s.tokensDir
    return dir && existsSync(dir) ? scanDir(dir) : []
  })
  ipcMain.handle('cache:write', (_e, rel: string, buf: ArrayBuffer) => cacheWrite(rel, buf))
  ipcMain.handle('cache:has', (_e, rel: string) => cacheHas(rel))
  ipcMain.handle('file:exists', (_e, p: string) => existsSync(p))

  // ── Sincronização de cena GM → Player ──
  ipcMain.on('scene:publish', (_e, payload: StagePayload) => {
    setLastPayload(payload)
    broadcastToPlayer('scene:state', payload)
  })
  ipcMain.on('fx:ping', (_e, ping) => {
    broadcastToPlayer('fx:ping', ping)
  })

  // ── Logo ──
  ipcMain.handle('logo:get', () => {
    const p = findLogoPath()
    return p ? mediaUrl(p) : null
  })
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

app.whenReady().then(() => {
  protocol.handle('media', async (request) => {
    try {
      const u = new URL(request.url)
      let p = decodeURIComponent(u.pathname)
      if (p.startsWith('/')) p = p.slice(1)
      if (!p || !existsSync(p)) {
        console.warn('media:// não encontrado:', p)
        return new Response('Not found', { status: 404 })
      }
      const ext = p.split('.').pop()?.toLowerCase() ?? ''
      const data = await readFile(p)
      return new Response(data, {
        headers: {
          'Content-Type': MIME[ext] ?? 'application/octet-stream',
          // imagens grandes não devem duplicar no cache de disco do Chromium
          'Cache-Control': 'no-store'
        }
      })
    } catch (err) {
      console.error('media:// erro:', request.url, err)
      return new Response('Error', { status: 500 })
    }
  })

  registerIpc()
  createGmWindow()
  buildMenu()
  startWatchers()

  screen.on('display-added', buildMenu)
  screen.on('display-removed', buildMenu)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createGmWindow()
  })
})

app.on('window-all-closed', () => {
  closeWatchers()
  app.quit()
})

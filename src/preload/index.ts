import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  DisplayInfo,
  FsEvent,
  LibraryFile,
  PingEvent,
  PlayerInfo,
  ScenesFile,
  Settings,
  StagePayload
} from '@shared/types'

type Unsub = () => void

function on<T>(channel: string, cb: (payload: T) => void): Unsub {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  // settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', patch),
  onSettings: (cb: (s: Settings) => void): Unsub => on('settings:changed', cb),

  // displays / player window
  listDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('displays:list'),
  togglePlayer: (): Promise<void> => ipcRenderer.invoke('player:toggle'),
  isPlayerOpen: (): Promise<boolean> => ipcRenderer.invoke('player:isOpen'),
  playerReady: (): void => ipcRenderer.send('player:ready'),
  onPlayerInfo: (cb: (info: PlayerInfo) => void): Unsub => on('player:info', cb),

  // diálogos
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseFolder'),
  chooseImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseImage'),

  // biblioteca / cenas / cache
  getLibrary: (): Promise<LibraryFile> => ipcRenderer.invoke('library:get'),
  saveLibrary: (lib: LibraryFile): void => ipcRenderer.send('library:save', lib),
  getScenes: (): Promise<ScenesFile> => ipcRenderer.invoke('scenes:get'),
  saveScenes: (scenes: ScenesFile): void => ipcRenderer.send('scenes:save', scenes),
  /** Gravação síncrona — usada no fechamento para não perder progresso */
  flush: (lib: LibraryFile, scenes: ScenesFile): void =>
    ipcRenderer.sendSync('data:flush', lib, scenes),
  scanFolder: (kind: 'map' | 'token'): Promise<{ path: string; folder: string }[]> =>
    ipcRenderer.invoke('scan:folder', kind),
  onFsEvent: (cb: (ev: FsEvent) => void): Unsub => on('fs:event', cb),
  cacheWrite: (rel: string, buf: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('cache:write', rel, buf),
  cacheHas: (rel: string): Promise<boolean> => ipcRenderer.invoke('cache:has', rel),
  fileExists: (p: string): Promise<boolean> => ipcRenderer.invoke('file:exists', p),

  // sincronização de cena
  publishScene: (payload: StagePayload): void => ipcRenderer.send('scene:publish', payload),
  onScene: (cb: (payload: StagePayload) => void): Unsub => on('scene:state', cb),
  sendPing: (ping: PingEvent): void => ipcRenderer.send('fx:ping', ping),
  onPing: (cb: (ping: PingEvent) => void): Unsub => on('fx:ping', cb),

  // diversos
  getLogoUrl: (): Promise<string | null> => ipcRenderer.invoke('logo:get'),
  onShowHelp: (cb: () => void): Unsub => on('ui:show-help', cb),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

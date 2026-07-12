import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join, dirname, relative } from 'path'
import { watch, type FSWatcher } from 'chokidar'
import {
  IMG_EXT_RE,
  type AssetKind,
  type FsEvent,
  type LibraryFile,
  type ScenesFile
} from '@shared/types'

// ── Persistência JSON simples em userData ────────────────────────────────────

function dataPath(name: string): string {
  return join(app.getPath('userData'), name)
}

function readJson<T>(name: string, fallback: T): T {
  try {
    // tolera BOM (arquivos editados por ferramentas externas)
    return JSON.parse(readFileSync(dataPath(name), 'utf-8').replace(/^﻿/, '')) as T
  } catch {
    return fallback
  }
}

function writeJson(name: string, data: unknown): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(dataPath(name), JSON.stringify(data), 'utf-8')
}

export function getLibrary(): LibraryFile {
  return readJson<LibraryFile>('library.json', { assets: [] })
}

export function saveLibrary(lib: LibraryFile): void {
  writeJson('library.json', lib)
}

export function getScenes(): ScenesFile {
  return readJson<ScenesFile>('scenes.json', { scenes: [], currentSceneId: null })
}

export function saveScenes(scenes: ScenesFile): void {
  writeJson('scenes.json', scenes)
}

// ── Cache de imagens (thumbs + versões de exibição) ──────────────────────────

export function cacheDir(): string {
  // não usar "cache": colide com o diretório de cache do próprio Chromium
  return join(app.getPath('userData'), 'imgcache')
}

export function cacheAbs(rel: string): string {
  return join(cacheDir(), rel)
}

export function cacheHas(rel: string): boolean {
  return existsSync(cacheAbs(rel))
}

export async function cacheWrite(rel: string, buffer: ArrayBuffer): Promise<string> {
  const abs = cacheAbs(rel)
  mkdirSync(dirname(abs), { recursive: true })
  await writeFile(abs, Buffer.from(buffer))
  return abs
}

// ── Scan e watch das pastas de mapas/tokens ──────────────────────────────────

export interface ScannedFile {
  path: string
  folder: string
}

export function scanDir(dir: string): ScannedFile[] {
  const out: ScannedFile[] = []
  const walk = (d: string, depth: number): void => {
    if (depth > 6) return
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(d, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full, depth + 1)
      else if (IMG_EXT_RE.test(name)) {
        out.push({ path: full, folder: relative(dir, dirname(full)) })
      }
    }
  }
  walk(dir, 0)
  return out
}

const watchers: Partial<Record<AssetKind, FSWatcher>> = {}

export function watchDir(
  kind: AssetKind,
  dir: string | null,
  onEvent: (ev: FsEvent) => void
): void {
  watchers[kind]?.close()
  delete watchers[kind]
  if (!dir || !existsSync(dir)) return
  const w = watch(dir, { ignoreInitial: true, depth: 6, ignorePermissionErrors: true })
  // OneDrive/arquivos sob demanda podem negar watch em arquivos individuais
  w.on('error', (err) => console.warn('watcher:', (err as Error).message))
  w.on('add', (p) => {
    if (IMG_EXT_RE.test(p)) onEvent({ kind, type: 'add', path: p })
  })
  w.on('unlink', (p) => {
    if (IMG_EXT_RE.test(p)) onEvent({ kind, type: 'unlink', path: p })
  })
  watchers[kind] = w
}

export function closeWatchers(): void {
  for (const k of Object.keys(watchers) as AssetKind[]) {
    watchers[k]?.close()
    delete watchers[k]
  }
}

import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

let cached: Settings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): Settings {
  if (cached) return cached
  try {
    const raw = readFileSync(settingsPath(), 'utf-8').replace(/^﻿/, '')
    cached = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    cached = { ...DEFAULT_SETTINGS }
  }
  // migra configs antigas: 8K foi removido (máx. 4K para carregar rápido)
  if (cached!.displayMaxEdge > 4096) cached!.displayMaxEdge = 4096
  return cached!
}

export function setSettings(patch: Partial<Settings>): Settings {
  cached = { ...getSettings(), ...patch }
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(settingsPath(), JSON.stringify(cached, null, 2), 'utf-8')
  } catch (err) {
    console.error('Falha ao salvar settings:', err)
  }
  return cached
}

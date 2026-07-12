import { mediaUrl, type AssetEntry, type AssetKind } from '@shared/types'
import { nanoid } from 'nanoid'

// ── Nomes, tags e variantes ──────────────────────────────────────────────────

export function cleanName(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  return base
    .replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/^c[oó]pia de\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    // remove diacríticos (faixa Unicode de combining marks)
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toUpperCase()
    .trim()
}

const DAY_SUFFIXES = new Set(['DIA', 'DAY', 'D', 'A'])
const NIGHT_SUFFIXES = new Set(['NOITE', 'NIGHT', 'N'])

/** Divide o nome em base + sufixo de variante (DIA/NOITE/A/N), se houver */
export function variantParts(name: string): { base: string; suffix: 'day' | 'night' | null } {
  const norm = normalize(name).replace(/\s*\(\d+\)\s*$/, '')
  const words = norm.split(/\s+/)
  const last = words[words.length - 1]
  if (words.length >= 2) {
    if (DAY_SUFFIXES.has(last)) return { base: words.slice(0, -1).join(' '), suffix: 'day' }
    if (NIGHT_SUFFIXES.has(last)) return { base: words.slice(0, -1).join(' '), suffix: 'night' }
  }
  return { base: norm, suffix: null }
}

export function autoTags(name: string, folder: string): string[] {
  const tags: string[] = []
  const { suffix } = variantParts(name)
  if (suffix === 'day') tags.push('Dia')
  if (suffix === 'night') tags.push('Noite')
  if (folder) {
    const top = folder.replace(/\\/g, '/').split('/')[0]
    if (top) tags.push(top)
  }
  return tags
}

/**
 * Auto-pareamento de variantes: agrupa por base do nome e vincula pares
 * dia/noite. Retorna os assets alterados.
 */
export function pairVariants(assets: AssetEntry[]): AssetEntry[] {
  const changed: AssetEntry[] = []
  const groups = new Map<string, AssetEntry[]>()
  for (const a of assets) {
    if (a.kind !== 'map') continue
    const { base, suffix } = variantParts(a.name)
    if (!suffix) continue
    const arr = groups.get(base) ?? []
    arr.push(a)
    groups.set(base, arr)
  }
  for (const arr of groups.values()) {
    if (arr.length !== 2) continue
    const [a, b] = arr
    if (a.variantId === b.id && b.variantId === a.id) continue
    if (a.variantId || b.variantId) continue // não sobrescreve vínculo manual
    changed.push({ ...a, variantId: b.id }, { ...b, variantId: a.id })
  }
  return changed
}

export function makeEntry(kind: AssetKind, path: string, folder: string): AssetEntry {
  const name = cleanName(path)
  return {
    id: nanoid(10),
    kind,
    name,
    path,
    folder,
    tags: autoTags(name, folder),
    width: 0,
    height: 0,
    displayWidth: 0,
    displayHeight: 0,
    addedAt: Date.now()
  }
}

// ── Geração de cache (thumb + versão de exibição) ────────────────────────────

const READ_TIMEOUT_MS = 25000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout de ${label} (${ms}ms)`)), ms)
    )
  ])
}

export interface CacheResult {
  /** patch a aplicar no asset (sucesso), ou undefined */
  patch?: Partial<AssetEntry>
  /** falha transitória (ex.: OneDrive hidratando) → tentar de novo depois */
  retry?: boolean
}

async function encodeScaled(
  blob: Blob,
  natW: number,
  natH: number,
  longEdge: number,
  quality: number
): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, longEdge / Math.max(natW, natH))
  const w = Math.max(1, Math.round(natW * scale))
  const h = Math.max(1, Math.round(natH * scale))
  // Decodifica JÁ no tamanho reduzido: evita alocar o bitmap gigante (mapas de
  // ~150 MP travavam o drawImage/convertToBlob em cheio).
  const bmp = await createImageBitmap(blob, {
    resizeWidth: w,
    resizeHeight: h,
    resizeQuality: 'high'
  })
  try {
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bmp, 0, 0, w, h)
    const out = await canvas.convertToBlob({ type: 'image/webp', quality })
    return { blob: out, w, h }
  } finally {
    bmp.close()
  }
}

/** Lê apenas as dimensões naturais sem manter o bitmap gigante na memória */
async function probeSize(blob: Blob): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(blob)
  const w = bmp.width
  const h = bmp.height
  bmp.close()
  return { w, h }
}

export async function generateCache(
  entry: AssetEntry,
  maxEdge: number
): Promise<CacheResult> {
  let blob: Blob
  let W: number
  let H: number
  try {
    // Timeout: arquivos "somente online" do OneDrive podem demorar (ou travar)
    // para hidratar. Não deixamos um arquivo lento parar a fila inteira.
    const res = await withTimeout(
      fetch(mediaUrl(entry.path)),
      READ_TIMEOUT_MS,
      'leitura'
    )
    if (!res.ok) {
      console.warn('Falha ao ler', entry.path, res.status)
      return { retry: true }
    }
    blob = await withTimeout(res.blob(), READ_TIMEOUT_MS, 'download')
    const size = await probeSize(blob)
    W = size.w
    H = size.h
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    console.warn('Falha ao ler/decodificar', entry.name, msg)
    // provável placeholder do OneDrive ainda hidratando → tenta de novo depois
    return { retry: true }
  }
  try {
    const thumb = await encodeScaled(blob, W, H, 300, 0.8)
    const thumbPath = await window.api.cacheWrite(
      `thumbs/${entry.id}.webp`,
      await thumb.blob.arrayBuffer()
    )
    const dispCap = entry.kind === 'map' ? maxEdge : 2048
    const disp = await encodeScaled(blob, W, H, dispCap, 0.85)
    const displayPath = await window.api.cacheWrite(
      `display/${entry.id}.webp`,
      await disp.blob.arrayBuffer()
    )
    return {
      patch: {
        width: W,
        height: H,
        displayWidth: disp.w,
        displayHeight: disp.h,
        thumbPath,
        displayPath,
        missing: false
      }
    }
  } catch (err) {
    console.warn('Falha ao gerar cache', entry.path, err)
    // erro de codificação (não é hidratação) → não insistir infinitamente
    return {}
  }
}

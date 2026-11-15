import type { DetectorReading } from '../features/simulation/engine'

export type SavedSimulation = {
  id?: string
  name: string
  date: string
  scenario: string
  radiationCategory?: string
  particle?: string
  spacecraft?: string
  material?: string
  thicknessMm?: number
  durationHours?: number
  energyRange?: string
  intensity?: number
  seed?: number
  dose: number
  primaryDoseGy?: number
  secondaryDoseGy?: number
  detectors: DetectorReading[]
  detectorPositions?: Record<string, [number, number, number]>
  configSignature?: string
  provenance?: string
}

export type SavedDataset = { id: string; name: string; unit: string; columns: string[]; rows?: number[][]; createdAt?: string; provenance?: string; sourceName?: string; sourceUrl?: string; sourceVariable?: string; sourceUnit?: string; startTime?: string; endTime?: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `API request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<{ api: string; database: 'connected' | 'connecting' | 'disconnected' }>('/health'),
  listSimulations: () => request<SavedSimulation[]>('/simulations'),
  saveSimulation: (simulation: SavedSimulation) => request<SavedSimulation>('/simulations', { method: 'POST', body: JSON.stringify(simulation) }),
  deleteSimulation: (id: string) => request<void>(`/simulations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clearSimulations: () => request<void>('/simulations', { method: 'DELETE' }),
  getWorkspace: () => request<Record<string, unknown>>('/workspace'),
  saveWorkspace: (settings: Record<string, unknown>) => request<Record<string, unknown>>('/workspace', { method: 'PUT', body: JSON.stringify(settings) }),
  listDatasets: () => request<SavedDataset[]>('/datasets'),
  getDataset: (id: string) => request<SavedDataset>(`/datasets/${encodeURIComponent(id)}`),
  saveDataset: (dataset: Omit<SavedDataset, 'id'>) => request<SavedDataset>('/datasets', { method: 'POST', body: JSON.stringify(dataset) }),
  importNasaRad: (input: { startDate: string; endDate: string; component: 'totalDoseB' | 'correctedDoseB' | 'totalDoseE' }) => request<SavedDataset>('/datasets/nasa-rad/import', { method: 'POST', body: JSON.stringify(input) }),
  deleteDataset: (id: string) => request<void>(`/datasets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

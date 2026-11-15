import { lazy, Suspense, useEffect, useMemo, useState, type ComponentProps } from 'react'
import type { DetectorPosition } from './Spacecraft3D'
import { fuseCompatible, fusionDescription, runEducationalSimulation, type DetectorReading } from './features/simulation/engine'
import { api, type SavedDataset, type SavedSimulation } from './services/api'
import './App.css'

const Spacecraft3D = lazy(() => import('./Spacecraft3D'))
const SpacecraftViewer = (props: ComponentProps<typeof Spacecraft3D>) => <Suspense fallback={<div className="spacecraft-3d three-loading">Loading 3D vehicle…</div>}><Spacecraft3D {...props}/></Suspense>

type Result = SavedSimulation & { detectorPositions?: Record<string, DetectorPosition> }
const nav = [
  ['Overview', '⌂', 'Mission overview'], ['Simulation Lab', '◉', 'Configure and run'], ['Spacecraft Designer', '◇', 'Vehicle configuration'],
  ['Radiation Environment', '◎', 'Mission environment'], ['Detector Laboratory', '⌁', 'Instrument setup'], ['Data Fusion', '⟁', 'Measurement synthesis'],
  ['Radiation Analysis', '▥', 'Explore results'], ['Crew Health Impact', '♡', 'Exposure health context'], ['Dataset Explorer', '▤', 'Local data library'], ['Simulation History', '◷', 'Saved runs'], ['Reports', '▧', 'Export analysis'], ['Settings', '⚙', 'Workspace preferences'],
]
const initialHistory: Result[] = JSON.parse(localStorage.getItem('gadaa-history') || '[]')
const detectorTypes = ['Silicon detector', 'Tissue-equivalent counter', 'Neutron detector', 'Scintillation detector', 'Passive dosimeter']
const scenarios = ['Mars Transit', 'Deep Space Mission', 'Lunar Mission', 'Earth Radiation Belt', 'Solar Particle Event', 'Custom Environment']
const spacecraftTypes = ['Space Shuttle Orbiter', 'Orion Deep Space', 'Asteria Transit', 'Lunar Lander', 'Cargo Transfer']
const spacecraftDescriptions: Record<string, string> = {
  'Space Shuttle Orbiter': 'NASA Space Shuttle Orbiter (matching Image 1): black-and-white thermal protection system (TPS), cockpit flight deck, open payload bay with Canadarm RMS robotic arm, deployable payloads, double-delta wings, OMS pods, and 3 SSME rocket engines.',
  'Orion Deep Space': 'Deep space exploration vehicle stack (matching Image 2): metallic conical crew module capsule, cylindrical service module, open lattice interstage truss housing 6 red propellant tanks, and large cryogenic rocket engine bell.',
  'Asteria Transit': 'Crewed interplanetary vehicle with a pressurized cabin and paired solar wings.',
  'Lunar Lander': 'Compact descent vehicle with landing struts, footpads, and short power wings.',
  'Cargo Transfer': 'Uncrewed logistics vehicle with an enlarged cargo bay and extended solar wings.',
}

function Chart({ compact = false, dose = .02, duration = 24 }: { compact?: boolean; dose?: number; duration?: number }) {
  const fractions = [0, .055, .12, .19, .25, .33, .4, .48, .56, .64, .72, .8, .9, 1]
  const vals = fractions.map((f, i) => f * (1 + Math.sin(i * .9) * .035))
  const maxMilliGy = Math.max(.001, dose * 1000)
  const pointY = (v: number) => 175 - v * 150
  return <div className={`chart ${compact ? 'chart-compact' : ''}`}><div className="chart-y"><span>{maxMilliGy.toPrecision(3)}</span><span>{(maxMilliGy*.75).toPrecision(3)}</span><span>{(maxMilliGy*.5).toPrecision(3)}</span><span>{(maxMilliGy*.25).toPrecision(3)}</span><span>0</span></div><svg viewBox="0 0 600 190" preserveAspectRatio="none" aria-label="Illustrative cumulative dose over time chart">
    {[15,55,95,135,175].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#27364a" strokeDasharray="3 5"/>)}
    <path d={`M0,175 ${vals.map((v,i)=>`L${i*46},${pointY(v)}`).join(' ')} L598,175 Z`} fill="url(#fill)" opacity=".48"/><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#38bdf8" stopOpacity=".48"/><stop offset="1" stopColor="#38bdf8" stopOpacity="0"/></linearGradient></defs>
    <polyline points={vals.map((v,i)=>`${i*46},${pointY(v)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="2.5"/>{vals.map((v,i)=><circle key={i} cx={i*46} cy={pointY(v)} r="2.7" fill="#93e4ff"/>)}
  </svg><div className="chart-x"><span>0h</span><span>{(duration*.25).toPrecision(2)}h</span><span>{(duration*.5).toPrecision(2)}h</span><span>{(duration*.75).toPrecision(2)}h</span><span>{duration}h</span></div></div>
}

function HealthTrend({ rows, unit }: { rows: number[][]; unit: string }) {
  const start = rows[0]?.[0] || 0
  const span = Math.max(.0001, (rows[rows.length - 1]?.[0] || 1) - start)
  const max = Math.max(.000001, ...rows.map(r => r[1]))
  const points = rows.map(r => `${36 + ((r[0] - start) / span) * 550},${172 - (r[1] / max) * 142}`).join(' ')
  return <div className="health-trend"><div className="health-trend-axis"><span>{max.toPrecision(3)} {unit}</span><span>{(max/2).toPrecision(3)}</span><span>0</span></div><svg viewBox="0 0 600 190" preserveAspectRatio="none" aria-label="Imported measured dose rate over time"><line x1="35" y1="30" x2="590" y2="30"/><line x1="35" y1="100" x2="590" y2="100"/><line x1="35" y1="172" x2="590" y2="172"/><polyline points={points}/>{rows.map((r,i)=><circle key={i} cx={36 + ((r[0] - start) / span) * 550} cy={172 - (r[1] / max) * 142} r="3"/>)}</svg><div className="health-trend-time"><span>{start} h</span><span>{rows[rows.length-1]?.[0]} h</span></div></div>
}

function LocalHealthAssistant({ assessment }: { assessment: { primary?: number; secondary?: number; combined?: number; unit: string; duration: number; provenance: string } | null }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<{ role: 'assistant' | 'user'; text: string }[]>([{ role: 'assistant', text: 'I can explain this page’s inputs, primary and secondary categories, units, and general prevention concepts. I run locally using fixed rules; I am not a medical or generative AI system.' }])
  const exposure = assessment?.combined !== undefined ? `${assessment.combined.toPrecision(4)} ${assessment.unit} over ${assessment.duration.toPrecision(3)} hours (${assessment.provenance})` : 'No valid exposure assessment is available.'
  const answer = (raw: string) => {
    const q = raw.toLowerCase()
    if (/primary|secondary|type one|type two/.test(q)) return 'Primary radiation means incoming particles from the environment. Secondary radiation means particles produced by interactions in spacecraft materials. This prototype only separates them when component-resolved inputs or its own synthetic model outputs are available; a combined dose cannot reveal that split.'
    if (/prevent|protect|shield|shelter|health/.test(q)) return 'General protection concepts include mission planning, exposure monitoring and dosimetry, following mission radiation alerts, and using designated storm-shelter areas during solar particle events. Shielding effects depend on particle type and material; more shielding is not automatically better because interactions can produce secondary particles. Follow mission-approved procedures and qualified medical/radiation-protection guidance.'
    if (/summar|result|what do|exposure/.test(q)) return `Current page summary: ${exposure} ${assessment?.primary !== undefined ? `Primary component: ${assessment.primary.toPrecision(4)} ${assessment.unit}. ` : ''}${assessment?.secondary !== undefined ? `Secondary component: ${assessment.secondary.toPrecision(4)} ${assessment.unit}.` : ''}`
    if (/ai|data|private|cloud/.test(q)) return 'This assistant is a transparent local rules-based prototype, not a trained or generative AI model. Your entered values stay in this browser and are not sent to an AI service.'
    return 'I can help explain primary versus secondary radiation, general prevention concepts, units, or summarize the current exposure input. This prototype cannot diagnose or estimate personal health risk.'
  }
  const submit = (text = question) => { const q = text.trim(); if (!q) return; setMessages(current => [...current, { role: 'user', text: q }, { role: 'assistant', text: answer(q) }]); setQuestion('') }
  return <div className="panel health-assistant"><PanelTitle title="GadaaSpace health assistant" sub="Local rules · no external AI service"/><div className="assistant-badge">Decision support prototype · not generative AI</div><div className="assistant-messages" aria-live="polite">{messages.map((m,i)=><div key={i} className={`assistant-message ${m.role}`}>{m.text}</div>)}</div><div className="assistant-prompts">{['Explain primary vs secondary', 'How can exposure be reduced?', 'Summarize current input'].map(p=><button key={p} onClick={()=>submit(p)}>{p}</button>)}</div><form className="assistant-entry" onSubmit={e=>{e.preventDefault();submit()}}><input aria-label="Ask the local health assistant" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about this exposure…"/><button className="primary">Send</button></form></div>
}

function App() {
  const [page, setPage] = useState('Overview')
  const [scenario, setScenario] = useState('Mars Transit')
  const [material, setMaterial] = useState('Aluminum')
  const [spacecraftType, setSpacecraftType] = useState('Orion Deep Space')
  const [thickness, setThickness] = useState(12)
  const [duration, setDuration] = useState(24)
  const [particle, setParticle] = useState('Protons')
  const [radiationCategory, setRadiationCategory] = useState('Galactic Cosmic Rays (GCR)')
  const [energyMin, setEnergyMin] = useState('10')
  const [energyMax, setEnergyMax] = useState('1000')
  const [intensity, setIntensity] = useState('1.0')
  const [cutaway, setCutaway] = useState(false)
  const [selected, setSelected] = useState('Crew compartment')
  const [detectors, setDetectors] = useState(['Silicon detector', 'Scintillation detector', 'Tissue-equivalent counter', 'Neutron detector'])
  const [detectorPositions, setDetectorPositions] = useState<Record<string, DetectorPosition>>(() => JSON.parse(localStorage.getItem('gadaa-detector-positions') || '{}'))
  const [history, setHistory] = useState<Result[]>(initialHistory)
  const [result, setResult] = useState<Result | null>(initialHistory[0] || null)
  const [running, setRunning] = useState(false)
  const [fusionMode, setFusionMode] = useState('Multi-detector fusion')
  const [fusionGroup, setFusionGroup] = useState('dose-gy')
  const [dataset, setDataset] = useState<number[][]>([])
  const [datasetSource, setDatasetSource] = useState<'empty' | 'imported' | 'database' | 'nasa'>('empty')
  const [datasetRateUnit, setDatasetRateUnit] = useState('Gy/h')
  const [datasetMetadata, setDatasetMetadata] = useState<SavedDataset | null>(null)
  const [nasaStartDate, setNasaStartDate] = useState('2014-01-01')
  const [nasaEndDate, setNasaEndDate] = useState('2014-01-02')
  const [nasaComponent, setNasaComponent] = useState<'totalDoseB' | 'correctedDoseB' | 'totalDoseE'>('correctedDoseB')
  const [nasaLoading, setNasaLoading] = useState(false)
  const [healthSource, setHealthSource] = useState('manual')
  const [healthDose, setHealthDose] = useState('')
  const [healthSecondaryDose, setHealthSecondaryDose] = useState('')
  const [healthDoseUnit, setHealthDoseUnit] = useState('mSv')
  const [healthDuration, setHealthDuration] = useState('24')
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState('Dark')
  const [seed, setSeed] = useState('42')
  const [databaseStatus, setDatabaseStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting')
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [savedDatasets, setSavedDatasets] = useState<SavedDataset[]>([])
  const [datasetName, setDatasetName] = useState('Imported radiation dataset')

  useEffect(() => {
    let cancelled = false
    const loadDatabase = async () => {
      try {
        let health = await api.health()
        for (let attempt = 0; health.database === 'connecting' && attempt < 12; attempt++) {
          await new Promise(resolve => window.setTimeout(resolve, 1000))
          health = await api.health()
        }
        if (health.database !== 'connected') throw new Error('Atlas is offline')
        const [remoteRuns, settings, remoteDatasets] = await Promise.all([api.listSimulations(), api.getWorkspace(), api.listDatasets()])
        let runs = remoteRuns
        const localRuns: Result[] = JSON.parse(localStorage.getItem('gadaa-history') || '[]')
        if (!runs.length && localRuns.length) {
          runs = await Promise.all(localRuns.slice(0, 30).map(run => api.saveSimulation(run)))
        }
        if (cancelled) return
        setDatabaseStatus('connected')
        setHistory(runs)
        setResult(runs[0] || null)
        localStorage.setItem('gadaa-history', JSON.stringify(runs))
        setSavedDatasets(remoteDatasets)
        if (remoteDatasets.length) {
          const storedDataset = await api.getDataset(remoteDatasets[0].id)
          if (storedDataset.rows) {
            setDataset(storedDataset.rows)
            setDatasetMetadata(storedDataset)
            setDatasetSource(storedDataset.sourceName?.startsWith('NASA') ? 'nasa' : 'database')
            setDatasetName(storedDataset.name)
            setDatasetRateUnit(storedDataset.unit)
          }
        }
        const values = settings
        if (typeof values.scenario === 'string') setScenario(values.scenario)
        if (typeof values.material === 'string') setMaterial(values.material)
        if (typeof values.spacecraftType === 'string') setSpacecraftType(values.spacecraftType)
        if (typeof values.thickness === 'number') setThickness(values.thickness)
        if (typeof values.duration === 'number') setDuration(values.duration)
        if (typeof values.particle === 'string') setParticle(values.particle)
        if (typeof values.radiationCategory === 'string') setRadiationCategory(values.radiationCategory)
        if (typeof values.energyMin === 'string') setEnergyMin(values.energyMin)
        if (typeof values.energyMax === 'string') setEnergyMax(values.energyMax)
        if (typeof values.intensity === 'string') setIntensity(values.intensity)
        if (typeof values.seed === 'string') setSeed(values.seed)
        if (typeof values.theme === 'string') setTheme(values.theme)
        if (Array.isArray(values.detectors) && values.detectors.every(item => typeof item === 'string')) setDetectors(values.detectors)
        if (values.detectorPositions && typeof values.detectorPositions === 'object') setDetectorPositions(values.detectorPositions as Record<string, DetectorPosition>)
      } catch {
        if (!cancelled) setDatabaseStatus('offline')
      } finally {
        if (!cancelled) setWorkspaceLoaded(true)
      }
    }
    void loadDatabase()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!workspaceLoaded || databaseStatus !== 'connected') return
    const timeout = window.setTimeout(() => {
      void api.saveWorkspace({ scenario, material, spacecraftType, thickness, duration, particle, radiationCategory, energyMin, energyMax, intensity, seed, theme, detectors, detectorPositions, fusionMode, fusionGroup }).catch(() => setDatabaseStatus('offline'))
    }, 600)
    return () => window.clearTimeout(timeout)
  }, [workspaceLoaded, databaseStatus, scenario, material, spacecraftType, thickness, duration, particle, radiationCategory, energyMin, energyMax, intensity, seed, theme, detectors, detectorPositions, fusionMode, fusionGroup])

  useEffect(() => {
    if (databaseStatus !== 'connected') return
    void api.listDatasets().then(setSavedDatasets).catch(() => setDatabaseStatus('offline'))
  }, [databaseStatus])

  const vehicleComponents = useMemo(() => {
    if (spacecraftType === 'Space Shuttle Orbiter') {
      return ['Crew compartment', 'Payload bay', 'Wings & TPS', 'Engine cluster']
    }
    if (spacecraftType === 'Orion Deep Space') {
      return ['Crew compartment', 'Equipment bay', 'Outer shielding', 'Engine cluster']
    }
    return ['Crew compartment', 'Equipment bay', 'Outer shielding', 'Solar arrays']
  }, [spacecraftType])
  const parseEnergy = (v: string, fallback: number) => Number.isFinite(Number(v)) ? Number(v) : fallback
  const simulationInput = { scenario, radiationCategory, particle, energyMinMeV: parseEnergy(energyMin, 10), energyMaxMeV: parseEnergy(energyMax, 1000), intensity: parseEnergy(intensity, 1), durationHours: duration, seed: Number(seed) || 42, material, thicknessMm: thickness, spacecraft: spacecraftType, detectors, positions: detectorPositions }
  const configSignature = JSON.stringify(simulationInput)
  const model = runEducationalSimulation(simulationInput)
  const latest: Result = result?.configSignature === configSignature ? result : { name: `${scenario} Radiation Analysis`, date: 'Current configuration · illustrative', scenario, radiationCategory, particle, spacecraft: spacecraftType, material, thicknessMm: thickness, durationHours: duration, energyRange: `${energyMin}–${energyMax} MeV`, intensity: Number(intensity), seed: Number(seed), dose: model.doseGy, primaryDoseGy: model.primaryDoseGy, secondaryDoseGy: model.secondaryDoseGy, detectors: model.readings, detectorPositions, configSignature }
  const compatibleReadings = latest.detectors.map(d => {
    if (d.fusionGroup) return d
    if (d.name.toLowerCase().includes('tissue')) return { ...d, quantity: 'Dose equivalent estimate', unit: 'Sv', fusionGroup: 'dose-equivalent-sv' }
    if (d.name.toLowerCase().includes('neutron')) return { ...d, quantity: 'Neutron count-rate proxy', unit: 'counts/s', fusionGroup: 'neutron-rate' }
    return { ...d, quantity: 'Absorbed dose estimate', unit: 'Gy', fusionGroup: 'dose-gy' }
  })
  const fusion = fuseCompatible(compatibleReadings, fusionGroup)
  const fused = fusion.estimate
  const fusedError = fusion.uncertainty
  const modelError = model.doseGy * .2
  const modelJointEstimate = fusionGroup === 'dose-gy' && fused !== null && fusedError !== null
    ? (fused / fusedError ** 2 + model.doseGy / modelError ** 2) / (1 / fusedError ** 2 + 1 / modelError ** 2)
    : null
  const modelJointError = fusionGroup === 'dose-gy' && fusedError !== null
    ? Math.sqrt(1 / (1 / fusedError ** 2 + 1 / modelError ** 2))
    : null
  const activeEstimate = fusionMode === 'Single detector' ? fusion.readings[0]?.value ?? null : fusionMode === 'Detectors + model' ? modelJointEstimate : fused
  const activeError = fusionMode === 'Single detector' ? fusion.readings[0]?.error ?? null : fusionMode === 'Detectors + model' ? modelJointError : fusedError
  const healthAssessment = (() => {
    if (healthSource === 'csv') {
      if (datasetSource === 'empty' || datasetSource === 'nasa' || dataset.length < 2) return null
      const rows = [...dataset].filter(row => Number.isFinite(row[0]) && row[0] >= 0 && Number.isFinite(row[1]) && row[1] >= 0).sort((a,b)=>a[0]-b[0])
      const elapsed = rows.length > 1 ? rows[rows.length-1][0] - rows[0][0] : 0
      if (elapsed <= 0) return null
      let primary = 0, secondary = 0
      for (let i=1;i<rows.length;i++) {
        const dt = rows[i][0] - rows[i-1][0]
        primary += ((rows[i-1][1] + rows[i][1]) / 2) * dt
        if (rows.every(row => Number.isFinite(row[2]))) secondary += ((rows[i-1][2] + rows[i][2]) / 2) * dt
      }
      const hasSecondary = rows.every(row => Number.isFinite(row[2]))
      return { value: primary + (hasSecondary ? secondary : 0), primary, secondary: hasSecondary ? secondary : undefined, unit: datasetRateUnit.replace('/h',''), duration: elapsed, averageRate: (primary + (hasSecondary ? secondary : 0))/elapsed, peakRate: Math.max(...rows.map(row=>row[1])), provenance: datasetMetadata?.sourceName ? `${datasetMetadata.sourceName} · ${datasetMetadata.provenance || 'measured archive data'}` : 'Imported CSV · user-supplied', synthetic: false, rows }
    }
    if (healthSource === 'simulation') {
      const primary = latest.primaryDoseGy
      const secondary = latest.secondaryDoseGy
      return { value: latest.dose, primary, secondary, unit: 'Gy', duration: latest.durationHours ?? duration, averageRate: latest.dose / Math.max(1, latest.durationHours ?? duration), peakRate: null as number | null, provenance: 'Synthetic model output', synthetic: true, rows: [] as number[][] }
    }
    const value = Number(healthDose)
    const hours = Number(healthDuration)
    if (!healthDose || !Number.isFinite(value) || value < 0 || !Number.isFinite(hours) || hours <= 0) return null
    const secondary = healthSecondaryDose ? Number(healthSecondaryDose) : undefined
    if (secondary !== undefined && (!Number.isFinite(secondary) || secondary < 0)) return null
    return { value: value + (secondary ?? 0), primary: value, secondary, unit: healthDoseUnit, duration: hours, averageRate: (value + (secondary ?? 0))/hours, peakRate: null as number | null, provenance: 'User-entered measurement', synthetic: false, rows: [] as number[][] }
  })()
  const showNotice = (s: string) => { setNotice(s); window.setTimeout(()=>setNotice(''), 3000) }
  const updateDetectorPosition = (name: string, position: DetectorPosition) => setDetectorPositions(current => {
    const next = { ...current, [name]: position }
    localStorage.setItem('gadaa-detector-positions', JSON.stringify(next))
    return next
  })
  const resetDetectorPositions = () => { setDetectorPositions({}); localStorage.removeItem('gadaa-detector-positions'); showNotice('Detector positions reset to their default locations.') }
  const openRun = (run: Result) => {
    const energyValues = run.energyRange?.match(/[\d.]+/g) || ['10', '1000']
    const nextDetectors = run.detectors.map(d => d.name)
    const nextPositions = run.detectorPositions || {}
    const restored = {
      scenario: run.scenario,
      radiationCategory: run.radiationCategory || 'Galactic Cosmic Rays (GCR)',
      particle: run.particle || 'Protons',
      energyMinMeV: Number(energyValues[0]),
      energyMaxMeV: Number(energyValues[1] || energyValues[0]),
      intensity: run.intensity ?? 1,
      durationHours: run.durationHours ?? 24,
      seed: run.seed ?? 42,
      material: run.material || 'Aluminum',
      thicknessMm: run.thicknessMm ?? 12,
      spacecraft: run.spacecraft || 'Asteria Transit',
      detectors: nextDetectors,
      positions: nextPositions,
    }
    setScenario(restored.scenario); setRadiationCategory(restored.radiationCategory); setParticle(restored.particle)
    setEnergyMin(String(restored.energyMinMeV)); setEnergyMax(String(restored.energyMaxMeV)); setIntensity(String(restored.intensity))
    setDuration(restored.durationHours); setSeed(String(restored.seed)); setMaterial(restored.material); setThickness(restored.thicknessMm)
    setSpacecraftType(restored.spacecraft); setDetectors(nextDetectors); setDetectorPositions(nextPositions)
    localStorage.setItem('gadaa-detector-positions', JSON.stringify(nextPositions))
    setResult({ ...run, configSignature: JSON.stringify(restored) })
  }
  const startSimulation = () => {
    if (running) {
      const output = runEducationalSimulation({ scenario, radiationCategory, particle, energyMinMeV: parseEnergy(energyMin, 10), energyMaxMeV: parseEnergy(energyMax, 1000), intensity: parseEnergy(intensity, 1), durationHours: duration, seed: Number(seed) || 42, material, thicknessMm: thickness, spacecraft: spacecraftType, detectors, positions: detectorPositions })
      const r: Result = {
        name: `${scenario} Radiation Analysis`,
        date: new Date().toLocaleString(),
        scenario,
        radiationCategory,
        particle,
        spacecraft: spacecraftType,
        material,
        thicknessMm: thickness,
        durationHours: duration,
        energyRange: `${energyMin}–${energyMax} MeV`,
        intensity: Number(intensity),
        seed: Number(seed) || 42,
        dose: output.doseGy,
        primaryDoseGy: output.primaryDoseGy,
        secondaryDoseGy: output.secondaryDoseGy,
        detectors: output.readings,
        detectorPositions: { ...detectorPositions },
        configSignature
      }
      const next = [r, ...history].slice(0, 30)
      setHistory(next)
      localStorage.setItem('gadaa-history', JSON.stringify(next))
      setResult(r)
      setRunning(false)
      if (databaseStatus === 'connected') {
        void api.saveSimulation(r).then(saved => {
          setHistory(current => current.map(item => item === r ? saved : item))
          setResult(saved)
          showNotice('Simulation saved to Atlas and this browser.')
        }).catch(() => { setDatabaseStatus('offline'); showNotice('Atlas unavailable · simulation remains saved in this browser.') })
      } else showNotice('Database offline · simulation saved in this browser only.')
      return
    }

    if (!detectors.length) {
      showNotice('Add at least one detector before running a simulation.')
      return
    }
    if (!(parseEnergy(energyMin, NaN) > 0) || !(parseEnergy(energyMax, NaN) > parseEnergy(energyMin, NaN)) || !(parseEnergy(intensity, NaN) > 0)) {
      showNotice('Enter positive intensity and an energy maximum greater than the minimum.')
      return
    }

    // Start continuous radiation streaming - runs until explicitly stopped!
    setRunning(true)
    setPage('Simulation Lab')
    showNotice('Continuous radiation stream started! It will keep running until you stop it.')
  }
  const toggleSimulation = (active: boolean) => {
    if (active && !running) startSimulation()
    else if (!active && running) startSimulation()
  }
  const clearHistory = async () => {
    if (databaseStatus === 'connected') {
      try { await api.clearSimulations() } catch { showNotice('Atlas could not clear saved simulations.'); return }
    }
    setHistory([]); setResult(null); localStorage.removeItem('gadaa-history'); showNotice(databaseStatus === 'connected' ? 'Atlas simulation history cleared.' : 'Local simulation history cleared.')
  }
  const deleteHistoryItem = async (run: Result, index: number) => {
    if (run.id && databaseStatus === 'connected') {
      try { await api.deleteSimulation(run.id) } catch { showNotice('Atlas could not delete this simulation.'); return }
    }
    const next = history.filter((_, i) => i !== index)
    setHistory(next); localStorage.setItem('gadaa-history', JSON.stringify(next))
  }
  const saveDatasetToAtlas = async () => {
    if (datasetSource !== 'imported' || !dataset.length) return
    try {
      const saved = await api.saveDataset({ name: datasetName, unit: datasetRateUnit, columns: dataset.some(row => row.length > 2) ? ['time_h', 'primary_or_combined_rate', 'secondary_rate'] : ['time_h', 'primary_or_combined_rate'], rows: dataset, provenance: 'User-imported CSV · user explicitly saved', sourceName: 'User CSV' })
      setSavedDatasets(current => [saved, ...current.filter(item => item.id !== saved.id)])
      setDatasetMetadata(saved); setDatasetSource('database')
      showNotice('Dataset explicitly saved to your Atlas database.')
    } catch (error) { showNotice(error instanceof Error ? error.message : 'Dataset could not be saved to Atlas.') }
  }
  const openSavedDataset = async (id: string) => {
    try { const saved = await api.getDataset(id); if (saved.rows) { const isNasa = saved.sourceName?.startsWith('NASA') || false; setDataset(saved.rows); setDatasetMetadata(saved); setDatasetSource(isNasa ? 'nasa' : 'database'); setDatasetName(saved.name); setDatasetRateUnit(saved.unit); if (!isNasa) setHealthSource('csv'); showNotice(`Loaded ${saved.name} from Atlas.`) } } catch { showNotice('Could not load this Atlas dataset.') }
  }
  const importNasaRad = async () => {
    setNasaLoading(true)
    try {
      const saved = await api.importNasaRad({ startDate: nasaStartDate, endDate: nasaEndDate, component: nasaComponent })
      setSavedDatasets(current => [saved, ...current.filter(item => item.id !== saved.id)])
      if (saved.rows) setDataset(saved.rows)
      setDatasetMetadata(saved); setDatasetSource('nasa'); setDatasetName(saved.name); setDatasetRateUnit(saved.unit)
      showNotice(`Imported ${saved.rows?.length || 0} NASA measured rows into Atlas.`)
    } catch (error) { showNotice(error instanceof Error ? error.message : 'NASA RAD observations could not be imported.') }
    finally { setNasaLoading(false) }
  }
  const deleteSavedDataset = async (id: string) => {
    try { await api.deleteDataset(id); setSavedDatasets(current => current.filter(item => item.id !== id)); showNotice('Dataset deleted from Atlas.') } catch { showNotice('Could not delete this Atlas dataset.') }
  }
  const exportCSV = () => {
    const csv = ['detector,quantity,value,unit,uncertainty,uncertainty_unit,provenance', ...compatibleReadings.map(d=>`${d.name},${d.quantity},${d.value},${d.unit},${d.error},${d.unit},synthetic illustrative`)].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'gadaaspace-results.csv'; a.click(); URL.revokeObjectURL(a.href)
  }
  const importCSV = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { const rows = String(reader.result).split(/\r?\n/).slice(1).map(line=>line.split(',')).map(c=>[Number(c[0]),Number(c[1]), ...(c[2]?.trim() ? [Number(c[2])] : [])]).filter(r=>r.length >= 2 && r.slice(0,2).every(Number.isFinite) && (r.length === 2 || Number.isFinite(r[2]))); if (!rows.length) showNotice('No valid numeric time, dose-rate rows found.'); else { setDataset(rows); setDatasetMetadata(null); setDatasetName(file.name.replace(/\.csv$/i,'')); setDatasetSource('imported'); showNotice(`${rows.length} local CSV rows imported. Optional column 3 is secondary dose rate; column 2 remains primary or combined, as documented by your source.`) } }; reader.readAsText(file) }
  const sections = useMemo(()=>[
    { title:'Overview', body:<><div className="welcome-row"><div><div className="eyebrow">FLIGHT DYNAMICS · WORKSPACE 01</div><h1>Mission overview</h1><p className="muted">Explore radiation exposure and interactive 3D satellite systems across your mission configurations.</p></div><button className="primary" onClick={()=>setPage('Simulation Lab')}>＋ New simulation</button></div>
      <div className="stat-grid"><Stat label="Simulations completed" value={history.length} icon="◷" delta="This workspace"/><Stat label="Active run" value={running?'Running':'Standby'} icon="◉" delta={running?'Progress 64%':'Ready to configure'}/><Stat label="Spacecraft configs" value="1" icon="◇" delta="Active workspace config"/><Stat label="Detector models" value="05" icon="⌁" delta={`${detectors.length} configured`}/></div>
      
      {/* 3D Mission & Solar System Overview Section */}
      <div className="panel overview-full-card" style={{ marginBottom: '14px' }}>
        <PanelTitle title="3D Mission & Satellite Overview" sub={`${spacecraftType} · ${scenario} · Interactive 3D Orbit & Systems`} action="Open Designer" onAction={()=>setPage('Spacecraft Designer')}/>
        <SpacecraftViewer spacecraftType={spacecraftType} material={material} thickness={thickness} detectors={detectors} detectorPositions={detectorPositions} scenario={scenario} particle={particle} radiationCategory={radiationCategory} onRadiationCategoryChange={setRadiationCategory} isSimulating={running} onToggleSimulating={toggleSimulation} initialMode="overview"/>
        <div className="craft-tags" style={{ marginTop: '10px' }}>
          <span>◉ Shielding: {material} ({thickness} mm)</span>
          <span>⌁ Instruments: {detectors.length} active sensors</span>
          <span>✦ Scenario: {scenario} ({particle})</span>
          <span>🌐 Trajectory: Deep Space Cruise</span>
        </div>
      </div>

      <div className="main-grid"><div className="panel exposure"><PanelTitle title={datasetMetadata?.sourceName?'Measured radiation exposure':'Radiation exposure'} sub={datasetMetadata?.sourceName || 'Cumulative dose · educational model'} action={String(latest.durationHours || duration)+' hours'}/>{dataset.length>1?<HealthTrend rows={dataset} unit={datasetRateUnit}/>:<Chart compact dose={latest.dose} duration={latest.durationHours || duration}/>}<div className="chart-foot"><span>DOSE RATE</span><strong>{dataset.length?dataset[dataset.length-1][1].toPrecision(4):(latest.dose/Math.max(latest.durationHours || duration,1)).toPrecision(4)} <small>{dataset.length?datasetRateUnit:'Gy/h'}</small></strong><span className="badge cyan">{datasetMetadata?.sourceName?'NASA MEASURED':datasetSource==='imported'?'USER-IMPORTED':'SYNTHETIC MODEL'}</span></div></div>
        <div className="panel craft-card"><PanelTitle title="Vehicle configuration" sub={spacecraftType} action="View design" onAction={()=>setPage('Spacecraft Designer')}/><SpacecraftViewer spacecraftType={spacecraftType} material={material} thickness={thickness} detectors={detectors} detectorPositions={detectorPositions} scenario={scenario} particle={particle} radiationCategory={radiationCategory} onRadiationCategoryChange={setRadiationCategory} isSimulating={running} onToggleSimulating={toggleSimulation}/><div className="craft-tags"><span>◉ {material} · {thickness} mm</span><span>⌁ {detectors.length} detectors</span></div></div>
      </div><div className="main-grid bottom-grid"><div className="panel"><PanelTitle title="Detector comparison" sub="Absorbed dose · Gy" action="Open analysis" onAction={()=>setPage('Data Fusion')}/><DetectorBars data={latest.detectors}/></div><div className="panel"><PanelTitle title="Quick start" sub="Mars Transit Radiation Analysis"/><p className="muted small">Load a complete, reproducible demo configuration with illustrative detector measurements and fusion results.</p><div className="quick-demo"><div><b>Mars transit</b><span>Aluminum · 3 detector models</span></div><button className="primary" onClick={()=>{setScenario('Mars Transit');setMaterial('Aluminum');setThickness(12);setDetectors(detectorTypes.slice(0,3));startSimulation()}}>Launch demo&nbsp; ↗</button></div><div className="recent"><b>Recent activity</b><p><i/> {history[0]?.name || 'No saved simulations yet'} <span>{history[0]?.date || 'Demo configuration'}</span></p></div></div></div></> },
    { title:'Simulation Lab', body:<><Header title="Simulation lab" desc="Configure an educational run. Outputs respond to these inputs and remain illustrative, not operational predictions."/><div className="two-col"><div className="panel form-panel"><PanelTitle title="Run configuration" sub="Inputs are shared with the environment page"/><RadiationInputs category={radiationCategory} setCategory={setRadiationCategory} particle={particle} setParticle={setParticle} energyMin={energyMin} setEnergyMin={setEnergyMin} energyMax={energyMax} setEnergyMax={setEnergyMax} intensity={intensity} setIntensity={setIntensity} scenario={scenario} setScenario={setScenario} duration={duration} setDuration={setDuration} seed={seed} setSeed={setSeed}/><label>Spacecraft shielding material<select value={material} onChange={e=>setMaterial(e.target.value)}>{['Aluminum','Polyethylene','Water','Lunar regolith','Composite'].map(m=><option key={m}>{m}</option>)}</select></label><label>Shield thickness · {thickness} mm<input type="range" min="0" max="40" value={thickness} onChange={e=>setThickness(+e.target.value)}/></label><p className="tiny muted">Detector outputs are synthetic model estimates, with quantity-specific units. Compatible absorbed dose measurements are eligible for fusion.</p><button className={`primary run-button ${running ? 'stop-sim-btn' : ''}`} onClick={startSimulation}>{running ? '⏹ Stop run & save results' : '▶ Run educational simulation'}</button></div><div className="panel"><PanelTitle title="Configuration preview" sub={`${spacecraftType} · current vehicle`}/><SpacecraftViewer spacecraftType={spacecraftType} material={material} thickness={thickness} detectors={detectors} detectorPositions={detectorPositions} cutaway scenario={scenario} particle={particle} radiationCategory={radiationCategory} onRadiationCategoryChange={setRadiationCategory} isSimulating={running} onToggleSimulating={toggleSimulation}/><div className="summary-list"><span>Shielding <b>{material} · {thickness} mm</b></span><span>Detectors <b>{detectors.length} active instruments</b></span><span>Environment <b>{radiationCategory} · {particle} · {energyMin}–{energyMax} MeV</b></span><span>Relative intensity <b>{intensity}</b></span></div><div className="result-callout"><span>Current modeled absorbed dose · synthetic</span><b>{(result?.dose ?? model.doseGy).toPrecision(4)} Gy</b><small>{result?.date || 'Updates from current inputs'}</small></div></div></div></> },
    { title:'Spacecraft Designer', body:<><Header title="Spacecraft designer" desc="Choose a vehicle architecture, configure shielding, and place virtual detectors."/><div className="panel vehicle-picker"><PanelTitle title="Spacecraft configuration" sub="Select a schematic vehicle architecture"/><div className="vehicle-options">{spacecraftTypes.map(type=><button key={type} className={spacecraftType===type?'vehicle-option selected':'vehicle-option'} onClick={()=>{setSpacecraftType(type);if(type==='Space Shuttle Orbiter')setSelected('Payload bay');else setSelected('Crew compartment')}}><span className="vehicle-glyph">{type==='Space Shuttle Orbiter'?'▲':type==='Orion Deep Space'?'◉':type==='Lunar Lander'?'⌑':type==='Cargo Transfer'?'▰':'◇'}</span><b>{type}</b><small>{spacecraftDescriptions[type]}</small></button>)}</div></div><div className="designer-grid"><div className="panel"><div className="toolbar"><button className={cutaway?'':'active'} onClick={()=>setCutaway(false)}>Exterior</button><button className={cutaway?'active':''} onClick={()=>setCutaway(true)}>Cutaway</button><span className="muted tiny">Drag to orbit · scroll to zoom · right-drag to pan</span></div><SpacecraftViewer spacecraftType={spacecraftType} cutaway={cutaway} material={material} thickness={thickness} detectors={detectors} detectorPositions={detectorPositions} onPositionChange={updateDetectorPosition} onSelect={setSelected} scenario={scenario} particle={particle} radiationCategory={radiationCategory} onRadiationCategoryChange={setRadiationCategory} isSimulating={running} onToggleSimulating={toggleSimulation}/><div className="component-pills">{vehicleComponents.map(c=><button key={c} className={selected===c?'chosen':''} onClick={()=>setSelected(c)}>{c}</button>)}</div></div><div className="panel form-panel"><PanelTitle title={selected} sub={`${spacecraftType} · selected component`}/><div className="info-box">{spacecraftDescriptions[spacecraftType]} Drag a colored detector marker to reposition it inside the vehicle.</div><label>Shielding material<select value={material} onChange={e=>setMaterial(e.target.value)}>{['Aluminum','Polyethylene','Water','Lunar regolith','Composite'].map(m=><option key={m}>{m}</option>)}</select></label><label>Shield thickness · {thickness} mm<input type="range" min="0" max="40" value={thickness} onChange={e=>setThickness(+e.target.value)}/></label><label>Shielding location<select><option>Outer hull</option><option>Crew compartment</option><option>Equipment bay</option></select></label><p className="tiny muted">Illustrative attenuation uses I = I₀e⁻ᵘˣ. It omits fragmentation and secondary particle transport.</p><PanelTitle title="Virtual detectors" sub="Placement status"/><DetectorManage detectors={detectors} setDetectors={setDetectors} positions={detectorPositions} onReset={resetDetectorPositions}/></div></div></> },
    { title:'Radiation Environment', body:<><Header title="Radiation environment" desc="Choose an illustrative scenario and configure the same inputs used by the simulation."/><div className="scenario-grid">{scenarios.map((s,i)=><button className={`scenario-card ${scenario===s?'selected':''}`} onClick={()=>setScenario(s)}><span className="scenario-icon">{['✦','☄','◒','◎','☀','＋'][i]}</span><b>{s}</b><small>{['Interplanetary mixed field','Transit spectrum example','Lunar surface and transit','Trapped belt passage','Elevated solar event','User-defined inputs'][i]}</small></button>)}</div><div className="two-col"><div className="panel form-panel"><PanelTitle title="Environment inputs" sub="Shared model inputs · illustrative values"/><RadiationInputs category={radiationCategory} setCategory={setRadiationCategory} particle={particle} setParticle={setParticle} energyMin={energyMin} setEnergyMin={setEnergyMin} energyMax={energyMax} setEnergyMax={setEnergyMax} intensity={intensity} setIntensity={setIntensity} scenario={scenario} setScenario={setScenario} duration={duration} setDuration={setDuration} seed={seed} setSeed={setSeed}/></div><div className="panel"><PanelTitle title="Environment primer" sub="What the model represents"/><div className="primer"><b>Galactic cosmic rays</b><p>High-energy particles arriving from outside the solar system. Composition and intensity vary with solar modulation.</p><b>Solar energetic particles</b><p>Energetic particles associated with solar activity; event intensity and spectrum can vary substantially.</p><b>Trapped radiation</b><p>Charged particles held by planetary magnetic fields. Exposure depends on orbit and trajectory.</p></div><div className="result-callout"><span>Current illustrative model output</span><b>{model.doseGy.toPrecision(4)} Gy</b><small>Changes when model inputs change</small></div><div className="notice">These configurable inputs are illustrative, not live or measured environmental data.</div></div></div></> },
    { title:'Detector Laboratory', body:<><Header title="Detector laboratory" desc="Manage virtual instruments and their measurement capabilities."/><div className="detector-cards">{detectorTypes.map((d,i)=><div className="panel detector-card"><div className="detector-icon">{['◈','◎','⌁','✧','▣'][i]}</div><div className="eyebrow">{['SOLID STATE','MICRODOSIMETRY','NEUTRON SENSITIVE','SCINTILLATION','INTEGRATING'][i]}</div><h3>{d}</h3><p>{['Energy deposition and particle energy response.','Tissue-equivalent microdosimetric concepts.','Neutron-sensitive response; not a universal dose instrument.','Radiation response through scintillation light.','Accumulated exposure over a deployment interval.'][i]}</p><div className="detector-detail"><span>Placement</span><b>{detectors.includes(d)?'Inside vehicle · editable in designer':'Not placed'}</b></div><div className="detector-detail"><span>Current illustrative output</span><b>{compatibleReadings.find(x=>x.name===d)?`${compatibleReadings.find(x=>x.name===d)?.value.toPrecision(4)} ${compatibleReadings.find(x=>x.name===d)?.unit}`:'—'}</b></div><button className={detectors.includes(d)?'remove-button':'outline-button'} onClick={()=>setDetectors(detectors.includes(d)?detectors.filter(x=>x!==d):[...detectors,d])}>{detectors.includes(d)?'Remove instrument':'＋ Add to spacecraft'}</button></div>)}</div><p className="tiny muted">Illustrative model outputs use detector-specific quantities and units. They are not calibrated measurements and should not be interchanged without compatible calibration and exposure windows.</p></> },
    { title:'Data Fusion', body:<><Header title="Data fusion laboratory" desc="Inspect detector outputs and fuse only readings of the same quantity and unit."/><div className="panel fusion-method"><div><div className="eyebrow">ANALYSIS APPROACH</div><div className="mode-tabs">{['Single detector','Multi-detector fusion','Detectors + model'].map(m=><button className={fusionMode===m?'active':''} onClick={()=>setFusionMode(m)}>{m}</button>)}</div></div><p className="muted small">Inverse-variance weighting is applied only to independent compatible measurements with matching quantity, unit, calibration, and time window.</p></div><div className="fusion-grid"><div className="panel"><PanelTitle title="Detector measurements" sub="Illustrative output; units vary by detector"/><DetectorBars data={compatibleReadings} group={fusionGroup}/>{compatibleReadings.map(d=><div className="measure-row" key={d.name}><span>{d.name}<small>{d.quantity}</small></span><b>{d.value.toPrecision(4)} <small>± {d.error.toPrecision(3)} {d.unit}</small></b></div>)}</div><div className="panel"><PanelTitle title="Approach comparison" sub={`Fusion group: ${fusionGroup}`}/><label className="fusion-select-label">Compatible quantity<select value={fusionGroup} onChange={e=>setFusionGroup(e.target.value)}><option value="dose-gy">Absorbed dose · Gy</option><option value="dose-equivalent-sv">Dose equivalent · Sv</option><option value="neutron-rate">Neutron rate · counts/s</option></select></label><div className="result-callout"><span>{fusionMode} · selected estimate</span><b>{activeEstimate === null ? 'Not available' : `${activeEstimate.toPrecision(4)} ${fusion.readings[0]?.unit || ''}`}</b><small>{activeError === null ? 'Needs a compatible detector reading' : `Illustrative uncertainty ± ${activeError.toPrecision(3)}`}</small></div><div className="approach-row"><span>Single detector estimate</span><b>{fusion.readings[0]?.value.toPrecision(4) || '—'} {fusion.readings[0]?.unit || ''}</b><small>{fusion.readings[0]?.name || 'No compatible detector'}</small></div><div className="approach-row highlight"><span>Compatible multi-detector fusion</span><b>{fused === null ? 'Not available' : `${fused.toPrecision(4)} ± ${fusedError?.toPrecision(3)} ${fusion.readings[0]?.unit}`}</b><small>{fusion.readings.length} compatible reading(s) · inverse-variance weighted</small></div><div className="approach-row"><span>Detectors + model</span><b>{modelJointEstimate === null ? 'Not compatible' : `${modelJointEstimate.toPrecision(4)} ± ${modelJointError?.toPrecision(3)} Gy`}</b><small>Only combined with an absorbed dose estimate in Gy</small></div><div className="formula">wᵢ = 1/σᵢ² · x̂ = Σ(wᵢxᵢ)/Σwᵢ · σ̂ = √(1/Σwᵢ)</div><p className="tiny muted">{fusionDescription[fusionGroup]}</p></div></div><div className="notice">{fusion.readings.length < 2 ? 'At least two compatible readings are needed for multi-detector fusion. Other detector quantities remain separate and are not converted here.' : `Fused ${fusion.readings.length} readings with compatible units. Incompatible detector readings are excluded.`} All values are synthetic educational model outputs.</div></> },
    { title:'Radiation Analysis', body:<><Header title="Radiation analysis" desc="Inspect model outputs, uncertainties, and simulation configuration."/><div className="panel"><PanelTitle title="Absorbed dose versus time" sub="Cumulative synthetic estimate · dose scale in mGy" action="Export CSV" onAction={exportCSV}/><Chart dose={latest.dose} duration={latest.durationHours || duration}/></div><div className="analysis-grid"><div className="panel"><PanelTitle title="Detector response" sub="Same-unit readings only"/><DetectorBars data={compatibleReadings} group={fusionGroup}/></div><div className="panel"><PanelTitle title="Particle categories" sub="Model-generated categories · illustrative"/><div className="particle-split"><div><i className="dot primary-dot"/><b>Primary radiation</b><span>Incoming component · model-generated</span><strong>{latest.primaryDoseGy === undefined ? '—' : `${(latest.primaryDoseGy * 1000).toPrecision(3)} mGy`}</strong></div><div><i className="dot secondary-dot"/><b>Secondary radiation</b><span>Educational interaction proxy</span><strong>{latest.secondaryDoseGy === undefined ? '—' : `${(latest.secondaryDoseGy * 1000).toPrecision(3)} mGy`}</strong></div></div><small className="muted">{latest.primaryDoseGy === undefined ? 'Component outputs unavailable for this saved run. Total dose does not determine the split.' : 'Separate synthetic model components; not separated detector measurements or validated transport predictions.'}</small></div><div className="panel wide"><PanelTitle title="Analysis parameters" sub="Current configuration"/><div className="summary-list"><span>Scenario <b>{latest.scenario} · {latest.radiationCategory || radiationCategory} · {latest.particle || particle}</b></span><span>Spacecraft and shielding <b>{latest.spacecraft || spacecraftType} · {latest.material || material} · {latest.thicknessMm ?? thickness} mm</b></span><span>Energy / intensity / duration <b>{latest.energyRange || `${energyMin}–${energyMax} MeV`} · {latest.intensity ?? intensity} · {latest.durationHours ?? duration} h</b></span><span>Seed and provenance <b>{latest.seed ?? seed} · synthetic, model-generated</b></span></div><div className="formula-grid"><div><b>Absorbed dose</b><code>D = E<sub>dep</sub> / m</code><small>Deposited energy divided by mass · Gy = J/kg</small></div><div><b>Dose rate</b><code>Ḋ = D / t</code><small>Absorbed dose over elapsed time · Gy/h</small></div><div><b>Fluence and flux</b><code>F = N/A&nbsp; · &nbsp;Φ = N/(At)</code><small>Particles per area · particles per area per time</small></div><div><b>Energy conversion</b><code>1 MeV = 1.602176634 × 10⁻¹³ J</code><small>Exact SI conversion</small></div></div></div></div><p className="notice">Total dose alone cannot identify primary and secondary contributions. Categories above are model-generated visualizations, not detector-separated measurements. I = I₀e⁻ᵘˣ is a simplified educational attenuation approximation, not realistic high-energy particle transport.</p></> },
    { title:'Crew Health Impact', body:<><Header title="Crew health impact" desc="Summarize measured or user-supplied radiation exposure and explain its health context."/><div className="notice health-notice"><b>Exposure context only · not a medical assessment.</b> Values describe radiation inputs; they do not diagnose, predict individual risk, or replace flight medical specialists.</div><div className="health-layout"><div className="panel form-panel"><PanelTitle title="Exposure data" sub="Primary and secondary components stay separate"/><label>Data source<select value={healthSource} onChange={e=>setHealthSource(e.target.value)}><option value="manual">Enter component-resolved measurements</option><option value="csv">Imported dose-rate time series</option><option value="simulation">Latest simulation · synthetic</option></select></label>{healthSource==='manual'&&<><label>Primary accumulated dose<input type="number" min="0" step="any" value={healthDose} onChange={e=>setHealthDose(e.target.value)} placeholder="Primary measurement"/></label><label>Secondary accumulated dose · optional<input type="number" min="0" step="any" value={healthSecondaryDose} onChange={e=>setHealthSecondaryDose(e.target.value)} placeholder="Leave blank if not separated"/></label><label>Quantity and unit<select value={healthDoseUnit} onChange={e=>setHealthDoseUnit(e.target.value)}><option>Gy</option><option>mGy</option><option>µGy</option><option>Sv</option><option>mSv</option><option>µSv</option></select><small>Enter both components in the same measured quantity and unit. A combined measurement cannot be split into primary and secondary.</small></label><label>Exposure interval · hours<input type="number" min="0.01" step="any" value={healthDuration} onChange={e=>setHealthDuration(e.target.value)}/></label></>}{healthSource==='csv'&&<>{datasetSource==='nasa'?<div className="info-box">NASA MSL RAD measures radiation on the Mars rover. These observations are not human-body dosimetry and are deliberately excluded from astronaut health calculations.</div>:datasetSource!=='empty'?<><div className="info-box">CSV columns: time in hours, primary (or combined) rate, and optional secondary rate. Column 3 is required for a separate secondary result; a combined value is never split.</div><label>Imported rate unit<select value={datasetRateUnit} onChange={e=>setDatasetRateUnit(e.target.value)}>{['Gy/h','mGy/h','µGy/h','Sv/h','mSv/h','µSv/h'].map(u=><option key={u}>{u}</option>)}</select></label><small className="muted">{dataset.length} imported rows · Atlas storage or browser memory</small></>:<Empty title="Import a measurement series" text="Upload CSV columns: elapsed time (h), primary or combined dose rate, optional separate secondary dose rate." action={()=>setPage('Dataset Explorer')}/>}</>}{healthSource==='simulation'&&<div className="info-box">Synthetic component outputs from the latest model run. Not measured astronaut exposure or validated radiation transport.</div>}{healthAssessment?<><div className="health-metrics"><div><span>{healthAssessment.secondary!==undefined?'COMBINED EXPOSURE':'PRIMARY / COMBINED INPUT'}</span><b>{healthAssessment.value.toPrecision(4)} <small>{healthAssessment.unit}</small></b></div><div><span>TIME AVERAGE</span><b>{healthAssessment.averageRate.toPrecision(4)} <small>{healthAssessment.unit}/h</small></b></div><div><span>EXPOSURE INTERVAL</span><b>{healthAssessment.duration.toPrecision(3)} <small>hours</small></b></div>{healthAssessment.peakRate!==null&&<div><span>PEAK RECORDED RATE</span><b>{healthAssessment.peakRate.toPrecision(4)} <small>{datasetRateUnit}</small></b></div>}</div><div className="component-dose-grid"><div><span>PRIMARY COMPONENT</span><b>{healthAssessment.primary===undefined?'Not separated':`${healthAssessment.primary.toPrecision(4)} ${healthAssessment.unit}`}</b></div><div><span>SECONDARY COMPONENT</span><b>{healthAssessment.secondary===undefined?'Not available in input':`${healthAssessment.secondary.toPrecision(4)} ${healthAssessment.unit}`}</b></div></div><div className="health-provenance">SOURCE <b>{healthAssessment.provenance}</b></div></>:healthSource==='manual'?<div className="empty-inline">Enter a non-negative primary dose and a positive exposure interval.</div>:null}</div><div className="panel"><PanelTitle title="Health relevance & prevention" sub="General guidance, not individual medical advice"/><div className="health-context"><div><span className="health-marker amber">01</span><section><b>Monitor and plan</b><p>Use calibrated dosimetry, track exposure over time, and follow mission-approved radiation alerts and operational guidance.</p></section></div><div><span className="health-marker blue">02</span><section><b>Solar particle events</b><p>Mission procedures may direct crew to designated storm-shelter locations with additional shielding. Follow the mission radiation-protection team’s instructions.</p></section></div><div><span className="health-marker violet">03</span><section><b>Shielding has tradeoffs</b><p>Protection depends on particle type, energy, material, and geometry. Interactions can produce secondary particles, so simplified shielding comparisons cannot establish a safe design.</p></section></div></div><div className="health-source-links"><a href="https://www.nasa.gov/hrp/hazard-space-radiation/" target="_blank" rel="noreferrer">NASA · Space radiation hazard ↗</a><a href="https://srag.jsc.nasa.gov/SpaceRadiation/How/How.cfm" target="_blank" rel="noreferrer">NASA SRAG · Protection concepts ↗</a></div></div></div>{healthAssessment?.rows.length? <div className="panel health-chart-panel"><PanelTitle title="Imported primary / combined dose-rate timeline" sub={`User-imported values · ${datasetRateUnit}`}/><HealthTrend rows={healthAssessment.rows} unit={datasetRateUnit}/></div>:null}<LocalHealthAssistant assessment={healthAssessment}/><div className="notice">No astronaut health status or probability of illness is inferred. Validated crew risk assessment needs calibrated organ-aware dosimetry and individual mission history; interpretation belongs to qualified flight medicine and radiation-protection teams.</div></> },
    { title: 'Dataset Explorer', body:<><Header title="Dataset explorer" desc="Inspect source-backed radiation observations and data stored in Atlas."/>
      <div className="panel nasa-source-panel"><PanelTitle title="NASA MSL RAD · measured observations" sub="NASA CDAWeb Level 2 · Mars rover instrument data"/>
        <div className="nasa-import-form">
          <label>Start date · UTC<input type="date" value={nasaStartDate} onChange={e=>setNasaStartDate(e.target.value)}/></label>
          <label>End date · UTC<input type="date" value={nasaEndDate} onChange={e=>setNasaEndDate(e.target.value)}/></label>
          <label>Dose channel<select value={nasaComponent} onChange={e=>setNasaComponent(e.target.value as typeof nasaComponent)}><option value="correctedDoseB">RTG-corrected detector B</option><option value="totalDoseB">Total detector B</option><option value="totalDoseE">Total detector E</option></select></label>
          <button className="primary" disabled={nasaLoading || databaseStatus!=='connected'} onClick={importNasaRad}>{nasaLoading?'Fetching NASA data…':'Fetch measured data and save to Atlas'}</button>
        </div>
        <p className="tiny muted">Fetched from NASA CDAWeb when requested, then stored in Atlas. NASA reports this product in µGy/day; GadaaSpace converts it to µGy/h. These are rover surface observations, not astronaut measurements or a crew exposure prediction.</p>
        {databaseStatus!=='connected'&&<small className="muted">Connect Atlas first to import and persist the NASA records.</small>}
      </div>
      <div className="panel"><div className="welcome-row"><div><PanelTitle title="Radiation measurement records" sub="Measured source data · provenance retained"/></div><label className="upload-button">↑ Import CSV<input type="file" accept=".csv,text/csv" onChange={e=>importCSV(e.target.files?.[0])}/></label></div>
        <div className="dataset-info"><span>Rows <b>{dataset.length}</b></span><span>Columns <b>Elapsed time · dose rate{dataset.some(r=>r.length>2)?' · secondary rate':''}</b></span><span>Source <b>{datasetMetadata?.sourceName || (datasetSource==='empty'?'No data loaded':datasetSource==='imported'?'User CSV · local':'Atlas dataset')}</b></span>{dataset.length>0&&<label className="dataset-unit-select">Rate unit<select value={datasetRateUnit} onChange={e=>setDatasetRateUnit(e.target.value)}>{['Gy/h','mGy/h','µGy/h','Sv/h','mSv/h','µSv/h'].map(u=><option key={u}>{u}</option>)}</select></label>}</div>
        <div className="table-wrap"><table><thead><tr><th>Elapsed time (h)</th><th>Dose rate ({datasetRateUnit})</th>{dataset.some(r=>r.length>2)&&<th>Secondary rate</th>}<th>Provenance</th></tr></thead><tbody>{dataset.slice(0,100).map((r,i)=><tr key={i}><td>{r[0]}</td><td>{r[1]}</td>{dataset.some(row=>row.length>2)&&<td>{r[2] ?? '—'}</td>}<td>{datasetMetadata?.provenance || (datasetSource==='imported'?'User CSV · local browser':'Atlas record')}</td></tr>)}</tbody></table></div>
        {dataset.length>0?<div className="dataset-stats"><span>Mean dose rate <b>{(dataset.reduce((a,r)=>a+r[1],0)/dataset.length).toFixed(5)} {datasetRateUnit}</b></span><span>Maximum <b>{Math.max(...dataset.map(r=>r[1])).toFixed(5)} {datasetRateUnit}</b></span><span>Rows shown <b>{Math.min(dataset.length,100)}</b></span></div>:<div className="empty-inline">No measurement rows loaded. Import measured NASA RAD data or a documented CSV; synthetic example rows are not shown here.</div>}
        {datasetMetadata?.sourceUrl&&<p className="dataset-provenance">Source record: <a href={datasetMetadata.sourceUrl} target="_blank" rel="noreferrer">NASA CDAWeb · MSL RAD Level 2 ↗</a><span>{datasetMetadata.sourceVariable} · {datasetMetadata.sourceUnit}</span></p>}
      </div>
      <div className="panel atlas-datasets"><PanelTitle title="MongoDB Atlas datasets" sub="CSV uploads are stored only after your explicit save"/>
        {datasetSource==='imported'&&<button className="primary" onClick={saveDatasetToAtlas}>Save “{datasetName}” to Atlas</button>}
        <div className="atlas-dataset-list">{savedDatasets.length?savedDatasets.map(d=><div className="atlas-dataset-row" key={d.id}><span><b>{d.name}</b><small>{d.unit} · {d.columns.length || 2} columns · {d.sourceName || 'user CSV'}</small></span><button className="outline-button" onClick={()=>openSavedDataset(d.id)}>Load</button><button className="icon-button" aria-label={'Delete '+d.name} onClick={()=>deleteSavedDataset(d.id)}>×</button></div>):<p className="muted small">No datasets saved in Atlas yet.</p>}</div>
      </div>
      <div className="panel dataset-chart"><PanelTitle title="Measured dose-rate visualization" sub={datasetMetadata?.sourceName || (datasetSource==='imported'?'Imported CSV · not yet saved to Atlas':'No measured series loaded')}/>{dataset.length>1?<HealthTrend rows={dataset} unit={datasetRateUnit}/>:<div className="empty-inline">Load at least two measured points to draw the time series.</div>}</div>
    </> },
    { title:'Simulation History', body:<><Header title="Simulation history" desc="Completed educational runs stored in your Atlas workspace."/><div className="panel"><div className="welcome-row"><PanelTitle title="Saved runs" sub={`${history.length} Atlas simulation${history.length===1?'':'s'}`}/><button className="outline-button" onClick={clearHistory}>Clear history</button></div>{history.length?history.map((r,i)=><div className="history-row" key={`${r.name}-${i}`}><div className="history-icon">◷</div><div><b>{r.name}</b><small>{r.date} · {r.scenario} · {r.spacecraft || 'Asteria Transit'} · synthetic</small></div><strong>{r.dose} Gy</strong><button className="outline-button small-button" onClick={()=>{openRun(r);setPage('Radiation Analysis')}}>Open</button><button className="icon-button" aria-label="Delete run" onClick={()=>deleteHistoryItem(r,i)}>×</button></div>):<Empty title="No saved Atlas runs yet" text="Run an educational simulation to save it to the connected Atlas workspace." action={()=>setPage('Simulation Lab')}/>}</div></> },
    { title:'Reports', body:<><Header title="Reports & export" desc="Generate a report from the latest completed simulation."/><div className="two-col"><div className="panel report-preview"><div className="eyebrow">GADAASPACE · SCIENTIFIC REPORT</div><h2>{latest.name}</h2><p className="muted">Generated {latest.date}</p><hr/><div className="summary-list"><span>Scenario <b>{latest.scenario} · {latest.radiationCategory || radiationCategory} · {latest.particle || particle}</b></span><span>Spacecraft <b>{latest.spacecraft || spacecraftType} · schematic</b></span><span>Shielding <b>{latest.material || material} · {latest.thicknessMm ?? thickness} mm</b></span><span>Duration / energy / intensity <b>{latest.durationHours ?? duration} h · {latest.energyRange || `${energyMin}–${energyMax} MeV`} · {latest.intensity ?? intensity}</b></span><span>Detectors <b>{latest.detectors.map(d=>`${d.name} (${d.unit || 'legacy'})`).join(', ') || 'None configured'}</b></span><span>Compatible fused estimate <b>{fused === null ? 'Not available' : `${fused.toPrecision(4)} ± ${fusedError?.toPrecision(3)} ${fusion.readings[0]?.unit}`}</b></span><span>Provenance <b>Synthetic illustrative model</b></span></div><h3>Method and limitations</h3><p className="muted small">Absorbed dose D = Edep/m. Dose rate Ḋ = D/t. Attenuation approximation I = I₀e⁻ᵘˣ. Values are educational prototype estimates, not validated transport calculations or operational spacecraft predictions.</p><div className="notice">Only matching quantities and units are fused. Secondary particles are model-generated categories; total dose does not resolve primary and secondary contributions.</div></div><div className="panel form-panel"><PanelTitle title="Export report" sub="CSV and PDF exports download locally"/><p className="muted small">Save the measurement table as CSV or use your browser's print dialog to save a PDF report.</p><button className="primary run-button" onClick={exportCSV}>↓  Export results as CSV</button><button className="outline-button run-button" onClick={()=>window.print()}>▧  Print / save PDF</button><p className="tiny muted">The PDF includes this report view. Charts and configuration summary are included in the page layout.</p></div></div></> },
    { title:'Settings', body:<><Header title="Settings" desc="Preferences and local data controls for this workspace."/><div className="settings-grid"><div className="panel form-panel"><PanelTitle title="Display preferences" sub="Saved to this workspace in Atlas"/><label>Theme<select value={theme} onChange={e=>setTheme(e.target.value)}><option>Dark</option><option>Light</option><option>System</option></select></label><label>Default dose units<select><option>Gray (Gy)</option><option>Sievert (Sv)</option></select></label><label>Chart density<select><option>Standard</option><option>Compact</option></select></label></div><div className="panel form-panel"><PanelTitle title="Local data management" sub="Atlas database · local API connection"/><div className="local-storage"><span>Saved simulations</span><b>{history.length}</b></div><button className="outline-button" onClick={clearHistory}>Clear simulation history</button><div className="info-box">This workspace connects to your private MongoDB Atlas database through the local API. Imported exposure files stay in memory until you explicitly save them.</div></div><div className="panel wide"><PanelTitle title="Scientific limitations" sub="Read before interpreting results"/><ul className="limitation-list"><li>Simplified attenuation does not represent nuclear fragmentation, secondary production, or full shielding transport.</li><li>Detector outputs are illustrative and do not imply universal sensitivity or calibration.</li><li>Only compatible measurements of the same quantity, unit, calibration, and time window should be fused.</li><li>Validated radiation transport requires established tools such as Geant4 and suitable physical models.</li><li>This prototype is not NASA-certified and does not provide operational spacecraft radiation predictions.</li></ul></div></div></> },
  ], [scenario, material, thickness, spacecraftType, duration, particle, radiationCategory, energyMin, energyMax, intensity, cutaway, selected, detectors, detectorPositions, history, result, running, fusionMode, fusionGroup, dataset, datasetSource, datasetRateUnit, datasetName, datasetMetadata, savedDatasets, databaseStatus, nasaStartDate, nasaEndDate, nasaComponent, nasaLoading, healthSource, healthDose, healthSecondaryDose, healthDoseUnit, healthDuration, theme, seed, vehicleComponents])
  const current = sections.find(s=>s.title===page)?.body
  return <div className={`app-shell ${theme==='Light'?'light-theme':''}`}><aside className="sidebar"><div className="brand"><div className="brand-mark">G</div><div><b>GadaaSpace</b><small>MISSION CONTROL</small></div></div><div className="workspace"><div className="workspace-icon">GS</div><div><small>WORKSPACE</small><b>Gadaa Research Lab</b></div><span>⌄</span></div><div className="nav-label">PLATFORM</div><nav>{nav.map(([label,icon,sub])=><button className={`nav-item ${page===label?'active':''}`} onClick={()=>setPage(label)} title={sub}><span className="nav-icon">{icon}</span>{label}{label==='Simulation Lab'&&running&&<i className="live-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="online"><i className={databaseStatus==='connected'?'ready-dot':'offline-dot'}/> Atlas database <span>{databaseStatus==='connected'?'READY':'OFFLINE'}</span></div><div className="user-row"><div className="avatar">GR</div><div><b>Gadaa Research</b><small>Student workspace</small></div><span>•••</span></div></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{page}</b></div><div className="top-actions"><span className="status"><i/> {running?'SIMULATION RUNNING':'SYSTEM READY'}</span><span className="status db-status"><i className={databaseStatus==='connected'?'ready-dot':'offline-dot'}/>{databaseStatus==='connected'?'ATLAS CONNECTED':databaseStatus==='connecting'?'DB CONNECTING':'DB OFFLINE'}</span><button className="top-icon" title="Notifications" onClick={()=>showNotice('No new activity.')}>♧<i/></button><button className="top-icon" title="Toggle theme" onClick={()=>setTheme(theme==='Dark'?'Light':'Dark')}>◐</button><div className="avatar small-avatar">GR</div></div></header><div className="content">{current}</div><footer>GadaaSpace <span>·</span> Synthetic model outputs are labeled · Imported measurements retain source provenance</footer></main>{notice&&<div className="toast">{notice}</div>}</div>
}
function Header({title,desc}:{title:string;desc:string}){return <div className="page-header"><div className="eyebrow">GADAASPACE / ANALYSIS</div><h1>{title}</h1><p className="muted">{desc}</p></div>}
function Stat({label,value,icon,delta}:{label:string;value:string|number;icon:string;delta:string}){return <div className="panel stat"><div className="stat-head"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{delta}</small></div>}
function PanelTitle({title,sub,action,onAction}:{title:string;sub?:string;action?:string;onAction?:()=>void}){return <div className="panel-title"><div><h3>{title}</h3>{sub&&<p>{sub}</p>}</div>{action&&<button className="text-action" onClick={onAction}>{action} ↗</button>}</div>}
function DetectorBars({data,group}:{data:DetectorReading[];group?:string}){const sameUnit=group?data.filter(d=>d.fusionGroup===group):data.filter(d=>!data[0]?.unit||d.unit===data[0].unit);const unit=sameUnit[0]?.unit;const max=Math.max(.001,...sameUnit.map(d=>d.value));return <div className="bars">{sameUnit.map((d,i)=><div className="bar-row" key={d.name}><span title={`${d.quantity} · ${d.unit}`}>{d.name}</span><div className="bar-track"><i style={{width:`${d.value/max*85}%`,background:['#38bdf8','#818cf8','#f59e0b','#34d399','#f87171'][i%5]}}/><em style={{left:`${Math.min(d.value/max*85+3,93)}%`}}/></div><b>{d.value.toPrecision(3)}</b></div>)}{data.length>sameUnit.length&&<small className="muted">Showing {group || unit || 'same-unit'} readings only; other measurement quantities are not directly comparable.</small>}{!sameUnit.length&&<small className="muted">No readings available for this measurement type.</small>}</div>}
function DetectorManage({detectors,setDetectors,positions,onReset}:{detectors:string[];setDetectors:(v:string[])=>void;positions:Record<string,DetectorPosition>;onReset:()=>void}){return <div className="manage-list">{detectors.map((d,i)=>{const p=positions[d];return <div className="managed-detector" key={d}><span className="det-mini">{['◈','◎','⌁'][i%3]}</span><span>{d}<small className="position-coords">{p?` · x ${p[0].toFixed(2)} / y ${p[1].toFixed(2)} / z ${p[2].toFixed(2)}`:' · default position'}</small></span><button aria-label={`Remove ${d}`} onClick={()=>setDetectors(detectors.filter(x=>x!==d))}>×</button></div>})}<select defaultValue="" onChange={e=>{if(e.target.value&&!detectors.includes(e.target.value))setDetectors([...detectors,e.target.value]);e.target.value=''}}><option value="" disabled>＋ Add detector model</option>{detectorTypes.map(d=><option key={d}>{d}</option>)}</select><button className="outline-button reset-position" onClick={onReset}>Reset all positions</button></div>}
function Empty({title,text,action}:{title:string;text:string;action:()=>void}){return <div className="empty-state"><div>◷</div><b>{title}</b><p>{text}</p><button className="primary" onClick={action}>Configure simulation</button></div>}
function RadiationInputs({category,setCategory,particle,setParticle,energyMin,setEnergyMin,energyMax,setEnergyMax,intensity,setIntensity,scenario,setScenario,duration,setDuration,seed,setSeed}:{category:string;setCategory:(v:string)=>void;particle:string;setParticle:(v:string)=>void;energyMin:string;setEnergyMin:(v:string)=>void;energyMax:string;setEnergyMax:(v:string)=>void;intensity:string;setIntensity:(v:string)=>void;scenario:string;setScenario:(v:string)=>void;duration:number;setDuration:(v:number)=>void;seed:string;setSeed:(v:string)=>void}){return <><label>Mission scenario<select value={scenario} onChange={e=>setScenario(e.target.value)}>{scenarios.map(s=><option key={s}>{s}</option>)}</select></label><label>Radiation category<select value={category} onChange={e=>setCategory(e.target.value)}><option>Galactic Cosmic Rays (GCR)</option><option>Solar Energetic Particles (SEP)</option><option>Trapped radiation</option><option>Secondary particle shower</option></select></label><label>Particle type<select value={particle} onChange={e=>setParticle(e.target.value)}><option>Protons</option><option>Heavy ions</option><option>Electrons</option><option>Neutrons</option><option>Mixed field</option></select></label><div className="form-row"><label>Minimum energy · MeV<input type="number" min="1" value={energyMin} onChange={e=>setEnergyMin(e.target.value)}/></label><label>Maximum energy · MeV<input type="number" min="1" value={energyMax} onChange={e=>setEnergyMax(e.target.value)}/></label></div><label>Relative particle intensity · {intensity}<input type="range" min="0.1" max="5" step="0.1" value={intensity} onChange={e=>setIntensity(e.target.value)}/><small>Dimensionless educational scale</small></label><label>Simulation duration · {duration} hours<input type="range" min="1" max="72" value={duration} onChange={e=>setDuration(+e.target.value)}/></label><label>Deterministic random seed<input value={seed} onChange={e=>setSeed(e.target.value)}/></label></>}
export default App

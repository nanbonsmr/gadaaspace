import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.API_PORT || 4173)
const host = '127.0.0.1'
const MAX_DATASET_ROWS = 20000
let databaseConnection = null
app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))

const detectorSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 }, value: Number, error: Number,
  quantity: String, unit: String, fusionGroup: String,
}, { _id: false })
const simulationSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 160 }, date: String,
  scenario: { type: String, required: true, maxlength: 100 }, radiationCategory: String,
  particle: String, spacecraft: String, material: String, thicknessMm: Number,
  durationHours: Number, energyRange: String, intensity: Number, seed: Number,
  dose: { type: Number, required: true }, primaryDoseGy: Number, secondaryDoseGy: Number,
  detectors: { type: [detectorSchema], default: [] }, detectorPositions: { type: mongoose.Schema.Types.Mixed, default: {} },
  configSignature: String, provenance: { type: String, default: 'synthetic illustrative' },
}, { timestamps: true, strict: true })
simulationSchema.index({ createdAt: -1 })
const workspaceSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'default' },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, strict: true })
const datasetSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 160 },
  columns: { type: [String], default: [] },
  rows: { type: [[Number]], required: true },
  unit: { type: String, required: true, maxlength: 20 },
  provenance: { type: String, default: 'user-imported' },
  sourceName: String, sourceUrl: String, sourceVariable: String, sourceUnit: String,
  startTime: String, endTime: String,
}, { timestamps: true, strict: true })
const Simulation = mongoose.model('Simulation', simulationSchema)
const Workspace = mongoose.model('Workspace', workspaceSchema)
const Dataset = mongoose.model('Dataset', datasetSchema)

const ready = (res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ error: 'Database is not connected. Check the local server configuration and Atlas network access.' })
    return false
  }
  return true
}
const cleanDoc = (doc) => {
  if (!doc) return null
  const value = doc.toObject ? doc.toObject() : doc
  const { _id, __v, ...rest } = value
  return { ...rest, id: String(_id) }
}
const isId = (value) => mongoose.isValidObjectId(value)

app.get('/api/health', (_req, res) => {
  const state = mongoose.connection.readyState
  res.json({ api: 'ready', database: state === 1 ? 'connected' : state === 2 ? 'connecting' : 'disconnected' })
})

app.get('/api/simulations', async (_req, res, next) => {
  try { if (!ready(res)) return; const docs = await Simulation.find().sort({ createdAt: -1 }).limit(100).lean(); res.json(docs.map(cleanDoc)) } catch (error) { next(error) }
})
app.post('/api/simulations', async (req, res, next) => {
  try {
    if (!ready(res)) return
    const { name, scenario, dose, detectors } = req.body || {}
    if (typeof name !== 'string' || !name.trim() || typeof scenario !== 'string' || !Number.isFinite(dose) || dose < 0 || !Array.isArray(detectors)) return res.status(400).json({ error: 'A simulation needs a name, scenario, non-negative dose, and detector list.' })
    const doc = await Simulation.create({ ...req.body, name: name.trim(), provenance: 'synthetic illustrative' })
    res.status(201).json(cleanDoc(doc))
  } catch (error) { next(error) }
})
app.delete('/api/simulations/:id', async (req, res, next) => {
  try { if (!ready(res)) return; if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid simulation identifier.' }); const deleted = await Simulation.findByIdAndDelete(req.params.id); return deleted ? res.status(204).end() : res.status(404).json({ error: 'Simulation not found.' }) } catch (error) { next(error) }
})
app.delete('/api/simulations', async (_req, res, next) => {
  try { if (!ready(res)) return; await Simulation.deleteMany({}); res.status(204).end() } catch (error) { next(error) }
})

app.get('/api/workspace', async (_req, res, next) => {
  try { if (!ready(res)) return; const doc = await Workspace.findOne({ key: 'default' }).lean(); res.json(doc?.settings || {}) } catch (error) { next(error) }
})
app.put('/api/workspace', async (req, res, next) => {
  try {
    if (!ready(res)) return
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || JSON.stringify(req.body).length > 100000) return res.status(400).json({ error: 'Workspace configuration is invalid or too large.' })
    const doc = await Workspace.findOneAndUpdate({ key: 'default' }, { $set: { settings: req.body } }, { upsert: true, new: true, runValidators: true })
    res.json(doc.settings)
  } catch (error) { next(error) }
})

app.get('/api/datasets', async (_req, res, next) => {
  try { if (!ready(res)) return; const docs = await Dataset.find().select('-rows').sort({ createdAt: -1 }).limit(100).lean(); res.json(docs.map(cleanDoc)) } catch (error) { next(error) }
})
app.post('/api/datasets', async (req, res, next) => {
  try {
    if (!ready(res)) return
    const { name, rows, unit, columns } = req.body || {}
    if (typeof name !== 'string' || !name.trim() || typeof unit !== 'string' || !Array.isArray(rows) || !rows.length || rows.length > MAX_DATASET_ROWS || !rows.every(row => Array.isArray(row) && row.length >= 2 && row.length <= 3 && row.every(Number.isFinite))) return res.status(400).json({ error: `Dataset must contain 1–${MAX_DATASET_ROWS} numeric rows with two or three columns.` })
    const doc = await Dataset.create({ name: name.trim(), rows, unit, columns: Array.isArray(columns) ? columns.slice(0, 3) : [], provenance: 'user-imported · explicitly saved to Atlas' })
    res.status(201).json(cleanDoc(doc))
  } catch (error) { next(error) }
})
app.post('/api/datasets/nasa-rad/import', async (req, res, next) => {
  try {
    if (!ready(res)) return
    const { startDate, endDate, component = 'correctedDoseB' } = req.body || {}
    const components = { totalDoseB: 0, correctedDoseB: 1, totalDoseE: 2 }
    const startMs = Date.parse(`${startDate}T00:00:00Z`)
    const endMs = Date.parse(`${endDate}T00:00:00Z`)
    const dayMs = 24 * 60 * 60 * 1000
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '') || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs || endMs - startMs > 30 * dayMs || !(component in components)) return res.status(400).json({ error: 'Choose valid UTC dates no more than 31 days apart and a supported RAD dose channel.' })

    const endExclusive = new Date(endMs + dayMs)
    const compact = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const startStamp = compact(new Date(startMs))
    const endStamp = compact(endExclusive)
    const variable = 'DOSIMETRY_TOTAL_f'
    const sourceUrl = `https://cdaweb.gsfc.nasa.gov/WS/cdasr/1/dataviews/sp_phys/datasets/MSL_RAD_OBS-L2/data/${startStamp},${endStamp}/${variable}?format=json`
    const sourceResponse = await fetch(sourceUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45000) })
    if (!sourceResponse.ok) return res.status(502).json({ error: `NASA CDAWeb returned HTTP ${sourceResponse.status}. Try a different date range.` })
    const payload = await sourceResponse.json()
    if (payload.Error?.length || !payload.CDF?.length) return res.status(404).json({ error: 'NASA CDAWeb has no RAD observations in that interval.' })

    const componentIndex = components[component]
    const timeSeries = new Map()
    for (const cdf of payload.CDF) {
      const variables = cdf.cdfVariables?.variable || []
      const valueVariable = variables.find(item => item.name === variable)
      const timeVariable = variables.find(item => item.name === 'EPOCH')
      if (!valueVariable || !timeVariable) continue
      const valueRecords = valueVariable.cdfVarData?.record || []
      const timeRecords = timeVariable.cdfVarData?.record || []
      for (let i = 0; i < Math.min(valueRecords.length, timeRecords.length); i++) {
        const raw = valueRecords[i]?.value?.[0]
        const numbers = Array.isArray(raw) ? raw.map(Number) : String(raw ?? '').trim().split(/\s+/).map(Number)
        const epoch = timeRecords[i]?.value?.[0]
        const elapsedHours = (Date.parse(epoch) - startMs) / 3600000
        const rateMicroGyPerDay = numbers[componentIndex]
        if (!Number.isFinite(elapsedHours) || !Number.isFinite(rateMicroGyPerDay) || rateMicroGyPerDay < 0 || rateMicroGyPerDay > 100000) continue
        timeSeries.set(epoch, [ +elapsedHours.toFixed(6), +(rateMicroGyPerDay / 24).toPrecision(8) ])
      }
    }
    const sorted = [...timeSeries.entries()].sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    const rows = sorted.map(([, row]) => row)
    const timestamps = sorted.map(([epoch]) => epoch)
    if (!rows.length) return res.status(404).json({ error: 'NASA returned no valid dose-rate records for that component and interval.' })

    const componentLabel = { totalDoseB: 'Total dose B', correctedDoseB: 'RTG-corrected dose B', totalDoseE: 'Total dose E' }[component]
    const saved = await Dataset.create({
      name: `NASA MSL RAD · ${componentLabel} · ${startDate} to ${endDate}`,
      columns: ['elapsed_hours_from_start', `${component}_dose_rate`],
      rows,
      unit: 'µGy/h',
      provenance: 'NASA measured observation · quality filtered',
      sourceName: 'NASA MSL Radiation Assessment Detector (RAD), Level 2',
      sourceUrl,
      sourceVariable: `${variable} [${componentLabel}]`,
      sourceUnit: 'µGy/day (converted from NASA uGray/day to µGy/h)',
      startTime: timestamps[0],
      endTime: timestamps[timestamps.length - 1],
    })
    res.status(201).json(cleanDoc(saved))
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return res.status(504).json({ error: 'NASA CDAWeb request timed out. Try a shorter date range.' })
    next(error)
  }
})
app.get('/api/datasets/:id', async (req, res, next) => {
  try { if (!ready(res)) return; if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid dataset identifier.' }); const doc = await Dataset.findById(req.params.id).lean(); return doc ? res.json(cleanDoc(doc)) : res.status(404).json({ error: 'Dataset not found.' }) } catch (error) { next(error) }
})
app.delete('/api/datasets/:id', async (req, res, next) => {
  try { if (!ready(res)) return; if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid dataset identifier.' }); const deleted = await Dataset.findByIdAndDelete(req.params.id); return deleted ? res.status(204).end() : res.status(404).json({ error: 'Dataset not found.' }) } catch (error) { next(error) }
})

app.use(express.static(path.join(projectRoot, 'dist'), { index: false }))
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(projectRoot, 'dist', 'index.html'), (error) => { if (error && !res.headersSent) next() })
  next()
})

app.use((error, _req, res, _next) => {
  console.error('API request failed:', error?.name || 'Error')
  if (res.headersSent) return
  res.status(error?.name === 'ValidationError' ? 400 : 500).json({ error: error?.name === 'ValidationError' ? 'The submitted data failed validation.' : 'The API could not complete that request.' })
})

app.listen(port, host, () => console.log(`GadaaSpace API listening on http://${host}:${port}`))
function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve()
  if (!process.env.MONGODB_URI) return Promise.reject(new Error('MONGODB_URI missing'))
  if (!databaseConnection) {
    databaseConnection = mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'gadaaspace', serverSelectionTimeoutMS: 10000 })
      .then(() => console.log('MongoDB Atlas connection ready.'))
      .catch((error) => {
        databaseConnection = null
        const serverCodes = [...(error?.reason?.servers?.values?.() || [])].map(server => server.error?.code).filter(Boolean)
        const failureCodes = [...new Set([error?.cause?.code, ...serverCodes].filter(Boolean))].join(', ') || 'no network error code'
        console.error(`MongoDB connection unavailable (${error?.name || 'connection error'}; ${failureCodes}). Check Atlas network access and credentials; no secret values are logged.`)
        throw error
      })
  }
  return databaseConnection
}
mongoose.connection.on('disconnected', () => { databaseConnection = null })
if (!process.env.MONGODB_URI) console.error('MONGODB_URI is missing. Copy .env.example to .env and configure Atlas credentials.')
else void connectDatabase().catch(() => {})

process.on('SIGINT', async () => { await mongoose.disconnect(); process.exit(0) })
process.on('SIGTERM', async () => { await mongoose.disconnect(); process.exit(0) })

export type DetectorReading = { name: string; value: number; error: number; quantity: string; unit: string; fusionGroup: string }
export type SimulationInput = {
  scenario: string; radiationCategory: string; particle: string; energyMinMeV: number; energyMaxMeV: number
  intensity: number; durationHours: number; seed: number; material: string; thicknessMm: number
  spacecraft: string; detectors: string[]; positions: Record<string, [number, number, number]>
}
export type SimulationOutput = { doseGy: number; primaryDoseGy: number; secondaryDoseGy: number; readings: DetectorReading[] }

const categories: Record<string, number> = { 'Galactic Cosmic Rays (GCR)': 1, 'Solar Energetic Particles (SEP)': 1.65, 'Trapped radiation': .72, 'Secondary particle shower': .34 }
const particleFactors: Record<string, number> = { Protons: 1, 'Heavy ions': 1.3, Electrons: .38, Neutrons: .8, 'Mixed field': 1.08 }
// Dimensionless teaching knobs only; these are not physical attenuation coefficients.
const attenuation: Record<string, number> = { Aluminum: .011, Polyethylene: .014, Water: .016, 'Lunar regolith': .009, Composite: .012 }
const vehicleFactors: Record<string, number> = { 'Space Shuttle Orbiter': 1.05, 'Orion Deep Space': .92, 'Asteria Transit': 1, 'Lunar Lander': 1.08, 'Crew Capsule': .94, 'Cargo Transfer': 1.12 }
const response: Record<string, { scale: number; uncertainty: number; quantity: string; unit: string; group: string }> = {
  'Silicon detector': { scale: 1.02, uncertainty: .09, quantity: 'Absorbed dose estimate', unit: 'Gy', group: 'dose-gy' },
  'Tissue-equivalent counter': { scale: 1.12, uncertainty: .13, quantity: 'Dose equivalent estimate', unit: 'Sv', group: 'dose-equivalent-sv' },
  'Neutron detector': { scale: .64, uncertainty: .2, quantity: 'Neutron count-rate proxy', unit: 'counts/s', group: 'neutron-rate' },
  'Scintillation detector': { scale: .97, uncertainty: .11, quantity: 'Absorbed dose estimate', unit: 'Gy', group: 'dose-gy' },
  'Passive dosimeter': { scale: 1.04, uncertainty: .08, quantity: 'Integrated absorbed dose', unit: 'Gy', group: 'dose-gy' },
}

function stableNoise(seed: number, index: number) {
  let x = (seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  return ((x ^ (x >>> 16)) / 0xffffffff - .5) * .08
}

export function runEducationalSimulation(input: SimulationInput): SimulationOutput {
  const energyMidpoint = (input.energyMinMeV + input.energyMaxMeV) / 2
  const energyScale = Math.max(.25, Math.min(2.5, Math.sqrt(Math.max(1, energyMidpoint) / 100)))
  const incidentDose = .0045 * Math.max(.1, input.intensity) * (input.durationHours / 24)
    * (categories[input.radiationCategory] ?? 1) * (particleFactors[input.particle] ?? 1)
    * energyScale * (vehicleFactors[input.spacecraft] ?? 1)
    * (1 + (input.scenario.length % 7) * .025)
  const opticalDepth = (attenuation[input.material] ?? .011) * Math.max(0, input.thicknessMm)
  const transmission = Math.exp(-opticalDepth)
  const primaryDoseGy = incidentDose * transmission
  // Educational interaction proxy generated separately from the transmitted primary component.
  // This is not a transport calculation or validated secondary-particle yield.
  const secondaryDoseGy = incidentDose * (1 - transmission) * .12
  const totalDose = primaryDoseGy + secondaryDoseGy

  const readings = input.detectors.map((name, i) => {
    const model = response[name] ?? response['Silicon detector']
    const location = input.positions[name] ?? [0, 0, 0]
    const positionFactor = 1 + Math.min(.12, Math.hypot(location[0], location[1]) * .04)
    const noise = stableNoise(input.seed, i)
    const value = totalDose * model.scale * positionFactor * (1 + noise)
    const quantityScale = model.unit === 'Sv' ? 1.15 : model.unit === 'counts/s' ? 120 : 1
    return { name, value: +(value * quantityScale).toPrecision(5), error: +(value * model.uncertainty * quantityScale).toPrecision(4), quantity: model.quantity, unit: model.unit, fusionGroup: model.group }
  })
  return { doseGy: +totalDose.toPrecision(5), primaryDoseGy: +primaryDoseGy.toPrecision(5), secondaryDoseGy: +secondaryDoseGy.toPrecision(5), readings }
}

export const fusionDescription: Record<string, string> = {
  'dose-gy': 'Absorbed dose estimates in Gy. Silicon, scintillation, and passive dosimeters can be fused here in this illustrative example, assuming compatible calibration and exposure windows.',
  'dose-equivalent-sv': 'Illustrative TEPC response proxy in Sv. No radiation weighting factors or validated conversion are applied; it stays separate from absorbed dose in Gy.',
  'neutron-rate': 'Illustrative neutron count-rate proxy in counts/s. This is not a dose reading and cannot be fused directly with Gy or Sv measurements.',
}

export function fuseCompatible(readings: DetectorReading[], group = 'dose-gy') {
  const compatible = readings.filter(r => r.fusionGroup === group && r.value > 0 && r.error > 0)
  if (!compatible.length) return { readings: compatible, estimate: null as number | null, uncertainty: null as number | null }
  const weights = compatible.map(r => 1 / r.error ** 2)
  const sumWeights = weights.reduce((a, b) => a + b, 0)
  return { readings: compatible, estimate: compatible.reduce((sum, r, i) => sum + weights[i] * r.value, 0) / sumWeights, uncertainty: Math.sqrt(1 / sumWeights) }
}

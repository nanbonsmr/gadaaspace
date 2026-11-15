import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { useRef, useState, useMemo, useEffect } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import './Spacecraft3D.css'

export type DetectorPosition = [number, number, number]

export type Props = {
  cutaway?: boolean
  material?: string
  thickness?: number
  spacecraftType?: string
  scenario?: string
  particle?: string
  radiationCategory?: string
  onRadiationCategoryChange?: (category: string) => void
  autoRotate?: boolean
  detectors?: string[]
  detectorPositions?: Record<string, DetectorPosition>
  onPositionChange?: (name: string, position: DetectorPosition) => void
  onSelect?: (part: string) => void
  initialMode?: ViewMode
  isSimulating?: boolean
  onToggleSimulating?: (active: boolean) => void
}

export type ViewMode = 'overview' | 'spacecraft' | 'innersystem' | 'highersystem'

// --- ANIMATED RADIATION PARTICLE STREAM COMPONENT ---
function RadiationStream({
  active,
  category = 'Galactic Cosmic Rays (GCR)',
  particle = 'Protons',
  thickness = 12,
  material = 'Aluminum',
  detectors = [],
}: {
  active: boolean
  category?: string
  particle?: string
  thickness?: number
  material?: string
  detectors?: string[]
}) {
  const particleGroup = useRef<Group>(null)
  const shieldGlowRef = useRef<Mesh>(null)
  const mode = category.includes('Solar Energetic') ? 'solar' : category.includes('Trapped') ? 'trapped' : category.includes('Secondary') ? 'secondary' : 'gcr'
  const particleColor = mode === 'solar' ? '#ffb347' : mode === 'trapped' ? '#b18cff' : mode === 'secondary' ? '#fb7185' : particle === 'Neutrons' ? '#a78bfa' : particle === 'Heavy ions' ? '#f87171' : particle === 'Electrons' ? '#facc15' : '#49c8ff'

  const attenuation = useMemo(() => {
    const materials: Record<string, number> = { Aluminum: 1, Polyethylene: 0.83, Water: 0.79, 'Lunar regolith': 1.08, Composite: 0.91 }
    const factor = materials[material] || 1
    return Math.min(0.92, Math.max(0.15, 1 - Math.exp(-0.011 * thickness * factor)))
  }, [material, thickness])

  const rays = useMemo<Array<{ orbit: boolean; angle?: number; radius?: number; height?: number; origin?: [number, number, number]; target?: [number, number, number]; speed: number; offset: number }>>(() => Array.from({ length: mode === 'solar' ? 34 : mode === 'trapped' ? 44 : 38 }).map((_, i) => {
    const a = i * 2.399963
    const u = ((i * 37) % 41) / 40
    if (mode === 'trapped') return { orbit: true, angle: a, radius: 1.9 + (i % 3) * .36, height: Math.sin(a * 1.7) * .7, speed: .45 + (i % 5) * .08, offset: i / 44 }
    if (mode === 'solar') return { origin: [-5.2, 3.5 + Math.sin(a) * 2.5, 2 + Math.cos(a) * 2.7] as [number, number, number], target: [-.45 + Math.sin(a) * .75, -.18 + Math.cos(a) * .8, .1], speed: 1.35 + (i % 6) * .17, offset: i / 34, orbit: false }
    if (mode === 'secondary') return { origin: [Math.sin(a) * .75, Math.cos(a) * .48, .4 + (i % 3) * .08] as [number, number, number], target: [Math.sin(a) * (2.5 + u), Math.cos(a) * (1.8 + u), .4 + Math.sin(a * 2) * 1.8], speed: .75 + (i % 5) * .13, offset: i / 38, orbit: false }
    const theta = a
    const z = 1 - 2 * u
    const radius = Math.sqrt(1 - z * z) * 5.5
    const origin = [radius * Math.cos(theta), z * 5.5, radius * Math.sin(theta)] as [number, number, number]
    return { origin, target: origin.map(v => -v * .9) as [number, number, number], speed: 1.1 + (i % 7) * .14, offset: i / 38, orbit: false }
  }), [mode])

  useFrame((state) => {
    if (!active) return

    if (shieldGlowRef.current) {
      const pulse = 0.35 + Math.sin(state.clock.elapsedTime * 8) * 0.18
      ;(shieldGlowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse
    }

    if (particleGroup.current) {
      const t = state.clock.elapsedTime
      particleGroup.current.children.forEach((child, i) => {
        const ray = rays[i]
        if (!ray) return
        const progress = ((t * ray.speed + ray.offset) % 1.25) / 1.25
        if (ray.orbit) {
          const angle = (ray.angle || 0) + t * ray.speed
          const radius = ray.radius || 2
          child.position.set(Math.cos(angle) * radius, ray.height || 0, Math.sin(angle) * radius)
          child.rotation.y = -angle
        } else {
          const origin = ray.origin || [0, 0, 0]
          const target = ray.target || [0, 0, 0]
          child.position.set(
            origin[0] * (1 - progress) + target[0] * progress,
            origin[1] * (1 - progress) + target[1] * progress,
            origin[2] * (1 - progress) + target[2] * progress,
          )
        }
      })
    }
  })

  if (!active) return null

  return (
    <group>
      <group ref={particleGroup}>
        {rays.map((_, i) => <group key={`${mode}-${i}`}>
          <mesh><sphereGeometry args={[mode === 'trapped' ? .055 : .045, 12, 12]} /><meshBasicMaterial color={particleColor} /></mesh>
          {mode !== 'trapped' && <mesh position={mode === 'gcr' ? [-.12, 0, 0] : [0, -.1, 0]} rotation={mode === 'gcr' ? [0, 0, Math.PI / 2] : [0, 0, -.58]}><cylinderGeometry args={[.012, .012, .24, 6]} /><meshBasicMaterial color={particleColor} transparent opacity={.35} /></mesh>}
        </group>)}
      </group>

      {mode === 'trapped' && <group rotation={[0, 0, Math.PI / 2]}><mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[2.2, .018, 8, 96]} /><meshBasicMaterial color={particleColor} transparent opacity={.22} /></mesh><mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[2.65, .012, 8, 96]} /><meshBasicMaterial color="#55b9ff" transparent opacity={.15} /></mesh></group>}

      <mesh ref={shieldGlowRef} position={[0, 0, -0.65]}>
        <boxGeometry args={[2.3, 1.7, 0.15]} />
        <meshBasicMaterial color={particleColor} transparent opacity={0.22} wireframe />
      </mesh>

      {(mode === 'secondary' || attenuation > 0.1) && (
        <group position={[0.4, 0.1, 0.5]}>
          <mesh rotation={[0, 0, 0.85]}>
            <cylinderGeometry args={[0.009, 0.009, 0.95, 6]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.75} />
          </mesh>
          <mesh position={[0.2, 0.35, 0]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        </group>
      )}

      {detectors.slice(0, 3).map((_, i) => (
        <mesh key={i} position={[-0.48 + i * 0.48, -0.15, 0.52]}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshBasicMaterial color={particleColor} transparent opacity={0.3} wireframe />
        </mesh>
      ))}
    </group>
  )
}

// --- 1. NASA SPACE SHUTTLE ORBITER MODEL (MATCHING USER IMAGE 1) ---
function SpaceShuttleOrbiter({
  cutaway,
  materialColor,
  explode = 0,
  deploy = 1,
  hovered,
  setHovered,
  onSelect,
}: {
  cutaway?: boolean
  materialColor: string
  explode: number
  deploy: number
  hovered: string
  setHovered: (s: string) => void
  onSelect?: (part: string) => void
}) {
  const hullOpacity = cutaway ? 0.32 : 1
  const shellColor = materialColor === '#829ab2' ? '#f8fafc' : materialColor
  const doorAngle = deploy * 1.25 // Smoothly closes at 0, opens wide (72 deg) at 1 like Image 1
  const topExplode = explode * 1.5
  const bottomExplode = -explode * 1.5
  const wingExplode = explode * 1.3

  const part = (name: string, pos: [number, number, number], args: [number, number, number], color: string, opacity = 1) => (
    <mesh
      position={pos}
      onClick={(e) => { e.stopPropagation(); onSelect?.(name) }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(name); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHovered(''); document.body.style.cursor = 'auto' }}
    >
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={hovered === name ? '#66d7ff' : color}
        transparent={opacity < 1}
        opacity={opacity}
        metalness={0.25}
        roughness={0.45}
      />
    </mesh>
  )

  return (
    <group rotation={[-0.35, 0.28, -0.38]}>
      {/* --- FORWARD FUSELAGE & CREW COCKPIT --- */}
      <group position={[0, 1.45 + topExplode, 0.15]}>
        {/* Forward Crew Module Fuselage */}
        {part('Crew compartment', [0, 0, 0], [1.15, 1.1, 0.95], '#f8fafc', hullOpacity)}

        {/* Black Thermal Nose Cone (RCC Nose Cap) */}
        <mesh position={[0, 0.72, -0.05]} onClick={() => onSelect?.('Crew compartment')}>
          <coneGeometry args={[0.54, 0.65, 24]} />
          <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.2} />
        </mesh>

        {/* Cockpit Flight Deck Windshield Windows */}
        <group position={[0, 0.35, 0.42]} rotation={[0.42, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.75, 0.22, 0.15]} />
            <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} />
          </mesh>
          {/* Overhead rendezvous windows */}
          <mesh position={[0, 0.16, -0.1]}>
            <boxGeometry args={[0.45, 0.12, 0.08]} />
            <meshStandardMaterial color="#0369a1" metalness={0.8} />
          </mesh>
        </group>

        {/* Forward RCS Nose Thruster Jets */}
        {[-0.35, 0.35].map((x, i) => (
          <mesh key={i} position={[x, 0.45, 0.28]}>
            <boxGeometry args={[0.12, 0.18, 0.08]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        ))}
      </group>

      {/* --- MID-FUSELAGE & PAYLOAD / CARGO BAY (MATCHING IMAGE 1) --- */}
      <group position={[0, 0, 0]}>
        {/* Main Cargo Bay Hull & Floor */}
        {part('Payload bay', [0, 0, 0], [1.25, 2.3, 0.9], '#f1f5f9', hullOpacity)}

        {/* Black Thermal Tile Belly (Heat Shield Underbody) */}
        <mesh position={[0, 0, -0.52]}>
          <boxGeometry args={[1.32, 2.35, 0.12]} />
          <meshStandardMaterial color="#0f172a" roughness={0.85} metalness={0.15} />
        </mesh>

        {/* Left Cargo Bay Door (Curved and Hinged Open) */}
        <group position={[-0.62, 0, 0.45]} rotation={[0, -doorAngle, 0]}>
          <mesh position={[-0.05, 0, 0.32]}>
            <boxGeometry args={[0.08, 2.25, 0.65]} />
        <meshStandardMaterial color={hovered === 'Payload bay' ? '#66d7ff' : shellColor} metalness={0.35} roughness={0.3} />
          </mesh>
          {/* Silver Radiator Lining on Inside of Door */}
          <mesh position={[0.01, 0, 0.32]}>
            <boxGeometry args={[0.02, 2.15, 0.6]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* Right Cargo Bay Door (Curved and Hinged Open) */}
        <group position={[0.62, 0, 0.45]} rotation={[0, doorAngle, 0]}>
          <mesh position={[0.05, 0, 0.32]}>
            <boxGeometry args={[0.08, 2.25, 0.65]} />
        <meshStandardMaterial color={hovered === 'Payload bay' ? '#66d7ff' : shellColor} metalness={0.35} roughness={0.3} />
          </mesh>
          <mesh position={[-0.01, 0, 0.32]}>
            <boxGeometry args={[0.02, 2.15, 0.6]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* Canadarm (Remote Manipulator System) Robotic Arm along port sill */}
        <group position={[-0.6, 0.2, 0.52]} rotation={[0.2 * deploy, 0.15 * (1 - deploy), -0.05 - 0.35 * deploy]}>
          {/* Shoulder joint */}
          <mesh>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.7} />
          </mesh>
          {/* Boom 1 */}
          <mesh position={[0.25, 0.38, 0.1]} rotation={[0, 0, 0.5]}>
            <cylinderGeometry args={[0.032, 0.032, 0.95, 8]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.4} />
          </mesh>
          {/* Elbow joint */}
          <mesh position={[0.48, 0.75, 0.2]}>
            <sphereGeometry args={[0.065, 12, 12]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
          {/* Boom 2 with end-effector */}
          <mesh position={[0.35, 1.1, 0.25]} rotation={[0, 0, -0.4]}>
            <cylinderGeometry args={[0.028, 0.028, 0.8, 8]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        </group>

        {/* Cylindrical Payloads Inside the Bay (Matching Image 1) */}
        <group position={[0, -0.4, 0.15]}>
          {/* Aft Payload Cylinder with white insulation blanket */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.68, 24]} />
            <meshStandardMaterial color="#f1f5f9" metalness={0.35} roughness={0.5} />
          </mesh>
          {/* Forward Payload Drum */}
          <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.38, 0.38, 0.58, 24]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.65} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* --- DOUBLE-DELTA WINGS WITH BLACK LEADING EDGES --- */}
      <group position={[0, -0.4, -0.2]}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * (0.95 + wingExplode), 0, 0]}>
            {/* Main Delta Wing Slab */}
            <mesh
              rotation={[0, 0, side * 0.22]}
              onClick={() => onSelect?.('Wings & TPS')}
              onPointerOver={() => setHovered('Wings & TPS')}
              onPointerOut={() => setHovered('')}
            >
              <boxGeometry args={[1.5, 1.95, 0.09]} />
              <meshStandardMaterial
                color={hovered === 'Wings & TPS' ? '#66d7ff' : '#f8fafc'}
                metalness={0.2}
                roughness={0.5}
              />
            </mesh>

            {/* Black RCC Leading Edge Tiles */}
            <mesh position={[side * 0.7, 0.4, 0]} rotation={[0, 0, side * -0.32]}>
              <boxGeometry args={[0.15, 1.85, 0.12]} />
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </mesh>

            {/* Wing Elevons at trailing edge */}
            <mesh position={[0, -0.92, 0]}>
              <boxGeometry args={[1.35, 0.18, 0.07]} />
              <meshStandardMaterial color="#334155" />
            </mesh>

            {/* NASA / USA Wing Insignia Accent */}
            <mesh position={[side * 0.15, -0.15, 0.052]}>
              <boxGeometry args={[0.35, 0.45, 0.01]} />
              <meshBasicMaterial color={side === 1 ? '#1e3a8a' : '#b91c1c'} />
            </mesh>
          </group>
        ))}
      </group>

      {/* --- AFT FUSELAGE, VERTICAL TAIL FIN, OMS PODS & 3 SSME ENGINES --- */}
      <group position={[0, -1.45 + bottomExplode, 0.1]}>
        {/* Aft Bulkhead Structure */}
        {part('Engine cluster', [0, 0, 0], [1.32, 0.65, 0.95], '#e2e8f0')}

        {/* Vertical Stabilizer (Tail Fin) */}
        <group position={[0, -0.1, 0.85]}>
          <mesh onClick={() => onSelect?.('Engine cluster')}>
            <boxGeometry args={[0.12, 1.35, 0.95]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.2} roughness={0.4} />
          </mesh>
          {/* Tail leading edge black RCC strip */}
          <mesh position={[0, 0.42, 0.42]} rotation={[0.45, 0, 0]}>
            <boxGeometry args={[0.14, 1.25, 0.14]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
        </group>

        {/* Twin OMS Pods (Orbital Maneuvering System) */}
        {[-0.45, 0.45].map((x, i) => (
          <group key={i} position={[x, -0.12, 0.28]}>
            <mesh>
              <boxGeometry args={[0.34, 0.85, 0.45]} />
              <meshStandardMaterial color="#f1f5f9" metalness={0.3} />
            </mesh>
            {/* Small OMS engine nozzle */}
            <mesh position={[0, -0.48, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.08, 0.18, 12, 1, true]} />
              <meshStandardMaterial color="#334155" metalness={0.8} />
            </mesh>
          </group>
        ))}

        {/* The 3 Iconic Space Shuttle Main Engines (SSMEs in Triangle Formation) */}
        {[
          [0, -0.42, 0.22],      // Top-center engine
          [-0.32, -0.42, -0.18], // Bottom-left engine
          [0.32, -0.42, -0.18],  // Bottom-right engine
        ].map((pos, i) => (
          <group key={i} position={pos as [number, number, number]}>
            <mesh rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.22, 0.42, 18, 1, true]} />
              <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.25} />
            </mesh>
            {/* Engine nozzle interior blue/orange glow */}
            <mesh position={[0, -0.22, 0]}>
              <sphereGeometry args={[0.09, 12, 12]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} />
            </mesh>
          </group>
        ))}

        {/* Aft Body Flap */}
        <mesh position={[0, -0.45, -0.45]}>
          <boxGeometry args={[1.05, 0.35, 0.08]} />
          <meshStandardMaterial color="#0f172a" roughness={0.9} />
        </mesh>
      </group>
    </group>
  )
}

// --- 2. ORION DEEP SPACE STACK MODEL (MATCHING USER IMAGE 2) ---
function OrionDeepSpaceStack({
  cutaway,
  materialColor,
  explode = 0,
  hovered,
  setHovered,
  onSelect,
}: {
  cutaway?: boolean
  materialColor: string
  explode: number
  hovered: string
  setHovered: (s: string) => void
  onSelect?: (part: string) => void
}) {
  const hullOpacity = cutaway ? 0.35 : 1
  const shellColor = materialColor === '#829ab2' ? '#f8fafc' : materialColor
  const xOffset = explode * 1.4

  return (
    <group rotation={[0.15, -0.72, 0.08]}>
      {/* 1. FORWARD CONICAL CREW MODULE (ORION CAPSULE - RIGHT SIDE IN IMAGE 2) */}
      <group position={[1.8 + xOffset, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        {/* Conical Capsule Body with Metallic Silver-Grey Thermal Skin */}
        <mesh
          onClick={(e) => { e.stopPropagation(); onSelect?.('Crew compartment') }}
          onPointerOver={() => { setHovered('Crew compartment'); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { setHovered(''); document.body.style.cursor = 'auto' }}
        >
          <cylinderGeometry args={[0.42, 1.25, 1.25, 32]} />
          <meshStandardMaterial
            color={hovered === 'Crew compartment' ? '#66d7ff' : '#20252b'}
            transparent={hullOpacity < 1}
            opacity={hullOpacity}
            metalness={0.42}
            roughness={0.58}
          />
        </mesh>

        {/* Riveted thermal panels and dark capsule access ports */}
        {[-0.42, -0.12, 0.18, 0.48].map((y, i) => (
          <group key={i}>
            <mesh position={[0.18, y, 0.86]} rotation={[0.12, 0, 0.08]}>
              <boxGeometry args={[0.28, 0.16, 0.035]} />
              <meshStandardMaterial color={i % 2 ? '#b77932' : '#343a40'} metalness={0.62} roughness={0.42} />
            </mesh>
            {[-0.42, 0.42].map((x) => <mesh key={x} position={[x, y, 0.8]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial color="#d3d4d2" metalness={0.8} /></mesh>)}
          </group>
        ))}

        {/* Forward Docking Adapter Ring & Nose Fairing */}
        <mesh position={[0, 0.72, 0]}>
          <cylinderGeometry args={[0.36, 0.42, 0.22, 24]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.7} roughness={0.25} />
        </mesh>

        {/* Cockpit Triangular View Windows */}
        <group position={[0, 0.12, 0.72]} rotation={[0.55, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.55, 0.22, 0.08]} />
            <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} />
          </mesh>
        </group>

        {/* Aft Heat Shield Base Flange Ring */}
        <mesh position={[0, -0.65, 0]}>
          <cylinderGeometry args={[1.32, 1.32, 0.12, 32]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.5} />
        </mesh>
      </group>

      {/* 2. SERVICE MODULE SECTION (CENTER MODULE) */}
      <group position={[0.5 + xOffset * 0.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        {/* Contrasting equipment band between the bright pressure barrel sections */}
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[1.135, 1.135, 0.38, 32]} />
          <meshStandardMaterial color="#30363c" metalness={0.64} roughness={0.43} />
        </mesh>
        {/* Service Module White Cylindrical Barrel */}
        <mesh
          onClick={(e) => { e.stopPropagation(); onSelect?.('Equipment bay') }}
          onPointerOver={() => { setHovered('Equipment bay'); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { setHovered(''); document.body.style.cursor = 'auto' }}
        >
          <cylinderGeometry args={[1.12, 1.12, 1.15, 32]} />
          <meshStandardMaterial
            color={hovered === 'Equipment bay' ? '#66d7ff' : shellColor}
            transparent={hullOpacity < 1}
            opacity={hullOpacity}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>

        {/* Circumferential Dark Adapter Collar Ring */}
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[1.18, 1.18, 0.08, 32]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>

        {/* Flared Conical Interstage Adapter */}
        <mesh position={[0, -0.72, 0]}>
          <cylinderGeometry args={[1.12, 0.95, 0.35, 32]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.4} />
        </mesh>
        {[-0.48, 0.48].map((y) => <mesh key={y} position={[0, y, 0]}><torusGeometry args={[1.13, 0.025, 8, 32]} /><meshStandardMaterial color="#d5d9dd" metalness={0.82} roughness={0.28} /></mesh>)}
      </group>

      {/* 3. OPEN STRUCTURAL TRUSS WITH RED PROPELLANT SPHERES (MATCHING IMAGE 2) */}
      <group position={[-0.65 - xOffset * 0.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        {/* Central Structural Core Tube */}
        <mesh>
          <cylinderGeometry args={[0.55, 0.55, 0.95, 20]} />
          <meshStandardMaterial color="#334155" metalness={0.7} />
        </mesh>

        {/* Outer Black Structural Lattice Rings & Struts */}
        {[-0.4, 0.4].map((y, i) => (
          <mesh key={i} position={[0, y, 0]}>
            <torusGeometry args={[0.92, 0.035, 8, 32]} />
            <meshStandardMaterial color="#b91c1c" metalness={0.8} />
          </mesh>
        ))}

        {/* Small vermilion service lines and canisters on the exposed truss */}
        {Array.from({ length: 6 }).map((_, idx) => {
          const angle = (idx / 6) * Math.PI * 2
          const rad = 0.76
          return (
            <group key={idx} position={[Math.cos(angle) * rad, 0, Math.sin(angle) * rad]}>
              <mesh onClick={() => onSelect?.('Outer shielding')}>
                <cylinderGeometry args={[0.105, 0.12, 0.42, 12]} />
                <meshStandardMaterial color="#bd302d" metalness={0.42} roughness={0.36} />
              </mesh>
              {/* Black Truss Mounting Bracket */}
              <mesh>
                <cylinderGeometry args={[0.02, 0.02, 0.8, 6]} />
                <meshStandardMaterial color="#1e293b" />
              </mesh>
            </group>
          )
        })}
      </group>

      {/* 4. CRYOGENIC PROPULSION STAGE & LARGE ROCKET ENGINE BELL (LEFT SIDE IN IMAGE 2) */}
      <group position={[-1.75 - xOffset, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        {/* Cryogenic Stage Tank Barrel */}
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.82, 0.82, 0.75, 28]} />
          <meshStandardMaterial color={shellColor} metalness={0.55} roughness={0.32} />
        </mesh>

        {/* Engine Thrust Structure & Gimbal Ring */}
        <mesh position={[0, -0.15, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 0.25, 20]} />
          <meshStandardMaterial color="#475569" metalness={0.8} />
        </mesh>

        {/* Large Regenerative Cryogenic Rocket Engine Bell (Matching Image 2) */}
        <group position={[0, -0.85, 0]} rotation={[Math.PI, 0, 0]}>
          <mesh onClick={() => onSelect?.('Engine cluster')}>
            <coneGeometry args={[0.62, 1.15, 32, 1, true]} />
            <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.25} />
          </mesh>
          {/* Engine nozzle interior glow */}
          <mesh position={[0, -0.45, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// --- 3. CLASSIC ASTERIA TRANSIT / LUNAR LANDER FALLBACK MODEL ---
function ClassicTransitModel({
  cutaway,
  materialColor,
  spacecraftType,
  thickness,
  explode = 0,
  deploy = 1,
  hovered,
  setHovered,
  onSelect,
}: {
  cutaway?: boolean
  materialColor: string
  spacecraftType?: string
  thickness?: number
  explode: number
  deploy: number
  hovered: string
  setHovered: (s: string) => void
  onSelect?: (part: string) => void
}) {
  const hullOpacity = cutaway ? 0.28 : 1
  const isLander = spacecraftType === 'Lunar Lander'
  const isCargo = spacecraftType === 'Cargo Transfer'

  const part = (name: string, pos: [number, number, number], args: [number, number, number], tint: string, opacity = 1) => (
    <mesh
      position={pos}
      onClick={(e) => { e.stopPropagation(); onSelect?.(name) }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(name); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHovered(''); document.body.style.cursor = 'auto' }}
    >
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={hovered === name ? '#66d7ff' : tint}
        transparent={opacity < 1}
        opacity={opacity}
        metalness={0.46}
        roughness={0.42}
      />
    </mesh>
  )

  const topOffset = explode * 1.35
  const bottomOffset = -explode * 1.45
  const rearOffset = -explode * 1.55
  const wingOffset = explode * 1.25
  const solarSpan = (isLander ? 1.1 : isCargo ? 2.85 : 2.35) * Math.max(0.2, deploy)
  const solarXPos = (isLander ? 1.85 : isCargo ? 3.05 : 2.45) + (1 - deploy) * -0.5 + wingOffset

  return (
    <group rotation={[0.12, -0.18, 0.08]}>
      {/* Cabin */}
      {part('Crew compartment', [0, 0, 0], isLander ? [1.8, 1.2, 1.7] : [2.05, 1.45, 1.35], materialColor, hullOpacity)}

      {/* Forward module */}
      <group position={[0, topOffset, 0]}>
        {part('Forward module', [0, 1.03, 0], [1.18, 0.62, 1.08], '#a7bdcc', cutaway ? 0.4 : 1)}
        {part('Docking port', [0, 1.47, 0], [0.52, 0.28, 0.52], '#9cb4c4')}
      </group>

      {/* Equipment Bay */}
      <group position={[0, bottomOffset, 0]}>
        {part('Equipment bay', [0, isCargo ? -0.82 : -0.9, 0], isCargo ? [2.55, 1.05, 1.72] : [1.55, 0.52, 1.12], '#334964', cutaway ? 0.45 : 1)}
        <mesh position={[0, -1.25, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.32, 0.45, 18, 1, true]} />
          <meshStandardMaterial color="#334155" metalness={0.85} />
        </mesh>
      </group>

      {/* Outer Shielding */}
      <group position={[0, 0, rearOffset]}>
        {part('Outer shielding', [0, 0, -0.7], [2.18, 1.57, Math.max(0.06, (thickness || 12) / 100)], materialColor, cutaway ? 0.18 : 0.86)}
      </group>

      {/* Solar Wings */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * solarXPos, 0, 0]}>
          {part('Solar arrays', [0, 0, 0], [solarSpan, 0.08, isLander ? 0.8 : 1.45], '#174b76')}
        </group>
      ))}
    </group>
  )
}

// --- REALISTIC ORBITAL EARTH BACKGROUND (MATCHING USER REFERENCE IMAGES 1 & 2) ---
function OrbitalEarthBackdrop({ isShuttle, isOrion }: { isShuttle?: boolean; isOrion?: boolean }) {
  const earthRef = useRef<Group>(null)
  useFrame((_, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.012
    }
  })

  // Position Earth below & behind matching the photography angles
  const pos: [number, number, number] = isShuttle
    ? [-3.5, -16.5, -11]
    : isOrion
    ? [0, -17.5, -12]
    : [0, -19, -14]

  return (
    <group ref={earthRef} position={pos} rotation={[0.38, 0.55, -0.22]}>
      {/* Deep Blue Planet Sphere */}
      <mesh raycast={() => null}>
        <sphereGeometry args={[15.5, 48, 48]} />
        <meshStandardMaterial color="#1e40af" roughness={0.7} metalness={0.15} />
      </mesh>

      {/* Continents & Landmasses */}
      {[
        { pos: [0, 4.2, 14.8], size: [6.2, 4.8] },
        { pos: [5.8, -1.8, 14.4], size: [4.8, 5.8] },
        { pos: [-5.2, 2.8, 14.5], size: [4.2, 3.8] },
      ].map((land, idx) => (
        <mesh key={idx} position={land.pos as [number, number, number]} raycast={() => null}>
          <planeGeometry args={[land.size[0], land.size[1]]} />
          <meshStandardMaterial color="#15803d" roughness={0.88} transparent opacity={0.65} />
        </mesh>
      ))}

      {/* Atmospheric Cloud Layer with Swirling Patterns */}
      <mesh raycast={() => null}>
        <sphereGeometry args={[15.68, 48, 48]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.4} roughness={0.95} depthWrite={false} />
      </mesh>

      {/* Atmospheric Rayleigh Scattering Glow Limb */}
      <mesh raycast={() => null}>
        <sphereGeometry args={[15.95, 36, 36]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.22} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

// --- MASTER EXPANDABLE VEHICLE CONTROLLER ---
function ExpandableVehicle(
  props: Props & {
    explode?: number
    deploy?: number
    showRays?: boolean
    autoRotate?: boolean
    radiationActive?: boolean
  }
) {
  const [hovered, setHovered] = useState('')
  const [dragging, setDragging] = useState('')
  const vehicle = useRef<Group>(null)

  const color = props.material === 'Aluminum'
    ? '#829ab2'
    : props.material === 'Polyethylene'
    ? '#81c9bc'
    : props.material === 'Water'
    ? '#42bce7'
    : props.material === 'Lunar regolith'
    ? '#b19a7c'
    : '#92a4c7'

  useFrame((_, delta) => {
    if (props.autoRotate && vehicle.current) {
      vehicle.current.rotation.y += delta * 0.15
    }
  })

  const moveDetector = (name: string, event: ThreeEvent<PointerEvent>) => {
    if (dragging !== name || !vehicle.current) return
    event.stopPropagation()
    const local = vehicle.current.worldToLocal(event.point.clone())
    props.onPositionChange?.(name, [
      Math.max(-0.78, Math.min(0.78, local.x)),
      Math.max(-0.48, Math.min(0.48, local.y)),
      Math.max(0.4, Math.min(0.63, local.z)),
    ])
  }

  const isShuttle = props.spacecraftType === 'Space Shuttle Orbiter' || props.spacecraftType === 'Space Shuttle'
  const isOrion = props.spacecraftType === 'Orion Deep Space' || props.spacecraftType === 'Crew Capsule' || props.spacecraftType === 'Orion Deep Space Stack' || props.spacecraftType === 'Asteria Transit'

  return (
    <>
      <OrbitalEarthBackdrop isShuttle={isShuttle} isOrion={isOrion} />
      <group ref={vehicle}>
        <RadiationStream
          active={Boolean(props.radiationActive)}
          category={props.radiationCategory}
          particle={props.particle}
          thickness={props.thickness}
        material={props.material}
        detectors={props.detectors}
      />

      {/* RENDER THE EXACT SELECTED SPACECRAFT ARCHITECTURE */}
      {isShuttle ? (
        <SpaceShuttleOrbiter
          cutaway={props.cutaway}
          materialColor={color}
          explode={props.explode || 0}
          deploy={props.deploy ?? 1}
          hovered={hovered}
          setHovered={setHovered}
          onSelect={props.onSelect}
        />
      ) : isOrion ? (
        <OrionDeepSpaceStack
          cutaway={props.cutaway}
          materialColor={color}
          explode={props.explode || 0}
          hovered={hovered}
          setHovered={setHovered}
          onSelect={props.onSelect}
        />
      ) : (
        <ClassicTransitModel
          cutaway={props.cutaway}
          materialColor={color}
          spacecraftType={props.spacecraftType}
          thickness={props.thickness}
          explode={props.explode || 0}
          deploy={props.deploy ?? 1}
          hovered={hovered}
          setHovered={setHovered}
          onSelect={props.onSelect}
        />
      )}

      {/* DRAGGABLE VIRTUAL DETECTORS PLACED INSIDE CREW CABIN */}
      {(props.detectors || []).slice(0, 5).map((name, i) => (
        <group
          key={name}
          position={
            props.detectorPositions?.[name] || [
              -0.42 + (i % 3) * 0.42,
              (isShuttle ? 0.95 : 0) + Math.floor(i / 3) * 0.35,
              0.52,
            ]
          }
        >
          <mesh
            onPointerDown={(e) => {
              e.stopPropagation()
              setDragging(name)
              ;(e.nativeEvent.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              setDragging('')
              ;(e.nativeEvent.target as HTMLCanvasElement).releasePointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => moveDetector(name, e)}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovered(name)
              document.body.style.cursor = 'grab'
            }}
            onPointerOut={() => {
              setHovered('')
              document.body.style.cursor = 'auto'
            }}
          >
            <sphereGeometry args={[0.115, 20, 20]} />
            <meshStandardMaterial
              color={['#38bdf8', '#a78bfa', '#f59e0b', '#34d399', '#f87171'][i]}
              emissive={
                props.radiationActive
                  ? ['#0284c7', '#7c3aed', '#d97706', '#059669', '#dc2626'][i]
                  : ['#0c4a6e', '#3b2c70', '#623d08', '#14532d', '#7f1d1d'][i]
              }
              emissiveIntensity={props.radiationActive ? 1.6 : hovered === name ? 0.95 : 0.5}
            />
          </mesh>
        </group>
      ))}
      </group>
    </>
  )
}

// --- SOLAR SYSTEM & HIGHER SOLAR SYSTEM 3D ENVIRONMENT (MATCHING USER REFERENCE IMAGE) ---
export type PlanetData = {
  name: string
  radius: number
  size: number
  color: string
  speed: number
  hasRings?: boolean
  ringInner?: number
  ringOuter?: number
  atmosphere?: string
  radiationLevel: string
  magneticShielding: string
  au: string
  period: string
  description: string
  isOuter?: boolean
}

export const PLANETS: PlanetData[] = [
  {
    name: 'Mercury',
    radius: 5.8,
    size: 0.28,
    color: '#857d77',
    speed: 1.6,
    radiationLevel: 'Intense Solar Flux (SEP: 12.8 mGy/h)',
    magneticShielding: 'Negligible (No Dipole Dynamo)',
    au: '0.387 AU (57.9M km)',
    period: '88.0 days',
    description: 'Closest world to the Sun; unshielded rocky surface directly blasted by extreme solar wind, coronal mass ejections, and high-energy protons.',
  },
  {
    name: 'Venus',
    radius: 9.0,
    size: 0.46,
    color: '#eab308',
    speed: 1.25,
    atmosphere: '#ca8a04',
    radiationLevel: 'Atmospheric Ionization (4.2 mGy/h)',
    magneticShielding: 'Induced Ionospheric Barrier (92 bar CO₂)',
    au: '0.723 AU (108.2M km)',
    period: '224.7 days',
    description: 'Enveloped by a super-dense CO₂ blanket that completely absorbs primary cosmic rays, though orbital altitudes experience high coronal particle flux.',
  },
  {
    name: 'Earth',
    radius: 12.8,
    size: 0.54,
    color: '#2563eb',
    speed: 1.0,
    atmosphere: '#38bdf8',
    radiationLevel: 'Van Allen Trapped Belts (0.05–50 mGy/h)',
    magneticShielding: 'Strong Geomagnetic Dipole (Protective Magnetosphere)',
    au: '1.000 AU (149.6M km)',
    period: '365.25 days',
    description: 'Home world; vigorous magnetic dynamo deflects deep space galactic cosmic rays, creating protective inner proton and outer electron radiation belts.',
  },
  {
    name: 'Mars',
    radius: 17.2,
    size: 0.40,
    color: '#dc2626',
    speed: 0.82,
    atmosphere: '#ea580c',
    radiationLevel: 'High GCR & Surface Neutrons (0.68 mSv/day)',
    magneticShielding: 'Weak Localized Remnant Crustal Fields',
    au: '1.524 AU (227.9M km)',
    period: '687.0 days',
    description: 'Prime exploration target; unshielded thin CO₂ atmosphere permits primary cosmic ray penetration and secondary albedo neutron generation from regolith.',
  },
  {
    name: 'Jupiter',
    radius: 29.5,
    size: 1.48,
    color: '#d97706',
    speed: 0.46,
    radiationLevel: 'Lethal Synchrotron Radiation (100–500 mGy/h)',
    magneticShielding: 'Colossal Planetary Magnetosphere (20,000x Earth)',
    au: '5.204 AU (778.5M km)',
    period: '11.86 years',
    description: 'Massive gas giant with multi-banded cloud decks and Great Red Spot; immense magnetic field traps relativistic electrons into lethal Jovian radiation belts.',
    isOuter: true,
  },
  {
    name: 'Saturn',
    radius: 40.0,
    size: 1.18,
    color: '#fef08a',
    speed: 0.34,
    hasRings: true,
    ringInner: 1.4,
    ringOuter: 2.6,
    radiationLevel: 'Ring-Absorbed Radiation Cavity (0.12 mGy/h)',
    magneticShielding: 'Axisymmetric Dipole Field',
    au: '9.582 AU (1.43B km)',
    period: '29.45 years',
    description: 'Magnificent ringed gas giant; its wide water-ice particle ring plane absorbs trapped charged particles, creating a tranquil low-radiation orbital cavity.',
    isOuter: true,
  },
  {
    name: 'Uranus',
    radius: 49.5,
    size: 0.74,
    color: '#67e8f9',
    speed: 0.24,
    radiationLevel: 'Chaotic Tilted Magnetosphere (0.26 mGy/h)',
    magneticShielding: 'Extreme 59° Oblique Quadrupole Field',
    au: '19.22 AU (2.87B km)',
    period: '84.0 years',
    description: 'Aquamarine ice giant tilted 98° on its side; complex, offset tumbling magnetic field creates dynamic shifting radiation corridors.',
    isOuter: true,
  },
  {
    name: 'Neptune',
    radius: 58.5,
    size: 0.70,
    color: '#1d4ed8',
    speed: 0.18,
    radiationLevel: 'Outer Heliospheric GCR Medium (0.42 mGy/h)',
    magneticShielding: 'Tilted 47° Offset Magnetic Field',
    au: '30.05 AU (4.50B km)',
    period: '164.8 years',
    description: 'Deep azure blue ice giant with supersonic methane winds near the termination shock where the solar wind gives way to the interstellar cosmic ray sea.',
    isOuter: true,
  },
]

// --- MINIATURIZED 3D SPACECRAFT CRUISING IN SOLAR SYSTEM (MATCHING USER IMAGES 1 & 2) ---
function SolarSystemActiveCraft({
  spacecraftType,
  position,
  rotation,
  isSelected,
  onSelect,
}: {
  spacecraftType?: string
  position: [number, number, number]
  rotation: [number, number, number]
  isSelected: boolean
  onSelect: () => void
}) {
  const isShuttle = spacecraftType === 'Space Shuttle Orbiter' || spacecraftType === 'Space Shuttle' || !spacecraftType
  const isOrion = spacecraftType === 'Orion Deep Space' || spacecraftType === 'Crew Capsule' || spacecraftType === 'Orion Deep Space Stack'

  return (
    <group position={position} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect() }}>
      {/* Target Locator Beacon & Selection Reticle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.65, 0.74, 32]} />
        <meshBasicMaterial color={isSelected ? '#38bdf8' : '#67e8f9'} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      {isSelected && (
        <mesh>
          <sphereGeometry args={[0.92, 16, 16]} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.4} />
        </mesh>
      )}

      {/* RENDER DETAILED 3D MODEL OF THE ACTIVE VEHICLE */}
      {isShuttle ? (
        <group scale={0.36} rotation={[0, Math.PI, 0]}>
          {/* Forward Cockpit & Nose */}
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.65, 0.72, 0.55]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.3} roughness={0.4} />
          </mesh>
          {/* Black Nose Cap */}
          <mesh position={[0, 0.98, -0.05]}>
            <coneGeometry args={[0.32, 0.38, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
          {/* Cockpit Window */}
          <mesh position={[0, 0.72, 0.28]} rotation={[0.4, 0, 0]}>
            <boxGeometry args={[0.45, 0.15, 0.08]} />
            <meshStandardMaterial color="#0284c7" metalness={0.9} />
          </mesh>
          {/* Mid-Fuselage Payload Bay with Silver Radiators */}
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[0.72, 1.25, 0.52]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.3} />
          </mesh>
          {/* Canadarm & Payloads in bay */}
          <mesh position={[-0.32, 0.1, 0.28]} rotation={[0, 0, 0.4]}>
            <cylinderGeometry args={[0.025, 0.025, 0.75, 6]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
          <mesh position={[0, -0.3, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.5, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.7} />
          </mesh>
          {/* Double-Delta Wings with Black RCC Leading Edges */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.65, -0.32, -0.1]}>
              <mesh rotation={[0, 0, s * 0.2]}>
                <boxGeometry args={[0.9, 1.15, 0.06]} />
                <meshStandardMaterial color="#f8fafc" />
              </mesh>
              {/* Black RCC edge */}
              <mesh position={[s * 0.42, 0.22, 0]}>
                <boxGeometry args={[0.1, 1.05, 0.08]} />
                <meshStandardMaterial color="#0f172a" />
              </mesh>
            </group>
          ))}
          {/* Vertical Tail Fin & Twin OMS Pods */}
          <mesh position={[0, -0.88, 0.48]}>
            <boxGeometry args={[0.08, 0.85, 0.68]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
          {[-0.24, 0.24].map((x, i) => (
            <mesh key={i} position={[x, -0.8, 0.18]}>
              <boxGeometry args={[0.22, 0.5, 0.26]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>
          ))}
          {/* 3 SSME Engines firing brilliant blue ion/chemical thrust plume */}
          {[-0.18, 0.18].map((x, i) => (
            <group key={i} position={[x, -0.96, -0.08]}>
              <mesh rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.13, 0.26, 12, 1, true]} />
                <meshStandardMaterial color="#1e293b" metalness={0.9} />
              </mesh>
              {/* Glowing engine exhaust flame */}
              <mesh position={[0, -0.38, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.1, 0.65, 12]} />
                <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} />
              </mesh>
            </group>
          ))}
        </group>
      ) : isOrion ? (
        <group scale={0.36} rotation={[0, Math.PI / 2, 0]}>
          {/* Conical Crew Module (Right Side - Image 2) */}
          <group position={[1.1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <mesh>
              <cylinderGeometry args={[0.25, 0.72, 0.72, 20]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.42, 0]}>
              <cylinderGeometry args={[0.2, 0.25, 0.15, 16]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.5} />
            </mesh>
          </group>
          {/* Cylindrical Service Module (Center) */}
          <group position={[0.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <mesh>
              <cylinderGeometry args={[0.65, 0.65, 0.68, 20]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.3} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.36, 0]}>
              <cylinderGeometry args={[0.68, 0.68, 0.06, 20]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
          </group>
          {/* Open Lattice Truss with 6 Red Propellant Spheres (Image 2) */}
          <group position={[-0.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <mesh>
              <cylinderGeometry args={[0.32, 0.32, 0.58, 14]} />
              <meshStandardMaterial color="#334155" metalness={0.7} />
            </mesh>
            {Array.from({ length: 6 }).map((_, idx) => {
              const a = (idx / 6) * Math.PI * 2
              return (
                <mesh key={idx} position={[Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46]}>
                  <sphereGeometry args={[0.15, 14, 14]} />
                  <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.3} />
                </mesh>
              )
            })}
          </group>
          {/* Cryogenic Stage & Large Rocket Engine Bell firing blue exhaust (Left Side - Image 2) */}
          <group position={[-0.98, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <mesh>
              <cylinderGeometry args={[0.48, 0.48, 0.48, 18]} />
              <meshStandardMaterial color="#f1f5f9" metalness={0.35} />
            </mesh>
            <mesh position={[0, -0.46, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.38, 0.72, 20, 1, true]} />
              <meshStandardMaterial color="#1e293b" metalness={0.85} />
            </mesh>
            {/* Engine plume */}
            <mesh position={[0, -0.92, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.24, 0.95, 14]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} />
            </mesh>
          </group>
        </group>
      ) : (
        <group scale={0.36}>
          <mesh>
            <boxGeometry args={[0.6, 0.6, 0.6]} />
            <meshStandardMaterial color="#829ab2" />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.85, 0, 0]}>
              <boxGeometry args={[0.95, 0.06, 0.45]} />
              <meshStandardMaterial color="#174b76" />
            </mesh>
          ))}
        </group>
      )}

      {/* Thruster point light */}
      <pointLight color="#38bdf8" intensity={8} distance={10} />
    </group>
  )
}

function SolarSystemScene({
  isHigher,
  selectedPlanet,
  onSelectPlanet,
  simSpeed,
  radiationActive = false,
  spacecraftType,
  showOrbitLines = true,
  showLabels = true,
}: {
  isHigher: boolean
  selectedPlanet: string
  onSelectPlanet: (name: string) => void
  simSpeed: number
  radiationActive?: boolean
  spacecraftType?: string
  material?: string
  thickness?: number
  showOrbitLines?: boolean
  showLabels?: boolean
}) {
  const planetRefs = useRef<Record<string, Group>>({})
  const sunSurfaceRef = useRef<Mesh>(null)
  const sunGlowRef = useRef<Mesh>(null)
  const solarWaveRef = useRef<Mesh>(null)
  const solarWaveRef2 = useRef<Mesh>(null)
  const earthCloudRef = useRef<Mesh>(null)
  const moonRef = useRef<Group>(null)

  const activePlanets = useMemo(() => {
    return isHigher ? PLANETS : PLANETS.filter((p) => !p.isOuter)
  }, [isHigher])

  const [spacecraftPos, setSpacecraftPos] = useState<[number, number, number]>([12.8, 0, 0])
  const [spacecraftRot, setSpacecraftRot] = useState<[number, number, number]>([0, 0, 0])

  const asteroidPositions = useMemo(() => {
    const coords: [number, number, number][] = []
    for (let i = 0; i < 240; i++) {
      const angle = (i / 240) * Math.PI * 2 + (Math.random() - 0.5) * 0.18
      const dist = 22.5 + (Math.random() - 0.5) * 3.4
      coords.push([
        Math.cos(angle) * dist,
        (Math.random() - 0.5) * 0.8,
        Math.sin(angle) * dist,
      ])
    }
    return coords
  }, [])

  const trajectoryPoints = useMemo(() => {
    const pts: [number, number, number][] = []
    const startR = 12.8
    const endR = 17.2
    for (let i = 0; i <= 80; i++) {
      const t = i / 80
      const theta = t * Math.PI * 1.05 + 0.35
      const r = startR + (endR - startR) * (1 - Math.cos(t * Math.PI)) * 0.5
      pts.push([Math.cos(theta) * r, Math.sin(t * Math.PI * 2) * 0.22, Math.sin(theta) * r])
    }
    return pts
  }, [])

  useFrame((state) => {
    const time = state.clock.elapsedTime * 0.2 * simSpeed

    activePlanets.forEach((p) => {
      const ref = planetRefs.current[p.name]
      if (ref) {
        const angle = time * p.speed + (p.radius * 0.65)
        ref.position.x = Math.cos(angle) * p.radius
        ref.position.z = Math.sin(angle) * p.radius
        ref.rotation.y += 0.018 * simSpeed
      }
    })

    if (earthCloudRef.current) {
      earthCloudRef.current.rotation.y += 0.008
    }

    if (moonRef.current) {
      moonRef.current.rotation.y = time * 2.8
    }

    if (sunSurfaceRef.current) {
      sunSurfaceRef.current.rotation.y += 0.004
    }
    if (sunGlowRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.8) * 0.04
      sunGlowRef.current.scale.set(pulse, pulse, pulse)
    }

    if (solarWaveRef.current && radiationActive) {
      const waveT = (state.clock.elapsedTime * 0.8) % 1
      const waveScale = 1 + waveT * 9
      solarWaveRef.current.scale.set(waveScale, 1, waveScale)
      ;(solarWaveRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 - waveT * 0.75)
    }
    if (solarWaveRef2.current && radiationActive) {
      const waveT2 = ((state.clock.elapsedTime * 0.8) + 0.5) % 1
      const waveScale2 = 1 + waveT2 * 9
      solarWaveRef2.current.scale.set(waveScale2, 1, waveScale2)
      ;(solarWaveRef2.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 - waveT2 * 0.55)
    }

    const t = ((state.clock.elapsedTime * 0.03 * simSpeed) % 1)
    const idx = Math.min(trajectoryPoints.length - 1, Math.floor(t * trajectoryPoints.length))
    const nextIdx = (idx + 1) % trajectoryPoints.length
    const pt = trajectoryPoints[idx]
    const nextPt = trajectoryPoints[nextIdx]
    if (pt && nextPt) {
      setSpacecraftPos(pt)
      const angle = Math.atan2(nextPt[0] - pt[0], nextPt[2] - pt[2])
      setSpacecraftRot([0, angle, 0])
    }
  })

  return (
    <group>
      {/* 1. THE SUN: RADIANT FIREBALL WITH SOLAR CORONA & PROMINENCES (MATCHING REFERENCE IMAGE) */}
      <group
        position={[0, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onSelectPlanet('Sun') }}
        onPointerOver={() => { document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = 'auto' }}
      >
        <mesh>
          <sphereGeometry args={[2.85, 36, 36]} />
          <meshBasicMaterial color="#ffea75" />
        </mesh>
        <mesh ref={sunSurfaceRef}>
          <sphereGeometry args={[2.95, 36, 36]} />
          <meshStandardMaterial
            color="#f59e0b"
            emissive="#ea580c"
            emissiveIntensity={1.2}
            roughness={0.9}
          />
        </mesh>
        {/* Solar Prominence Loops */}
        {[
          { rot: [0.3, 0.4, 0], scale: [1, 1, 1] },
          { rot: [-0.6, 1.2, 0.4], scale: [0.85, 1.2, 0.9] },
          { rot: [1.1, -0.8, -0.5], scale: [1.1, 0.9, 1] },
          { rot: [-0.2, -1.4, 0.8], scale: [0.95, 1.1, 0.85] },
        ].map((flare, idx) => (
          <group key={idx} rotation={flare.rot as [number, number, number]} scale={flare.scale as [number, number, number]}>
            <mesh position={[0, 2.85, 0]}>
              <torusGeometry args={[0.65, 0.08, 12, 24, Math.PI * 0.85]} />
              <meshBasicMaterial color="#f97316" transparent opacity={0.75} />
            </mesh>
          </group>
        ))}
        {/* Coronal Glow */}
        <mesh ref={sunGlowRef}>
          <sphereGeometry args={[3.45, 32, 32]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.32} />
        </mesh>
        <mesh>
          <sphereGeometry args={[4.2, 32, 32]} />
          <meshBasicMaterial color="#ea580c" transparent opacity={0.15} side={THREE.BackSide} />
        </mesh>
        <pointLight intensity={55} distance={200} decay={1.05} color="#fffbeb" />

        {/* CME Shockwaves */}
        {radiationActive && (
          <group>
            <mesh ref={solarWaveRef} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[3.2, 3.8, 64]} />
              <meshBasicMaterial color="#f97316" transparent opacity={0.75} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={solarWaveRef2} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[3.0, 3.5, 64]} />
              <meshBasicMaterial color="#fbbf24" transparent opacity={0.55} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>

      {/* 2. CONCENTRIC CLEAN WHITE ORBITAL ELLIPSES (MATCHING USER REFERENCE IMAGE) */}
      {showOrbitLines && activePlanets.map((p) => (
        <mesh key={`orbit-${p.name}`} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[p.radius - 0.05, p.radius + 0.05, 128]} />
          <meshBasicMaterial
            color={selectedPlanet === p.name ? '#38bdf8' : '#e2e8f0'}
            transparent
            opacity={selectedPlanet === p.name ? 0.95 : 0.48}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* 3. PLANETS IN ORDER (MATCHING THE REFERENCE IMAGE) */}
      {activePlanets.map((p) => (
        <group key={p.name}>
          <group
            ref={(el) => { if (el) planetRefs.current[p.name] = el }}
            onClick={(e) => { e.stopPropagation(); onSelectPlanet(p.name) }}
            onPointerOver={() => { document.body.style.cursor = 'pointer' }}
            onPointerOut={() => { document.body.style.cursor = 'auto' }}
          >
            {/* PLANET-SPECIFIC AUTHENTIC 3D RENDERING */}
            {p.name === 'Earth' ? (
              // Earth & Luna System (Image shows Moon beside Earth)
              <group>
                <mesh>
                  <sphereGeometry args={[0.54, 32, 32]} />
                  <meshStandardMaterial color="#1e40af" roughness={0.65} metalness={0.15} />
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.546, 24, 24]} />
                  <meshStandardMaterial color="#15803d" roughness={0.85} transparent opacity={0.65} />
                </mesh>
                <mesh ref={earthCloudRef}>
                  <sphereGeometry args={[0.558, 32, 32]} />
                  <meshStandardMaterial color="#ffffff" transparent opacity={0.42} roughness={0.92} depthWrite={false} />
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.61, 24, 24]} />
                  <meshBasicMaterial color="#38bdf8" transparent opacity={0.24} side={THREE.BackSide} />
                </mesh>
                {/* Moon Orbit Ring & Moon Sphere */}
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[1.18, 1.21, 48]} />
                  <meshBasicMaterial color="#94a3b8" transparent opacity={0.35} side={THREE.DoubleSide} />
                </mesh>
                <group ref={moonRef}>
                  <mesh
                    position={[1.2, 0, 0]}
                    onClick={(e) => { e.stopPropagation(); onSelectPlanet('Moon') }}
                  >
                    <sphereGeometry args={[0.15, 16, 16]} />
                    <meshStandardMaterial color="#cbd5e1" roughness={0.92} metalness={0.08} />
                  </mesh>
                </group>
              </group>
            ) : p.name === 'Jupiter' ? (
              // Jupiter: Multi-banded cloud stripes with Great Red Spot (Image reference)
              <group>
                <mesh>
                  <sphereGeometry args={[1.42, 36, 36]} />
                  <meshStandardMaterial color="#d97706" roughness={0.55} metalness={0.1} />
                </mesh>
                {[
                  { y: 0.65, h: 0.26, col: '#b45309', op: 0.8 },
                  { y: 0.35, h: 0.3, col: '#fef3c7', op: 0.85 },
                  { y: 0.04, h: 0.34, col: '#fde68a', op: 0.9 },
                  { y: -0.28, h: 0.32, col: '#9a3412', op: 0.85 },
                  { y: -0.64, h: 0.28, col: '#b45309', op: 0.8 },
                ].map((b, i) => (
                  <mesh key={i} position={[0, b.y, 0]}>
                    <cylinderGeometry args={[Math.sqrt(Math.max(0.1, 1.42**2 - b.y**2)) * 1.002, Math.sqrt(Math.max(0.1, 1.42**2 - b.y**2)) * 1.002, b.h, 36, 1, true]} />
                    <meshStandardMaterial color={b.col} transparent opacity={b.op} roughness={0.6} />
                  </mesh>
                ))}
                {/* The Great Red Spot */}
                <group position={[1.05, -0.32, 0.88]} rotation={[0.2, 0.75, -0.1]}>
                  <mesh>
                    <sphereGeometry args={[0.3, 16, 16]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.4} />
                  </mesh>
                </group>
              </group>
            ) : p.name === 'Saturn' ? (
              // Saturn: Golden gas giant with concentric tilted ring system & Cassini division
              <group>
                <mesh>
                  <sphereGeometry args={[1.14, 32, 32]} />
                  <meshStandardMaterial color="#fef08a" roughness={0.6} metalness={0.1} />
                </mesh>
                <mesh position={[0, 0, 0]}>
                  <cylinderGeometry args={[1.15, 1.15, 0.34, 32, 1, true]} />
                  <meshStandardMaterial color="#fde047" transparent opacity={0.65} />
                </mesh>
                {/* Tilted Concentric Rings (A, B, C with Cassini Division) */}
                <group rotation={[1.12, 0.38, -0.15]}>
                  {/* Inner C Ring */}
                  <mesh>
                    <ringGeometry args={[1.35, 1.65, 64]} />
                    <meshStandardMaterial color="#78350f" transparent opacity={0.45} side={THREE.DoubleSide} roughness={0.7} />
                  </mesh>
                  {/* Main B Ring */}
                  <mesh>
                    <ringGeometry args={[1.68, 2.22, 64]} />
                    <meshStandardMaterial color="#fef08a" transparent opacity={0.92} side={THREE.DoubleSide} roughness={0.45} />
                  </mesh>
                  {/* Cassini Division Gap */}
                  <mesh>
                    <ringGeometry args={[2.22, 2.29, 64]} />
                    <meshBasicMaterial color="#0f172a" transparent opacity={0.9} side={THREE.DoubleSide} />
                  </mesh>
                  {/* Outer A Ring */}
                  <mesh>
                    <ringGeometry args={[2.31, 2.75, 64]} />
                    <meshStandardMaterial color="#e2d4a7" transparent opacity={0.78} side={THREE.DoubleSide} roughness={0.5} />
                  </mesh>
                </group>
              </group>
            ) : p.name === 'Mars' ? (
              // Mars: Terracotta rust with dark basalt & white polar ice cap
              <group>
                <mesh>
                  <sphereGeometry args={[0.4, 28, 28]} />
                  <meshStandardMaterial color="#c2410c" roughness={0.75} metalness={0.1} />
                </mesh>
                <mesh position={[0.1, 0, 0.28]}>
                  <sphereGeometry args={[0.22, 16, 16]} />
                  <meshStandardMaterial color="#7c2d12" roughness={0.9} transparent opacity={0.65} />
                </mesh>
                <mesh position={[0, 0.38, 0]}>
                  <cylinderGeometry args={[0.08, 0.16, 0.05, 16]} />
                  <meshStandardMaterial color="#f8fafc" roughness={0.4} />
                </mesh>
              </group>
            ) : p.name === 'Uranus' ? (
              // Uranus: Pale cyan with vertical ring
              <group>
                <mesh>
                  <sphereGeometry args={[0.74, 28, 28]} />
                  <meshStandardMaterial color="#67e8f9" roughness={0.45} metalness={0.15} />
                </mesh>
                <mesh rotation={[0.2, 0, 1.52]}>
                  <ringGeometry args={[0.95, 1.12, 48]} />
                  <meshBasicMaterial color="#a5f3fc" transparent opacity={0.32} side={THREE.DoubleSide} />
                </mesh>
              </group>
            ) : p.name === 'Neptune' ? (
              // Neptune: Azure deep blue with methane clouds
              <group>
                <mesh>
                  <sphereGeometry args={[0.7, 28, 28]} />
                  <meshStandardMaterial color="#1d4ed8" roughness={0.45} metalness={0.2} />
                </mesh>
                <mesh position={[0, 0.12, 0]}>
                  <cylinderGeometry args={[0.706, 0.706, 0.22, 28, 1, true]} />
                  <meshStandardMaterial color="#38bdf8" transparent opacity={0.55} />
                </mesh>
              </group>
            ) : (
              // Mercury & Venus
              <group>
                <mesh>
                  <sphereGeometry args={[p.size, 24, 24]} />
                  <meshStandardMaterial color={p.color} roughness={0.7} metalness={0.15} />
                </mesh>
                {p.atmosphere && (
                  <mesh>
                    <sphereGeometry args={[p.size * 1.14, 24, 24]} />
                    <meshBasicMaterial color={p.atmosphere} transparent opacity={0.24} />
                  </mesh>
                )}
              </group>
            )}

            {/* Selection highlight wireframe sphere */}
            {selectedPlanet === p.name && (
              <mesh>
                <sphereGeometry args={[p.size * 1.5, 16, 16]} />
                <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.7} />
              </mesh>
            )}

            {/* 3D Pin Marker */}
            {showLabels && (
              <group position={[0, p.size + 0.5, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.015, 0.015, 0.38, 6]} />
                  <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} />
                </mesh>
                <mesh position={[0, 0.24, 0]}>
                  <sphereGeometry args={[0.09, 12, 12]} />
                  <meshBasicMaterial color={selectedPlanet === p.name ? '#38bdf8' : '#cbd5e1'} />
                </mesh>
              </group>
            )}
          </group>
        </group>
      ))}

      {/* 4. ASTEROID BELT BETWEEN MARS AND JUPITER */}
      <group>
        {asteroidPositions.map((pos, idx) => (
          <mesh key={idx} position={pos}>
            <dodecahedronGeometry args={[0.05, 0]} />
            <meshStandardMaterial color="#64748b" roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* 5. ACTIVE UPDATED SPACECRAFT TRAJECTORY & MINIATURIZED 3D CRAFT */}
      <group>
        {/* Glowing Hohmann Transfer Trajectory Arc */}
        {showOrbitLines && (
          <group>
            {trajectoryPoints.map((pt, i) => {
              if (i === 0) return null
              const prev = trajectoryPoints[i - 1]
              const mid: [number, number, number] = [
                (pt[0] + prev[0]) / 2,
                (pt[1] + prev[1]) / 2,
                (pt[2] + prev[2]) / 2,
              ]
              const dist = Math.hypot(pt[0] - prev[0], pt[1] - prev[1], pt[2] - prev[2])
              return (
                <mesh key={i} position={mid}>
                  <cylinderGeometry args={[0.032, 0.032, dist, 6]} />
                  <meshBasicMaterial color="#38bdf8" transparent opacity={0.7} />
                </mesh>
              )
            })}
          </group>
        )}

        {/* The 3D Spacecraft cruising through the solar system */}
        <SolarSystemActiveCraft
          spacecraftType={spacecraftType}
          position={spacecraftPos}
          rotation={spacecraftRot}
          isSelected={selectedPlanet === 'Spacecraft'}
          onSelect={() => onSelectPlanet('Spacecraft')}
        />
      </group>

      {/* 6. OUTER HELIOPAUSE BOUNDARY & INBOUND GCR PARTICLES (HIGHER SOLAR SYSTEM) */}
      {isHigher && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[72, 74.5, 96]} />
            <meshBasicMaterial color="#818cf8" transparent opacity={0.4} side={THREE.DoubleSide} />
          </mesh>
          <mesh>
            <sphereGeometry args={[78, 32, 24]} />
            <meshBasicMaterial color="#4f46e5" transparent opacity={0.06} side={THREE.BackSide} wireframe />
          </mesh>
          {[
            [74, 15, 30],
            [-72, -12, 40],
            [58, -20, -52],
            [-65, 22, -48],
          ].map((pos, i) => (
            <group key={i} position={pos as [number, number, number]}>
              <mesh rotation={[0.4, 0.8, -0.6]}>
                <cylinderGeometry args={[0.08, 0.08, 14, 6]} />
                <meshBasicMaterial color="#c084fc" transparent opacity={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  )
}

// --- HYBRID OVERVIEW SCENE ---
function OverviewScene(props: Props & { deploy: number; explode: number; radiationActive: boolean }) {
  return (
    <group>
      <group position={[0, 0, 0]} scale={1.25}>
        <ExpandableVehicle
          {...props}
          cutaway={false}
          explode={props.explode}
          deploy={props.deploy}
          showRays={true}
          autoRotate={props.autoRotate ?? true}
          radiationActive={props.radiationActive}
        />
      </group>

      <group position={[-24, 7, -26]}>
        <mesh>
          <sphereGeometry args={[2.8, 24, 24]} />
          <meshBasicMaterial color="#fef08a" />
        </mesh>
        <pointLight intensity={35} color="#fffbeb" distance={80} />
      </group>

      <group position={[14, -5, -22]}>
        <mesh>
          <sphereGeometry args={[1.2, 24, 24]} />
          <meshStandardMaterial color="#2563eb" roughness={0.7} />
        </mesh>
        <mesh>
          <sphereGeometry args={[1.35, 20, 20]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.25} />
        </mesh>
      </group>

      <group position={[-12, -4, 20]}>
        <mesh>
          <sphereGeometry args={[0.85, 20, 20]} />
          <meshStandardMaterial color="#ef4444" roughness={0.8} />
        </mesh>
      </group>

      <mesh rotation={[-0.3, 0.4, 0]} position={[0, -1.8, 0]}>
        <ringGeometry args={[12, 12.06, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// --- MAIN EXPORTED COMPONENT ---
export default function Spacecraft3D(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(props.initialMode || 'spacecraft')
  const [explode, setExplode] = useState(0)
  const [deploy, setDeploy] = useState(1)
  const [selectedPlanet, setSelectedPlanet] = useState('Spacecraft')
  const [simSpeed, setSimSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [cutawayState, setCutawayState] = useState(props.cutaway ?? false)
  const [showOverviewDrawer, setShowOverviewDrawer] = useState(true)
  const [autoRotate, setAutoRotate] = useState(true)
  const [showOrbitLines, setShowOrbitLines] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [viewPreset, setViewPreset] = useState<'infographic' | 'top' | 'spacecraft'>('infographic')

  const isShuttle = props.spacecraftType === 'Space Shuttle Orbiter' || props.spacecraftType === 'Space Shuttle' || !props.spacecraftType
  const [manualRadiation, setManualRadiation] = useState(false)

  useEffect(() => {
    if (props.isSimulating !== undefined) {
      setManualRadiation(props.isSimulating)
    }
  }, [props.isSimulating])

  const radiationActive = manualRadiation

  const handleToggleRadiation = () => {
    const nextState = !manualRadiation
    setManualRadiation(nextState)
    props.onToggleSimulating?.(nextState)
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().then(() => {
          setIsFullscreen(true)
        }).catch(() => {
          setIsFullscreen((prev) => !prev)
        })
      } else {
        setIsFullscreen((prev) => !prev)
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          setIsFullscreen(false)
        }).catch(() => {
          setIsFullscreen(false)
        })
      } else {
        setIsFullscreen(false)
      }
    }
  }

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        }
        setIsFullscreen(false)
      }
      if ((e.key === 'f' || e.key === 'F') && !['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        toggleFullscreen()
      }
    }

    document.addEventListener('fullscreenchange', handleFsChange)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  useEffect(() => {
    if (props.cutaway !== undefined) {
      setCutawayState(props.cutaway)
    }
  }, [props.cutaway])

  const cameraConfig = useMemo(() => {
    switch (viewMode) {
      case 'overview':
        return { position: [11, 7, 14] as [number, number, number], fov: 42, minDistance: 4, maxDistance: 32 }
      case 'innersystem':
        return {
          position: (viewPreset === 'top' ? [0, 58, 0.01] : viewPreset === 'spacecraft' ? [14, 8, 16] : [-24, 28, 42]) as [number, number, number],
          fov: 46,
          minDistance: 6,
          maxDistance: 120
        }
      case 'highersystem':
        return {
          position: (viewPreset === 'top' ? [0, 115, 0.01] : viewPreset === 'spacecraft' ? [16, 10, 18] : [-32, 38, 62]) as [number, number, number],
          fov: 48,
          minDistance: 12,
          maxDistance: 240
        }
      case 'spacecraft':
      default:
        return { position: [4.8, 3.2, 5.8] as [number, number, number], fov: 42, minDistance: 3.2, maxDistance: 18 }
    }
  }, [viewMode, viewPreset])

  const currentTargetInfo = useMemo(() => {
    if (viewMode === 'overview') return null
    if (selectedPlanet === 'Spacecraft') {
      return {
        name: `${props.spacecraftType || 'Space Shuttle Orbiter'} (Active Mission)`,
        type: 'Interplanetary Cruising Vehicle',
        dose: 'Active Shielded Exposure',
        status: `Trajectory: Earth-Mars Transfer · Shielding: ${props.material || 'Aluminum'} (${props.thickness || 12} mm) · Active Sensors: ${(props.detectors || []).length} Online · Continuous Stream Active`,
      }
    }
    if (selectedPlanet === 'Sun') {
      return {
        name: 'The Sun (Sol)',
        type: 'G2V Main Sequence Yellow Dwarf Star',
        dose: 'Solar Wind & Extreme SEP Source',
        status: 'Central gravitational powerhouse driving heliospheric magnetic flux, coronal mass ejections (CMEs), and energetic particle events throughout the system.',
      }
    }
    if (selectedPlanet === 'Moon') {
      return {
        name: 'The Moon (Luna)',
        type: 'Earth Natural Satellite',
        dose: 'Direct Vacuum GCR (0.35 mGy/day)',
        status: 'Distance: 384,400 km from Earth · Unshielded surface bombarded by solar wind and cosmic rays, creating secondary albedo neutrons.',
      }
    }
    const found = PLANETS.find((p) => p.name === selectedPlanet)
    if (found) {
      return {
        name: found.name,
        type: found.isOuter ? 'Gas / Ice Giant Planet' : 'Terrestrial Planet',
        dose: found.radiationLevel,
        status: `${found.au} · Orbital Period: ${found.period} · Magnetosphere: ${found.magneticShielding} · ${found.description}`,
      }
    }
    return null
  }, [viewMode, selectedPlanet, props.spacecraftType, props.material, props.thickness, deploy])

  return (
    <div
      ref={containerRef}
      className={`spacecraft-3d ${viewMode !== 'spacecraft' ? 'solar-view-active' : ''} ${isFullscreen ? 'fullscreen-active' : ''}`}
    >
      {/* --- TOP 3D NAVIGATION & VIEW MODE SWITCHER --- */}
      <div className="three-hud-top">
        <div className="three-mode-switch">
          <button
            className={viewMode === 'overview' ? 'active' : ''}
            onClick={() => setViewMode('overview')}
          >
            🌐 Overview
          </button>
          <button
            className={viewMode === 'spacecraft' ? 'active' : ''}
            onClick={() => setViewMode('spacecraft')}
          >
            🛰️ Spacecraft Detail
          </button>
          <button
            className={viewMode === 'innersystem' ? 'active' : ''}
            onClick={() => setViewMode('innersystem')}
          >
            🪐 Inner Solar System
          </button>
          <button
            className={viewMode === 'highersystem' ? 'active' : ''}
            onClick={() => setViewMode('highersystem')}
          >
            🌌 Complete Solar System
          </button>
        </div>

        {/* Quick View Controls */}
        <div className="three-hud-actions">
          <label className="radiation-mode-wrap" title="Select the radiation field to visualize">
            <span>FIELD</span>
            <select className="radiation-mode-select" value={props.radiationCategory || 'Galactic Cosmic Rays (GCR)'} onChange={(e) => props.onRadiationCategoryChange?.(e.target.value)}>
              <option>Galactic Cosmic Rays (GCR)</option>
              <option>Solar Energetic Particles (SEP)</option>
              <option>Trapped radiation</option>
              <option>Secondary particle shower</option>
            </select>
          </label>
          {/* PERSISTENT RADIATION STREAM TOGGLE BUTTON */}
          <button
            className={`hud-toggle ${radiationActive ? 'radiation-pulse-btn' : ''}`}
            onClick={handleToggleRadiation}
            title={radiationActive ? 'Halt continuous radiation stream' : 'Start continuous radiation stream (runs until you stop it)'}
          >
            {radiationActive ? '⏹ Stop Radiation' : '☢️ Start Radiation'}
          </button>

          <button className={`hud-toggle ${autoRotate ? 'active' : ''}`} onClick={() => setAutoRotate((value) => !value)} title={autoRotate ? 'Pause spacecraft rotation' : 'Resume spacecraft rotation'}>
            {autoRotate ? '⟳ Rotate on' : '⟳ Rotate off'}
          </button>

          {/* FULLSCREEN TOGGLE BUTTON */}
          <button
            className={`hud-toggle ${isFullscreen ? 'active fs-exit-btn' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Full Screen (Esc / F)' : 'Enter Full Screen Mode (F)'}
          >
            {isFullscreen ? '↙ Exit Fullscreen' : '⛶ Fullscreen'}
          </button>

          {viewMode === 'overview' ? (
            <button
              className={`hud-toggle ${showOverviewDrawer ? 'active' : ''}`}
              onClick={() => setShowOverviewDrawer(!showOverviewDrawer)}
              title="Toggle Overview Section Telemetry"
            >
              📋 {showOverviewDrawer ? 'Hide Details' : 'Overview Panel'}
            </button>
          ) : viewMode === 'spacecraft' ? (
            <>
              <button
                className={`hud-toggle ${cutawayState ? 'active' : ''}`}
                onClick={() => setCutawayState(!cutawayState)}
                title="Toggle Interior Cutaway"
              >
                {cutawayState ? '▣ Cutaway On' : '▢ Exterior'}
              </button>
              <button
                className={`hud-toggle ${explode > 0 ? 'active' : ''}`}
                onClick={() => setExplode(explode > 0 ? 0 : 0.85)}
                title="Explode / Expand Spacecraft Modules"
              >
                ⟛ {explode > 0 ? 'Collapse View' : 'Expand Modules'}
              </button>
            </>
          ) : (
            <>
              <button
                className="hud-toggle"
                onClick={() => setPaused(!paused)}
                title={paused ? 'Resume Simulation' : 'Pause Simulation'}
              >
                {paused ? '▶ Play' : '⏸ Pause'}
              </button>
              <button
                className="hud-toggle"
                onClick={() => setSimSpeed(simSpeed === 1 ? 2.5 : simSpeed === 2.5 ? 5 : 1)}
                title="Cycle Orbital Speed"
              >
                ⚡ {simSpeed}x
              </button>
            </>
          )}
        </div>
      </div>

      {/* --- LIVE RADIATION EVENT BANNER --- */}
      {radiationActive && (
        <div className="radiation-live-hud">
          <div className="radiation-hud-badge">
            <span className="rad-indicator" /> {props.radiationCategory || 'Galactic Cosmic Rays (GCR)'} · {props.particle || 'Protons'}
          </div>
          <div className="radiation-hud-metrics">
            <span>VISUALIZATION: <b>MODEL-GENERATED</b></span>
            <span>SHIELD CONFIG: <b>{props.material || 'Aluminum'} · {props.thickness || 12} mm</b></span>
            <span>PROVENANCE: <b>ILLUSTRATIVE · NOT MEASURED</b></span>
          </div>
        </div>
      )}

      {/* --- MISSION OVERVIEW SECTION OVERLAY --- */}
      {viewMode === 'overview' && showOverviewDrawer && (
        <div className="three-overview-section">
          <div className="overview-section-header">
            <div>
              <div className="overview-badge">DEEP SPACE FLIGHT TELEMETRY</div>
              <h4 className="overview-title">{props.scenario || 'Mars Transit'} · Mission Overview</h4>
            </div>
            <button
              className="overview-close-btn"
              onClick={() => setShowOverviewDrawer(false)}
              aria-label="Close Overview details"
            >
              ✕
            </button>
          </div>

          <div className="overview-stats-grid">
            <div className="overview-stat-cell">
              <span>SOLAR DISTANCE</span>
              <strong>1.28 <small>AU</small></strong>
              <small>Heliocentric orbital arc</small>
            </div>
            <div className="overview-stat-cell">
              <span>CRUISE VELOCITY</span>
              <strong>24.6 <small>km/s</small></strong>
              <small>Hohmann transfer corridor</small>
            </div>
            <div className="overview-stat-cell">
              <span>SHIELD ATTENUATION</span>
              <strong className="text-cyan">-38.2<small>%</small></strong>
              <small>{props.material || 'Aluminum'} · {props.thickness || 12} mm</small>
            </div>
            <div className="overview-stat-cell">
              <span>MISSION DOSE RATE</span>
              <strong className="text-amber">{radiationActive ? '0.248' : '0.164'} <small>Gy</small></strong>
              <small>{radiationActive ? 'Elevated particle influx' : '24h cumulative synthetic'}</small>
            </div>
          </div>

          <div className="overview-subsystems-bar">
            <span className="subsystem-pill active">
              <i className="status-dot green" /> Cargo Doors: {Math.round(deploy * 100)}% Open (Radiators Deployed)
            </span>
            <span className="subsystem-pill active">
              <i className="status-dot green" /> Canadarm RMS: Operational
            </span>
            <span className="subsystem-pill active">
              <i className="status-dot cyan" /> Active Detectors: {(props.detectors || []).length} Online
            </span>
            <span className="subsystem-pill active">
              <i className="status-dot blue" /> Propulsion: SSME & OMS Flight Ready
            </span>
          </div>

          <div className="overview-footer-actions">
            <button className="overview-action-btn" onClick={() => setViewMode('spacecraft')}>
              🔍 Inspect Spacecraft & Detectors
            </button>
            <button className="overview-action-btn" onClick={() => setViewMode('innersystem')}>
              🪐 Track in Solar System
            </button>
          </div>
        </div>
      )}

      {/* --- BOTTOM EXPANDABLE CONTROLS BAR (When in Spacecraft Mode) --- */}
      {viewMode === 'spacecraft' && (
        <div className="three-expandable-bar">
          <div className="slider-control">
            <span className="slider-label">
              <b>{isShuttle ? 'Payload Bay Doors & Canadarm' : 'Solar Wings / Panels'}</b>
              <small>{Math.round(deploy * 100)}%</small>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={deploy}
              onChange={(e) => setDeploy(parseFloat(e.target.value))}
            />
          </div>

          <div className="slider-control">
            <span className="slider-label">
              <b>Exploded Assembly View</b>
              <small>{Math.round(explode * 100)}%</small>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={explode}
              onChange={(e) => setExplode(parseFloat(e.target.value))}
            />
          </div>

          <div className="quick-expand-actions">
            <button
              className="mini-btn"
              onClick={() => {
                setDeploy(deploy < 0.5 ? 1 : 0)
              }}
            >
              {deploy < 0.5 ? (isShuttle ? 'Open Bay Doors' : 'Deploy Wings') : (isShuttle ? 'Close Doors' : 'Stow Wings')}
            </button>
            <button
              className="mini-btn"
              onClick={() => {
                setExplode(explode < 0.5 ? 0.9 : 0)
              }}
            >
              {explode < 0.5 ? 'Explode View' : 'Reassemble'}
            </button>
          </div>
        </div>
      )}

      {/* --- PLANET FOCUS & SOLAR SYSTEM CONTROLS BAR (When in Solar System Mode) --- */}
      {(viewMode === 'innersystem' || viewMode === 'highersystem') && (
        <div className="three-planet-bar">
          <div className="solar-hud-group">
            <span className="bar-title">VIEW:</span>
            <button
              className={`preset-btn ${viewPreset === 'infographic' ? 'active' : ''}`}
              onClick={() => setViewPreset('infographic')}
              title="Alamy Infographic Perspective (Sun on left, concentric elliptical orbits)"
            >
              🖼️ Infographic View
            </button>
            <button
              className={`preset-btn ${viewPreset === 'top' ? 'active' : ''}`}
              onClick={() => setViewPreset('top')}
              title="Top-Down Orbital Plan View"
            >
              🪐 Top-Down Plan
            </button>
            <button
              className={`preset-btn ${viewPreset === 'spacecraft' ? 'active' : ''}`}
              onClick={() => {
                setViewPreset('spacecraft')
                setSelectedPlanet('Spacecraft')
              }}
              title="Focus & Track Active Spacecraft"
            >
              🛰️ Track Craft
            </button>
          </div>

          <div className="solar-hud-divider" />

          <div className="solar-hud-group">
            <span className="bar-title">SPEED:</span>
            <button
              className={`speed-pill ${paused ? 'active' : ''}`}
              onClick={() => setPaused(!paused)}
            >
              {paused ? '▶ Play' : '⏸ Pause'}
            </button>
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                className={`speed-pill ${!paused && simSpeed === s ? 'active' : ''}`}
                onClick={() => {
                  setSimSpeed(s)
                  setPaused(false)
                }}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="solar-hud-divider" />

          <div className="solar-hud-group">
            <span className="bar-title">TOGGLES:</span>
            <button
              className={`toggle-pill ${showOrbitLines ? 'active' : ''}`}
              onClick={() => setShowOrbitLines(!showOrbitLines)}
              title="Toggle White Elliptical Orbit Lines"
            >
              ⚪ Orbits
            </button>
            <button
              className={`toggle-pill ${showLabels ? 'active' : ''}`}
              onClick={() => setShowLabels(!showLabels)}
              title="Toggle Planet Pins & Markers"
            >
              🏷️ Pins
            </button>
          </div>

          <div className="solar-hud-divider" />

          <div className="solar-hud-group planets-scroll">
            <span className="bar-title">TARGET:</span>
            {[
              { id: 'Spacecraft', label: '🛰️ Active Craft' },
              { id: 'Sun', label: '☀️ Sun' },
              { id: 'Mercury', label: '🪨 Mercury' },
              { id: 'Venus', label: '🟡 Venus' },
              { id: 'Earth', label: '🌍 Earth' },
              { id: 'Moon', label: '🌑 Moon' },
              { id: 'Mars', label: '🔴 Mars' },
              ...(viewMode === 'highersystem'
                ? [
                    { id: 'Jupiter', label: '🟠 Jupiter' },
                    { id: 'Saturn', label: '🪐 Saturn' },
                    { id: 'Uranus', label: '❄️ Uranus' },
                    { id: 'Neptune', label: '🔵 Neptune' },
                  ]
                : []),
            ].map((target) => (
              <button
                key={target.id}
                className={selectedPlanet === target.id ? 'active' : ''}
                onClick={() => {
                  setSelectedPlanet(target.id)
                  if (target.id === 'Spacecraft') setViewPreset('spacecraft')
                  else setViewPreset('infographic')
                }}
              >
                {target.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- TELEMETRY / TARGET HUD CARD --- */}
      {currentTargetInfo && (
        <div className="three-telemetry-card">
          <div className="telemetry-header">
            <span className="telemetry-title">{currentTargetInfo.name}</span>
            <span className="telemetry-type">{currentTargetInfo.type}</span>
          </div>
          <div className="telemetry-body">
            <div className="telemetry-row">
              <span>RADIATION ENVIRONMENT</span>
              <strong className="badge-cyan">{currentTargetInfo.dose}</strong>
            </div>
            <p className="telemetry-desc">{currentTargetInfo.status}</p>
          </div>
        </div>
      )}

      {/* --- THREE.JS CANVAS VIEWPORT --- */}
      <Canvas
        key={viewMode}
        camera={{ position: cameraConfig.position, fov: cameraConfig.fov }}
        dpr={[1, 1.7]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#070d17']} />
        <ambientLight intensity={viewMode === 'spacecraft' || viewMode === 'overview' ? 1.15 : 0.45} />
        {viewMode === 'spacecraft' || viewMode === 'overview' ? (
          <>
            <directionalLight position={[6, 9, 6]} intensity={2.2} />
            <pointLight position={[-6, -1, -3]} intensity={28} color="#238fc0" />
          </>
        ) : null}

        <Stars
          radius={viewMode === 'highersystem' ? 140 : 50}
          depth={viewMode === 'highersystem' ? 50 : 25}
          count={viewMode === 'highersystem' ? 900 : 450}
          factor={3}
          saturation={0}
          fade
          speed={0.15}
        />

        {viewMode === 'overview' ? (
          <OverviewScene {...props} deploy={deploy} explode={explode} radiationActive={radiationActive} autoRotate={autoRotate} />
        ) : viewMode === 'spacecraft' ? (
          <ExpandableVehicle
            {...props}
            cutaway={cutawayState}
            explode={explode}
            deploy={deploy}
            showRays={true}
            radiationActive={radiationActive}
            autoRotate={autoRotate}
          />
        ) : (
          <SolarSystemScene
            isHigher={viewMode === 'highersystem'}
            selectedPlanet={selectedPlanet}
            onSelectPlanet={setSelectedPlanet}
            simSpeed={paused ? 0 : simSpeed}
            radiationActive={radiationActive}
            spacecraftType={props.spacecraftType}
            material={props.material}
            thickness={props.thickness}
            showOrbitLines={showOrbitLines}
            showLabels={showLabels}
          />
        )}

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={cameraConfig.minDistance}
          maxDistance={cameraConfig.maxDistance}
          target={viewMode === 'spacecraft' || viewMode === 'overview' ? [0, 0, 0] : (viewPreset === 'top' ? [0, 0, 0] : [12, 0, 0])}
        />
      </Canvas>

      <span className="three-caption">
        {isFullscreen
          ? '⛶ FULLSCREEN MODE · PRESS ESC OR F TO EXIT · DRAG TO ROTATE · SCROLL TO ZOOM'
          : radiationActive
          ? '⚠️ CONTINUOUS RADIATION STREAM ACTIVE · RUNS UNTIL STOPPED · SOLAR CME & HELIOSPHERIC SHOCK'
          : viewMode === 'overview'
          ? 'MISSION OVERVIEW · SPACECRAFT FLIGHT TRAJECTORY IN HELIOCENTRIC SPACE · DRAG TO ROTATE'
          : viewMode === 'spacecraft'
          ? '3D HIGH-FIDELITY VEHICLE · DRAG TO ORBIT · SCROLL TO ZOOM · GRAB DETECTORS'
          : viewMode === 'innersystem'
          ? 'INNER SOLAR SYSTEM · HOHMANN TRANSFER TRAJECTORY · CLICK PLANETS OR ACTIVE CRAFT TO INSPECT'
          : 'COMPLETE SOLAR SYSTEM · REFERENCE INFOGRAPHIC PERSPECTIVE · WHITE CONCENTRIC ORBITS & ACTIVE SPACECRAFT'}
      </span>
    </div>
  )
}

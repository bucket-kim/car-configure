import { useLayoutEffect, useMemo, type FC } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { BuildSelection, Catalog, VisualEffect } from '@car-config/core'
import { selectedOptionIds } from '@car-config/core'
import { MATERIAL_PRESETS } from '../../../shared/const.ts'
import { useConfiguration } from '../../../hooks/useConfiguration.ts'

/* ------------------------------------------------------------------ */
/* Named material presets                                             */
/* ------------------------------------------------------------------ */
//
// `kind: "material"` names a finish ("Carbon_Weave") rather than describing
// one, so the catalog stays free of rendering detail. That name has to
// resolve somewhere, and this is the registry. A miss is logged, not thrown —
// a typo in the catalog should degrade to "unchanged", never a blank screen.

type Baseline = { color: number; metalness: number; roughness: number }

type SceneData = {
  materials: Map<string, THREE.MeshStandardMaterial[]>
  baseline: Map<string, Baseline>
}

const SCENE_DATA_KEY = '__carViewerSceneData'

function cloneSceneWithMaterials(scene: THREE.Object3D): THREE.Object3D {
  const root = scene.clone(true)
  const remap = new Map<THREE.Material, THREE.Material>()
  const materials = new Map<string, THREE.MeshStandardMaterial[]>()
  const baseline = new Map<string, Baseline>()

  const cloneOnce = (src: THREE.Material) => {
    let copy = remap.get(src)
    if (!copy) {
      copy = src.clone()
      copy.name = src.name // clone() keeps the name, but be explicit
      remap.set(src, copy)

      if (copy instanceof THREE.MeshStandardMaterial) {
        const list = materials.get(copy.name) ?? []
        list.push(copy)
        materials.set(copy.name, list)
        if (!baseline.has(copy.name)) {
          baseline.set(copy.name, {
            color: copy.color.getHex(),
            metalness: copy.metalness,
            roughness: copy.roughness,
          })
        }
      }
    }
    return copy
  }

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(cloneOnce)
      : cloneOnce(mesh.material)
  })

  root.userData[SCENE_DATA_KEY] = { materials, baseline } satisfies SceneData
  return root
}

function disposeSceneData(root: THREE.Object3D) {
  const data = root.userData[SCENE_DATA_KEY] as SceneData | undefined
  if (!data) return
  for (const list of data.materials.values()) for (const m of list) m.dispose()
  delete root.userData[SCENE_DATA_KEY]
}

function applyBuildToScene(root: THREE.Object3D, catalog: Catalog, build: BuildSelection) {
  const data = root.userData[SCENE_DATA_KEY] as SceneData | undefined
  if (!data) return

  const { materials, baseline } = data

  // Reset first. Effects mutate in place, so without a clean slate a
  // deselected option would leave its paint behind.
  for (const [name, list] of materials) {
    const base = baseline.get(name)
    if (!base) continue
    for (const m of list) {
      m.color.setHex(base.color)
      m.metalness = base.metalness
      m.roughness = base.roughness
    }
  }
  root.traverse((obj) => {
    obj.visible = true
  })

  const paint = (targetMaterial: string, apply: (m: THREE.MeshStandardMaterial) => void) => {
    const list = materials.get(targetMaterial)
    if (!list) {
      console.warn(`[CarViewer] no material named "${targetMaterial}" in this model`)
      return
    }
    for (const m of list) apply(m)
  }

  const setVisible = (name: string, visible: boolean) => {
    const obj = root.getObjectByName(name)
    if (!obj) {
      console.warn(`[CarViewer] no object named "${name}" in this model`)
      return
    }
    obj.visible = visible
  }

  const applyEffect = (effect: VisualEffect) => {
    switch (effect.kind) {
      case 'paint':
        paint(effect.targetMaterial, (m) => {
          m.color.set(effect.hex)
          m.metalness = effect.metallic
          m.roughness = effect.roughness
        })
        break

      case 'material': {
        const preset = MATERIAL_PRESETS[effect.materialName]
        if (!preset) {
          console.warn(`[CarViewer] unknown material preset "${effect.materialName}"`)
          break
        }
        paint(effect.targetMaterial, (m) => {
          m.color.set(preset.color)
          m.metalness = preset.metalness
          m.roughness = preset.roughness
        })
        break
      }

      case 'swapMesh':
        // Order matters: hide first, then show. An id appearing in both
        // lists should end up visible.
        for (const name of effect.hide) setVisible(name, false)
        for (const name of effect.show) setVisible(name, true)
        break

      case 'none':
        break
    }
  }

  const selected = selectedOptionIds(build)
  for (const option of catalog.options) {
    if (selected.has(option.id)) applyEffect(option.visual)
  }
}

interface CarViewerProps {
  catalog: Catalog
}

export const CarViewer: FC<CarViewerProps> = ({ catalog }) => {

  const { build } = useConfiguration(catalog)

  const model = catalog?.models.find((m) => m.id === build?.modelId)
  if (!model) throw new Error(`Unknown model: ${build?.modelId}`)

  const { scene } = useGLTF(model.modelUrl)

  const root = useMemo(() => cloneSceneWithMaterials(scene), [scene])

  // Our clones are ours to dispose; the cached originals are not.
  useLayoutEffect(() => {
    return () => disposeSceneData(root)
  }, [root])

  /* ---------------------------------------------------------------- */
  /* Apply the build — data-driven, never id-driven                    */
  /* ---------------------------------------------------------------- */

  useLayoutEffect(() => {
    if (!catalog || !build) return
    applyBuildToScene(root, catalog, build)
  }, [root, catalog, build])

  return (
    <>
      {/*
        An HDRI is doing more work here than every light below it combined.
        Car paint reads as paint because of what it reflects — with only
        directional lights, metalness has nothing to sample and the body goes
        flat matte. This is the first knob to turn, not the last.

        Note: drei's presets stream the .hdr from a CDN at runtime, and
        Environment suspends while it does. Its own Suspense boundary keeps a
        slow or unreachable CDN from holding the whole car off screen — the
        body renders immediately on the lights below, and the reflections pop
        in a moment later. To drop the network dependency entirely, install
        @pmndrs/assets and pass `files` instead of `preset`.
      */}


      <primitive object={root} />


    </>
  )
}

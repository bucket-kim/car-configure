import * as THREE from "three";

export type Baseline = { color: number; metalness: number; roughness: number };

export type SceneData = {
  materials: Map<string, THREE.MeshStandardMaterial[]>;
  baseline: Map<string, Baseline>;
};

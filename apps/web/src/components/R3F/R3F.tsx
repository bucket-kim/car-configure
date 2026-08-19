import type { Catalog } from "@car-config/core";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, type FC } from "react";
import Light from "./Lighting/Light.tsx";
import { CarViewer } from "./scene/CarViewer.tsx";

interface R3FProps {
  catalog: Catalog;
}

const R3F: FC<R3FProps> = ({ catalog }) => {
  // const DEMO_BUILD: BuildSelection = useMemo(() => ({
  //     modelId: '911-c4s',
  //     options: {
  //         'exterior-color': ['c-white'],
  //         wheels: ['w-carrera-s-20'],
  //         interior: ['i-black-leather'],
  //         packages: [],
  //     },
  // }), [])

  return (
    <Canvas
      shadows
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: -1,
      }}
      camera={{ position: [6, 3, 8], fov: 40 }}
    >
      <OrbitControls />
      <Suspense fallback={null}>
        <CarViewer catalog={catalog} />
      </Suspense>
      <Light />
    </Canvas>
  );
};

export default R3F;

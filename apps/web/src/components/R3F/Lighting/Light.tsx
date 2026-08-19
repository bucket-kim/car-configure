import { ContactShadows, Environment } from "@react-three/drei";
import { Fragment, Suspense } from "react";

const Light = () => {
  return (
    <Fragment>
      <Suspense fallback={null}>
        <Environment preset="studio" />
      </Suspense>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 5]} intensity={1.4} castShadow />
      <ContactShadows
        position={[0, -1.1, 0]}
        opacity={0.55}
        scale={18}
        blur={2.2}
        far={4}
      />
    </Fragment>
  );
};

export default Light;

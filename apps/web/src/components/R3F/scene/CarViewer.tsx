import type { Catalog } from "@car-config/core";
import { useGLTF } from "@react-three/drei";
import { Fragment, useLayoutEffect, useMemo, type FC } from "react";
import { useConfiguration } from "../../../hooks/useConfiguration.ts";
import {
  applyBuildToScene,
  cloneSceneWithMaterials,
  disposeSceneData,
} from "../../../shared/useCarViewerHelper.ts";

interface CarViewerProps {
  catalog: Catalog;
}

export const CarViewer: FC<CarViewerProps> = ({ catalog }) => {
  const { build } = useConfiguration(catalog);

  const model = catalog.models.find((m) => m.id === build.modelId);
  if (!model) throw new Error(`Unknown model: ${build.modelId}`);

  const { scene } = useGLTF(model.modelUrl);

  const root = useMemo(() => cloneSceneWithMaterials(scene), [scene]);

  // Our clones are ours to dispose; the cached originals are not.
  useLayoutEffect(() => {
    return () => disposeSceneData(root);
  }, [root]);

  useLayoutEffect(() => {
    if (!catalog || !build) return;
    applyBuildToScene(root, catalog, build);
  }, [root, catalog, build]);

  return (
    <Fragment>
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
    </Fragment>
  );
};

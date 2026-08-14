import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CarViewer } from './scene/CarViewer.tsx'
import Light from './Lighting/Light.tsx'
import { OrbitControls } from '@react-three/drei'


const R3F = () => {

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
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100dvh',
                zIndex: -1,
            }}
            camera={{ position: [6, 3, 8], fov: 40 }}
        >
            <OrbitControls />
            <Suspense fallback={null}>
                <CarViewer />
            </Suspense>
            <Light />
        </Canvas>
    )
}

export default R3F

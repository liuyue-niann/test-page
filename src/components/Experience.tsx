import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import TreeSystem from './TreeSystem';
import CrystalOrnaments from './CrystalOrnaments';

const Experience: React.FC = () => {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0, 18], fov: 45, near: 0.1, far: 100 }}
      gl={{ antialias: false, toneMapping: THREE.ReinhardToneMapping, toneMappingExposure: 1.5 }}
    >
      <color attach="background" args={['#020205']} />
      
      {/* Cinematic Lighting */}
      <ambientLight intensity={0.1} color="#001133" />
      <spotLight 
        position={[10, 20, 10]} 
        angle={0.5} 
        penumbra={1} 
        intensity={10} 
        color="#fff0dd" 
        castShadow 
      />
      <pointLight position={[-10, -5, -10]} intensity={2} color="#004225" />
      <pointLight position={[0, 5, 0]} intensity={1} color="#ffaa00" distance={10} />
      
      {/* Environment */}
      <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <Sparkles count={300} scale={20} size={3} speed={0.4} opacity={0.5} color="#ffd700" />
      <Environment preset="night" />

      {/* Main Content */}
      <group position={[0, -3, 0]}>
        <TreeSystem />
        <CrystalOrnaments />
      </group>

      {/* Controls */}
      <OrbitControls 
        enablePan={false} 
        enableZoom={true} 
        minDistance={5} 
        maxDistance={40}
        maxPolarAngle={Math.PI / 1.5}
        autoRotate={false}
        enableDamping
      />

      {/* Post Processing */}
      <EffectComposer disableNormalPass>
        <DepthOfField 
          focusDistance={0} 
          focalLength={0.02} 
          bokehScale={6} 
          height={480} 
        />
        <Bloom 
          luminanceThreshold={1.1} 
          mipmapBlur 
          intensity={0.8} 
          radius={0.7}
        />
        <Noise opacity={0.05} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </Canvas>
  );
};

export default Experience;

import React, { useContext } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import TreeSystem from './TreeSystem';
import CrystalOrnaments from './CrystalOrnaments';
import { TreeContext, TreeContextType } from '../types';

const Rig = () => {
  const { state } = useContext(TreeContext) as TreeContextType;
  useFrame((state3d) => {
    // Gentle floating camera movement
    const t = state3d.clock.getElapsedTime();
    // Move camera out when Chaos, in when Formed
    const targetZ = state === 'CHAOS' ? 22 : 16;
    const targetY = state === 'CHAOS' ? 2 : 0;
    
    state3d.camera.position.z = THREE.MathUtils.lerp(state3d.camera.position.z, targetZ + Math.sin(t * 0.2) * 2, 0.02);
    state3d.camera.position.y = THREE.MathUtils.lerp(state3d.camera.position.y, targetY + Math.cos(t * 0.2) * 1, 0.02);
    state3d.camera.lookAt(0, 0, 0);
  });
  return null;
};

const Experience: React.FC = () => {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0, 18], fov: 45, near: 0.1, far: 100 }}
      gl={{ 
        antialias: false, 
        toneMapping: THREE.ReinhardToneMapping, 
        toneMappingExposure: 1.5,
        stencil: false,
        depth: true
      }}
    >
      <color attach="background" args={['#010103']} />
      
      {/* Cinematic Lighting */}
      <ambientLight intensity={0.4} color="#001133" />
      <spotLight 
        position={[10, 20, 10]} 
        angle={0.5} 
        penumbra={1} 
        intensity={8} 
        color="#fff0dd" 
        castShadow 
      />
      <pointLight position={[-10, -5, -10]} intensity={3} color="#004225" />
      <pointLight position={[0, 0, 0]} intensity={1} color="#ffaa00" distance={10} />
      
      {/* Environment */}
      <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <Sparkles count={200} scale={20} size={2} speed={0.4} opacity={0.3} color="#ffd700" />
      <Environment preset="city" environmentIntensity={0.5} />

      {/* Main Content */}
      <group position={[0, -2, 0]}>
        <TreeSystem />
        <CrystalOrnaments />
      </group>

      {/* Controls & Rig */}
      <OrbitControls 
        enablePan={false} 
        enableZoom={true} 
        minDistance={8} 
        maxDistance={40}
        maxPolarAngle={Math.PI / 1.6}
        target={[0, 2, 0]}
      />
      <Rig />

      {/* Post Processing - Optimized for Clarity (No DoF) */}
      <EffectComposer enableNormalPass={false}>
        <Bloom 
          luminanceThreshold={1.0} 
          mipmapBlur 
          intensity={0.6} 
          radius={0.4} 
          levels={8}
        />
        <Noise opacity={0.04} />
        <Vignette eskil={false} offset={0.1} darkness={1.0} />
      </EffectComposer>
    </Canvas>
  );
};

export default Experience;

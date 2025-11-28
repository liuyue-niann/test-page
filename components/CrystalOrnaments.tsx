import React, { useContext, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { TreeContext } from '../types';

const CrystalOrnaments: React.FC = () => {
  const { state, rotationSpeed } = useContext(TreeContext);
  const groupRef = useRef<THREE.Group>(null);
  
  // Progress & Rotation State
  const progress = useRef(0);
  const treeRotation = useRef(0);

  // Generate static data for ornaments
  const ornaments = useMemo(() => {
    const count = 40;
    const items = [];
    
    for (let i = 0; i < count; i++) {
        // Tree Form Data
        const t = i / count;
        const h = t * 11 - 5.5; 
        const r = (6 - (h + 5.5)) * 0.5 + 0.5;
        const angle = t * Math.PI * 13; // Lots of wraps
        
        // Chaos Form Data
        const chaosPos = [
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
        ];

        // Type
        const type = Math.random() > 0.6 ? 'sphere' : (Math.random() > 0.5 ? 'box' : 'octahedron');
        const color = Math.random() > 0.5 ? '#ff3333' : '#ffd700';

        items.push({
            id: i,
            chaosPos: new THREE.Vector3(...chaosPos),
            treeCyl: { h, r, angle },
            type,
            color,
            scale: Math.random() * 0.3 + 0.2
        });
    }
    return items;
  }, []);

  useFrame((state3d, delta) => {
    const targetProgress = state === 'FORMED' ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.0, delta);
    const p = progress.current;
    const ease = p * p * (3 - 2 * p);

    const spinFactor = state === 'FORMED' ? rotationSpeed : 0.05;
    treeRotation.current += spinFactor * delta;

    if (groupRef.current) {
        groupRef.current.children.forEach((child, i) => {
            // Skip the star (last child usually, or identified by name)
            if (child.name === 'STAR') {
                // Animate Star separately (always at top)
                const starY = THREE.MathUtils.lerp(10, 7.5, ease);
                child.position.set(0, starY, 0);
                child.rotation.y += delta * 0.5;
                child.rotation.z = Math.sin(state3d.clock.elapsedTime) * 0.1;
                // Scale pulse
                const s = 1.5 + Math.sin(state3d.clock.elapsedTime * 3) * 0.1;
                child.scale.setScalar(THREE.MathUtils.lerp(0, s, ease));
                return;
            }

            const data = ornaments[i];
            if (!data) return;

            // Chaos
            const cx = data.chaosPos.x;
            const cy = data.chaosPos.y;
            const cz = data.chaosPos.z;
            const cr = Math.sqrt(cx*cx + cz*cz);
            const cAngle = Math.atan2(cz, cx);

            // Tree
            const { h, r, angle } = data.treeCyl;

            // Interpolate
            const y = THREE.MathUtils.lerp(cy, h, ease);
            const currentR = THREE.MathUtils.lerp(cr, r, ease);
            
            const vortexTwist = (1 - ease) * 12.0;
            const currentAngle = angle + vortexTwist + treeRotation.current;

            // Chaos Orbit
            const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.3);
            const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.3);

            const tX = currentR * Math.cos(currentAngle);
            const tZ = currentR * Math.sin(currentAngle);

            child.position.x = THREE.MathUtils.lerp(cRotatedX, tX, ease);
            child.position.y = y;
            child.position.z = THREE.MathUtils.lerp(cRotatedZ, tZ, ease);

            // Rotate objects
            child.rotation.x += delta * (1 - ease);
            child.rotation.y += delta * (1 - ease);
        });
    }
  });

  // Reusable Material Props
  const materialProps = {
    thickness: 0.2,
    roughness: 0,
    transmission: 1,
    ior: 1.5,
    chromaticAberration: 0.1, // High dispersion for crystal look
    backside: true,
  };

  return (
    <group ref={groupRef}>
      {ornaments.map((o, i) => (
        <mesh key={i} scale={o.scale} castShadow receiveShadow>
          {o.type === 'sphere' && <sphereGeometry args={[1, 32, 32]} />}
          {o.type === 'box' && <boxGeometry args={[1.2, 1.2, 1.2]} />}
          {o.type === 'octahedron' && <octahedronGeometry args={[1, 0]} />}
          
          <MeshTransmissionMaterial 
            {...materialProps} 
            color={o.color} 
            distortion={0.5} 
            distortionScale={0.5} 
          />
        </mesh>
      ))}

      {/* TOP STAR */}
      <mesh name="STAR" position={[0, 7.5, 0]}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial 
          color="#ffdd00" 
          emissive="#ffaa00"
          emissiveIntensity={4}
          roughness={0.1}
          metalness={1}
        />
        <pointLight intensity={2} color="#ffaa00" distance={5} decay={2} />
      </mesh>
    </group>
  );
};

export default CrystalOrnaments;
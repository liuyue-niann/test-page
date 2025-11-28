import React, { useContext, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeContext } from '../types';

const CrystalOrnaments: React.FC = () => {
  const { state, rotationSpeed } = useContext(TreeContext);
  const groupRef = useRef<THREE.Group>(null);
  
  const progress = useRef(0);
  const treeRotation = useRef(0);

  const ornaments = useMemo(() => {
    const count = 60; // 稍微再多加几个装饰品，让颜色更丰富
    const items = [];
    
    // 定义颜色池：圣诞红、金、圣诞绿
    const colors = ['#D32F2F', '#FFD700', '#2E7D32'];

    for (let i = 0; i < count; i++) {
        // Tree Form Data
        const t = i / count;
        const h = t * 11 - 5.5; 
        const r = (6 - (h + 5.5)) * 0.5 + 0.5;
        const angle = t * Math.PI * 13;
        
        // Chaos Form Data (保持在照片外圈)
        const radius = 10 + Math.random() * 12;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        const chaosPos = [
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.sin(phi) * Math.sin(theta),
            radius * Math.cos(phi)
        ];

        // Type
        const type = Math.random() > 0.5 ? 'sphere' : 'box';
        
        // --- 修改重点：添加绿色 ---
        // 随机从颜色池中取一个颜色
        const color = colors[Math.floor(Math.random() * colors.length)];

        items.push({
            id: i,
            chaosPos: new THREE.Vector3(...chaosPos),
            treeCyl: { h, r, angle },
            type,
            color,
            scale: Math.random() * 0.2 + 0.15 
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
            if (child.name === 'STAR') {
                const starY = THREE.MathUtils.lerp(10, 7.5, ease);
                child.position.set(0, starY, 0);
                child.rotation.y += delta * 0.5;
                const s = 1.0 + Math.sin(state3d.clock.elapsedTime * 3) * 0.1;
                child.scale.setScalar(THREE.MathUtils.lerp(0, s, ease));
                return;
            }

            const data = ornaments[i];
            if (!data) return;

            const cx = data.chaosPos.x;
            const cy = data.chaosPos.y;
            const cz = data.chaosPos.z;
            const cr = Math.sqrt(cx*cx + cz*cz);
            const cAngle = Math.atan2(cz, cx);

            const { h, r, angle } = data.treeCyl;

            const y = THREE.MathUtils.lerp(cy, h, ease);
            const currentR = THREE.MathUtils.lerp(cr, r, ease);
            
            const vortexTwist = (1 - ease) * 12.0;
            const currentAngle = angle + vortexTwist + treeRotation.current;

            const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.1);
            const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.1);

            const tX = currentR * Math.cos(currentAngle);
            const tZ = currentR * Math.sin(currentAngle);

            child.position.x = THREE.MathUtils.lerp(cRotatedX, tX, ease);
            child.position.y = y;
            child.position.z = THREE.MathUtils.lerp(cRotatedZ, tZ, ease);

            child.rotation.x += delta * (1 - ease);
            child.rotation.y += delta * (1 - ease);
        });
    }
  });

  return (
    <group ref={groupRef}>
      {ornaments.map((o, i) => (
        <mesh key={i} scale={o.scale} castShadow receiveShadow>
          {o.type === 'sphere' && <sphereGeometry args={[1, 32, 32]} />}
          {o.type === 'box' && <boxGeometry args={[1, 1, 1]} />}
          
          {/* 关键修改：材质参数调整 */}
          <meshStandardMaterial 
            color={o.color} 
            roughness={0.2}
            metalness={0.5}        /* 降低金属感：从 0.8 降到 0.5，减少变黑的情况 */
            emissive={o.color}
            emissiveIntensity={0.8} /* 提高自发光：从 0.4 升到 0.8，确保在黑背景下发亮 */
          />
        </mesh>
      ))}

      {/* TOP STAR */}
      <mesh name="STAR" position={[0, 7.5, 0]}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial 
          color="#ffdd00" 
          emissive="#ffaa00"
          emissiveIntensity={3}
          roughness={0.2}
          metalness={1.0}
          toneMapped={false}
        />
        <pointLight intensity={2} color="#ffaa00" distance={8} decay={2} />
      </mesh>
    </group>
  );
};

export default CrystalOrnaments;
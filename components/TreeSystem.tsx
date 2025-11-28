
import React, { useRef, useMemo, useContext, useState, useEffect } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, useTexture } from '@react-three/drei';
import * as maath from 'maath/random/dist/maath-random.esm';
import { TreeContext, ParticleData, TreeContextType } from '../types';

// --- Custom Shaders ---

const FoliageMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#004225'),
    uColorAccent: new THREE.Color('#00fa9a'),
    uPixelRatio: 1,
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uPixelRatio;
    attribute float size;
    varying vec3 vPosition;
    varying float vBlink;
    varying float vDistance;

    // Curl noise function (Simplex-like)
    vec3 curl(float x, float y, float z) {
        float eps = 1., n1, n2, a, b;
        x /= eps; y /= eps; z /= eps;
        vec3 curl = vec3(0.);
        n1 = sin(y + cos(z + uTime));
        n2 = cos(x + sin(z + uTime));
        curl.x = n1 - n2;
        n1 = sin(z + cos(x + uTime));
        n2 = cos(y + sin(x + uTime));
        curl.y = n1 - n2;
        n1 = sin(x + cos(y + uTime));
        n2 = cos(z + sin(y + uTime));
        curl.z = n1 - n2;
        return curl * 0.15;
    }

    void main() {
      vPosition = position;
      
      // Add curl noise for organic movement
      vec3 distortedPosition = position + curl(position.x, position.y, position.z);
      
      vec4 mvPosition = modelViewMatrix * vec4(distortedPosition, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      // Size attenuation
      gl_PointSize = size * uPixelRatio * (50.0 / -mvPosition.z);
      
      // Blink animation
      vBlink = sin(uTime * 3.0 + position.y * 2.0 + position.x * 2.0);
      vDistance = -mvPosition.z;
    }
  `,
  // Fragment Shader
  `
    uniform vec3 uColor;
    uniform vec3 uColorAccent;
    varying float vBlink;

    void main() {
      // Circular particle
      vec2 xy = gl_PointCoord.xy - vec2(0.5);
      float ll = length(xy);
      if(ll > 0.5) discard;
      
      // Sharp core, soft glow
      float strength = pow(1.0 - ll * 2.0, 4.0);
      
      // Mix colors based on blink
      vec3 color = mix(uColor, uColorAccent, smoothstep(-0.5, 1.0, vBlink));
      
      gl_FragColor = vec4(color, strength);
    }
  `
);

extend({ FoliageMaterial });

// --- Photo Component ---
const PolaroidPhoto: React.FC<{ 
  url: string; 
  position: THREE.Vector3; 
  rotation: THREE.Euler; 
  scale: number;
  opacity?: number;
}> = ({ url, position, rotation, scale, opacity = 1 }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('Anonymous');
    loader.load(
      url,
      (tex) => {
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 16;
        setTexture(tex);
      },
      undefined,
      (err) => {
        console.warn(`Failed to load texture: ${url}`);
      }
    );
  }, [url]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Photo Frame (Back/Border) */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[1, 1.25, 0.02]} />
        <meshStandardMaterial 
          color="#f5f5f5" 
          roughness={0.4} 
          metalness={0.1} 
        />
      </mesh>
      
      {/* The Image */}
      <mesh position={[0, 0.15, 0.015]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshBasicMaterial 
          map={texture}
          color={texture ? 'white' : '#e0e0e0'}
          toneMapped={false}
        />
      </mesh>
      
      {/* Glossy Coating */}
      <mesh position={[0, 0.15, 0.016]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshPhysicalMaterial 
          transparent 
          opacity={0.1} 
          roughness={0.1} 
          metalness={0.5} 
          color="white"
        />
      </mesh>
    </group>
  );
};

// --- Main Tree System ---

const TreeSystem: React.FC = () => {
  const { state, rotationSpeed } = useContext(TreeContext) as TreeContextType;
  const pointsRef = useRef<THREE.Points>(null);
  const lightsRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.Mesh>(null);
  
  // Transition Progress: 0 = Chaos, 1 = Formed
  const progress = useRef(0);
  const treeRotation = useRef(0);
  
  // We manage Photo positions manually in the useFrame loop
  const [photoObjects, setPhotoObjects] = useState<{
    id: string;
    url: string;
    ref: React.MutableRefObject<THREE.Group | null>;
    data: ParticleData;
    pos: THREE.Vector3;
    rot: THREE.Euler;
    scale: number;
  }[]>([]);

  // --- Data Generation ---
  const { foliageData, photosData, lightsData } = useMemo(() => {
    // 1. Generate Foliage Particles
    const particleCount = 4500;
    const foliage = new Float32Array(particleCount * 3); 
    const foliageChaos = new Float32Array(particleCount * 3);
    const foliageTree = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    const sphere = maath.inSphere(new Float32Array(particleCount * 3), { radius: 18 });
    for (let i = 0; i < particleCount * 3; i++) foliageChaos[i] = sphere[i];

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const h = Math.random() * 14; 
      const coneRadius = (14 - h) * 0.45;
      const angle = h * 3.0 + Math.random() * Math.PI * 2;
      
      foliageTree[i3] = Math.cos(angle) * coneRadius; 
      foliageTree[i3 + 1] = h - 6; 
      foliageTree[i3 + 2] = Math.sin(angle) * coneRadius;
      
      sizes[i] = Math.random() * 1.5 + 0.5;
    }

    // 2. Generate Fairy Lights
    const lightCount = 300; // Increased count
    const lightChaos = new Float32Array(lightCount * 3);
    const lightTree = new Float32Array(lightCount * 3);
    const lSphere = maath.inSphere(new Float32Array(lightCount * 3), { radius: 20 });
    
    for(let i=0; i<lightCount * 3; i++) lightChaos[i] = lSphere[i];

    for(let i=0; i<lightCount; i++) {
      const i3 = i * 3;
      const t = i / lightCount;
      const h = t * 13; // 0 to 13
      const coneRadius = (14 - h) * 0.48; // Slightly wider than foliage
      const angle = t * Math.PI * 25; // High frequency spiral
      
      lightTree[i3] = Math.cos(angle) * coneRadius;
      lightTree[i3+1] = h - 6;
      lightTree[i3+2] = Math.sin(angle) * coneRadius;
    }

    // 3. Generate Photo Metadata
    const photoCount = 31;
    const photos: ParticleData[] = [];
    for (let i = 0; i < photoCount; i++) {
        // 树形态逻辑 (Tree Form) - 保持不变
        const t = i / (photoCount - 1);
        const h = t * 10 - 5; 
        const radius = (6 - (h + 5)) * 0.6 + 1.8; 
        const angle = t * Math.PI * 8; 
        
        // --- 修改开始：优化散开位置与朝向 ---
        
        // 1. 位置优化 (Position): 扩大散开范围，解决紧凑问题
        const rTheta = Math.random() * Math.PI * 2;
        const rPhi = Math.acos(2 * Math.random() - 1);
        
        // 修改点：半径从原来的 2-8 扩大到 6-16，让照片散得更开，占据屏幕
        const rRad = 6 + Math.random() * 10; 

        // 计算散开坐标
        const chaosX = rRad * Math.sin(rPhi) * Math.cos(rTheta);
        // Y轴稍微压缩一点点 (0.9)，避免照片跑得太高或太低超出屏幕
        const chaosY = (rRad * Math.sin(rPhi) * Math.sin(rTheta)) * 0.9; 
        const chaosZ = rRad * Math.cos(rPhi);

        // 2. 旋转优化 (Rotation): 让照片正面朝前，带一点点随机倾斜
        // 之前是完全随机 (Math.PI)，现在改为 0 附近的微小偏移
        // (Math.random() - 0.5) * 0.5 大约是 ±15度
        const chaosRotX = (Math.random() - 0.5) * 0.5; 
        const chaosRotY = (Math.random() - 0.5) * 0.5; 
        const chaosRotZ = (Math.random() - 0.5) * 0.2; // Z轴倾斜稍微小一点，保持水平感

        // --- 修改结束 ---

        photos.push({
            id: `photo-${i}`,
            type: 'PHOTO',
            chaosPos: [chaosX, chaosY, chaosZ],
            treePos: [
                Math.cos(angle) * radius,
                h,
                Math.sin(angle) * radius
            ],
            chaosRot: [chaosRotX, chaosRotY, chaosRotZ], // 应用新的朝向
            treeRot: [0, -angle + Math.PI / 2, 0], 
            scale: 0.9 + Math.random() * 0.3,
            image: `https://picsum.photos/seed/${i + 55}/400/500`, // 如果你有本地照片，记得这里逻辑是读取 bodyPhotoPaths
            color: 'white'
        });
    }

    return { 
        foliageData: { current: foliage, chaos: foliageChaos, tree: foliageTree, sizes }, 
        lightsData: { chaos: lightChaos, tree: lightTree, count: lightCount },
        photosData: photos 
    };
  }, []);

  useEffect(() => {
    setPhotoObjects(photosData.map(p => ({
      id: p.id,
      url: p.image!,
      ref: React.createRef(),
      data: p,
      pos: new THREE.Vector3(),
      rot: new THREE.Euler(),
      scale: p.scale
    })));
  }, [photosData]);

  // --- Animation Loop ---
  useFrame((state3d, delta) => {
    // 1. Update State Progress
    const targetProgress = state === 'FORMED' ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.0, delta);
    const p = progress.current;
    const ease = p * p * (3 - 2 * p);

    // 2. Global Rotation
    const spinFactor = state === 'FORMED' ? rotationSpeed : 0.05;
    treeRotation.current += spinFactor * delta;

    // 3. Update Foliage Points
    if (pointsRef.current) {
        // @ts-ignore
        pointsRef.current.material.uniforms.uTime.value = state3d.clock.getElapsedTime();
        const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;

        for (let i = 0; i < positions.length / 3; i++) {
            const i3 = i * 3;
            // Vortex Math
            const cx = foliageData.chaos[i3];
            const cy = foliageData.chaos[i3+1];
            const cz = foliageData.chaos[i3+2];
            const tx = foliageData.tree[i3];
            const ty = foliageData.tree[i3+1];
            const tz = foliageData.tree[i3+2];

            const y = THREE.MathUtils.lerp(cy, ty, ease);
            const tr = Math.sqrt(tx*tx + tz*tz);
            const tAngle = Math.atan2(tz, tx);
            const cr = Math.sqrt(cx*cx + cz*cz);
            const r = THREE.MathUtils.lerp(cr, tr, ease);
            
            const vortexTwist = (1 - ease) * 15.0;
            const currentAngle = tAngle + vortexTwist + treeRotation.current;

            const formedX = r * Math.cos(currentAngle);
            const formedZ = r * Math.sin(currentAngle);
            
            const cAngle = Math.atan2(cz, cx);
            const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.5);
            const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.5);

            positions[i3]   = THREE.MathUtils.lerp(cRotatedX, formedX, ease);
            positions[i3+1] = y;
            positions[i3+2] = THREE.MathUtils.lerp(cRotatedZ, formedZ, ease);
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // 4. Update Lights (InstancedMesh)
    if (lightsRef.current) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < lightsData.count; i++) {
             const i3 = i * 3;
             const cx = lightsData.chaos[i3];
             const cy = lightsData.chaos[i3+1];
             const cz = lightsData.chaos[i3+2];
             const tx = lightsData.tree[i3];
             const ty = lightsData.tree[i3+1];
             const tz = lightsData.tree[i3+2];

             const y = THREE.MathUtils.lerp(cy, ty, ease);
             const tr = Math.sqrt(tx*tx + tz*tz);
             const tAngle = Math.atan2(tz, tx);
             const cr = Math.sqrt(cx*cx + cz*cz);
             const r = THREE.MathUtils.lerp(cr, tr, ease);
             
             const vortexTwist = (1 - ease) * 12.0;
             const currentAngle = tAngle + vortexTwist + treeRotation.current;
             
             const cAngle = Math.atan2(cz, cx);
             const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.3);
             const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.3);
             
             const fx = THREE.MathUtils.lerp(cRotatedX, r * Math.cos(currentAngle), ease);
             const fz = THREE.MathUtils.lerp(cRotatedZ, r * Math.sin(currentAngle), ease);

             dummy.position.set(fx, y, fz);
             dummy.scale.setScalar(1);
             dummy.updateMatrix();
             lightsRef.current.setMatrixAt(i, dummy.matrix);
        }
        lightsRef.current.instanceMatrix.needsUpdate = true;
    }

    // 5. Update Trunk
    if (trunkRef.current) {
        // Fade in and scale up trunk only when forming
        const trunkScale = THREE.MathUtils.smoothstep(ease, 0.3, 1.0);
        trunkRef.current.scale.set(trunkScale, ease, trunkScale);
        trunkRef.current.position.y = 1; // Center offset
        trunkRef.current.rotation.y = treeRotation.current;
    }

    // 6. Update Photos
    photoObjects.forEach((obj) => {
        if (!obj.ref.current) return;
        const { chaosPos, treePos, chaosRot, treeRot } = obj.data;
        const [cx, cy, cz] = chaosPos;
        const [tx, ty, tz] = treePos;
        
        const y = THREE.MathUtils.lerp(cy, ty, ease);
        const cr = Math.sqrt(cx*cx + cz*cz);
        const tr = Math.sqrt(tx*tx + tz*tz);
        const r = THREE.MathUtils.lerp(cr, tr, ease);
        
        const tAngle = Math.atan2(tz, tx);
        const vortexTwist = (1 - ease) * 10.0;
        const currentAngle = tAngle + vortexTwist + treeRotation.current;
        
        const cAngle = Math.atan2(cz, cx);
        const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.2);
        const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.2);
        
        const targetX = r * Math.cos(currentAngle);
        const targetZ = r * Math.sin(currentAngle);
        
        obj.ref.current.position.set(
            THREE.MathUtils.lerp(cRotatedX, targetX, ease),
            y,
            THREE.MathUtils.lerp(cRotatedZ, targetZ, ease)
        );

        const lookAtAngle = -currentAngle + Math.PI / 2;
        obj.ref.current.rotation.x = THREE.MathUtils.lerp(chaosRot[0], treeRot[0], ease);
        obj.ref.current.rotation.y = THREE.MathUtils.lerp(chaosRot[1], lookAtAngle, ease);
        obj.ref.current.rotation.z = THREE.MathUtils.lerp(chaosRot[2], treeRot[2], ease);
    });
  });

  return (
    <group>
      {/* Tree Trunk */}
      <mesh ref={trunkRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.8, 14, 8]} />
        <meshStandardMaterial 
            color="#3E2723" 
            roughness={0.9} 
            metalness={0.1}
        />
      </mesh>

      {/* Foliage Particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={foliageData.current.length / 3}
            array={foliageData.current}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-size"
            count={foliageData.sizes.length}
            array={foliageData.sizes}
            itemSize={1}
          />
        </bufferGeometry>
        {/* @ts-ignore */}
        <foliageMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>

      {/* Fairy Lights - Small and bright */}
      <instancedMesh ref={lightsRef} args={[undefined, undefined, lightsData.count]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial 
            color="#ffddaa" 
            emissive="#ffbb00" 
            emissiveIntensity={3} 
            toneMapped={false}
        />
      </instancedMesh>

      {/* Photos */}
      {photoObjects.map((obj) => (
        <group key={obj.id} ref={obj.ref}>
          <PolaroidPhoto 
            url={obj.url} 
            position={new THREE.Vector3(0,0,0)} 
            rotation={new THREE.Euler(0,0,0)} 
            scale={obj.scale} 
          />
        </group>
      ))}
    </group>
  );
};

export default TreeSystem;

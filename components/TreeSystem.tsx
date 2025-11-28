import React, { useRef, useMemo, useContext, useState, useEffect } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, useTexture } from '@react-three/drei';
import * as maath from 'maath/random/dist/maath-random.esm';
import { TreeContext } from '../App';
import { ParticleData } from '../types';

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
        return curl * 0.1;
    }

    void main() {
      vPosition = position;
      
      // Add curl noise for organic movement
      vec3 distortedPosition = position + curl(position.x, position.y, position.z);
      
      vec4 mvPosition = modelViewMatrix * vec4(distortedPosition, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      // Size attenuation
      gl_PointSize = size * uPixelRatio * (60.0 / -mvPosition.z);
      
      // Blink animation
      vBlink = sin(uTime * 2.0 + position.y * 5.0 + position.x);
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
      
      // Soft glow edge
      float strength = pow(1.0 - ll * 2.0, 3.0);
      
      // Mix colors based on blink
      vec3 color = mix(uColor, uColorAccent, smoothstep(-0.8, 0.8, vBlink));
      
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
  const texture = useTexture(url);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Photo Frame (Back/Border) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 1.25, 0.02]} />
        <meshStandardMaterial 
          color="#f0f0f0" 
          roughness={0.2} 
          metalness={0.5} 
          envMapIntensity={2} 
        />
      </mesh>
      
      {/* The Image */}
      <mesh position={[0, 0.15, 0.015]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshPhysicalMaterial 
          map={texture} 
          roughness={0.2} 
          clearcoat={1.0} 
          clearcoatRoughness={0.1}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

// --- Main Tree System ---

const TreeSystem: React.FC = () => {
  const { state, rotationSpeed } = useContext(TreeContext);
  const pointsRef = useRef<THREE.Points>(null);
  
  // Transition Progress: 0 = Chaos, 1 = Formed
  const progress = useRef(0);
  const treeRotation = useRef(0);
  
  // We manage Photo positions manually in the useFrame loop for performance/synchronization
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
  const { foliageData, photosData } = useMemo(() => {
    // 1. Generate Foliage Particles
    const particleCount = 3500;
    const foliage = new Float32Array(particleCount * 3); // Current Positions
    const foliageChaos = new Float32Array(particleCount * 3); // Target Chaos
    const foliageTree = new Float32Array(particleCount * 3); // Target Tree
    const sizes = new Float32Array(particleCount);

    // Chaos: Sphere distribution
    const sphere = maath.inSphere(new Float32Array(particleCount * 3), { radius: 15 });
    for (let i = 0; i < particleCount * 3; i++) foliageChaos[i] = sphere[i];

    // Tree: Cone spiral distribution
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const h = Math.random() * 12; // Height 0 to 12
      // Cone shape: Radius gets smaller as H gets higher
      const coneRadius = (12 - h) * 0.45;
      const angle = h * 2.5 + Math.random() * Math.PI * 2;
      
      // Tree target positions (centered at 0, h-6, 0)
      foliageTree[i3] = Math.cos(angle) * coneRadius; 
      foliageTree[i3 + 1] = h - 6; 
      foliageTree[i3 + 2] = Math.sin(angle) * coneRadius;
      
      sizes[i] = Math.random() * 1.5 + 0.5;
    }

    // 2. Generate Photo Metadata
    const photoCount = 31;
    const photos: ParticleData[] = [];
    for (let i = 0; i < photoCount; i++) {
        // Spiral placement on tree
        const t = i / (photoCount - 1);
        const h = t * 10 - 5; // -5 to 5 height
        const radius = (6 - (h + 5)) * 0.6 + 1.5; 
        const angle = t * Math.PI * 8; // 4 full rotations
        
        // Chaos position
        const rTheta = Math.random() * Math.PI * 2;
        const rPhi = Math.acos(2 * Math.random() - 1);
        const rRad = 10 + Math.random() * 8;

        photos.push({
            id: `photo-${i}`,
            type: 'PHOTO',
            chaosPos: [
                rRad * Math.sin(rPhi) * Math.cos(rTheta),
                rRad * Math.sin(rPhi) * Math.sin(rTheta),
                rRad * Math.cos(rPhi)
            ],
            treePos: [
                Math.cos(angle) * radius,
                h,
                Math.sin(angle) * radius
            ],
            chaosRot: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
            treeRot: [0, -angle + Math.PI / 2, 0.1], // Face outwards
            scale: 0.8 + Math.random() * 0.4,
            color: 'white',
            image: `https://picsum.photos/seed/${i + 42}/400/500`
        });
    }

    return { 
        foliageData: { current: foliage, chaos: foliageChaos, tree: foliageTree, sizes }, 
        photosData: photos 
    };
  }, []);

  // Initialize photo refs
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
    // 1. Update State Progress (Smooth Damp)
    const targetProgress = state === 'FORMED' ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.0, delta);
    const p = progress.current;
    
    // Smoothstep for visual interpolation
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
            
            // Chaos Coords
            const cx = foliageData.chaos[i3];
            const cy = foliageData.chaos[i3+1];
            const cz = foliageData.chaos[i3+2];

            // Tree Coords
            const tx = foliageData.tree[i3];
            const ty = foliageData.tree[i3+1];
            const tz = foliageData.tree[i3+2];

            // Vortex Math
            // Current Y
            const y = THREE.MathUtils.lerp(cy, ty, ease);
            
            // Target Radius and Angle (Formed)
            const tr = Math.sqrt(tx*tx + tz*tz);
            const tAngle = Math.atan2(tz, tx);
            
            // Current Radius (lerp from chaos radius to tree radius)
            const cr = Math.sqrt(cx*cx + cz*cz);
            const r = THREE.MathUtils.lerp(cr, tr, ease);
            
            // Vortex Angle: 
            // Start with a chaotic offset, blend to target angle
            // Add a spiral twist based on (1-p)
            // Add continuous rotation
            const vortexTwist = (1 - ease) * 15.0; // Twist amount
            const currentAngle = tAngle + vortexTwist + treeRotation.current;

            // Apply positions
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

    // 4. Update Photos
    photoObjects.forEach((obj) => {
        if (!obj.ref.current) return;
        
        const { chaosPos, treePos, chaosRot, treeRot } = obj.data;
        
        // Pos Interp
        const [cx, cy, cz] = chaosPos;
        const [tx, ty, tz] = treePos;
        
        const y = THREE.MathUtils.lerp(cy, ty, ease);
        const cr = Math.sqrt(cx*cx + cz*cz);
        const tr = Math.sqrt(tx*tx + tz*tz);
        const r = THREE.MathUtils.lerp(cr, tr, ease);
        
        const tAngle = Math.atan2(tz, tx);
        const vortexTwist = (1 - ease) * 10.0;
        const currentAngle = tAngle + vortexTwist + treeRotation.current;
        
        // Chaos orbit
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

        const lookAtAngle = -currentAngle + Math.PI / 2; // Face outward from center
        
        // Simple Lerp for Euler
        obj.ref.current.rotation.x = THREE.MathUtils.lerp(chaosRot[0], treeRot[0], ease);
        obj.ref.current.rotation.y = THREE.MathUtils.lerp(chaosRot[1], lookAtAngle, ease);
        obj.ref.current.rotation.z = THREE.MathUtils.lerp(chaosRot[2], treeRot[2], ease);
    });
  });

  return (
    <group>
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
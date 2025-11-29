
import React, { useRef, useMemo, useContext, useState, useEffect } from 'react';
import { useFrame, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import * as random from 'maath/random/dist/maath-random.esm';
import { TreeContext, ParticleData, TreeContextType } from '../types';

// ... (FoliageMaterial shader 代码保持不变) ...
const FoliageMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color('#004225'), uColorAccent: new THREE.Color('#00fa9a'), uPixelRatio: 1 },
  ` uniform float uTime; uniform float uPixelRatio; attribute float size; varying vec3 vPosition; varying float vBlink; vec3 curl(float x, float y, float z) { float eps=1.,n1,n2,a,b;x/=eps;y/=eps;z/=eps;vec3 curl=vec3(0.);n1=sin(y+cos(z+uTime));n2=cos(x+sin(z+uTime));curl.x=n1-n2;n1=sin(z+cos(x+uTime));n2=cos(y+sin(x+uTime));curl.z=n1-n2;n1=sin(x+cos(y+uTime));n2=cos(z+sin(y+uTime));curl.z=n1-n2;return curl*0.1; } void main() { vPosition=position; vec3 distortedPosition=position+curl(position.x,position.y,position.z); vec4 mvPosition=modelViewMatrix*vec4(distortedPosition,1.0); gl_Position=projectionMatrix*mvPosition; gl_PointSize=size*uPixelRatio*(60.0/-mvPosition.z); vBlink=sin(uTime*2.0+position.y*5.0+position.x); } `,
  ` uniform vec3 uColor; uniform vec3 uColorAccent; varying float vBlink; void main() { vec2 xy=gl_PointCoord.xy-vec2(0.5); float ll=length(xy); if(ll>0.5) discard; float strength=pow(1.0-ll*2.0,3.0); vec3 color=mix(uColor,uColorAccent,smoothstep(-0.8,0.8,vBlink)); gl_FragColor=vec4(color,strength); } `
);
extend({ FoliageMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    foliageMaterial: any
  }
}

// --- Photo Component ---
const PolaroidPhoto: React.FC<{ url: string; position: THREE.Vector3; rotation: THREE.Euler; scale: number; id: string; }> = ({ url, position, rotation, scale, id }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'local' | 'fallback'>('loading');

  useEffect(() => {
    const loader = new THREE.TextureLoader();

    // 先尝试加载本地照片
    loader.load(
      url,
      (tex) => {
        // 本地照片加载成功
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
        setLoadStatus('local');
        console.log(`✅ Successfully loaded local image: ${url}`);
      },
      undefined, // onProgress
      (error) => {
        // 本地照片加载失败，使用 Picsum 随机照片
        console.warn(`⚠️ Local image not found: ${url}, loading random photo...`);
        const seed = id.split('-')[1] || '55';
        const fallbackUrl = `https://picsum.photos/seed/${parseInt(seed)+100}/400/500`;

        loader.load(
          fallbackUrl,
          (fbTex) => {
            fbTex.wrapS = THREE.ClampToEdgeWrapping;
            fbTex.wrapT = THREE.ClampToEdgeWrapping;
            fbTex.colorSpace = THREE.SRGBColorSpace;
            setTexture(fbTex);
            setLoadStatus('fallback');
            console.log(`✅ Loaded fallback image for ${url}`);
          },
          undefined,
          (fallbackError) => {
            console.error(`❌ Failed to load both local and fallback images for ${url}`, fallbackError);
          }
        );
      }
    );
  }, [url, id]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* 相框边框 - 本地照片用金色，网络照片用银色 */}
      <mesh position={[0, 0, 0]} userData={{ photoId: id, photoUrl: url }}>
        <boxGeometry args={[1, 1.25, 0.02]} />
        <meshStandardMaterial
          color={loadStatus === 'local' ? '#ffd700' : '#f0f0f0'}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>
      {/* 照片内容 */}
      <mesh position={[0, 0.15, 0.015]} userData={{ photoId: id, photoUrl: url }}>
        <planeGeometry args={[0.9, 0.9]} />
        {texture ? (
            <meshPhysicalMaterial map={texture} roughness={0.2} clearcoat={1.0} toneMapped={false} />
        ) : (
            // 加载中状态 - 显示深灰色占位符
            <meshStandardMaterial color="#333" />
        )}
      </mesh>
    </group>
  );
};

// --- Main Tree System ---
const TreeSystem: React.FC = () => {
  const { state, rotationSpeed, pointer, clickTrigger, setSelectedPhotoUrl, selectedPhotoUrl, panOffset } = useContext(TreeContext) as TreeContextType;
  const { camera, raycaster } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  const lightsRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  
  const progress = useRef(0);
  const treeRotation = useRef(0);
  
  // 用于平滑过渡 Pan
  const currentPan = useRef({ x: 0, y: 0 });
  
  const [photoObjects, setPhotoObjects] = useState<{ id: string; url: string; ref: React.MutableRefObject<THREE.Group | null>; data: ParticleData; pos: THREE.Vector3; rot: THREE.Euler; scale: number; }[]>([]);

  // --- Data Generation ---
  const { foliageData, photosData, lightsData } = useMemo(() => {
    const particleCount = 4500;
    const foliage = new Float32Array(particleCount*3); const foliageChaos=new Float32Array(particleCount*3); const foliageTree=new Float32Array(particleCount*3); const sizes=new Float32Array(particleCount);
    const sphere = random.inSphere(new Float32Array(particleCount*3),{radius:18}); for(let i=0;i<particleCount*3;i++) foliageChaos[i]=sphere[i];
    for(let i=0;i<particleCount;i++){ const i3=i*3;const h=Math.random()*14;const coneRadius=(14-h)*0.45;const angle=h*3.0+Math.random()*Math.PI*2;foliageTree[i3]=Math.cos(angle)*coneRadius;foliageTree[i3+1]=h-6;foliageTree[i3+2]=Math.sin(angle)*coneRadius;sizes[i]=Math.random()*1.5+0.5;}

    const lightCount = 300;
    const lightChaos = new Float32Array(lightCount * 3); const lightTree = new Float32Array(lightCount * 3); const lSphere = random.inSphere(new Float32Array(lightCount * 3), { radius: 20 });
    for(let i=0; i<lightCount * 3; i++) lightChaos[i] = lSphere[i];
    for(let i=0; i<lightCount; i++) { const i3 = i * 3; const t = i / lightCount; const h = t * 13; const coneRadius = (14 - h) * 0.48; const angle = t * Math.PI * 25; lightTree[i3] = Math.cos(angle) * coneRadius; lightTree[i3+1] = h - 6; lightTree[i3+2] = Math.sin(angle) * coneRadius; }

    const photoCount = 31; const photos: ParticleData[] = [];
    for(let i=0;i<photoCount;i++){ 
        const t=i/(photoCount-1);const h=t*10-5;const radius=(6-(h+5))*0.6+1.8;const angle=t*Math.PI*8;
        const rTheta=Math.random()*Math.PI*2;const rPhi=Math.acos(2*Math.random()-1);const rRad=6+Math.random()*10;
        const chaosX=rRad*Math.sin(rPhi)*Math.cos(rTheta);const chaosY=(rRad*Math.sin(rPhi)*Math.sin(rTheta))*0.9;const chaosZ=rRad*Math.cos(rPhi);
        
        // 关键修改：移除 public 前缀，Web 访问时 public 是根目录
        const imageUrl = `/photos/${i + 1}.jpg`;

        photos.push({ id:`photo-${i}`, type:'PHOTO', chaosPos:[chaosX,chaosY,chaosZ], treePos:[Math.cos(angle)*radius,h,Math.sin(angle)*radius], chaosRot:[(Math.random()-0.5)*0.5,(Math.random()-0.5)*0.5,(Math.random()-0.5)*0.2], treeRot:[0,-angle+Math.PI/2,0.1], scale:0.9+Math.random()*0.3, image: imageUrl, color:'white' });
    }
    return { foliageData: { current: foliage, chaos: foliageChaos, tree: foliageTree, sizes }, photosData: photos, lightsData: { chaos: lightChaos, tree: lightTree, count: lightCount } };
  }, []);

  useEffect(() => {
    setPhotoObjects(photosData.map(p => ({ id: p.id, url: p.image!, ref: React.createRef(), data: p, pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: p.scale })));
  }, [photosData]);

  // --- 处理点击事件 ---
  useEffect(() => {
    if (state === 'CHAOS' && pointer && !selectedPhotoUrl) {
        const x = pointer.x * 2 - 1;
        const y = -(pointer.y * 2) + 1;
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        const targets = photoObjects.map(obj => obj.ref.current).filter((group): group is THREE.Group => group !== null);
        const intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            const hit = intersects[0];
            let currentObj: THREE.Object3D | null = hit.object;
            while(currentObj && !currentObj.userData.photoUrl) currentObj = currentObj.parent;
            if (currentObj && currentObj.userData.photoUrl) setSelectedPhotoUrl(currentObj.userData.photoUrl);
        }
    }
  }, [clickTrigger, selectedPhotoUrl]);

  // --- Animation Loop ---
  useFrame((state3d, delta) => {
    const targetProgress = state === 'FORMED' ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.0, delta);
    const ease = progress.current * progress.current * (3 - 2 * progress.current);
    treeRotation.current += (state === 'FORMED' ? rotationSpeed : 0.05) * delta;
    
    // 应用平移 (带阻尼)
    // 关键修复：当 FORMED 时，忽略 panOffset，强制目标为 (0,0)
    const targetPanX = state === 'FORMED' ? 0 : panOffset.x;
    const targetPanY = state === 'FORMED' ? 0 : panOffset.y;

    currentPan.current.x = THREE.MathUtils.lerp(currentPan.current.x, targetPanX, 0.1);
    currentPan.current.y = THREE.MathUtils.lerp(currentPan.current.y, targetPanY, 0.1);
    
    if (groupRef.current) {
        groupRef.current.position.x = currentPan.current.x;
        groupRef.current.position.y = currentPan.current.y;
    }

    if (pointsRef.current) {
        // @ts-ignore
        pointsRef.current.material.uniforms.uTime.value = state3d.clock.getElapsedTime();
        const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < positions.length / 3; i++) {
            const i3=i*3; const cx=foliageData.chaos[i3];const cy=foliageData.chaos[i3+1];const cz=foliageData.chaos[i3+2]; const tx=foliageData.tree[i3];const ty=foliageData.tree[i3+1];const tz=foliageData.tree[i3+2];
            const y=THREE.MathUtils.lerp(cy,ty,ease); const tr=Math.sqrt(tx*tx+tz*tz); const tAngle=Math.atan2(tz,tx); const cr=Math.sqrt(cx*cx+cz*cz); const r=THREE.MathUtils.lerp(cr,tr,ease);
            const vortexTwist=(1-ease)*15.0; const currentAngle=tAngle+vortexTwist+treeRotation.current; const formedX=r*Math.cos(currentAngle); const formedZ=r*Math.sin(currentAngle);
            const cAngle=Math.atan2(cz,cx); const cRotatedX=cr*Math.cos(cAngle+treeRotation.current*0.5); const cRotatedZ=cr*Math.sin(cAngle+treeRotation.current*0.5);
            positions[i3]=THREE.MathUtils.lerp(cRotatedX,formedX,ease); positions[i3+1]=y; positions[i3+2]=THREE.MathUtils.lerp(cRotatedZ,formedZ,ease);
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
    if (lightsRef.current) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < lightsData.count; i++) {
             const i3 = i * 3; const cx = lightsData.chaos[i3]; const cy = lightsData.chaos[i3+1]; const cz = lightsData.chaos[i3+2]; const tx = lightsData.tree[i3]; const ty = lightsData.tree[i3+1]; const tz = lightsData.tree[i3+2];
             const y = THREE.MathUtils.lerp(cy, ty, ease); const tr = Math.sqrt(tx*tx + tz*tz); const tAngle = Math.atan2(tz, tx); const cr = Math.sqrt(cx*cx + cz*cz); const r = THREE.MathUtils.lerp(cr, tr, ease);
             const vortexTwist = (1 - ease) * 12.0; const currentAngle = tAngle + vortexTwist + treeRotation.current;
             const cAngle = Math.atan2(cz, cx); const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.3); const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.3);
             const fx = THREE.MathUtils.lerp(cRotatedX, r * Math.cos(currentAngle), ease); const fz = THREE.MathUtils.lerp(cRotatedZ, r * Math.sin(currentAngle), ease);
             dummy.position.set(fx, y, fz); dummy.scale.setScalar(1); dummy.updateMatrix(); lightsRef.current.setMatrixAt(i, dummy.matrix);
        }
        lightsRef.current.instanceMatrix.needsUpdate = true;
    }
    if (trunkRef.current) {
        const trunkScale = THREE.MathUtils.smoothstep(ease, 0.3, 1.0); trunkRef.current.scale.set(trunkScale, ease, trunkScale); trunkRef.current.position.y = 1; trunkRef.current.rotation.y = treeRotation.current;
    }
    photoObjects.forEach((obj) => {
        if (!obj.ref.current) return;
        const { chaosPos, treePos, chaosRot, treeRot } = obj.data;
        const [cx,cy,cz]=chaosPos; const [tx,ty,tz]=treePos;
        const y=THREE.MathUtils.lerp(cy,ty,ease); const cr=Math.sqrt(cx*cx+cz*cz); const tr=Math.sqrt(tx*tx+tz*tz); const r=THREE.MathUtils.lerp(cr,tr,ease);
        const tAngle=Math.atan2(tz,tx); const vortexTwist=(1-ease)*10.0; const currentAngle=tAngle+vortexTwist+treeRotation.current;
        const cAngle=Math.atan2(cz,cx); const cRotatedX=cr*Math.cos(cAngle+treeRotation.current*0.2); const cRotatedZ=cr*Math.sin(cAngle+treeRotation.current*0.2);
        const targetX=r*Math.cos(currentAngle); const targetZ=r*Math.sin(currentAngle);
        obj.ref.current.position.set(THREE.MathUtils.lerp(cRotatedX,targetX,ease),y,THREE.MathUtils.lerp(cRotatedZ,targetZ,ease));
        const lookAtAngle=-currentAngle+Math.PI/2;
        obj.ref.current.rotation.x=THREE.MathUtils.lerp(chaosRot[0],treeRot[0],ease); obj.ref.current.rotation.y=THREE.MathUtils.lerp(chaosRot[1],lookAtAngle,ease); obj.ref.current.rotation.z=THREE.MathUtils.lerp(chaosRot[2],treeRot[2],ease);
    });
  });

  return (
    <group ref={groupRef}>
      <mesh ref={trunkRef} position={[0, 0, 0]}><cylinderGeometry args={[0.2, 0.8, 14, 8]} /><meshStandardMaterial color="#3E2723" roughness={0.9} metalness={0.1} /></mesh>
      <points ref={pointsRef}> <bufferGeometry> <bufferAttribute attach="attributes-position" count={foliageData.current.length/3} array={foliageData.current} itemSize={3} /> <bufferAttribute attach="attributes-size" count={foliageData.sizes.length} array={foliageData.sizes} itemSize={1} /> </bufferGeometry> <foliageMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} /> </points>
      <instancedMesh ref={lightsRef} args={[undefined, undefined, lightsData.count]}><sphereGeometry args={[0.05, 8, 8]} /><meshStandardMaterial color="#ffddaa" emissive="#ffbb00" emissiveIntensity={3} toneMapped={false} /></instancedMesh>
      {photoObjects.map((obj, index) => ( 
        <group key={obj.id} ref={(el) => { obj.ref.current = el; }}>
             <PolaroidPhoto url={obj.url} position={obj.pos} rotation={obj.rot} scale={obj.scale} id={obj.id} />
        </group> 
      ))}
    </group>
  );
};

export default TreeSystem;

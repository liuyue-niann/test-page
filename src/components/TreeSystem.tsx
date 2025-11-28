import React, { useRef, useMemo, useContext, useState, useEffect } from 'react';
import { useFrame, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, useTexture } from '@react-three/drei';
import * as random from 'maath/random/dist/maath-random.esm';
import { TreeContext, ParticleData, TreeContextType } from '../types';

// ... (FoliageMaterial shader 代码完全保持不变，复制你原来文件里的即可) ...
const FoliageMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color('#004225'), uColorAccent: new THREE.Color('#00fa9a'), uPixelRatio: 1 },
  ` uniform float uTime; uniform float uPixelRatio; attribute float size; varying vec3 vPosition; varying float vBlink; vec3 curl(float x, float y, float z) { float eps=1.,n1,n2,a,b;x/=eps;y/=eps;z/=eps;vec3 curl=vec3(0.);n1=sin(y+cos(z+uTime));n2=cos(x+sin(z+uTime));curl.x=n1-n2;n1=sin(z+cos(x+uTime));n2=cos(y+sin(x+uTime));curl.y=n1-n2;n1=sin(x+cos(y+uTime));n2=cos(z+sin(y+uTime));curl.z=n1-n2;return curl*0.1; } void main() { vPosition=position; vec3 distortedPosition=position+curl(position.x,position.y,position.z); vec4 mvPosition=modelViewMatrix*vec4(distortedPosition,1.0); gl_Position=projectionMatrix*mvPosition; gl_PointSize=size*uPixelRatio*(60.0/-mvPosition.z); vBlink=sin(uTime*2.0+position.y*5.0+position.x); } `,
  ` uniform vec3 uColor; uniform vec3 uColorAccent; varying float vBlink; void main() { vec2 xy=gl_PointCoord.xy-vec2(0.5); float ll=length(xy); if(ll>0.5) discard; float strength=pow(1.0-ll*2.0,3.0); vec3 color=mix(uColor,uColorAccent,smoothstep(-0.8,0.8,vBlink)); gl_FragColor=vec4(color,strength); } `
);
extend({ FoliageMaterial });

// Fix for: Property 'foliageMaterial' does not exist on type 'JSX.IntrinsicElements'
declare global {
  namespace JSX {
    interface IntrinsicElements {
      foliageMaterial: any;
    }
  }
}

// --- Photo Component ---
const PolaroidPhoto: React.FC<{ 
  url: string; position: THREE.Vector3; rotation: THREE.Euler; scale: number; id: string;
}> = ({ url, position, rotation, scale, id }) => {
  const texture = useTexture(url);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* userData 存储关键信息 */}
      <mesh position={[0, 0, 0]} userData={{ photoId: id, photoUrl: url }}>
        <boxGeometry args={[1, 1.25, 0.02]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.2} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.15, 0.015]} userData={{ photoId: id, photoUrl: url }}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshPhysicalMaterial map={texture} roughness={0.2} clearcoat={1.0} toneMapped={false} />
      </mesh>
    </group>
  );
};

// --- Main Tree System ---
const TreeSystem: React.FC = () => {
  const { state, rotationSpeed, pointer, setSelectedPhotoUrl, setHoverProgress } = useContext(TreeContext) as TreeContextType;
  const { camera, raycaster } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  const progress = useRef(0);
  const treeRotation = useRef(0);
  const lightsRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.Mesh>(null);
  
  // 悬停逻辑状态
  const hoverState = useRef<{ id: string | null; timer: number }>({ id: null, timer: 0 });
  const photoMeshesRef = useRef<THREE.Group[]>([]);
  const [photoObjects, setPhotoObjects] = useState<{
    id: string; url: string; ref: React.MutableRefObject<THREE.Group | null>; data: ParticleData; pos: THREE.Vector3; rot: THREE.Euler; scale: number;
  }[]>([]);

  // --- Data Generation (保持不变) ---
  const { foliageData, photosData, lightsData } = useMemo(() => {
    // ... 简写: 请保留原来的粒子、灯光、照片生成逻辑 ...
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
        photos.push({ id:`photo-${i}`, type:'PHOTO', chaosPos:[chaosX,chaosY,chaosZ], treePos:[Math.cos(angle)*radius,h,Math.sin(angle)*radius], chaosRot:[(Math.random()-0.5)*0.5,(Math.random()-0.5)*0.5,(Math.random()-0.5)*0.2], treeRot:[0,-angle+Math.PI/2,0.1], scale:0.9+Math.random()*0.3, image:`https://picsum.photos/seed/${i+55}/400/500`, color:'white' });
    }
    return { foliageData: { current: foliage, chaos: foliageChaos, tree: foliageTree, sizes }, photosData: photos, lightsData: { chaos: lightChaos, tree: lightTree, count: lightCount } };
  }, []);

  useEffect(() => {
    setPhotoObjects(photosData.map(p => ({ id: p.id, url: p.image!, ref: React.createRef(), data: p, pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: p.scale })));
  }, [photosData]);

  // --- Animation Loop ---
  useFrame((state3d, delta) => {
    // 基础动画 (保持不变)
    const targetProgress = state === 'FORMED' ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.0, delta);
    const p = progress.current;
    const ease = p * p * (3 - 2 * p);
    const spinFactor = state === 'FORMED' ? rotationSpeed : 0.05;
    treeRotation.current += spinFactor * delta;

    // --- 悬停点击逻辑 (Hover to Click) ---
    // 1. 只有 CHAOS 模式且有光标时才检测
    if (state === 'CHAOS' && pointer) {
        const x = pointer.x * 2 - 1;
        const y = -(pointer.y * 2) + 1;
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        
        const targets = photoObjects.map(obj => obj.ref.current).filter((group): group is THREE.Group => group !== null);
        const intersects = raycaster.intersectObjects(targets, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            let currentObj: THREE.Object3D | null = hit.object;
            // 找到包含 ID 的父对象
            while(currentObj && !currentObj.userData.photoId) {
                currentObj = currentObj.parent;
            }

            if (currentObj) {
                const hitId = currentObj.userData.photoId;
                
                // 如果指着同一个物体
                if (hoverState.current.id === hitId) {
                    hoverState.current.timer += delta;
                    // 计算进度 (1.0秒为阈值)
                    const DWELL_TIME = 1.0; 
                    const prog = Math.min(hoverState.current.timer / DWELL_TIME, 1);
                    setHoverProgress(prog);

                    if (hoverState.current.timer > DWELL_TIME) {
                        setSelectedPhotoUrl(currentObj.userData.photoUrl);
                        // 触发后重置，防止连击
                        hoverState.current = { id: null, timer: 0 };
                        setHoverProgress(0);
                    }
                } else {
                    // 指向了新物体，重置计时器
                    hoverState.current = { id: hitId, timer: 0 };
                    setHoverProgress(0);
                }
            }
        } else {
            // 没指到任何东西
            hoverState.current = { id: null, timer: 0 };
            setHoverProgress(0);
        }
    } else {
        // 没有光标
        hoverState.current = { id: null, timer: 0 };
        setHoverProgress(0);
    }

    // --- Update Particles & Photos (Visual Logic - 保持不变) ---
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
    <group>
      <mesh ref={trunkRef} position={[0, 0, 0]}><cylinderGeometry args={[0.2, 0.8, 14, 8]} /><meshStandardMaterial color="#3E2723" roughness={0.9} metalness={0.1} /></mesh>
      <points ref={pointsRef}> <bufferGeometry> <bufferAttribute attach="attributes-position" count={foliageData.current.length/3} array={foliageData.current} itemSize={3} /> <bufferAttribute attach="attributes-size" count={foliageData.sizes.length} array={foliageData.sizes} itemSize={1} /> </bufferGeometry> <foliageMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} /> </points>
      <instancedMesh ref={lightsRef} args={[undefined, undefined, lightsData.count]}><sphereGeometry args={[0.05, 8, 8]} /><meshStandardMaterial color="#ffddaa" emissive="#ffbb00" emissiveIntensity={3} toneMapped={false} /></instancedMesh>
      {photoObjects.map((obj, index) => ( <group key={obj.id} ref={(el) => { obj.ref.current = el; if (el) photoMeshesRef.current[index] = el; }}> <PolaroidPhoto url={obj.url} position={new THREE.Vector3(0,0,0)} rotation={new THREE.Euler(0,0,0)} scale={obj.scale} id={obj.id} /> </group> ))}
    </group>
  );
};

export default TreeSystem;
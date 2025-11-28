import { createContext } from 'react';

export type AppState = 'CHAOS' | 'FORMED';

// 指针坐标接口 (归一化 0-1)
export interface PointerCoords {
  x: number;
  y: number;
}

export interface TreeContextType {
  state: AppState;
  setState: (state: AppState) => void;
  rotationSpeed: number;
  setRotationSpeed: (speed: number) => void;
  webcamEnabled: boolean;
  setWebcamEnabled: (enabled: boolean) => void;
  
  // --- 交互状态 ---
  pointer: PointerCoords | null;   // 指针位置
  setPointer: (coords: PointerCoords | null) => void;
  
  hoverProgress: number;           // 悬停进度 0.0 ~ 1.0 (用于 UI 圈圈动画)
  setHoverProgress: (progress: number) => void;
  
  clickTrigger: number;            // 点击信号 (每次点击更新为当前时间戳)
  setClickTrigger: (time: number) => void;

  selectedPhotoUrl: string | null; // 当前选中的照片
  setSelectedPhotoUrl: (url: string | null) => void;
}

export interface ParticleData {
  id: string;
  chaosPos: [number, number, number];
  treePos: [number, number, number];
  chaosRot: [number, number, number];
  treeRot: [number, number, number];
  scale: number;
  color: string;
  image?: string;
  type: 'LEAF' | 'ORNAMENT' | 'PHOTO';
}

export const TreeContext = createContext<TreeContextType>({} as TreeContextType);
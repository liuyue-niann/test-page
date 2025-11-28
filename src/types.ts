
import { createContext } from 'react';

export type AppState = 'CHAOS' | 'FORMED';

export interface TreeContextType {
  // 核心应用状态
  state: AppState;
  setState: (state: AppState) => void;
  rotationSpeed: number;
  setRotationSpeed: (speed: number) => void;
  webcamEnabled: boolean;
  setWebcamEnabled: (enabled: boolean) => void;

  // 新增：隔空触控交互状态
  pointer: { x: number; y: number } | null; // 归一化的屏幕坐标 (0-1)
  setPointer: (ptr: { x: number; y: number } | null) => void;
  
  isPinching: boolean; // 是否正在做捏合手势
  setIsPinching: (isPinching: boolean) => void;
  
  selectedPhotoUrl: string | null; // 当前被选中/放大的照片 URL
  setSelectedPhotoUrl: (url: string | null) => void;
}

export interface ParticleData {
  id: string;
  chaosPos: [number, number, number]; // Random position in space
  treePos: [number, number, number];  // Target position on cone
  chaosRot: [number, number, number];
  treeRot: [number, number, number];
  scale: number;
  color: string;
  image?: string;
  type: 'LEAF' | 'ORNAMENT' | 'PHOTO';
}

export const TreeContext = createContext<TreeContextType>({} as TreeContextType);

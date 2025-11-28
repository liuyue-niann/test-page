import { createContext } from 'react';

export type AppState = 'CHAOS' | 'FORMED';

export interface TreeContextType {
  state: AppState;
  setState: (state: AppState) => void;
  rotationSpeed: number;
  setRotationSpeed: (speed: number) => void;
  webcamEnabled: boolean;
  setWebcamEnabled: (enabled: boolean) => void;
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
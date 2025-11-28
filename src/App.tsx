import React, { useState, Suspense, useContext } from 'react';
import { TreeContextType, AppState, TreeContext, PointerCoords } from './types';
import Experience from './components/Experience';
import GestureInput from './components/GestureInput';
import { AnimatePresence, motion } from 'framer-motion';

// --- 新光标组件: 带有进度条 ---
const CursorRing: React.FC<{ pointer: PointerCoords | null, progress: number }> = ({ pointer, progress }) => {
    if (!pointer) return null;
    return (
        <div
            className="fixed top-0 left-0 w-12 h-12 pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
        >
            {/* 外部光圈 */}
            <div className="absolute inset-0 rounded-full border-2 border-cyan-400/50 shadow-[0_0_10px_rgba(0,255,255,0.3)]"></div>
            
            {/* 进度条 (SVG 圆环) */}
            <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                    cx="24" cy="24" r="20"
                    fill="none"
                    stroke="#00FFFF"
                    strokeWidth="4"
                    strokeDasharray="125.6" // 2 * PI * 20
                    strokeDashoffset={125.6 * (1 - progress)}
                    className="transition-[stroke-dashoffset] duration-75 ease-linear"
                />
            </svg>
            
            {/* 中心点 */}
            <div className={`absolute top-1/2 left-1/2 w-1 h-1 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all ${progress > 0 ? 'bg-red-500 w-2 h-2' : 'bg-white'}`}></div>
        </div>
    );
};

// 照片弹窗 (保持不变)
const PhotoModal: React.FC<{ url: string | null, onClose: () => void }> = ({ url, onClose }) => {
    if (!url) return null;
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm" onClick={onClose}>
            <motion.div initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 50 }} className="relative max-w-4xl max-h-full bg-white p-4 rounded-lg shadow-2xl border-[10px] border-white rotate-1" onClick={(e) => e.stopPropagation()}>
                <img src={url} alt="Memory" className="max-h-[80vh] object-contain rounded shadow-inner" />
                <button onClick={onClose} className="absolute -top-12 right-0 text-white hover:text-red-400 cinzel text-xl tracking-widest">CLOSE [X]</button>
            </motion.div>
        </motion.div>
    );
}

const AppContent: React.FC = () => {
    const { state, setState, webcamEnabled, setWebcamEnabled, pointer, hoverProgress, selectedPhotoUrl, setSelectedPhotoUrl } = useContext(TreeContext) as TreeContextType;

    return (
        <main className="relative w-full h-screen bg-black text-white overflow-hidden cursor-none">
            <div className="absolute inset-0 z-0">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-emerald-500 cinzel animate-pulse">Loading Experience...</div>}>
                    <Experience />
                </Suspense>
            </div>

            <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
                <header className="flex justify-between items-start">
                    <div>
                        <h1 className="text-4xl md:text-6xl font-bold cinzel text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 to-amber-100 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">NOËL VORTEX</h1>
                        <p className="text-emerald-400/80 text-sm mt-2 tracking-widest uppercase">Interactive Memory Archive</p>
                    </div>
                    <div className="pointer-events-auto">
                        <button onClick={() => setWebcamEnabled(!webcamEnabled)} className={`px-4 py-2 border rounded-full backdrop-blur-md transition-all duration-300 cinzel text-sm ${webcamEnabled ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200' : 'border-white/20 bg-black/40 text-gray-400'}`}>
                            {webcamEnabled ? '● AI Vision Active' : '○ Enable Camera'}
                        </button>
                    </div>
                </header>
                <footer className="flex flex-col md:flex-row items-end md:items-center justify-between gap-6 pointer-events-auto">
                     <div className="flex gap-4">
                        <button onClick={() => setState('CHAOS')} className={`w-32 py-3 rounded border transition-all duration-500 cinzel font-bold tracking-widest ${state === 'CHAOS' ? 'border-amber-400 bg-amber-400/10 text-amber-200' : 'border-white/10 text-white/40'}`}>CHAOS</button>
                        <button onClick={() => setState('FORMED')} className={`w-32 py-3 rounded border transition-all duration-500 cinzel font-bold tracking-widest ${state === 'FORMED' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-white/40'}`}>FORM</button>
                    </div>
                </footer>
            </div>

            <AnimatePresence>
                {webcamEnabled && (
                    <motion.div initial={{ opacity:0, x: 20}} animate={{ opacity: 1, x: 0}} exit={{ opacity: 0, x: 20}} className="absolute bottom-4 right-4 z-20 w-56 h-42 rounded-lg overflow-hidden border border-white/20 shadow-2xl pointer-events-auto bg-black/50 backdrop-blur-md">
                        <GestureInput />
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* 只有在 CHAOS 模式且摄像头开启时，显示跟随光标 */}
            <AnimatePresence>
                {state === 'CHAOS' && webcamEnabled && <CursorRing pointer={pointer} progress={hoverProgress} />}
                {selectedPhotoUrl && <PhotoModal url={selectedPhotoUrl} onClose={() => setSelectedPhotoUrl(null)} />}
            </AnimatePresence>
        </main>
    );
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>('CHAOS');
  const [rotationSpeed, setRotationSpeed] = useState<number>(0.2);
  const [webcamEnabled, setWebcamEnabled] = useState<boolean>(false);
  const [pointer, setPointer] = useState<PointerCoords | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  return (
    // @ts-ignore
    <TreeContext.Provider value={{ state, setState, rotationSpeed, setRotationSpeed, webcamEnabled, setWebcamEnabled, pointer, setPointer, hoverProgress, setHoverProgress, selectedPhotoUrl, setSelectedPhotoUrl }}>
      <AppContent />
    </TreeContext.Provider>
  );
};

export default App;

import React, { useState, Suspense, useContext, useEffect, useRef } from 'react';
import { TreeContextType, AppState, TreeContext, PointerCoords } from './types';
import Experience from './components/Experience';
import GestureInput from './components/GestureInput';
import { AnimatePresence, motion } from 'framer-motion';

// --- 光标组件 ---
const CursorRing: React.FC<{ pointer: PointerCoords | null, progress: number }> = ({ pointer, progress }) => {
    if (!pointer) return null;
    return (
        <div
            className="fixed top-0 left-0 w-12 h-12 pointer-events-none z-[200] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
        >
            <div className="absolute inset-0 rounded-full border-2 border-cyan-400/50 shadow-[0_0_10px_rgba(0,255,255,0.3)]"></div>
            <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="24" cy="24" r="20" fill="none" stroke="#00FFFF" strokeWidth="4" strokeDasharray="125.6" strokeDashoffset={125.6 * (1 - progress)} className="transition-[stroke-dashoffset] duration-75 ease-linear" />
            </svg>
            <div className={`absolute top-1/2 left-1/2 w-1 h-1 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all ${progress > 0 ? 'bg-red-500 w-2 h-2' : 'bg-white'}`}></div>
        </div>
    );
};

// --- 照片弹窗 (增加 ID 以便检测) ---
const PhotoModal: React.FC<{ url: string | null, onClose: () => void }> = ({ url, onClose }) => {
    if (!url) return null;
    return (
        <motion.div 
            id="photo-modal-backdrop" // 添加 ID
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm" 
            onClick={onClose}
        >
            <motion.div 
                initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 50 }} 
                className="relative max-w-4xl max-h-full bg-white p-4 rounded-lg shadow-2xl border-[10px] border-white rotate-1" 
                onClick={(e) => e.stopPropagation()}
            >
                <img src={url} alt="Memory" className="max-h-[80vh] object-contain rounded shadow-inner" />
                <button 
                    id="photo-modal-close-btn" // 添加 ID
                    onClick={onClose} 
                    className="absolute -top-12 right-0 text-white hover:text-red-400 cinzel text-xl tracking-widest"
                >
                    CLOSE [X]
                </button>
            </motion.div>
        </motion.div>
    );
}

const AppContent: React.FC = () => {
    const { state, setState, webcamEnabled, setWebcamEnabled, pointer, hoverProgress, selectedPhotoUrl, setSelectedPhotoUrl, clickTrigger } = useContext(TreeContext) as TreeContextType;

    // 监听全局“悬停点击”信号，用于处理 2D UI 交互 (关闭弹窗)
    useEffect(() => {
        if (selectedPhotoUrl && pointer) {
            // 获取光标下的 DOM 元素
            const x = pointer.x * window.innerWidth;
            const y = pointer.y * window.innerHeight;
            const element = document.elementFromPoint(x, y);
            
            if (element) {
                // 如果指着背景 或 指着关闭按钮 或 指着图片本身 -> 关闭
                // 用户需求：单个手指点击图片关闭
                const isImage = element.tagName === 'IMG';
                const isBackdrop = element.id === 'photo-modal-backdrop';
                const isCloseBtn = element.id === 'photo-modal-close-btn' || element.closest('#photo-modal-close-btn');

                if (isBackdrop || isCloseBtn || isImage) {
                    setSelectedPhotoUrl(null);
                }
            }
        }
    }, [clickTrigger]); // 当计时器触发时执行

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
                        <p className="text-emerald-400/80 cinzel tracking-widest text-sm mt-2">
                            INTERACTIVE MEMORY ARCHIVE // {state === 'CHAOS' ? 'CHAOS MODE' : 'FORMED MODE'}
                        </p>
                    </div>
                    <div className="flex gap-4 pointer-events-auto">
                        <button 
                            onClick={() => setWebcamEnabled(!webcamEnabled)}
                            className={`px-4 py-2 border border-emerald-500/30 rounded text-xs cinzel tracking-widest transition-all ${webcamEnabled ? 'bg-emerald-900/50 text-emerald-200' : 'bg-black/50 text-gray-500'}`}
                        >
                            {webcamEnabled ? 'CAMERA ON' : 'CAMERA OFF'}
                        </button>
                    </div>
                </header>

                <div className="w-full flex justify-between items-end">
                    <div className="w-48 h-36 bg-black/40 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm pointer-events-auto">
                         {webcamEnabled && <GestureInput />}
                    </div>
                    
                    <div className="text-right">
                        <p className="text-xs text-white/30 cinzel">
                            USE HAND GESTURES TO NAVIGATE<br/>
                            OPEN PALM: EXPLORE • FIST: ASSEMBLE • POINT: SELECT
                        </p>
                    </div>
                </div>
            </div>

            <CursorRing pointer={pointer} progress={hoverProgress} />

            <AnimatePresence>
                {selectedPhotoUrl && <PhotoModal url={selectedPhotoUrl} onClose={() => setSelectedPhotoUrl(null)} />}
            </AnimatePresence>
        </main>
    );
};

const App: React.FC = () => {
    const [state, setState] = useState<AppState>('CHAOS');
    const [rotationSpeed, setRotationSpeed] = useState<number>(0.2);
    const [webcamEnabled, setWebcamEnabled] = useState<boolean>(true);
    const [pointer, setPointer] = useState<PointerCoords | null>(null);
    const [hoverProgress, setHoverProgress] = useState<number>(0);
    const [clickTrigger, setClickTrigger] = useState<number>(0);
    const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

    return (
        <TreeContext.Provider value={{
            state, setState,
            rotationSpeed, setRotationSpeed,
            webcamEnabled, setWebcamEnabled,
            pointer, setPointer,
            hoverProgress, setHoverProgress,
            clickTrigger, setClickTrigger,
            selectedPhotoUrl, setSelectedPhotoUrl
        }}>
            <AppContent />
        </TreeContext.Provider>
    );
};

export default App;

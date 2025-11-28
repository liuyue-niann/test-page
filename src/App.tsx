
import React, { useState, Suspense } from 'react';
import { TreeContextType, AppState, TreeContext } from './types';
import Experience from './components/Experience';
import GestureInput from './components/GestureInput';
import { AnimatePresence, motion } from 'framer-motion';

// --- 组件: 光标圆环 (CursorRing) ---
const CursorRing: React.FC<{ pointer: { x: number; y: number } | null; isPinching: boolean }> = ({ pointer, isPinching }) => {
  if (!pointer) return null;

  return (
    <motion.div
      className="fixed z-50 pointer-events-none rounded-full border-2 border-white mix-blend-difference"
      style={{ 
        left: `${pointer.x * 100}%`, 
        top: `${pointer.y * 100}%`,
        x: '-50%',
        y: '-50%'
      }}
      animate={{
        width: isPinching ? 15 : 40,
        height: isPinching ? 15 : 40,
        borderColor: isPinching ? '#EF4444' : '#00FFFF', // 捏合变红，平时青色
        opacity: 0.8
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
        {/* 准星中心点 */}
        <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
    </motion.div>
  );
};

// --- 组件: 照片弹窗 (PhotoModal) ---
const PhotoModal: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
  if (!url) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-pointer"
    >
      <motion.div 
        initial={{ scale: 0.8, rotate: -5 }} 
        animate={{ scale: 1, rotate: 0 }} 
        exit={{ scale: 0.8, rotate: 5 }}
        className="relative bg-white p-4 pb-12 shadow-[0_0_50px_rgba(255,255,255,0.2)] max-w-2xl max-h-[80vh] transform"
        onClick={(e) => e.stopPropagation()} // 防止点击图片本身关闭
      >
        <img src={url} alt="Memory" className="w-full h-full object-contain" />
        <div className="absolute bottom-4 left-0 w-full text-center font-handwriting text-gray-600 text-xl cinzel">
          A Precious Memory
        </div>
        <button 
            onClick={onClose}
            className="absolute -top-4 -right-4 w-10 h-10 bg-red-500 rounded-full text-white font-bold hover:bg-red-600 transition-colors shadow-lg"
        >
            ✕
        </button>
      </motion.div>
    </motion.div>
  );
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>('CHAOS');
  const [rotationSpeed, setRotationSpeed] = useState<number>(0.2);
  const [webcamEnabled, setWebcamEnabled] = useState<boolean>(false);
  
  // 隔空触控状态
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [isPinching, setIsPinching] = useState<boolean>(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  return (
    <TreeContext.Provider value={{ 
      state, setState, 
      rotationSpeed, setRotationSpeed, 
      webcamEnabled, setWebcamEnabled,
      pointer, setPointer,
      isPinching, setIsPinching,
      selectedPhotoUrl, setSelectedPhotoUrl
    }}>
      <main className="relative w-full h-screen bg-black text-white overflow-hidden cursor-none"> {/* Hide default cursor */}
        
        {/* 3D Scene Layer */}
        <div className="absolute inset-0 z-0">
          <Suspense fallback={<div className="flex items-center justify-center h-full text-emerald-500 cinzel animate-pulse">Summoning Memories...</div>}>
            <Experience />
          </Suspense>
        </div>

        {/* UI Overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
          
          {/* Header */}
          <header className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl md:text-6xl font-bold cinzel text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 to-amber-100 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                NOËL VORTEX
              </h1>
              <p className="text-emerald-400/80 text-sm mt-2 tracking-widest uppercase">
                Interactive Memory Archive
              </p>
            </div>
            
            <div className="pointer-events-auto">
              <button 
                onClick={() => setWebcamEnabled(!webcamEnabled)}
                className={`px-4 py-2 border border-emerald-500/30 rounded-full backdrop-blur-md transition-all duration-300 ${webcamEnabled ? 'bg-emerald-500/20 text-emerald-200' : 'bg-black/40 text-gray-400 hover:text-white'}`}
              >
                {webcamEnabled ? '● AI Vision Active' : '○ Enable Camera'}
              </button>
            </div>
          </header>

          {/* Controls / Status */}
          <footer className="flex flex-col md:flex-row items-end md:items-center justify-between gap-6">
            <div className="space-y-4 pointer-events-auto">
              <div className="flex gap-4">
                <button
                  onClick={() => setState('CHAOS')}
                  className={`w-32 py-3 rounded border transition-all duration-500 cinzel font-bold tracking-widest ${state === 'CHAOS' ? 'border-amber-400 bg-amber-400/10 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.2)]' : 'border-white/10 text-white/40 hover:border-white/30'}`}
                >
                  CHAOS
                </button>
                <button
                  onClick={() => setState('FORMED')}
                  className={`w-32 py-3 rounded border transition-all duration-500 cinzel font-bold tracking-widest ${state === 'FORMED' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'border-white/10 text-white/40 hover:border-white/30'}`}
                >
                  FORM
                </button>
              </div>
            </div>

            <div className="text-right max-w-sm">
              <AnimatePresence mode="wait">
                {state === 'CHAOS' ? (
                  <motion.p 
                    key="chaos-text"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-gray-400 text-sm italic"
                  >
                    "Use your index finger to explore. Pinch to select memories."
                  </motion.p>
                ) : (
                  <motion.p 
                    key="formed-text"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-emerald-200 text-sm italic"
                  >
                    "Bound together by the spirit of the season."
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </footer>
        </div>

        {/* AI Controller Layer */}
        {webcamEnabled && (
          <div className="absolute bottom-4 right-4 z-20 w-48 h-36 rounded-lg overflow-hidden border border-white/20 shadow-2xl pointer-events-auto">
            <GestureInput />
          </div>
        )}
        
        {/* Interactive Cursor */}
        {webcamEnabled && state === 'CHAOS' && (
            <CursorRing pointer={pointer} isPinching={isPinching} />
        )}

        {/* Photo Modal */}
        <AnimatePresence>
            {selectedPhotoUrl && (
                <PhotoModal url={selectedPhotoUrl} onClose={() => setSelectedPhotoUrl(null)} />
            )}
        </AnimatePresence>

      </main>
    </TreeContext.Provider>
  );
};

export default App;

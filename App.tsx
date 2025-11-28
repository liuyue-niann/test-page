import React, { useState, Suspense } from 'react';
import { TreeContextType, AppState, TreeContext } from './types';
import Experience from './components/Experience';
import GestureInput from './components/GestureInput';
import { AnimatePresence, motion } from 'framer-motion';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>('CHAOS');
  const [rotationSpeed, setRotationSpeed] = useState<number>(0.2);
  const [webcamEnabled, setWebcamEnabled] = useState<boolean>(false);

  return (
    <TreeContext.Provider value={{ state, setState, rotationSpeed, setRotationSpeed, webcamEnabled, setWebcamEnabled }}>
      <main className="relative w-full h-screen bg-black text-white overflow-hidden">
        
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
                    "Memories float like stardust, waiting to be gathered..."
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

      </main>
    </TreeContext.Provider>
  );
};

export default App;
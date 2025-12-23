import React, { useState, Suspense, useContext, useEffect, useRef } from 'react';
import { TreeContextType, AppState, TreeContext, PointerCoords } from './types';
import Experience from './components/Experience';
import GestureInput from './components/GestureInput';
import TechEffects from './components/TechEffects';
import { AnimatePresence, motion } from 'framer-motion';

// --- 音乐弹框组件 ---
const MusicModal: React.FC = () => {
    const { isMusicPlaying, setIsMusicPlaying, showMusicModal, setShowMusicModal } = useContext(TreeContext) as TreeContextType;
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handlePlayMusic = () => {
        if (!audioRef.current) {
            audioRef.current = new Audio('/mp3/Bauklotze.mp3');
            audioRef.current.loop = true;
            audioRef.current.volume = 0.5;
        }

        audioRef.current.play().then(() => {
            setIsMusicPlaying(true);
            setShowMusicModal(false);
        }).catch((error) => {
            console.error('音频播放失败:', error);
        });
    };

    const handlePlayWithoutMusic = () => {
        setShowMusicModal(false);
    };

    if (!showMusicModal) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.8, opacity: 0, rotate: -2 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.8, opacity: 0, rotate: 2 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="relative max-w-md w-full mx-4 p-8 bg-gradient-to-br from-red-900/90 to-green-900/90 backdrop-blur-xl rounded-3xl shadow-[0_0_60px_rgba(255,0,0,0.3)] border border-white/20 overflow-hidden"
            >
                {/* 装饰性光晕 */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-red-500/10 via-transparent to-green-500/10 pointer-events-none"></div>
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-yellow-400/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-red-500/20 rounded-full blur-3xl pointer-events-none"></div>

                {/* 内容 */}
                <div className="relative z-10 text-center">
                    {/* 图标 */}
                    <motion.div
                        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="text-7xl mb-6"
                    >
                        🎄
                    </motion.div>

                    {/* 标题 */}
                    <h2 className="text-3xl font-bold mb-4 cinzel text-white drop-shadow-lg">
                        christmas-trees-turbo版本
                    </h2>

                    {/* 描述 */}
                    <p className="text-white/80 mb-8 text-sm leading-relaxed">
                        开启音乐没有彩蛋
                        因为需要3D渲染所以用到了GPU,如果电脑GPU不好会卡卡的（我电脑就是）,不好意思=￣ω￣=
                    </p>

                    {/* 按钮 */}
                    <div className="flex flex-col gap-4">
                        <motion.button
                            onClick={handlePlayMusic}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-white font-bold rounded-2xl shadow-lg shadow-yellow-500/30 transition-all duration-300 flex items-center justify-center gap-3"
                        >
                            <span className="text-2xl">🎵</span>
                            <span>播放音乐</span>
                        </motion.button>

                    </div>
                </div>

                {/* 装饰性边框 */}
                <div className="absolute top-4 left-4 text-2xl">❄️</div>
                <div className="absolute top-4 right-4 text-2xl">⭐</div>
                <div className="absolute bottom-4 left-4 text-2xl">✨</div>
                <div className="absolute bottom-4 right-4 text-2xl">🎁</div>
            </motion.div>
        </motion.div>
    );
};

// --- 音乐播放/静音切换按钮 ---
const MuteButton: React.FC = () => {
    const { isMusicPlaying, setIsMusicPlaying } = useContext(TreeContext) as TreeContextType;
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handleToggle = () => {
        if (!audioRef.current) {
            audioRef.current = new Audio('/mp3/Bauklotze.mp3');
            audioRef.current.loop = true;
            audioRef.current.volume = 0.5;
        }

        if (isMusicPlaying) {
            audioRef.current.pause();
            setIsMusicPlaying(false);
        } else {
            audioRef.current.play().then(() => {
                setIsMusicPlaying(true);
            }).catch((error) => {
                console.error('音频播放失败:', error);
            });
        }
    };

    return (
        <motion.button
            onClick={handleToggle}
            className="pointer-events-auto fixed bottom-8 right-8 z-40 w-12 h-12 bg-gradient-to-r from-red-600/80 to-red-800/80 hover:from-red-500/90 hover:to-red-700/90 backdrop-blur-sm rounded-full shadow-[0_0_30px_rgba(255,0,0,0.4)] border border-white/20 transition-all duration-300 flex items-center justify-center group"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <span className={`text-xl ${isMusicPlaying ? 'animate-pulse' : ''}`}>
                {isMusicPlaying ? '🎵' : '🔇'}
            </span>
        </motion.button>
    );
};


// --- 梦幻光标组件 ---
const DreamyCursor: React.FC<{ pointer: PointerCoords | null, progress: number }> = ({ pointer, progress }) => {
    if (!pointer) return null;
    return (
        <motion.div
            className="fixed top-0 left-0 pointer-events-none z-[200]"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
                opacity: 1,
                scale: 1,
                left: `${pointer.x * 100}%`,
                top: `${pointer.y * 100}%`
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            style={{ x: "-50%", y: "-50%" }}
        >
            {/* 核心光点 */}
            <div className={`rounded-full transition-all duration-300 ${progress > 0.8 ? 'w-4 h-4 bg-emerald-400 shadow-[0_0_20px_#34d399]' : 'w-2 h-2 bg-amber-200 shadow-[0_0_15px_#fcd34d]'}`} />

            {/* 进度光环 - 魔法符文风格 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/20 animate-spin-slow"></div>

            <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 -rotate-90 overflow-visible">
                <defs>
                    <linearGradient id="magicGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#fbbf24" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                        <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>
                {/* 倒计时圆环 */}
                <circle
                    cx="24" cy="24" r="20"
                    fill="none"
                    stroke="url(#magicGradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="125.6"
                    strokeDashoffset={125.6 * (1 - progress)}
                    filter="url(#glow)"
                    className="transition-[stroke-dashoffset] duration-75 ease-linear"
                />
            </svg>

            {/* 粒子拖尾装饰 (CSS 动画) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-gradient-to-r from-emerald-500/10 to-amber-500/10 rounded-full blur-xl animate-pulse"></div>
        </motion.div>
    );
};

// --- 照片弹窗 ---
const PhotoModal: React.FC<{ url: string | null, onClose: () => void }> = ({ url, onClose }) => {
    if (!url) return null;
    return (
        <motion.div
            id="photo-modal-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.8, y: 50, rotate: -5 }}
                animate={{ scale: 1, y: 0, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, y: 100 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="relative max-w-4xl max-h-full bg-white p-3 rounded shadow-[0_0_50px_rgba(255,215,0,0.3)] border-8 border-white"
                onClick={(e) => e.stopPropagation()}
            >
                <img src={url} alt="Memory" className="max-h-[80vh] object-contain rounded shadow-inner" />
                <div className="absolute -bottom-12 w-full text-center text-red-300/70 cinzel text-sm">
                    ❄️ Precious Moment ❄️ Tap to close
                </div>
            </motion.div>
        </motion.div>
    );
}

const AppContent: React.FC = () => {
    const { state, setState, webcamEnabled, setWebcamEnabled, pointer, hoverProgress, selectedPhotoUrl, setSelectedPhotoUrl, clickTrigger } = useContext(TreeContext) as TreeContextType;

    useEffect(() => {
        if (selectedPhotoUrl && pointer) {
            const x = pointer.x * window.innerWidth;
            const y = pointer.y * window.innerHeight;
            const element = document.elementFromPoint(x, y);
            if (element) {
                const isImage = element.tagName === 'IMG';
                const isBackdrop = element.id === 'photo-modal-backdrop';
                if (isBackdrop || isImage) setSelectedPhotoUrl(null);
            }
        }
    }, [clickTrigger]);

    return (
        <main className="relative w-full h-screen bg-black text-white overflow-hidden cursor-none">
            {/* 摄像头背景层 (z-0) */}
            {webcamEnabled && <GestureInput />}

            {/* 3D 场景层 (z-10) */}
            <div className="absolute inset-0 z-10">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-red-400 cinzel animate-pulse text-2xl">🎄 Loading Christmas Magic... ❄️</div>}>
                    <Experience />
                </Suspense>
            </div>

            {/* 科技感特效层 (z-20) */}
            {webcamEnabled && <TechEffects />}

            {/* UI 层 (z-30) */}
            <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-8">
                {/* 静音切换按钮 */}
                <MuteButton />
            </div>

            {/* 光标层 (z-200) */}
            <DreamyCursor pointer={pointer} progress={hoverProgress} />

            {/* 弹窗层 (z-100) */}
            <AnimatePresence>
                {selectedPhotoUrl && <PhotoModal url={selectedPhotoUrl} onClose={() => setSelectedPhotoUrl(null)} />}
            </AnimatePresence>

            {/* 音乐弹窗层 (z-150) */}
            <AnimatePresence>
                <MusicModal />
            </AnimatePresence>
        </main>
    );
};

const App: React.FC = () => {
    const [state, setState] = useState<AppState>('CHAOS');
    const [rotationSpeed, setRotationSpeed] = useState<number>(0.3); // 固定基础旋转速度
    const [rotationBoost, setRotationBoost] = useState<number>(0); // 额外加速度
    const [webcamEnabled, setWebcamEnabled] = useState<boolean>(true);
    const [pointer, setPointer] = useState<PointerCoords | null>(null);
    const [hoverProgress, setHoverProgress] = useState<number>(0);
    const [clickTrigger, setClickTrigger] = useState<number>(0);
    const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
    const [panOffset, setPanOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [zoomOffset, setZoomOffset] = useState<number>(0);
    const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
    const [showMusicModal, setShowMusicModal] = useState<boolean>(true);

    return (
        <TreeContext.Provider value={{
            state, setState,
            rotationSpeed, setRotationSpeed,
            webcamEnabled, setWebcamEnabled,
            pointer, setPointer,
            hoverProgress, setHoverProgress,
            clickTrigger, setClickTrigger,
            selectedPhotoUrl, setSelectedPhotoUrl,
            panOffset, setPanOffset,
            rotationBoost, setRotationBoost,
            zoomOffset, setZoomOffset,
            isMusicPlaying, setIsMusicPlaying,
            showMusicModal, setShowMusicModal
        }}>
            <AppContent />
        </TreeContext.Provider>
    );
};

export default App;
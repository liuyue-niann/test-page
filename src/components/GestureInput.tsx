import React, { useEffect, useRef, useContext, useState } from 'react';
import { FilesetResolver, GestureRecognizer, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { TreeContext, TreeContextType } from '../types';

const GestureInput: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const { setState, setRotationSpeed, setPointer, state: appState, setHoverProgress, setClickTrigger, selectedPhotoUrl, setPanOffset } = useContext(TreeContext) as TreeContextType;
  
  const stateRef = useRef(appState);
  const photoRef = useRef(selectedPhotoUrl);

  useEffect(() => {
    stateRef.current = appState;
    photoRef.current = selectedPhotoUrl;
  }, [appState, selectedPhotoUrl]);

  const [loading, setLoading] = useState(true);
  
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastVideoTime = useRef<number>(-1);
  const gestureStreak = useRef<{ name: string | null; count: number }>({ name: null, count: 0 });
  
  const dwellTimerRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  
  // 记录上一帧手掌中心位置，用于计算位移差
  const lastPalmPos = useRef<{x: number, y: number} | null>(null);

  const isExtended = (landmarks: NormalizedLandmark[], tipIdx: number, mcpIdx: number, wrist: NormalizedLandmark) => {
    const tipDist = Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y);
    const mcpDist = Math.hypot(landmarks[mcpIdx].x - wrist.x, landmarks[mcpIdx].y - wrist.y);
    return tipDist > mcpDist * 1.3;
  };

  useEffect(() => {
    let mounted = true;
    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        if (!mounted) return;
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 320, height: 240, frameRate: { ideal: 30 } } 
          });
          if (videoRef.current && mounted) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play();
              if (canvasRef.current && videoRef.current) {
                  canvasRef.current.width = videoRef.current.videoWidth;
                  canvasRef.current.height = videoRef.current.videoHeight;
              }
              setLoading(false);
              lastFrameTimeRef.current = Date.now();
              predictWebcam();
            };
          }
        }
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
        setLoading(false);
      }
    };
    setupMediaPipe();
    return () => {
      mounted = false;
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const predictWebcam = () => {
    const now = Date.now();
    const delta = (now - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = now;

    const currentState = stateRef.current;
    const isPhotoOpen = !!photoRef.current;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const recognizer = recognizerRef.current;

    if (video && recognizer && canvas) {
      if (video.currentTime !== lastVideoTime.current) {
        lastVideoTime.current = video.currentTime;
        const results = recognizer.recognizeForVideo(video, Date.now());
        const ctx = canvas.getContext("2d");
        
        let detectedColor = "rgba(255, 255, 255, 0.2)";
        let currentPointer = null;
        let isPointing = false;
        let isPanning = false;

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const wrist = landmarks[0];

          const indexExtended = isExtended(landmarks, 8, 5, wrist);
          const middleExtended = isExtended(landmarks, 12, 9, wrist);
          const ringExtended = isExtended(landmarks, 16, 13, wrist);
          const pinkyExtended = isExtended(landmarks, 20, 17, wrist);
          const thumbExtended = isExtended(landmarks, 4, 2, wrist);

          isPointing = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;
          const isFiveFingers = indexExtended && middleExtended && ringExtended && pinkyExtended && thumbExtended;

          // --- 逻辑分支 1: 五指平移 (仅在 CHAOS 且未打开照片时) ---
          if (currentState === 'CHAOS' && !isPhotoOpen && isFiveFingers) {
             isPanning = true;
             // 计算手掌中心 (用 0, 5, 17 的重心简单模拟)
             const palmX = (landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3;
             const palmY = (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3;

             if (lastPalmPos.current) {
                // 计算差值 (注意 x 轴镜像)
                const dx = (1.0 - palmX) - (1.0 - lastPalmPos.current.x);
                const dy = palmY - lastPalmPos.current.y;
                
                // 累加到全局位移，稍微放大灵敏度
                setPanOffset(prev => ({ 
                    x: prev.x + dx * 15, 
                    y: prev.y - dy * 15  // Y轴反转，手向上树向上
                }));
             }
             lastPalmPos.current = { x: palmX, y: palmY };
             detectedColor = "rgba(255, 215, 0, 0.8)"; // 金色

             // 平移时清除光标状态
             dwellTimerRef.current = 0;
             setHoverProgress(0);
             
          } else {
             lastPalmPos.current = null;
          }

          // --- 逻辑分支 2: 单指光标 ---
          if (!isPanning && currentState === 'CHAOS' && isPointing) {
            const indexTip = landmarks[8];
            currentPointer = { x: 1.0 - indexTip.x, y: indexTip.y };
            
            dwellTimerRef.current += delta;
            
            const DWELL_THRESHOLD = 1.2;
            const progress = Math.min(dwellTimerRef.current / DWELL_THRESHOLD, 1.0);
            setHoverProgress(progress);
            
            if (dwellTimerRef.current >= DWELL_THRESHOLD) {
                setClickTrigger(Date.now());
                dwellTimerRef.current = 0;
                setHoverProgress(0);
                detectedColor = "rgba(0, 255, 0, 1.0)";
            } else {
                detectedColor = "rgba(0, 255, 255, 0.8)";
            }
          } else if (!isPanning) {
            dwellTimerRef.current = 0;
            setHoverProgress(0);
          }

          // --- 逻辑分支 3: 状态切换 (拳头/张手 - 简单版) ---
          // 仅在 FORMED 状态或者 CHAOS 但非平移操作时检测
          // 此时 isPanning 为 false
          if (!isPointing && !isPanning && !isPhotoOpen && results.gestures.length > 0) {
            const gesture = results.gestures[0][0];
            const name = gesture.categoryName;
            const score = gesture.score;

            if (score > 0.6) {
               // 简化：这里主要用于 FORMED 切换回 CHAOS，或者 CHAOS 切换回 FORMED (如果不是五指平移的话)
               // 因为 isFiveFingers 已经被上面的 isPanning 捕获了，所以 Open_Palm 在 CHAOS 下优先触发平移
               // 只有在 FORMED 下 Open_Palm 才触发切换
               
               if (currentState === 'FORMED' && name === 'Open_Palm') {
                    if (gestureStreak.current.name === name) gestureStreak.current.count++;
                    else gestureStreak.current = { name: name, count: 1 };
               } else if (name === 'Closed_Fist') {
                    if (gestureStreak.current.name === name) gestureStreak.current.count++;
                    else gestureStreak.current = { name: name, count: 1 };
               }
              
              if (gestureStreak.current.count > 15) {
                if (name === "Open_Palm") setState("CHAOS");
                else if (name === "Closed_Fist") setState("FORMED");
              }
            } else {
              gestureStreak.current = { name: null, count: 0 };
            }
            
            // 旋转控制 (FORMED 模式)
            if (currentState === 'FORMED') {
                 const handX = landmarks[0].x;
                 setRotationSpeed(0.2 + (handX * 2.0));
            }
          }

        } else {
          dwellTimerRef.current = 0;
          setHoverProgress(0);
          setPointer(null);
          lastPalmPos.current = null;
        }
        
        setPointer(currentPointer);

        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.landmarks && results.landmarks.length > 0) {
                const landmarks = results.landmarks[0];
                const drawingUtils = new DrawingUtils(ctx);
                
                drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: detectedColor, lineWidth: 2 });
                drawingUtils.drawLandmarks(landmarks, { color: "rgba(255, 255, 255, 0.5)", lineWidth: 1, radius: 2 });

                if (currentPointer) {
                    const indexTip = landmarks[8];
                    ctx.beginPath();
                    ctx.arc(indexTip.x * canvas.width, indexTip.y * canvas.height, 8, 0, 2 * Math.PI);
                    ctx.strokeStyle = "#00FFFF";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    // 尺寸放大：w-64 h-48 (原 48x36 -> 192px / 144px，现在 256px / 192px, 再大一倍 w-96 h-72)
    <div className="relative w-96 h-72 bg-black/80 overflow-hidden rounded-lg border border-white/10 shadow-2xl">
      <video 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-cover opacity-80" 
        playsInline 
        muted 
        autoPlay
        style={{ transform: 'scaleX(-1)' }} 
      />
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full object-cover" 
        style={{ transform: 'scaleX(-1)' }} 
      />
      {loading && <div className="absolute inset-0 flex items-center justify-center text-xs text-emerald-500 animate-pulse bg-black/90 z-20 cinzel">SYSTEM INITIALIZING...</div>}
      <div className="absolute bottom-2 left-3 text-[10px] text-white/50 cinzel z-10">
        POINT: SELECT | PALM MOVE: PAN | FIST: FORM
      </div>
    </div>
  );
};

export default GestureInput;
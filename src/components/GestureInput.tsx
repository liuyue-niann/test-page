
import React, { useEffect, useRef, useContext, useState } from 'react';
import { FilesetResolver, GestureRecognizer, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { TreeContext, TreeContextType } from '../types';

const GestureInput: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { setState, setRotationSpeed, setPointer, state: appState, setHoverProgress, setClickTrigger } = useContext(TreeContext) as TreeContextType;
  const [loading, setLoading] = useState(true);
  
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastVideoTime = useRef<number>(-1);
  const gestureStreak = useRef<{ name: string | null; count: number }>({ name: null, count: 0 });
  
  // 悬停计时器 Ref
  const dwellTimerRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  // --- 辅助函数：判断手指伸直 ---
  // 通过比较 [指尖到手腕距离] 与 [指根到手腕距离]
  const isExtended = (landmarks: NormalizedLandmark[], tipIdx: number, mcpIdx: number, wrist: NormalizedLandmark) => {
    const tipDist = Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y);
    const mcpDist = Math.hypot(landmarks[mcpIdx].x - wrist.x, landmarks[mcpIdx].y - wrist.y);
    return tipDist > mcpDist * 1.3; // 阈值 1.3，表示指尖要伸得比关节远
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const predictWebcam = () => {
    const now = Date.now();
    const delta = (now - lastFrameTimeRef.current) / 1000; // 秒
    lastFrameTimeRef.current = now;

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

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const wrist = landmarks[0];

          // --- 1. 严格的手势过滤 (只允许单指指向) ---
          const indexExtended = isExtended(landmarks, 8, 5, wrist);   // 食指
          const middleExtended = isExtended(landmarks, 12, 9, wrist); // 中指
          const ringExtended = isExtended(landmarks, 16, 13, wrist);  // 无名指
          const pinkyExtended = isExtended(landmarks, 20, 17, wrist); // 小指

          // 只有食指伸直，其他三指弯曲，才算“指向”
          // (拇指比较灵活，不做严格限制，这样手势更自然)
          isPointing = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

          // 只有在 CHAOS (散开) 模式下才启用光标
          if (appState === 'CHAOS' && isPointing) {
            // 获取食指指尖 (镜像翻转 X)
            const indexTip = landmarks[8];
            currentPointer = { x: 1.0 - indexTip.x, y: indexTip.y };
            
            // --- 悬停确认逻辑 ---
            // 累加时间
            dwellTimerRef.current += delta;
            
            const DWELL_THRESHOLD = 1.2; // 调整为 1.2 秒
            const progress = Math.min(dwellTimerRef.current / DWELL_THRESHOLD, 1.0);
            setHoverProgress(progress);
            
            if (dwellTimerRef.current >= DWELL_THRESHOLD) {
                // 触发点击！
                setClickTrigger(Date.now());
                dwellTimerRef.current = 0; // 重置
                setHoverProgress(0);
                detectedColor = "rgba(0, 255, 0, 1.0)"; // 触发瞬间变绿
            } else {
                detectedColor = "rgba(0, 255, 255, 0.8)"; // 正在指向：青色
            }

          } else {
            // 没指向时，重置计时器
            dwellTimerRef.current = 0;
            setHoverProgress(0);
          }

          // --- 2. 状态切换手势 (Open Palm / Closed Fist) ---
          // 只有当 *没有* 在指向时，才允许切换状态，防止误触
          if (!isPointing && results.gestures.length > 0) {
            const gesture = results.gestures[0][0];
            const name = gesture.categoryName;
            const score = gesture.score;

            if (score > 0.6) {
              if (gestureStreak.current.name === name) {
                gestureStreak.current.count++;
              } else {
                gestureStreak.current = { name: name, count: 1 };
              }
              
              if (gestureStreak.current.count > 8) {
                if (name === "Open_Palm") setState("CHAOS");
                else if (name === "Closed_Fist") setState("FORMED");
              }
            } else {
              gestureStreak.current = { name: null, count: 0 };
            }
            
            // 旋转控制
            const handX = landmarks[0].x;
            setRotationSpeed(0.2 + (handX * 2.0));
          } else {
             gestureStreak.current = { name: null, count: 0 };
          }

        } else {
          // 没手
          dwellTimerRef.current = 0;
          setHoverProgress(0);
          setPointer(null);
        }
        
        // 更新光标位置
        setPointer(currentPointer);

        // --- 3. 绘制 HUD ---
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.landmarks && results.landmarks.length > 0) {
                const landmarks = results.landmarks[0];
                const drawingUtils = new DrawingUtils(ctx);
                
                // 绘制骨骼
                drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: detectedColor, lineWidth: 2 });
                drawingUtils.drawLandmarks(landmarks, { color: "rgba(255, 255, 255, 0.5)", lineWidth: 1, radius: 2 });

                // 如果正在指向，高亮食指指尖
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
    <div className="relative w-full h-full bg-black/80 overflow-hidden rounded-lg border border-white/10">
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
        POINT: SELECT | PALM: CHAOS
      </div>
    </div>
  );
};

export default GestureInput;

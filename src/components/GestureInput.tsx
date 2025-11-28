
import React, { useEffect, useRef, useContext, useState } from 'react';
import { FilesetResolver, GestureRecognizer, DrawingUtils } from '@mediapipe/tasks-vision';
import { TreeContext, TreeContextType } from '../types';

const GestureInput: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 从 Context 获取更新状态的方法
  const { 
    state,
    setState, 
    setRotationSpeed,
    setPointer,      // 更新光标位置
    setIsPinching    // 更新捏合状态
  } = useContext(TreeContext) as TreeContextType;

  const [loading, setLoading] = useState(true);
  
  // AI Core Refs
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastVideoTime = useRef<number>(-1);

  // Gesture Debounce Ref
  const gestureStreak = useRef<{ name: string | null; count: number }>({ name: null, count: 0 });
  const [skeletonColor, setSkeletonColor] = useState<string>("rgba(255, 255, 255, 0.3)");

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
              if (videoRef.current) {
                videoRef.current.play();
                if (canvasRef.current) {
                    canvasRef.current.width = videoRef.current.videoWidth;
                    canvasRef.current.height = videoRef.current.videoHeight;
                }
                setLoading(false);
                predictWebcam();
              }
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
  }, [state]); // 依赖 state，因为某些交互仅在 CHAOS 下生效

  const predictWebcam = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const recognizer = recognizerRef.current;

    if (video && recognizer && canvas) {
      if (video.currentTime !== lastVideoTime.current) {
        lastVideoTime.current = video.currentTime;
        
        const results = recognizer.recognizeForVideo(video, Date.now());
        const ctx = canvas.getContext("2d");
        
        // 默认骨骼颜色
        let detectedColor = "rgba(255, 255, 255, 0.3)";
        let isPinchingNow = false;

        // --- 手势与触控逻辑 ---
        if (results.gestures.length > 0 && results.landmarks && results.landmarks.length > 0) {
          const gesture = results.gestures[0][0];
          const name = gesture.categoryName;
          const score = gesture.score;
          const landmarks = results.landmarks[0];

          // 1. 获取关键点：食指指尖 (8) 和 拇指指尖 (4)
          const indexTip = landmarks[8];
          const thumbTip = landmarks[4];

          // 2. 计算捏合距离 (欧几里得距离)
          const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
          const PINCH_THRESHOLD = 0.05; // 触发阈值
          
          if (pinchDist < PINCH_THRESHOLD) {
            isPinchingNow = true;
          }

          // 3. 更新全局光标 (仅在 CHAOS 模式下)
          // 注意：视频是镜像翻转的 (scaleX(-1))，所以 X 坐标需要反转 (1.0 - x)
          if (state === 'CHAOS') {
            setPointer({ x: 1.0 - indexTip.x, y: indexTip.y });
            setIsPinching(isPinchingNow);
          } else {
            // FORMED 模式下禁用光标
            setPointer(null);
            setIsPinching(false);
          }

          // 4. 全局状态切换 (Open_Palm / Closed_Fist)
          // 防冲突：只有在没有捏合时才检测大手势
          if (!isPinchingNow && score > 0.6) {
            
            if (gestureStreak.current.name === name) {
              gestureStreak.current.count++;
            } else {
              gestureStreak.current = { name: name, count: 1 };
            }

            // 防抖：连续 10 帧才触发
            if (gestureStreak.current.count > 10) {
              if (name === "Open_Palm") {
                setState("CHAOS");
                detectedColor = "rgba(0, 255, 255, 0.8)";
              } else if (name === "Closed_Fist") {
                setState("FORMED");
                detectedColor = "rgba(255, 215, 0, 0.8)";
              }
            } else {
              detectedColor = "rgba(255, 255, 255, 0.6)";
            }

          } else {
            gestureStreak.current = { name: null, count: 0 };
          }

          // 5. 旋转速度控制 (仅 FORMED 模式)
          if (state === 'FORMED') {
            const handX = landmarks[0].x;
            const speedFactor = 0.2 + (handX * 2.0); 
            setRotationSpeed(speedFactor);
          }

        } else {
          // 未检测到手
          setPointer(null);
          setIsPinching(false);
          gestureStreak.current = { name: null, count: 0 };
        }
        
        // 捏合时的颜色反馈
        if (isPinchingNow) {
            detectedColor = "rgba(255, 50, 50, 0.9)";
        }
        
        if (detectedColor !== skeletonColor) setSkeletonColor(detectedColor);

        // --- 绘制骨骼与反馈 ---
        if (ctx && results.landmarks) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const drawingUtils = new DrawingUtils(ctx);
            
            for (const landmarks of results.landmarks) {
                // 绘制连接线
                drawingUtils.drawConnectors(
                    landmarks, 
                    GestureRecognizer.HAND_CONNECTIONS, 
                    { color: detectedColor, lineWidth: 2 }
                );
                // 绘制关节点
                drawingUtils.drawLandmarks(
                    landmarks, 
                    { color: "rgba(255, 255, 255, 0.5)", lineWidth: 1, radius: 2 }
                );

                // --- 高亮食指指尖 (光标点) ---
                const indexTip = landmarks[8];
                const x = indexTip.x * canvas.width;
                const y = indexTip.y * canvas.height;
                
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, 2 * Math.PI); // 指尖光圈
                // 捏合变红，否则青色
                ctx.fillStyle = isPinchingNow ? "rgba(255, 50, 50, 1)" : "rgba(0, 255, 255, 0.8)";
                ctx.fill();
                ctx.strokeStyle = "white";
                ctx.stroke();
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
        className="absolute inset-0 w-full h-full object-cover opacity-40" 
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

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-emerald-500 animate-pulse bg-black/90 z-20 cinzel">
          SYSTEM INITIALIZING...
        </div>
      )}
      
      <div className="absolute bottom-2 left-3 flex flex-col gap-1 z-20 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${skeletonColor.includes('255, 50, 50') ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-white/20'}`}></div>
          <span className="text-[10px] text-white/60 cinzel tracking-widest">PINCH: SELECT</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${skeletonColor.includes('0, 255, 255') ? 'bg-cyan-400 shadow-[0_0_10px_cyan]' : 'bg-white/20'}`}></div>
          <span className="text-[10px] text-white/60 cinzel tracking-widest">INDEX: POINTER</span>
        </div>
      </div>
    </div>
  );
};

export default GestureInput;

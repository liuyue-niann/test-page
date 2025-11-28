import React, { useEffect, useRef, useContext, useState } from 'react';
import { FilesetResolver, GestureRecognizer, DrawingUtils } from '@mediapipe/tasks-vision';
import { TreeContext } from '../types';

const GestureInput: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // 新增 Canvas 引用
  const { setState, setRotationSpeed } = useContext(TreeContext);
  const [loading, setLoading] = useState(true);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastVideoTime = useRef<number>(-1);

  useEffect(() => {
    let mounted = true;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        if (!mounted) return;

        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1 // 追踪一只手
        });

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              width: 320, 
              height: 240,
              frameRate: { ideal: 30 }
            } 
          });
          
          if (videoRef.current && mounted) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play();
              // 初始化 Canvas 尺寸
              if (canvasRef.current && videoRef.current) {
                  canvasRef.current.width = videoRef.current.videoWidth;
                  canvasRef.current.height = videoRef.current.videoHeight;
              }
              setLoading(false);
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
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const recognizer = recognizerRef.current;

    if (video && recognizer && canvas) {
      if (video.currentTime !== lastVideoTime.current) {
        lastVideoTime.current = video.currentTime;
        
        // 1. 获取识别结果
        const results = recognizer.recognizeForVideo(video, Date.now());
        
        // 2. 准备绘图上下文
        const ctx = canvas.getContext("2d");
        
        if (ctx) {
            // 清除上一帧的画图
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 如果检测到了手部关键点，开始绘制骨骼
            if (results.landmarks) {
                const drawingUtils = new DrawingUtils(ctx);
                for (const landmarks of results.landmarks) {
                    // 绘制连接线 (骨骼) - 使用半透明青色
                    drawingUtils.drawConnectors(
                        landmarks, 
                        GestureRecognizer.HAND_CONNECTIONS, 
                        { color: "rgba(0, 255, 255, 0.6)", lineWidth: 4 }
                    );
                    // 绘制关键点 (关节) - 使用白色
                    drawingUtils.drawLandmarks(
                        landmarks, 
                        { color: "#FFFFFF", lineWidth: 1, radius: 3 }
                    );
                }
            }
        }

        // 3. 处理手势逻辑 (保持原有逻辑)
        if (results.gestures.length > 0) {
          const gesture = results.gestures[0][0];
          
          if (gesture.categoryName === "Open_Palm") {
            setState("CHAOS");
          } else if (gesture.categoryName === "Closed_Fist") {
            setState("FORMED");
          }

          if (results.landmarks && results.landmarks[0]) {
            const handX = results.landmarks[0][0].x;
            const speedFactor = 0.2 + (handX * 2.0); 
            setRotationSpeed(speedFactor);
          }
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="relative w-full h-full bg-black/80 overflow-hidden rounded-lg">
      {/* 视频层：镜像翻转 */}
      <video 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-cover opacity-60" 
        playsInline 
        muted 
        autoPlay
        style={{ transform: 'scaleX(-1)' }} 
      />
      
      {/* Canvas层：绘制骨骼，必须也镜像翻转以匹配视频 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-emerald-500 animate-pulse bg-black/90 z-20">
          INITIALIZING AI...
        </div>
      )}
      
      <div className="absolute bottom-1 left-2 text-[10px] text-white/70 cinzel z-20 drop-shadow-md">
        OPEN: CHAOS | CLOSED: FORM
      </div>
    </div>
  );
};

export default GestureInput;
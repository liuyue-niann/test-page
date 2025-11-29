import React, { useEffect, useRef, useContext, useState } from 'react';
import { FilesetResolver, GestureRecognizer, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { TreeContext, TreeContextType } from '../types';

const GestureInput: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { setState, setRotationSpeed, setRotationBoost, setPointer, state: appState, setHoverProgress, setClickTrigger, selectedPhotoUrl, setPanOffset, setZoomOffset } = useContext(TreeContext) as TreeContextType;

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
  const gestureStreak = useRef<{ name: string | null; count: number; lastStable: string | null }>({ name: null, count: 0, lastStable: null });

  const dwellTimerRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  // 记录上一帧手掌中心位置，用于计算位移差
  const lastPalmPos = useRef<{ x: number, y: number } | null>(null);
  // 记录上一帧双手距离，用于缩放
  const lastHandDistance = useRef<number | null>(null);

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
          numHands: 2
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

          // 全局更新手掌位置 (无论什么手势，只要有手就追踪，防止 flickering 导致 dx 丢失)
          const palmX = (landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3;
          const palmY = (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3;

          let dx = 0;
          let dy = 0;
          if (lastPalmPos.current) {
            dx = (1.0 - palmX) - (1.0 - lastPalmPos.current.x); // x 轴镜像
            dy = palmY - lastPalmPos.current.y;
          }
          lastPalmPos.current = { x: palmX, y: palmY };

          const isMoving = Math.abs(dx) > 0.003 || Math.abs(dy) > 0.003;

          // 如果是单指指向，打断"蓄力"状态
          if (isPointing) {
            gestureStreak.current.lastStable = null;
          }

          // --- 逻辑分支 1: 五指平移 (仅在 CHAOS 且未打开照片时，且只有一只手) ---
          if (currentState === 'CHAOS' && !isPhotoOpen && isFiveFingers && results.landmarks.length === 1) {
            isPanning = true;
            // 累加到全局位移
            setPanOffset(prev => ({
              x: prev.x + dx * 15,
              y: prev.y - dy * 15
            }));
            detectedColor = "rgba(255, 215, 0, 0.8)"; // 金色

            // 平移时清除光标状态
            dwellTimerRef.current = 0;
            setHoverProgress(0);

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

          // --- 逻辑分支 3: 状态切换 & 旋转控制 ---
          if (!isPointing && !isPanning && !isPhotoOpen && results.gestures.length > 0) {
            const gesture = results.gestures[0][0];
            const name = gesture.categoryName;
            const score = gesture.score;

            if (score > 0.6) {
              // 状态切换逻辑
              // 1. FORMED -> CHAOS (Open_Palm) - 必须是组合手势：先握拳 (Closed_Fist) -> 再张开 (Open_Palm)
              // 2. CHAOS -> FORMED (Closed_Fist)

              let targetState = null;
              if (currentState === 'FORMED' && name === 'Open_Palm') {
                // 只要上一个稳定手势是 Closed_Fist，就允许炸开，即使有轻微移动
                // 这样解决了用户反馈的"从拳头展开5个手指，圣诞树不会炸开"的问题
                if (gestureStreak.current.lastStable === 'Closed_Fist') {
                  targetState = 'CHAOS';
                }
              } else if (name === 'Closed_Fist') {
                targetState = 'FORMED';
              }

              if (targetState) {
                if (gestureStreak.current.name === name) {
                  gestureStreak.current.count++;
                } else {
                  gestureStreak.current = { ...gestureStreak.current, name: name, count: 1 };
                }
              } else {
                // 如果正在移动或者手势变了，重置计数，但保留 lastStable
                gestureStreak.current = { ...gestureStreak.current, name: null, count: 0 };
              }

              // 阈值调整：
              // Closed_Fist (成树) 可以慢一点，防误触 -> 15帧
              // Open_Palm (炸开) 需要快一点，响应用户需求 -> 5帧
              const threshold = name === 'Open_Palm' ? 5 : 15;

              if (gestureStreak.current.count > threshold) {
                if (name === "Open_Palm" && currentState === 'FORMED') {
                  setState("CHAOS");
                  // 触发后重置 lastStable，防止重复触发
                  gestureStreak.current.lastStable = null;
                }
                else if (name === "Closed_Fist") {
                  setState("FORMED");
                  // 记录稳定手势为 Closed_Fist
                  gestureStreak.current.lastStable = 'Closed_Fist';
                }

                // 触发状态切换后重置计数
                gestureStreak.current = { ...gestureStreak.current, name: null, count: 0 };
              }
            } else {
              gestureStreak.current = { ...gestureStreak.current, name: null, count: 0 };
            }

            // 旋转控制 (FORMED 模式)
            if (currentState === 'FORMED') {
              // 物理模拟：手势加速 + 自动衰减
              // 使用 isFiveFingers (基于 landmarks) 响应更灵敏
              if (isFiveFingers) {
                if (Math.abs(dx) > 0.001) { // 只要有微小移动就计算加速度
                  // 累加加速度
                  // 修正：反转方向 (prev - dx)
                  setRotationBoost(prev => {
                    const newBoost = prev - dx * 8.0; // 增加灵敏度 5.0 -> 8.0, 方向反转
                    return Math.max(Math.min(newBoost, 3.0), -3.0); // 稍微放宽上限
                  });
                  detectedColor = "rgba(255, 215, 0, 0.8)";

                  // 关键：如果正在旋转（移动），且上一个状态不是拳头，则打断"蓄力"状态
                  // 如果是拳头，保留状态以便触发炸开
                  if (gestureStreak.current.lastStable !== 'Closed_Fist') {
                    gestureStreak.current.lastStable = null;
                  }
                }
              } else {
                // 无手势时，阻尼衰减
                setRotationBoost(prev => {
                  const decayed = prev * 0.95;
                  if (Math.abs(decayed) < 0.001) return 0;
                  return decayed;
                });
              }
            }
          }

          // --- 逻辑分支 4: 双手缩放 (仅在 CHAOS 模式) ---
          if (currentState === 'CHAOS' && results.landmarks.length === 2) {
            const hand1 = results.landmarks[0][0]; // Wrist of hand 1
            const hand2 = results.landmarks[1][0]; // Wrist of hand 2

            // 计算两手距离 (归一化坐标系)
            const dist = Math.hypot(hand1.x - hand2.x, hand1.y - hand2.y);

            if (lastHandDistance.current !== null) {
              const delta = dist - lastHandDistance.current;

              // 距离变大 -> Zoom In (TargetZ 减小) -> delta > 0 -> zoomOffset 减小
              // 距离变小 -> Zoom Out (TargetZ 增大) -> delta < 0 -> zoomOffset 增大
              // 灵敏度调整: 40.0 -> 80.0 (加大力度)
              if (Math.abs(delta) > 0.005) {
                setZoomOffset(prev => prev - delta * 80.0);
                detectedColor = "rgba(255, 0, 255, 0.8)"; // 紫色表示缩放
              }
            }
            lastHandDistance.current = dist;
          } else {
            lastHandDistance.current = null;
          }

        } else {
          dwellTimerRef.current = 0;
          setHoverProgress(0);
          setPointer(null);
          lastPalmPos.current = null;
          // 手势丢失，重置所有状态
          gestureStreak.current = { name: null, count: 0, lastStable: null };
        }

        setPointer(currentPointer);

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];
            const drawingUtils = new DrawingUtils(ctx);

            for (const landmarks of results.landmarks) {
              drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: detectedColor, lineWidth: 2 });
              drawingUtils.drawLandmarks(landmarks, { color: "rgba(255, 255, 255, 0.5)", lineWidth: 1, radius: 2 });
            }

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
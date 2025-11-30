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
  const clickCooldownRef = useRef<number>(0);

  // 记录上一帧手掌中心位置，用于计算位移差
  const lastPalmPos = useRef<{ x: number, y: number } | null>(null);
  // 记录上一帧双手距离，用于缩放
  const lastHandDistance = useRef<number | null>(null);
  // 记录上一帧单手尺寸，用于单手缩放
  const lastHandScale = useRef<number | null>(null);

  const isExtended = (landmarks: NormalizedLandmark[], tipIdx: number, mcpIdx: number, wrist: NormalizedLandmark) => {
    const tipDist = Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y);
    const mcpDist = Math.hypot(landmarks[mcpIdx].x - wrist.x, landmarks[mcpIdx].y - wrist.y);
    return tipDist > mcpDist * 1.3;
  };

  const isPinching = (landmarks: NormalizedLandmark[]) => {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    return distance < 0.05; // Threshold for pinch
  };

  useEffect(() => {
    let mounted = true;
    const setupMediaPipe = async () => {
      try {
        // 1. Start Camera Access (Parallel)
        const streamPromise = navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, frameRate: { ideal: 30 } }
        });

        // 2. Start MediaPipe Loading (Parallel)
        const recognizerPromise = (async () => {
          const vision = await FilesetResolver.forVisionTasks(
            "/wasm"
          );
          return GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "/models/gesture_recognizer.task",
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
          });
        })();

        // 3. Wait for both to complete
        const [stream, recognizer] = await Promise.all([streamPromise, recognizerPromise]);

        if (!mounted) return;

        recognizerRef.current = recognizer;

        if (videoRef.current) {
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

        let detectedColor = "rgba(0, 255, 255, 0.2)"; // 默认霓虹青色，降低透明度
        let currentPointer = null;
        let isPointing = false;
        let isPanning = false;
        let isZooming = false;

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
          // 两指检测（食指+中指伸出，无名指和小指收拢）- 用于平移
          const isTwoFingers = indexExtended && middleExtended && !ringExtended && !pinkyExtended;

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

          lastPalmPos.current = { x: palmX, y: palmY };

          // Relaxed movement threshold to 0.005 (was 0.003) to improve dwell stability
          const isMoving = Math.abs(dx) > 0.005 || Math.abs(dy) > 0.005;

          // 如果是单指指向，打断"蓄力"状态
          if (isPointing) {
            gestureStreak.current.lastStable = null;
          }

          // --- 逻辑分支 1: 单手控制 (平移/缩放/旋转) ---
          if (results.landmarks.length === 1) {
            // 1.1 单手缩放 (五指张开，仅在 CHAOS 状态下生效，避免与状态切换冲突)
            // 动作快则缩放快，增强操纵感
            if (isFiveFingers && currentState === 'CHAOS') {
              const currentScale = Math.hypot(wrist.x - landmarks[9].x, wrist.y - landmarks[9].y);
              if (lastHandScale.current !== null) {
                const deltaScale = currentScale - lastHandScale.current;
                // 移除阈值，使用非线性映射增强快速动作的响应
                // deltaScale 越大，缩放越快（平方关系增强差异）
                const speed = Math.abs(deltaScale);
                const amplifiedDelta = Math.sign(deltaScale) * speed * (1 + speed * 50);

                setZoomOffset(prev => {
                  const next = prev - amplifiedDelta * 200.0;
                  return Math.max(-20, Math.min(next, 40));
                });
                if (speed > 0.001) isZooming = true;
              }
              lastHandScale.current = currentScale;
            } else {
              lastHandScale.current = null;
            }

            // 1.2 两指平移 (任何状态下都可以，但未打开照片时)
            // 圣诞树树根直接跟随两指中点位置
            if (!isPhotoOpen && isTwoFingers) {
              isPanning = true;

              // 计算食指和中指尖端的中点
              const indexTip = landmarks[8];
              const middleTip = landmarks[12];
              const centerX = (indexTip.x + middleTip.x) / 2;
              const centerY = (indexTip.y + middleTip.y) / 2;

              // 将归一化坐标 (0-1) 转换为以屏幕中心为原点的坐标 (-0.5 到 0.5)
              // 然后乘以系数映射到世界坐标
              // x 轴镜像（因为摄像头是镜像的）
              const worldX = (0.5 - centerX) * 20;  // 左右范围 -10 到 10
              const worldY = (0.5 - centerY) * 12;  // 上下范围 -6 到 6

              // 直接设置位置（绝对跟随）
              setPanOffset({ x: worldX, y: worldY });

              detectedColor = "rgba(0, 255, 200, 0.9)";
              dwellTimerRef.current = 0;
              setHoverProgress(0);
            }
          } else {
            // 如果不是单手，重置单手缩放记录
            lastHandScale.current = null;
          }

          // --- 逻辑分支 2: 单指光标 & 点击 (Dwell or Pinch) ---
          const pinch = isPinching(landmarks);

          // 确保只有单指指向时才能点击，排除五指张开、两指等其他手势
          if (!isPanning && !isFiveFingers && !isTwoFingers && currentState === 'CHAOS' && (isPointing || pinch)) {
            const indexTip = landmarks[8];
            currentPointer = { x: 1.0 - indexTip.x, y: indexTip.y };

            // Pinch Click (Immediate)
            if (pinch) {
              if (dwellTimerRef.current === 0) { // Prevent rapid fire
                setClickTrigger(Date.now());
                detectedColor = "rgba(0, 255, 255, 1.0)"; // 霓虹青色点击
                dwellTimerRef.current = -0.5; // Cooldown
              } else if (dwellTimerRef.current < 0) {
                dwellTimerRef.current += delta; // Recover from cooldown
                if (dwellTimerRef.current > 0) dwellTimerRef.current = 0;
              }
            }
            // Dwell Click (Hover)
            else {
              dwellTimerRef.current += delta;
              const DWELL_THRESHOLD = 1.2; // 增加到 1.2 秒，防止误触
              const progress = Math.min(dwellTimerRef.current / DWELL_THRESHOLD, 1.0);
              setHoverProgress(progress);

              if (dwellTimerRef.current >= DWELL_THRESHOLD) {
                setClickTrigger(Date.now());
                clickCooldownRef.current = 2.0; // 增加冷却到 2 秒
                dwellTimerRef.current = 0;
                setHoverProgress(0);
                detectedColor = "rgba(100, 255, 255, 1.0)"; // 亮青色完成
              } else {
                detectedColor = "rgba(0, 255, 255, 0.8)"; // 霓虹青色悬停
              }
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
              // 状态切换逻辑（简化版）
              // 1. FORMED -> CHAOS: 五指张开(Open_Palm)静止即可炸开
              // 2. CHAOS -> FORMED: 握拳(Closed_Fist)

              let targetState = null;
              if (currentState === 'FORMED' && name === 'Open_Palm' && !isMoving) {
                // 五指张开且静止 -> 炸开（不再需要先握拳）
                targetState = 'CHAOS';
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
                gestureStreak.current = { ...gestureStreak.current, name: null, count: 0 };
              }

              // 阈值调整：
              // Closed_Fist (收拢) 保持 10帧
              // Open_Palm (炸开) 保持 15帧（静止约0.4秒）
              const threshold = name === 'Open_Palm' ? 15 : 10;

              if (gestureStreak.current.count > threshold) {
                if (name === "Open_Palm" && currentState === 'FORMED') {
                  setState("CHAOS");
                }
                else if (name === "Closed_Fist") {
                  setState("FORMED");
                }
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
                  detectedColor = "rgba(0, 200, 255, 0.9)"; // 霓虹蓝青色旋转

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

          // --- 逻辑分支 4: 双手缩放 (全状态生效) ---
          // 动作快则缩放快，增强操纵感
          if (results.landmarks.length === 2) {
            const hand1 = results.landmarks[0][0]; // Wrist of hand 1
            const hand2 = results.landmarks[1][0]; // Wrist of hand 2

            // 计算两手距离 (归一化坐标系)
            const dist = Math.hypot(hand1.x - hand2.x, hand1.y - hand2.y);

            if (lastHandDistance.current !== null) {
              const delta = dist - lastHandDistance.current;

              // 使用非线性映射增强快速动作的响应
              const speed = Math.abs(delta);
              const amplifiedDelta = Math.sign(delta) * speed * (1 + speed * 30);

              setZoomOffset(prev => {
                const next = prev - amplifiedDelta * 100.0;
                return Math.max(-20, Math.min(next, 40));
              });
              if (speed > 0.002) {
                detectedColor = "rgba(150, 255, 255, 0.9)";
              }
            }
            lastHandDistance.current = dist;
          } else {
            lastHandDistance.current = null;
          }

        } else {
          dwellTimerRef.current = 0;
          setHoverProgress(0);

          if (clickCooldownRef.current > 0) {
            clickCooldownRef.current -= delta;
            // Keep the last pointer if cooling down
          } else {
            setPointer(null);
            lastPalmPos.current = null;
          }

          // 手势丢失，重置所有状态
          gestureStreak.current = { name: null, count: 0, lastStable: null };
        }

        setPointer(currentPointer);

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // 注释：暂时隐藏手部骨骼线，保持简洁
          // if (results.landmarks && results.landmarks.length > 0) {
          //   const landmarks = results.landmarks[0];
          //   const drawingUtils = new DrawingUtils(ctx);

          //   for (const landmarks of results.landmarks) {
          //     drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: detectedColor, lineWidth: 1 });
          //     drawingUtils.drawLandmarks(landmarks, { color: "rgba(0, 255, 255, 0.3)", lineWidth: 0.5, radius: 1.5 });
          //   }

          //   if (currentPointer) {
          //     const indexTip = landmarks[8];
          //     ctx.beginPath();
          //     ctx.arc(indexTip.x * canvas.width, indexTip.y * canvas.height, 6, 0, 2 * Math.PI);
          //     ctx.strokeStyle = "#00FFFF";
          //     ctx.lineWidth = 2;
          //     ctx.stroke();
          //     // 添加轻微发光效果
          //     ctx.shadowBlur = 8;
          //     ctx.shadowColor = "#00FFFF";
          //     ctx.stroke();
          //     ctx.shadowBlur = 0;
          //   }
          // }
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    // 全屏背景布局 - 最底层
    <div className="fixed inset-0 w-full h-full z-0">
      {/* 摄像头视频背景层 */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover z-0"
        playsInline
        muted
        autoPlay
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* 半透明黑色遮罩 */}
      <div className="absolute inset-0 bg-black/70 z-[1]" />

      {/* 手势骨架线画布 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover z-[2]"
        style={{ transform: 'scaleX(-1)' }}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-2xl text-emerald-500 animate-pulse bg-black/90 z-20 cinzel">
          SYSTEM INITIALIZING...
        </div>
      )}
    </div>
  );
};

export default GestureInput;
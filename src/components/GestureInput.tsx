import React, { useEffect, useRef, useContext, useState } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { TreeContext } from '../App';

const GestureInput: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setState, setRotationSpeed } = useContext(TreeContext);
  const [loading, setLoading] = useState(true);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number>();
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
          numHands: 1
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
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const predictWebcam = () => {
    const video = videoRef.current;
    const recognizer = recognizerRef.current;

    if (video && recognizer) {
      if (video.currentTime !== lastVideoTime.current) {
        lastVideoTime.current = video.currentTime;
        const results = recognizer.recognizeForVideo(video, Date.now());

        if (results.gestures.length > 0) {
          const gesture = results.gestures[0][0];
          const handedness = results.handedness[0][0];
          
          // State Control
          if (gesture.categoryName === "Open_Palm") {
            setState("CHAOS");
          } else if (gesture.categoryName === "Closed_Fist") {
            setState("FORMED");
          }

          // Rotation Speed Control based on Hand X position
          // If hand is detected, map x (0-1) to speed (-1 to 1) or scalar
          if (results.landmarks && results.landmarks[0]) {
            const handX = results.landmarks[0][0].x; // 0 (left) to 1 (right)
            // Reverse logic for mirror effect if needed, but usually:
            // Center is 0.5. 
            // Let's make movement depend on distance from center? 
            // Or simpler: Left side of screen = spin left, Right side = spin right
            // const speed = (handX - 0.5) * 4.0;
            
            // Or just speed scalar for the current direction
            const speedFactor = 0.2 + (handX * 2.0); 
            // We only control scalar speed as direction is fixed in TreeSystem usually, 
            // but let's update the context speed
            setRotationSpeed(speedFactor);
          }
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="relative w-full h-full bg-black/80">
      <video 
        ref={videoRef} 
        className="w-full h-full object-cover opacity-80" 
        playsInline 
        muted 
        autoPlay
        style={{ transform: 'scaleX(-1)' }} // Mirror effect
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-emerald-500 animate-pulse">
          INITIALIZING AI...
        </div>
      )}
      <div className="absolute bottom-1 left-2 text-[10px] text-white/50 cinzel">
        OPEN: CHAOS | CLOSED: FORM
      </div>
    </div>
  );
};

export default GestureInput;
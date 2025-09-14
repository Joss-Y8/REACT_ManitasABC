import React, { useRef, useEffect, useState } from 'react';
import './CameraPage.css';
import Header from './Header';
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { HAND_CONNECTIONS } from '@mediapipe/hands';

function CameraPage({ nameToDeleter, selectedLetter, onGoBack }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [currentLetter, setCurrentLetter] = useState('');
  const [letterImageURL, setLetterImageURL] = useState('');

  // Inicio de la cámara
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOn(true);
      }
    } catch (error) {
      console.error("Error al acceder a la cámara: ", error);
    }
  };

  useEffect(() => {
    startCamera();

    // --- Configuración de MediaPipe Hands ---
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1, //analizaremos una sola mano.
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results) => {
      const canvasCtx = canvasRef.current.getContext("2d");
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      // Dibujar la imagen original
      canvasCtx.drawImage(
        results.image,
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );

      // Dibujar landmarks de la mano con puntos
      /*if (results.multiHandLandmarks) {
        results.multiHandLandmarks.forEach((landmarks) => {
          canvasCtx.fillStyle = "pink";
          landmarks.forEach((point) => {
            canvasCtx.beginPath();
            canvasCtx.arc(point.x * canvasRef.current.width, point.y * canvasRef.current.height, 5, 0, 2 * Math.PI);
            canvasCtx.fill();
          });
        });
      }*/
     if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach((landmarks) => {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
          color: "#c6a7f2", // líneas 
          lineWidth: 3,
        });
        drawLandmarks(canvasCtx, landmarks, {
          color: "#f58eb8", // puntos en unión
          lineWidth: 1,
          radius: 4,
        });
      });
    }

      canvasCtx.restore();
    });

    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          await hands.send({ image: videoRef.current });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }

    // limpiar cámara al desmontar
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (selectedLetter) {
      setCurrentLetter(selectedLetter);
      setLetterImageURL(`/assets/images/abecedario/${selectedLetter.toLowerCase()}.png`);
    } else if (nameToDeleter) {
      const firstLetter = nameToDeleter.charAt(0).toUpperCase();
      setCurrentLetter(firstLetter);
      setLetterImageURL(`/assets/images/abecedario/${firstLetter.toLowerCase()}.png`);
    } else {
      setCurrentLetter('');
      setLetterImageURL('');
    }
  }, [nameToDeleter, selectedLetter]);

  const handleBack = () => {
    onGoBack();
    console.log('Regresar clickeado');
  };

  return (
    <div className="camera-container">
      <Header onBackClick={handleBack}/>
      <div className="cam-cont">
        <div className="column">
          <h2>{`¡Haz la seña de la letra ${currentLetter}!`}</h2>
          {letterImageURL && (
            <div className="image-container">
              <img src={letterImageURL} alt={`Seña de la letra ${currentLetter}`} className="letter-image" />
            </div>
          )}
        </div>
        <div className="column">
          {isCameraOn ? <p>Cámara activada. ¡Muestra la seña!</p> : <p>Activando la cámara...</p>} 
          
          {/* Video oculto (solo fuente para MediaPipe) */}
          <video ref={videoRef} className="camera-feed" autoPlay playsInline muted style={{ display: "none" }} /> 
          
          {/* Canvas donde se dibuja la mano */}
          <canvas ref={canvasRef} className="camera-feed" width="640" height="480" />
        </div>
      </div>  
    </div>
  );
}

export default CameraPage;

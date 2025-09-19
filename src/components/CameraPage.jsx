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
  const cameraRef = useRef(null); 
  const streamRef = useRef(null);
  const handsRef = useRef(null); 
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [currentLetter, setCurrentLetter] = useState('');
  const [letterImageURL, setLetterImageURL] = useState('');

  //esta función se creó para detener completamente la cámara 
  const stopCamera = () => {
    console.log("Deteniendo camara"); 

    //detemos el stream de la camara 
    if(streamRef.current){
      streamRef.current.getTracks().forEach((track)=>{
        track.stop(); 
        console.log("Track detenido:", track.kind); 
      }); 
      streamRef.current = null; 
    }

    //detener cámara de MediaPipe 
    if(cameraRef.current){
      handsRef.current.onResults(()=>{}); 
      handsRef.current.close(); 
      handsRef.current = null; 
    }

    if(videoRef.current){
      videoRef.current.srcObject=null; 
    }
    setIsCameraOn(false); 
  }; 

  // Inicio de la cámara
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream; //referencia del stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOn(true);
      }
    } catch (error) {
      console.error("Error al acceder a la cámara: ", error);
    }
  };

  useEffect(() => {
    const videoEl = videoRef.current; //congelamos la referencia del video para prevenir riesgos futuros. 
    let isMounted = true; //bandera
    startCamera();

    // --- Configuración de MediaPipe Hands ---
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    handsRef.current = hands; //referencia de las manos detectadas

    hands.setOptions({
      maxNumHands: 1, //analizaremos una sola mano.
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results) => {
      if(!isMounted) return; //no dibujar
      const canvas = canvasRef.current; 
      if(!canvas) return; //evita el error si se cambia de página
      const canvasCtx = canvas.getContext("2d");
      if(!canvasCtx) return; //para evitar el error de desmontaje 

      const {width, height} = canvas; //las dimensiones solo se guardan si existen. 
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, width, height);

      // Dibujar la imagen original
      canvasCtx.drawImage(
        results.image,
        0,
        0,
        width,
        height
      );

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

    let camera; 
    if (videoEl) {
      camera = new Camera(videoEl, {
        onFrame: async () => {
          if(!isMounted) return;
          await hands.send({ image: videoEl });
        },
        width: 640,
        height: 480,
      });
      cameraRef.current = camera; //guardamos referencia de la cámara
      camera.start();
    }

    // limpiar cámara al desmontar
    return () => {
      isMounted = false; 
      //se deben detener los tracks de la cámara 
      if (videoEl && videoEl.srcObject) {
        const tracks = videoEl.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }

      //se debe detener la cámara de MediaPipe 
      if(camera){
        camera.stop(); //evitamos la ejecución onFrame
      }
      hands.onResults(()=>{}); //ya no llamamos al código nuevamente. 
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
    stopCamera(); 
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
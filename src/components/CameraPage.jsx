// src/CameraPage.jsx
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import './CameraPage.css';
import Header from './Header';
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { HAND_CONNECTIONS } from '@mediapipe/hands';

import useTimedSignPredictor from '../hooks/useTimedSignPredictor';

function CameraPage({ nameToDeleter, selectedLetter, onGoBack }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const streamRef = useRef(null);
  const handsRef = useRef(null);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [currentLetter, setCurrentLetter] = useState('');
  const [letterImageURL, setLetterImageURL] = useState('');

  //Aquí se maneja el flujo del deletro para el nombre
  const isNameMode = !!nameToDeleter && !selectedLetter;
  const lettersOfName = useMemo(() => (
      nameToDeleter ? nameToDeleter.toUpperCase().split('') : []),
      [nameToDeleter]
  );
  const [nameIndex, setNameIndex] = useState(0);
  const [nameResults, setNameResults] = useState([]); // { expected, predicted, scoreTarget, scoreTop }
  const [showNameSummary, setShowNameSummary] = useState(false);

  // Ref para el restart del hook (no le muevan nada aquí)
  const restartRef = useRef(null);

  // Letra objetivo que se pasa al hook
  const targetForHook = isNameMode
    ? (lettersOfName[nameIndex] || '')
    : (selectedLetter || currentLetter || '');

  // Callback cuando el hook termina un intento de análisis
  const onFinalResult = useCallback((payload) => {
    // payload: { label, prob, all, targetScore, targetLetter, isMatch }
    if (isNameMode) {
      const expected = targetForHook || '';
      const predicted = payload.label || '-';
      const scoreTop = payload.prob || 0;
      const scoreTarget = payload.targetScore || 0;

      setNameResults(prev => [...prev, { expected, predicted, scoreTarget, scoreTop }]);

      //Pasamos a la siguiente letra, con breves retrasos para no analizar la letra pasada otra vez (importante, no le muevan)
      setTimeout(() => {
        const next = nameIndex + 1;
        if (next < lettersOfName.length) {
          setNameIndex(next);
          // Reiniciamos el hook para el siguiente intento
          if (restartRef.current) {
            restartRef.current();
          }
        } else {
          setShowNameSummary(true);
        }
      }, 300);
    }
    // Si no nos encontramos en modo nombre, el modal solo regresa a volver a intentar para el hook (ya no analizamos nada amigos)
  }, [isNameMode, nameIndex, lettersOfName.length, targetForHook]);

  //Almacenamos el handleResults del hook para pasarlo a MediaPipe
  const handleResultsRef = useRef(null);

  const { Badge, ResultModal, handleResults, restart } = useTimedSignPredictor({
    targetLetter: targetForHook,
    onFinalResult,
  });

  // Actuaización de los ref cada que cambian las funciones
  useEffect(() => {
    handleResultsRef.current = handleResults;
    restartRef.current = restart;
  }, [handleResults, restart]);

  // Detener completamente la cámara
  const stopCamera = () => {
    console.log("Deteniendo camara");

    // detener el stream de la cámara
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log("Track detenido:", track.kind);
      });
      streamRef.current = null;
    }

    // detener MediaPipe
    if (cameraRef.current) {
      handsRef.current?.onResults(() => {});
      handsRef.current?.close();
      handsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
  };

  // Inicio de la cámara
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOn(true);
      }
    } catch (error) {
      console.error("Error al acceder a la cámara: ", error);
    }
  };

  useEffect(() => {
    const videoEl = videoRef.current;
    let isMounted = true;
    let camera = null;
    let hands = null;

    const initializeMediaPipe = async () => {
      if (!isMounted) return;

      try {
        await startCamera();
        if (!isMounted) return;

        // Aquí se hace la configuración de MediaPipe Hands (No le muevan nada)
        hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        handsRef.current = hands;

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });

        hands.onResults((results) => {
          if (!isMounted) return;

          const canvas = canvasRef.current;
          if (!canvas) return;
          const canvasCtx = canvas.getContext("2d");
          if (!canvasCtx) return;

          const { width, height } = canvas;
          canvasCtx.save();
          canvasCtx.clearRect(0, 0, width, height);

          // Dibujar la imagen original
          canvasCtx.drawImage(results.image, 0, 0, width, height);

          // Dibujar landmarks y conexiones
          if (results.multiHandLandmarks) {
            results.multiHandLandmarks.forEach((landmarks) => {
              drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: "#c6a7f2",
                lineWidth: 3,
              });
              drawLandmarks(canvasCtx, landmarks, {
                color: "#f58eb8",
                lineWidth: 1,
                radius: 4,
              });
            });
          }

          canvasCtx.restore();

          // Pasar los resultados al hook usando la ref
          if (handleResultsRef.current) {
            handleResultsRef.current(results);
          }
        });

        if (videoEl && isMounted) {
          camera = new Camera(videoEl, {
            onFrame: async () => {
              if (!isMounted || !hands) return;
              try {
                await hands.send({ image: videoEl });
              } catch (err) {
                // Ignorar errores si la cámara ya fue cerrada
                if (isMounted) {
                  console.error("Error en MediaPipe frame:", err);
                }
              }
            },
            width: 640,
            height: 480,
          });
          cameraRef.current = camera;
          camera.start();
        }
      } catch (error) {
        console.error("Error inicializando MediaPipe:", error);
      }
    };

    initializeMediaPipe();

    // limpiar al desmontar
    return () => {
      isMounted = false;

      if (hands) {
        try {
          hands.close();
        } catch (err) {
          console.error("Error cerrando hands:", err);
        }
        handsRef.current = null;
      }

      if (camera) {
        try {
          camera.stop();
        } catch (err) {
          console.error("Error deteniendo camera:", err);
        }
        cameraRef.current = null;
      }

      if (videoEl && videoEl.srcObject) {
        const tracks = videoEl.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []); // Array vacío que solo se ejecuta una vez al montar

  useEffect(() => {
    if (selectedLetter) {
      setCurrentLetter(selectedLetter);
      setLetterImageURL(`/assets/images/abecedario/${selectedLetter.toLowerCase()}.png`);
    } else if (nameToDeleter) {
      // En modo nombre, usa la letra actual según nameIndex
      const L = (lettersOfName[nameIndex] || '').toUpperCase();
      setCurrentLetter(L);
      setLetterImageURL(L ? `/assets/images/abecedario/${L.toLowerCase()}.png` : '');
    } else {
      setCurrentLetter('');
      setLetterImageURL('');
    }
  }, [nameToDeleter, selectedLetter, lettersOfName, nameIndex]);

  const handleBack = () => {
    stopCamera();
    onGoBack();
    console.log('Regresar clickeado');
  };

  //modal que muestra el resumen del análisis del nombre
  const NameSummaryModal = () => {
    if (!showNameSummary) return null;
    const avgTarget = nameResults.length
      ? Math.round(nameResults.reduce((s, r) => s + (r.scoreTarget || 0), 0) / nameResults.length)
      : 0;

    return (
      <div style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16
      }}>
        <div style={{
          width:'min(620px,92vw)', background:'#fff', borderRadius:16,
          padding:24, boxShadow:'0 12px 40px rgba(0,0,0,.25)'
        }}>
          <h2 style={{ marginTop:0 }}>Resumen de tu nombre</h2>
          <p style={{ margin:'8px 0 12px' }}>
            Precisión promedio (letra objetivo): <strong>{avgTarget}%</strong>
          </p>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr>
                <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:'6px 4px' }}>Letra</th>
                <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:'6px 4px' }}>Coincidencia (%)</th>
              </tr>
            </thead>
            <tbody>
              {nameResults.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding:'6px 4px', borderBottom:'1px solid #f4f4f4' }}>{r.expected}</td>
                  <td style={{ padding:'6px 4px', borderBottom:'1px solid #f4f4f4' }}>{r.scoreTarget}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop:16, display:'flex', gap:8 }}>
            <button
              onClick={() => { 
                setShowNameSummary(false); 
                setNameResults([]); 
                setNameIndex(0); 
                if (restartRef.current) {
                  restartRef.current();
                }
              }}
              style={{ padding:'10px 16px', borderRadius:10, border:'none', background:'#7c3aed', color:'#fff', cursor:'pointer' }}
            >
              Repetir nombre
            </button>
            <button
              onClick={() => { setShowNameSummary(false); }}
              style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #ddd', background:'#fff', cursor:'pointer' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="camera-container">
      <Header onBackClick={handleBack} />
      <div className="cam-cont">
        <div className="column">
          <h2>{`¡Haz la seña de la letra ${currentLetter}!`}</h2>
          {isNameMode && (
            <p style={{ marginTop: 8 }}>
              Letra {nameIndex + 1} de {lettersOfName.length}
            </p>
          )}
          {letterImageURL && (
            <div className="image-container">
              <img
                src={letterImageURL}
                alt={`Seña de la letra ${currentLetter}`}
                className="letter-image"
              />
            </div>
          )}
        </div>

        <div className="column">
          {isCameraOn ? <p>Cámara activada. ¡Muestra la seña!</p> : <p>Activando la cámara...</p>}

          {/* En modo nombre NO mostramos el ResultModal por intento */}
          {!isNameMode && <ResultModal />}
          <NameSummaryModal /> {/* Solo aparece al terminar el nombre */}

          {/* Video oculto (solo fuente para MediaPipe) */}
          <video
            ref={videoRef}
            className="camera-feed"
            autoPlay
            playsInline
            muted
            style={{ display: "none" }}
          />

          {/* Canvas donde se dibuja la mano */}
          <canvas ref={canvasRef} className="camera-feed" width="640" height="480" />
        </div>
      </div>
    </div>
  );
}

export default CameraPage;

import React, { useRef, useEffect, useState } from 'react';
import './CameraPage.css';
import Header from './Header';

function CameraPage({ nameToDeleter, selectedLetter, onGoBack }) {
  const videoRef = useRef(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [currentLetter, setCurrentLetter] = useState('');
  const [letterImageURL, setLetterImageURL] = useState('');

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

  const handleBack =() =>{
      onGoBack(); 
      console.log('Regresar clickeado')
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
          <video ref={videoRef} className="camera-feed" autoPlay playsInline muted />
          
        </div>
      </div>  
    </div>
  );
}

export default CameraPage;
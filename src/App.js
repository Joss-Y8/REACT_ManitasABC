import React, { useState } from 'react';
import WelcomePage from './components/WelcomePage';
import ThemesPage from './components/ThemesPage'; 
import ConsonantsPage from './components/ConsonantsPage';
import VowelsPage from './components/VowelsPage';
import NamePage from './components/NamePage';
import CameraPage from './components/CameraPage'; 


function App() {
  const [currentPage, setCurrentPage] = useState('welcome');
  const [userName, setUserName] = useState(''); 
  const [selectedLetter, setSelectedLetter] = useState('');

  const renderPage = () => {
    if (currentPage === 'welcome') {
      return <WelcomePage onStartClick={() => setCurrentPage('themes')} />;
    }

    if (currentPage === 'themes') {
      return <ThemesPage onSelectTheme={handleSelectTheme} onGoBack={()=>setCurrentPage('welcome')} />;
    }

    if (currentPage === 'consonants') {
      return <ConsonantsPage onLetterSelect={handleLetterSelect} onGoBack={()=>setCurrentPage('themes')}/>;
    }

    if (currentPage === 'vowels') {
      return <VowelsPage onLetterSelect={handleLetterSelect} onGoBack={()=>setCurrentPage('themes')}/>;
    }

    if (currentPage === 'name') {
      return <NamePage onNameSubmit ={handleNameSubmit} onGoBack={()=>setCurrentPage('themes')}/>;
    }

    if (currentPage === 'camera'){
      return <CameraPage nameToDeleter={userName} selectedLetter={selectedLetter} onGoBack={()=>setCurrentPage('themes')} onCloseSummary={() => setCurrentPage('themes')}/>
    }
  };

  const handleSelectTheme = (theme) => {
    setCurrentPage(theme); // Cambia a la página del tema seleccionado
  };

  const handleNameSubmit = (name)=>{
    setUserName(name); 
    setSelectedLetter(''); 
    setCurrentPage('camera'); 
  }

  const handleLetterSelect = (letter) => {
    setSelectedLetter(letter);
    setUserName('');
    setCurrentPage('camera');
  };

  return (
    <div>
      {renderPage()}
    </div>
  );
}

export default App;

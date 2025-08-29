import React from 'react';
import './ThemesPage.css';
import Header from './Header';

function ThemesPage({ onSelectTheme, onGoBack }) {
    const handleBack =() =>{
      onGoBack(); 
      console.log('Regresar clickeado')
    }; 
  return (
    <div className="themes">
      <Header onBackClick={handleBack}/>
      <div className="themes-container">
        <h2>¿Qué quieres aprender hoy?</h2>
        <div className="themes-grid">
          <button className="theme-card" id="consonants-button"onClick={() => onSelectTheme('consonants')}>
            <span className='consonants-button'>Consonantes</span>
          </button>
          <button className="theme-card" id="vowels-button" onClick={() => onSelectTheme('vowels')}>
            <span className='vowels-button'>Vocales</span>
          </button>
          <button className="theme-card" id="name-button"onClick={() => onSelectTheme('name')}>
            <span className='name-button'>Mi Nombre</span>
          </button>
        </div>
      </div>
      
    </div>
  );
}

export default ThemesPage;
import React from 'react';
import LetterCard from './LetterCard';
import './VowelsPage.css';
import Header from './Header';

const vowelsData = [
    {letter: 'A', imageURL:'/assets/images/abecedario/a.png'},
    {letter: 'E', imageURL:'/assets/images/abecedario/e.png'},
    {letter: 'I', imageURL:'/assets/images/abecedario/i.png'},
    {letter: 'O', imageURL:'/assets/images/abecedario/o.png'},
    {letter: 'U', imageURL:'/assets/images/abecedario/u.png'}
]; 

function VowelsPage({onLetterSelect, onGoBack}) {
  const handleBack =() =>{
      onGoBack(); 
      console.log('Regresar clickeado')
    }; 
  return (
    <div className="alphabet">
      <Header onBackClick={handleBack}/>
      <div className="alphabet-container">
        <h2>Aprende las Vocales en LSM</h2>
        <div className="alphabet-grid">
          {vowelsData.map((item, index)=>(<LetterCard key={index} letter={item.letter} imageURL={item.imageURL} onLetterClick={onLetterSelect}/>))}
        </div>
      </div>
    </div>
  );
}

export default VowelsPage;
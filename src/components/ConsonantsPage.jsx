import React from 'react';
import LetterCard from './LetterCard';
import './Consonants.css';
import Header from './Header';

const consonantsData = [
    {letter: 'B', imageURL:'/assets/images/abecedario/b.png'},
    {letter: 'C', imageURL:'/assets/images/abecedario/c.png'},
    {letter: 'D', imageURL:'/assets/images/abecedario/d.png'},
    {letter: 'F', imageURL:'/assets/images/abecedario/f.png'},
    {letter: 'G', imageURL:'/assets/images/abecedario/g.png'},
    {letter: 'H', imageURL:'/assets/images/abecedario/h.png'},
    {letter: 'J', imageURL:'/assets/images/abecedario/j.png'},
    {letter: 'K', imageURL:'/assets/images/abecedario/k.png'},
    {letter: 'L', imageURL:'/assets/images/abecedario/l.png'},
    {letter: 'M', imageURL:'/assets/images/abecedario/m.png'},
    {letter: 'N', imageURL:'/assets/images/abecedario/n.png'},
    {letter: 'Ñ', imageURL:'/assets/images/abecedario/ñ.png'},
    {letter: 'P', imageURL:'/assets/images/abecedario/p.png'},
    {letter: 'Q', imageURL:'/assets/images/abecedario/q.png'},
    {letter: 'R', imageURL:'/assets/images/abecedario/r.png'},
    {letter: 'S', imageURL:'/assets/images/abecedario/s.png'},
    {letter: 'T', imageURL:'/assets/images/abecedario/t.png'},
    {letter: 'V', imageURL:'/assets/images/abecedario/v.png'},
    {letter: 'W', imageURL:'/assets/images/abecedario/w.png'},
    {letter: 'X', imageURL:'/assets/images/abecedario/x.png'},
    {letter: 'Y', imageURL:'/assets/images/abecedario/y.png'},
    {letter: 'Z', imageURL:'/assets/images/abecedario/z.png'}
]; 

function ConsonantsPage({onLetterSelect, onGoBack}) {
  const handleBack =() =>{
      onGoBack(); 
      console.log('Regresar clickeado')
    }; 
  return (
    <div className="alphabet">
      <Header onBackClick={handleBack}/>
      <div className="alphabet-container">
        <h2>Aprende las Consonantes en LSM</h2>
        <div className="alphabet-grid">
          {consonantsData.map((item, index)=>(<LetterCard key={index} letter={item.letter} imageURL={item.imageURL} onLetterClick={onLetterSelect}/>))}
        </div>
      </div>
    </div>
  );
}

export default ConsonantsPage;
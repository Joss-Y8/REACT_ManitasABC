import React from 'react';
import './LetterCard.css';

function LetterCard({ letter, imageURL, onLetterClick}) {
  return (
    <div className="letter-card" data-letter={letter} onClick={() =>onLetterClick(letter)}>
        <img src={imageURL} alt={`Seña de la letra ${letter}`}></img>
        <h3>{letter}</h3>
    </div>
  );
}

export default LetterCard;
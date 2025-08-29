import React, {useState} from 'react';
import './NamePage.css';
import Header from './Header';

function NamePage({onNameSubmit, onGoBack}) {
  const [name, setName] = useState(''); 

  const handleChange = (event) => { setName(event.target.value);};

  const handleSubmit = () => {
    if (name.trim()!==''){
        onNameSubmit(name.trim()); 
    }
  };

  const handleBack =() =>{
      onGoBack(); 
      console.log('Regresar clickeado')
    }; 
    
  return (
    <div className="name">
      <Header onBackClick={handleBack}/>
      <div className="name-container">
        <h2>Escribe tu nombre</h2>
        <p>¡Pide ayuda a un adulto si lo necesitas!</p>
        <input type="text" value={name} onChange={handleChange} placeholder="Escribe aquí tu nombre"/>
        <button onClick={handleSubmit}>¡Comienza a deletrear!</button>
      </div>
    </div>    
  );
}

export default NamePage;
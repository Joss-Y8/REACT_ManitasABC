import React from 'react'; 
import './WelcomePage.css'

function WelcomePage({onStartClick}){
    return(
        <div className='welcome-container'>
            <img src="./assets/images/logo.png" alt="Manitas ABC Logo" className='logo'/>
            <h1>BIENVENIDO</h1>
            <h2>Señas que hablan, manitas que aprenden.</h2>
            <button onClick={onStartClick} className='start-button'>
                ¡COMENZAR!
            </button>
        </div>
    ); 
}

export default WelcomePage; 
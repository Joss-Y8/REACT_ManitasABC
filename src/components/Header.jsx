import React from "react";

function Header({ onBackClick }) {
    return (
        <header>
            <img src="../../assets/images/manitas_abc.png" alt="Logo de Manitas ABC" className="logo" />
            <img src="../../assets/images/regresar.png" alt="Botón de Regresar" className="regresar" onClick={onBackClick}
            />
        </header>
    );
}

export default Header;
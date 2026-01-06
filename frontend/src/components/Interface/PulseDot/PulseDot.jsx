import './PulseDot.scss';

const PulseDot = ({color, size, pulse}) => {
    return(
        <div className={`pulse-dot ${pulse ? 'pulse' : ''}`} style={{'--color':color, '--size':size}}>
            <div className="dot"></div>
            <div className="outer-dot"></div>
        </div>
    )
}

export default PulseDot;
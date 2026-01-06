import './SlideSwitch.scss';

const SlideSwitch = ({ checked, onChange, size = 'medium', primaryColor = '#84da89' }) => {
    const style = {
        '--primary': primaryColor,
    };

    return (
        <label className="slide-switch" style={style}>
            <input type="checkbox" checked={checked} onChange={onChange} />
            <span className="slider"></span>
        </label>
    )
}

export default SlideSwitch;
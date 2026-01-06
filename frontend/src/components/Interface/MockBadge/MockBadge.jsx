import './MockBadge.scss';

const MockBadge = ({badgeColor, badgeContent, isInactive}) => {
    return (
        <div className={`mock-badge visible ${isInactive ? "inactive" : "active"}`} style={{backgroundColor: badgeColor}}>
        {badgeContent}
    </div>
    )
}

export default MockBadge;
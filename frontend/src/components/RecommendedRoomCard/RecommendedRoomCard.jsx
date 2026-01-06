import React from 'react';
import { useNavigate } from 'react-router-dom';
import './RecommendedRoomCard.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import FilledStar from '../../assets/Icons/FilledStar.svg';



const RecommendedRoomCard = ({ room, horizontalScroll = false, onRoomClick }) => {
    const navigate = useNavigate();

    console.log(room);

    const handleClick = () => {
        if (room && room._id) {
            if (onRoomClick) {
                onRoomClick(room);
            } else {
                navigate(`/room/${room.name}`);
            }
        }
    };

    if (!room) {
        return (
            <div className="recommended-room-card">
                <div className="card-header">
                    <Icon icon="material-symbols:door-open" />
                    <span>No Room Available</span>
                </div>
                <div className="card-content">
                    <p>No recommended rooms found</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`recommended-room-card ${horizontalScroll ? 'scroll': ""}`} onClick={handleClick} >
            
            <div className="card-header">
                <img src={room.image} alt={room.name} />
            </div>
            <div className="card-content">
                <div className="content-top">   
                        <h3 className="room-name">
                            {room.name}
                        
                        </h3>
                                    
                    {/* Available Status */}
                    <div className="room-stats-row">
                    <div className="room-rating">
                                <img src={FilledStar} alt="star" className="star-icon" />
                                <span className="rating-text">{room.rating || 4.2}</span>
                            </div>
                    <div className="free-until">
                        <div className="dot">
                            <div className="outer-dot"></div>
                            <div className="inner-dot"></div>
                        </div>
                            Available Now
                        </div>
                    </div>

                </div>
                
                <div className="card-footer">
                    <span className="view-details">View Details</span>
                    <Icon icon="mingcute:arrow-right-line" className="arrow-icon" />
                </div>
            </div>
        </div>
    );
};

export default RecommendedRoomCard;

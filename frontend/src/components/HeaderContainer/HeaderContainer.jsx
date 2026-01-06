import React from 'react';
import './HeaderContainer.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

/**
 * HeaderContainer Component
 * 
 * A reusable container component that displays a header section with an icon and optional subheader,
 * followed by content below.
 * 
 * @component
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to be displayed in the container body
 * @param {string} props.icon - Iconify icon name to be displayed in the header
 * @param {string} props.header - Main header text
 * @param {React.ReactNode} [props.subheader] - Optional subheader content
 * @param {React.ReactNode} [props.right] - Optional content to be displayed on the right side of the header
 * @param {string} [props.size='16px'] - Size of the icon (defaults to 16px)
 * @param {string} [props.classN] - Additional CSS class name to be applied to the container
 * @param {boolean} [props.scroll] - Whether the container should be scrollable (unused in current implementation)
 * 
 * @example
 * <HeaderContainer 
 *   icon="mdi:home"
 *   header="Dashboard"
 *   subheader={<span>Welcome back!</span>}
 *   right={<button>Action</button>}
 * >
 *   <div>Main content here</div>
 * </HeaderContainer>
 */

const HeaderContainer = ({children, icon, header, scroll, subheader, right, size = '16px', classN, subheaderRow}) => {
    return(
        <div className={`${classN} header-container`} style={{'--size' : size}}>
            <div className="header-container-header">
                <div className="row">
                    <div>
                        {icon && (
                            <div className="header-container-header-icon">
                                <Icon icon={icon}/>
                            </div>
                        )}
                        <div className="header-container-header-text">
                            <h2 id="header-text">{header}</h2>
                            {
                                subheader && 
                                <div className="row subheader">
                                    {subheader}
                                </div>
                            }
                        </div>
                    </div>
                    {right && right}
                </div>
                {subheaderRow && subheaderRow}
            </div>
            <div className="header-container-content">
                {children}
            </div>
        </div>
    )
}

export default HeaderContainer;
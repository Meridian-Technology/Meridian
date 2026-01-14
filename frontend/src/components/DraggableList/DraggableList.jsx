import React from 'react';
import { Reorder, useMotionValue } from 'framer-motion';
import { useRaisedShadow } from './useRaisedShadow';
import './DraggableList.scss';

/**
 * Reusable DraggableList component for reordering items
 * 
 * @param {Array} items - Array of items to display
 * @param {Function} onReorder - Callback when items are reordered: (newItems) => void
 * @param {Function} renderItem - Function to render each item: (item, index) => ReactNode
 * @param {Function} getItemId - Function to get unique ID for each item: (item) => string|number
 * @param {string} className - Additional CSS class name
 * @param {boolean} disabled - Whether dragging is disabled
 */
const DraggableList = ({ 
    items = [], 
    onReorder, 
    renderItem, 
    getItemId = (item, index) => item?.id || item?.name || index,
    className = '',
    disabled = false,
    gap = '0px'
}) => {
    if (!items || items.length === 0) {
        return null;
    }

    return (
        <div className={`draggable-list ${className}`}>
            <Reorder.Group 
                axis="y" 
                values={items} 
                onReorder={disabled ? undefined : onReorder}
                className="draggable-list-group"
                style={{ gap }}
            >
                {items.map((item, index) => {
                    const itemId = getItemId(item, index);
                    return (
                        <DraggableItem
                            key={itemId}
                            item={item}
                            index={index}
                            itemId={itemId}
                            renderItem={renderItem}
                            disabled={disabled}
                        />
                    );
                })}
            </Reorder.Group>
        </div>
    );
};

/**
 * Internal component for draggable items with shadow effect
 */
const DraggableItem = ({ item, index, itemId, renderItem, disabled }) => {
    const y = useMotionValue(0);
    const boxShadow = useRaisedShadow(y);

    return (
        <Reorder.Item
            value={item}
            id={String(itemId)}
            style={{ boxShadow, y }}
            disabled={disabled}
            className="draggable-item"
            dragListener={!disabled}
            layout
            transition={{
                type: "spring",
                stiffness: 350,
                damping: 25
            }}
        >
            {renderItem(item, index)}
        </Reorder.Item>
    );
};

export default DraggableList;


/**
 * CanvasButtonGroup - Container for canvas floating buttons
 *
 * Automatically arranges buttons from right to left with consistent spacing.
 * Buttons are added in order (rightmost first) and spacing is handled automatically.
 */

import React, { ReactNode } from 'react'
import { Box } from '@mui/material'

export interface CanvasButtonProps {
    /**
     * Button element to render
     */
    children: ReactNode
}

const BUTTON_SIZE = 40
const BUTTON_GAP = 10

/**
 * Individual button wrapper with positioning
 */
export const CanvasButton: React.FC<CanvasButtonProps> = ({ children }) => {
    return <>{children}</>
}

export interface CanvasButtonGroupProps {
    /**
     * Button children (will be positioned from right to left in order)
     */
    children: ReactNode
}

/**
 * Canvas Button Group Component
 *
 * Positions buttons from right to left with consistent spacing.
 * The last child in the array will be rightmost, first child will be leftmost.
 */
export const CanvasButtonGroup: React.FC<CanvasButtonGroupProps> = ({ children }) => {
    // Convert children to array and filter out null/undefined
    const childArray = React.Children.toArray(children).filter(Boolean)

    return (
        <Box
            sx={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                display: 'flex',
                flexDirection: 'row-reverse',
                gap: `${BUTTON_GAP}px`,
                zIndex: 5,
                alignItems: 'center'
            }}
        >
            {childArray.map((child, index) => (
                <Box key={index} sx={{ display: 'flex' }}>
                    {child}
                </Box>
            ))}
        </Box>
    )
}

export default CanvasButtonGroup

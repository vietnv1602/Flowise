/**
 * GenerationProgress - Progress Display Component
 *
 * Simple, clean progress indicator
 */

import React from 'react'
import { Box, LinearProgress, Typography, Chip } from '@mui/material'
import { GenerationProgressState as ProgressType } from '../types'

export interface GenerationProgressProps {
    progress: ProgressType
}

/**
 * Stage labels
 */
const STAGE_LABELS: Record<string, string> = {
    discovery: 'Discovery',
    exploration: 'Exploration',
    clarifying: 'Clarifying',
    architecture: 'Architecture',
    implementation: 'Implementation',
    review: 'Review',
    complete: 'Complete',
    error: 'Error',
    idle: 'Idle'
}

/**
 * Generation Progress Component
 */
export const GenerationProgress: React.FC<GenerationProgressProps> = ({ progress }) => {
    const label = STAGE_LABELS[progress.stage] || 'Idle'

    // Calculate progress percentage
    const progressPercent = progress.totalSteps > 0 ? (progress.currentStep / progress.totalSteps) * 100 : 0

    return (
        <Box sx={{ p: 1 }}>
            {/* Stage Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant='subtitle2' fontWeight='medium'>
                    {label}
                </Typography>
                <Chip label={`${progress.currentStep}/${progress.totalSteps}`} size='small' variant='outlined' />
            </Box>

            {/* Progress Bar */}
            {progress.stage !== 'idle' && progress.stage !== 'error' && progress.stage !== 'complete' && (
                <Box sx={{ mb: 1 }}>
                    <LinearProgress variant='determinate' value={progressPercent} sx={{ height: 4, borderRadius: 2 }} />
                </Box>
            )}

            {/* Message */}
            {progress.message && (
                <Typography variant='caption' color='text.secondary'>
                    {progress.message}
                </Typography>
            )}
        </Box>
    )
}

export default GenerationProgress

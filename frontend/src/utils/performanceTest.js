import { useRef, useCallback, useState } from 'react';

// Performance testing utilities for drag selection
export class PerformanceMonitor {
    constructor() {
        this.metrics = {
            mouseMoveCount: 0,
            renderCount: 0,
            averageFrameTime: 0,
            maxFrameTime: 0,
            minFrameTime: Infinity,
            frameTimes: []
        };
        this.isMonitoring = false;
        this.frameStartTime = 0;
    }

    startMonitoring() {
        this.isMonitoring = true;
        this.metrics = {
            mouseMoveCount: 0,
            renderCount: 0,
            averageFrameTime: 0,
            maxFrameTime: 0,
            minFrameTime: Infinity,
            frameTimes: []
        };
        console.log('🚀 Performance monitoring started');
    }

    stopMonitoring() {
        this.isMonitoring = false;
        this.logResults();
    }

    recordMouseMove() {
        if (!this.isMonitoring) return;
        this.metrics.mouseMoveCount++;
    }

    recordRender() {
        if (!this.isMonitoring) return;
        this.metrics.renderCount++;
    }

    recordFrameStart() {
        if (!this.isMonitoring) return;
        this.frameStartTime = performance.now();
    }

    recordFrameEnd() {
        if (!this.isMonitoring || this.frameStartTime === 0) return;
        
        const frameTime = performance.now() - this.frameStartTime;
        this.metrics.frameTimes.push(frameTime);
        this.metrics.maxFrameTime = Math.max(this.metrics.maxFrameTime, frameTime);
        this.metrics.minFrameTime = Math.min(this.metrics.minFrameTime, frameTime);
        
        // Keep only last 100 frame times for rolling average
        if (this.metrics.frameTimes.length > 100) {
            this.metrics.frameTimes.shift();
        }
        
        this.metrics.averageFrameTime = this.metrics.frameTimes.reduce((a, b) => a + b, 0) / this.metrics.frameTimes.length;
    }

    logResults() {
        console.log('📊 Performance Results:');
        console.log(`Mouse moves: ${this.metrics.mouseMoveCount}`);
        console.log(`Renders: ${this.metrics.renderCount}`);
        console.log(`Average frame time: ${this.metrics.averageFrameTime.toFixed(2)}ms`);
        console.log(`Max frame time: ${this.metrics.maxFrameTime.toFixed(2)}ms`);
        console.log(`Min frame time: ${this.metrics.minFrameTime.toFixed(2)}ms`);
        console.log(`FPS: ${(1000 / this.metrics.averageFrameTime).toFixed(1)}`);
        
        // Performance recommendations
        if (this.metrics.averageFrameTime > 16.67) {
            console.warn('⚠️  Performance issue: Average frame time > 16.67ms (60fps)');
        }
        if (this.metrics.renderCount > this.metrics.mouseMoveCount * 2) {
            console.warn('⚠️  Performance issue: Too many re-renders per mouse move');
        }
        if (this.metrics.maxFrameTime > 33.33) {
            console.warn('⚠️  Performance issue: Frame drops detected (max frame time > 33.33ms)');
        }
    }
}

// React hook for performance monitoring
export const usePerformanceMonitor = () => {
    const monitorRef = useRef(new PerformanceMonitor());
    
    const startMonitoring = useCallback(() => {
        monitorRef.current.startMonitoring();
    }, []);
    
    const stopMonitoring = useCallback(() => {
        monitorRef.current.stopMonitoring();
    }, []);
    
    const recordMouseMove = useCallback(() => {
        monitorRef.current.recordMouseMove();
    }, []);
    
    const recordRender = useCallback(() => {
        monitorRef.current.recordRender();
    }, []);
    
    return {
        startMonitoring,
        stopMonitoring,
        recordMouseMove,
        recordRender
    };
};

// Performance testing component
export const PerformanceTestPanel = ({ onStartTest, onStopTest }) => {
    const [isRunning, setIsRunning] = useState(false);
    const monitor = useRef(new PerformanceMonitor());
    
    const handleStart = () => {
        monitor.current.startMonitoring();
        setIsRunning(true);
        onStartTest?.();
    };
    
    const handleStop = () => {
        monitor.current.stopMonitoring();
        setIsRunning(false);
        onStopTest?.();
    };
    
    return (
        <div style={{
            position: 'fixed',
            top: '10px',
            left: '10px',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            zIndex: 1000,
            fontSize: '12px'
        }}>
            <h4>Performance Test</h4>
            <button 
                onClick={isRunning ? handleStop : handleStart}
                style={{
                    background: isRunning ? '#ff4444' : '#44ff44',
                    color: 'white',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '3px',
                    cursor: 'pointer'
                }}
            >
                {isRunning ? 'Stop Test' : 'Start Test'}
            </button>
            <p>Click and drag to test selection performance</p>
        </div>
    );
};

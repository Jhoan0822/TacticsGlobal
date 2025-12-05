import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { TerrainService } from '../services/terrainService';
import { POI } from '../types';

interface TerrainDebugLayerProps {
    pois: POI[];
    enabled?: boolean;
}

/**
 * Debug visualization layer for terrain detection.
 * Shows LAND (green), OCEAN (blue), and COAST (yellow/orange) classification.
 * Toggle with F3 key.
 */
const TerrainDebugLayer: React.FC<TerrainDebugLayerProps> = ({ pois, enabled = false }) => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isVisible, setIsVisible] = useState(enabled);
    const lastRenderRef = useRef<{ center: L.LatLng; zoom: number } | null>(null);

    // Toggle visibility with F3
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F3') {
                e.preventDefault();
                setIsVisible(prev => !prev);
                console.log('[TERRAIN DEBUG] Toggled:', !isVisible);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible) {
            // Remove canvas if hidden
            if (canvasRef.current && canvasRef.current.parentNode) {
                canvasRef.current.parentNode.removeChild(canvasRef.current);
                canvasRef.current = null;
            }
            return;
        }

        // Create canvas
        const canvas = L.DomUtil.create('canvas', '') as HTMLCanvasElement;
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '250'; // Above terrain layer
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.opacity = '0.6'; // Semi-transparent

        const container = map.getContainer();
        container.appendChild(canvas);
        canvasRef.current = canvas;

        const GRID_SIZE = 20; // Pixels between sample points

        // Colors for terrain types
        const COLORS = {
            LAND: 'rgba(34, 197, 94, 0.7)',   // Green
            OCEAN: 'rgba(59, 130, 246, 0.7)',  // Blue
            COAST: 'rgba(251, 191, 36, 0.9)'   // Yellow/Orange
        };

        const renderDebug = () => {
            if (!canvas || !map || !isVisible) return;

            const size = map.getSize();
            const pixelRatio = window.devicePixelRatio || 1;

            // Resize canvas if needed
            if (canvas.width !== size.x * pixelRatio || canvas.height !== size.y * pixelRatio) {
                canvas.width = size.x * pixelRatio;
                canvas.height = size.y * pixelRatio;
                canvas.style.width = `${size.x}px`;
                canvas.style.height = `${size.y}px`;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.resetTransform();
            ctx.scale(pixelRatio, pixelRatio);
            ctx.clearRect(0, 0, size.x, size.y);

            // Check if terrain service is ready
            if (!TerrainService.isReady()) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                ctx.font = '20px sans-serif';
                ctx.fillText('Terrain Service Loading...', 20, 40);
                return;
            }

            // Sample terrain at grid points
            const cellSize = GRID_SIZE;
            const cols = Math.ceil(size.x / cellSize);
            const rows = Math.ceil(size.y / cellSize);

            let landCount = 0;
            let oceanCount = 0;
            let coastCount = 0;

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const screenX = col * cellSize + cellSize / 2;
                    const screenY = row * cellSize + cellSize / 2;

                    // Convert screen position to lat/lng
                    const point = L.point(screenX, screenY);
                    const latlng = map.containerPointToLatLng(point);

                    // Get terrain type
                    const terrainType = TerrainService.getTerrainType(latlng.lat, latlng.lng, pois);

                    // Choose color
                    let color: string;
                    switch (terrainType) {
                        case 'LAND':
                            color = COLORS.LAND;
                            landCount++;
                            break;
                        case 'OCEAN':
                            color = COLORS.OCEAN;
                            oceanCount++;
                            break;
                        case 'COAST':
                            color = COLORS.COAST;
                            coastCount++;
                            break;
                        default:
                            color = 'rgba(128, 128, 128, 0.5)';
                    }

                    // Draw cell
                    ctx.fillStyle = color;
                    ctx.fillRect(
                        col * cellSize,
                        row * cellSize,
                        cellSize - 1,
                        cellSize - 1
                    );
                }
            }

            // Draw legend
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(10, size.y - 100, 180, 90);

            ctx.font = 'bold 12px sans-serif';
            ctx.fillStyle = 'white';
            ctx.fillText('TERRAIN DEBUG (F3 toggle)', 15, size.y - 82);

            ctx.font = '11px sans-serif';

            ctx.fillStyle = COLORS.LAND;
            ctx.fillRect(15, size.y - 70, 15, 15);
            ctx.fillStyle = 'white';
            ctx.fillText(`LAND: ${landCount}`, 35, size.y - 58);

            ctx.fillStyle = COLORS.OCEAN;
            ctx.fillRect(15, size.y - 50, 15, 15);
            ctx.fillStyle = 'white';
            ctx.fillText(`OCEAN: ${oceanCount}`, 35, size.y - 38);

            ctx.fillStyle = COLORS.COAST;
            ctx.fillRect(15, size.y - 30, 15, 15);
            ctx.fillStyle = 'white';
            ctx.fillText(`COAST: ${coastCount}`, 35, size.y - 18);

            // Store last render state
            lastRenderRef.current = {
                center: map.getCenter(),
                zoom: map.getZoom()
            };
        };

        // Initial render
        renderDebug();

        // Re-render on map move/zoom (throttled)
        let renderTimeout: ReturnType<typeof setTimeout> | null = null;
        const onMove = () => {
            if (renderTimeout) clearTimeout(renderTimeout);
            renderTimeout = setTimeout(renderDebug, 100);
        };

        map.on('move', onMove);
        map.on('zoom', onMove);
        map.on('resize', onMove);

        // Poll for terrain service ready
        const checkInterval = setInterval(() => {
            if (TerrainService.isReady()) {
                renderDebug();
                clearInterval(checkInterval);
            }
        }, 500);

        return () => {
            map.off('move', onMove);
            map.off('zoom', onMove);
            map.off('resize', onMove);
            if (renderTimeout) clearTimeout(renderTimeout);
            clearInterval(checkInterval);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        };
    }, [map, isVisible, pois]);

    return null;
};

export default React.memo(TerrainDebugLayer);

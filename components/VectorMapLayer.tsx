import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import * as d3 from 'd3';
import { TerrainService } from '../services/terrainService';

interface CachedFeature {
    feature: any;
    bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
}

const VectorMapLayer: React.FC = () => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameId = useRef<number | null>(null);
    const cachedFeaturesRef = useRef<CachedFeature[] | null>(null);

    useEffect(() => {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated') as HTMLCanvasElement;
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '0'; // Background
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.backgroundColor = '#0f172a'; // Dark Ocean

        // Move to Container (Screen Space) to sync with CanvasUnitLayer and avoid drift
        const container = map.getContainer();
        container.appendChild(canvas);
        canvasRef.current = canvas;

        // Pre-process GeoJSON for Culling
        const prepareData = () => {
            const geoJson = TerrainService.getWorldData();
            if (geoJson && geoJson.features && !cachedFeaturesRef.current) {
                cachedFeaturesRef.current = geoJson.features.map((f: any) => {
                    const bounds = d3.geoBounds(f); // [[w, s], [e, n]]
                    return {
                        feature: f,
                        bbox: [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]]
                    };
                });
            }
        };

        const draw = () => {
            if (!canvas || !map) return;

            const size = map.getSize();
            const pixelRatio = window.devicePixelRatio || 1;

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

            prepareData();
            if (!cachedFeaturesRef.current) return;

            // CULLING
            const mapBounds = map.getBounds();
            const n = mapBounds.getNorth();
            const s = mapBounds.getSouth();
            const e = mapBounds.getEast();
            const w = mapBounds.getWest();

            // Handle world wrap? Leaflet bounds might be > 180. 
            // For simplicity, we just check intersection.
            // If map spans dateline, it's tricky, but basic box check covers 99%.

            const visibleFeatures = cachedFeaturesRef.current.filter(cf => {
                // Check intersection
                return (
                    cf.bbox[0] <= e &&
                    cf.bbox[2] >= w &&
                    cf.bbox[1] <= n &&
                    cf.bbox[3] >= s
                );
            });

            if (visibleFeatures.length > 0) {
                ctx.fillStyle = '#1e293b'; // Slate-800 for Land
                ctx.strokeStyle = '#334155'; // Slate-700 for Coastline
                ctx.lineWidth = 1;

                const transform = d3.geoTransform({
                    point: function (x, y) {
                        const point = map.latLngToContainerPoint([y, x]);
                        this.stream.point(point.x, point.y);
                    }
                });

                const path = d3.geoPath().projection(transform).context(ctx);

                ctx.beginPath();
                // Draw all visible features in one path for performance? 
                // Or individually? One path is faster for fill.
                visibleFeatures.forEach(cf => path(cf.feature));
                ctx.fill();
                ctx.stroke();
            }
        };

        // Initial Draw
        draw();

        // Event Listeners
        const onMove = () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = requestAnimationFrame(draw);
        };

        map.on('move', onMove);
        map.on('zoom', onMove);
        map.on('resize', onMove);

        // Poll for GeoJSON load if not ready
        const checkInterval = setInterval(() => {
            if (TerrainService.isReady()) {
                draw();
                clearInterval(checkInterval);
            }
        }, 500);

        return () => {
            map.off('move', onMove);
            map.off('zoom', onMove);
            map.off('resize', onMove);
            clearInterval(checkInterval);
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        };
    }, [map]);

    return null;
};

export default React.memo(VectorMapLayer);

import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import * as d3 from 'd3';
import { TerrainService } from '../services/terrainService';

interface CachedFeature {
    feature: any;
    bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
}

const TerrainLayer: React.FC = () => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const cachedFeaturesRef = useRef<CachedFeature[] | null>(null);
    const lastMapStateRef = useRef<{ center: L.LatLng, zoom: number } | null>(null);

    useEffect(() => {
        const canvas = L.DomUtil.create('canvas', '') as HTMLCanvasElement;
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '200'; // BOTTOM LAYER
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.backgroundColor = '#0f172a'; // Dark Ocean Background

        const container = map.getContainer();
        container.appendChild(canvas);
        canvasRef.current = canvas;

        // Create Offscreen Canvas for Map
        offscreenCanvasRef.current = document.createElement('canvas');

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

        const renderMapToOffscreen = () => {
            const offCanvas = offscreenCanvasRef.current;
            if (!offCanvas || !map) return;

            const size = map.getSize();
            const pixelRatio = window.devicePixelRatio || 1;

            if (offCanvas.width !== size.x * pixelRatio || offCanvas.height !== size.y * pixelRatio) {
                offCanvas.width = size.x * pixelRatio;
                offCanvas.height = size.y * pixelRatio;
            }

            const ctx = offCanvas.getContext('2d');
            if (!ctx) return;

            ctx.resetTransform();
            ctx.scale(pixelRatio, pixelRatio);
            ctx.clearRect(0, 0, size.x, size.y);

            prepareData();

            const mapBounds = map.getBounds();
            const n = mapBounds.getNorth();
            const s = mapBounds.getSouth();
            const e = mapBounds.getEast();
            const w = mapBounds.getWest();

            if (cachedFeaturesRef.current) {
                const visibleFeatures = cachedFeaturesRef.current.filter(cf => {
                    return (
                        cf.bbox[0] <= e &&
                        cf.bbox[2] >= w &&
                        cf.bbox[1] <= n &&
                        cf.bbox[3] >= s
                    );
                });

                if (visibleFeatures.length > 0) {
                    // Fill land only - no borders between countries
                    ctx.fillStyle = '#1e293b'; // Slate-800 (land color)

                    const transform = d3.geoTransform({
                        point: function (x, y) {
                            const point = map.latLngToContainerPoint([y, x]);
                            this.stream.point(point.x, point.y);
                        }
                    });

                    const path = d3.geoPath().projection(transform).context(ctx);

                    ctx.beginPath();
                    visibleFeatures.forEach(cf => path(cf.feature));
                    ctx.fill();
                    // NOTE: Removed ctx.stroke() to eliminate country borders
                }
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
                renderMapToOffscreen();
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.resetTransform();
            ctx.scale(pixelRatio, pixelRatio);
            ctx.clearRect(0, 0, size.x, size.y);

            // Check if map moved significantly
            const currentCenter = map.getCenter();
            const currentZoom = map.getZoom();

            const mapStateChanged = !lastMapStateRef.current ||
                lastMapStateRef.current.center.lat !== currentCenter.lat ||
                lastMapStateRef.current.center.lng !== currentCenter.lng ||
                lastMapStateRef.current.zoom !== currentZoom;

            if (mapStateChanged) {
                renderMapToOffscreen();
                lastMapStateRef.current = { center: currentCenter, zoom: currentZoom };
            }

            if (offscreenCanvasRef.current) {
                ctx.drawImage(offscreenCanvasRef.current, 0, 0, size.x, size.y);
            }
        };

        // Initial Draw
        draw();

        const onMove = () => {
            requestAnimationFrame(draw);
        };

        map.on('move', onMove);
        map.on('zoom', onMove);
        map.on('resize', onMove);

        // Poll for GeoJSON load
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
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        };
    }, [map]);

    return null;
};

export default React.memo(TerrainLayer);

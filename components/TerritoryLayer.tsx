import React, { useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import * as d3 from 'd3';
import { GameUnit, Faction, POI, UnitClass } from '../types';
import { TERRITORY_CONFIG } from '../constants';

interface Props {
    units: GameUnit[];
    pois: POI[];
    factions: Faction[];
}

interface Site {
    id: string;
    lat: number;
    lng: number;
    factionId: string;
    radius: number;
}

interface VoronoiCell {
    id: string;
    polygon: [number, number][]; // Array of [lat, lng]
    site: Site;
    factionColor: string;
}

const MAX_LAT = 85.05112878;
const SVG_SIZE = 4096;

const TerritoryLayer: React.FC<Props> = ({ units, pois, factions }) => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameId = useRef<number | null>(null);

    // Refs for data access in loop
    const cellsRef = useRef<VoronoiCell[]>([]);

    // Extract HQs for Voronoi
    const hqs = useMemo(() => units.filter(u =>
        (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MOBILE_COMMAND_CENTER) && u.hp > 0
    ), [units]);

    // Calculate Voronoi Geometry (LatLng Polygons)
    const cells = useMemo(() => {
        const sites: Site[] = [];

        // GENERATE SITES FROM CITIES ONLY (plus HQ)
        pois.forEach(p => {
            let r = TERRITORY_CONFIG.CITY_TIER_3_RADIUS;
            if (p.tier === 1) r = TERRITORY_CONFIG.CITY_TIER_1_RADIUS;
            else if (p.tier === 2) r = TERRITORY_CONFIG.CITY_TIER_2_RADIUS;
            else if (p.type === 'OIL_RIG') r = TERRITORY_CONFIG.OIL_RIG_RADIUS;

            sites.push({
                id: p.id,
                lat: p.position.lat,
                lng: p.position.lng,
                factionId: p.ownerFactionId,
                radius: r
            });
        });

        // Add HQs as Sites
        hqs.forEach(u => {
            sites.push({
                id: u.id,
                lat: u.position.lat,
                lng: u.position.lng,
                factionId: u.factionId,
                radius: TERRITORY_CONFIG.HQ_RADIUS
            });
        });

        if (sites.length < 1) return [];

        // Projection for calculation (Mercator)
        const projection = d3.geoMercator()
            .scale(SVG_SIZE / (2 * Math.PI))
            .translate([SVG_SIZE / 2, SVG_SIZE / 2]);

        const projectedSites = sites.map(s => {
            const safeLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, s.lat));
            const [x, y] = projection([s.lng, safeLat]) || [0, 0];
            return { ...s, x, y };
        });

        const delaunay = d3.Delaunay.from(projectedSites.map(s => [s.x, s.y]));
        const voronoi = delaunay.voronoi([0, 0, SVG_SIZE, SVG_SIZE]);

        const generatedCells: VoronoiCell[] = [];

        for (let i = 0; i < projectedSites.length; i++) {
            const site = projectedSites[i];
            const faction = factions.find(f => f.id === site.factionId);

            if (!faction || site.factionId === 'NEUTRAL') continue;

            const polygonCoords = voronoi.cellPolygon(i);
            if (!polygonCoords) continue;

            // Convert back to LatLng
            const latLngPolygon: [number, number][] = polygonCoords.map(([x, y]) => {
                const coords = projection.invert!([x, y]);
                return [coords![1], coords![0]]; // [lat, lng]
            });

            generatedCells.push({
                id: site.id,
                polygon: latLngPolygon,
                site: site,
                factionColor: faction.color
            });
        }

        return generatedCells;

    }, [hqs, pois, factions]);

    // Update ref when cells change
    useEffect(() => {
        cellsRef.current = cells;
    }, [cells]);

    // Canvas Setup and Draw Loop
    useEffect(() => {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated') as HTMLCanvasElement;
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '400'; // MIDDLE LAYER
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';

        const container = map.getContainer();
        container.appendChild(canvas);
        canvasRef.current = canvas;

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

            const currentCells = cellsRef.current;
            // const mapBounds = map.getBounds(); // Not used in this version, but useful for culling
            // const buffer = 0.5; // degrees buffer // Not used in this version, but useful for culling

            currentCells.forEach(cell => {
                // Simple bounds check optimization could go here

                // Project Polygon to Screen
                ctx.beginPath();
                let first = true;
                cell.polygon.forEach(([lat, lng]) => {
                    const pos = map.latLngToContainerPoint([lat, lng]);
                    if (first) {
                        ctx.moveTo(pos.x, pos.y);
                        first = false;
                    } else {
                        ctx.lineTo(pos.x, pos.y);
                    }
                });
                ctx.closePath();

                // Gradient Fill
                const centerPos = map.latLngToContainerPoint([cell.site.lat, cell.site.lng]);
                // Gradient radius in pixels? 
                // We want it to be "attached" so it should scale.
                // In SVG it was 600 units in 4096 space.
                // 600 / 4096 ~= 0.14 of world width.
                // That's huge.
                // Let's calculate a pixel radius based on the site radius or a fixed visual size?
                // The user wants "attached", so it should scale with zoom.
                // Let's use the site radius (in meters) converted to pixels.
                // But the gradient was "glowy" and large.
                // Let's try a fixed large pixel radius that scales?
                // Or just use the distance to the furthest point?
                // Let's use a fixed geographic radius (e.g. 500km) converted to pixels.

                // Approximation: 1 degree lat ~= 111km.
                // 500km ~= 4.5 degrees.
                const pointAtRadius = map.latLngToContainerPoint([cell.site.lat + 4.5, cell.site.lng]);
                const dx = pointAtRadius.x - centerPos.x;
                const dy = pointAtRadius.y - centerPos.y;
                const gradientRadius = Math.sqrt(dx * dx + dy * dy);

                const grad = ctx.createRadialGradient(centerPos.x, centerPos.y, 0, centerPos.x, centerPos.y, gradientRadius);
                grad.addColorStop(0, hexToRgba(cell.factionColor, 0.7));
                grad.addColorStop(0.15, hexToRgba(cell.factionColor, 0.4));
                grad.addColorStop(0.4, hexToRgba(cell.factionColor, 0.2));
                grad.addColorStop(1, hexToRgba(cell.factionColor, 0.05));

                ctx.fillStyle = grad;
                ctx.fill();

                // Stroke
                ctx.strokeStyle = cell.factionColor;
                ctx.lineWidth = 2; // Constant width!
                ctx.globalAlpha = 0.3;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            });

            animationFrameId.current = requestAnimationFrame(draw);
        };

        animationFrameId.current = requestAnimationFrame(draw);

        const onMove = () => {
            // Handled by rAF
        };

        map.on('move', onMove);
        map.on('zoom', onMove);
        map.on('resize', onMove);

        return () => {
            map.off('move', onMove);
            map.off('zoom', onMove);
            map.off('resize', onMove);
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        };
    }, [map]);

    return null;
};

// Helper for Hex to RGBA
function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default React.memo(TerritoryLayer);
import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { GameUnit, Faction, POI, POIType } from '../types';
import { UNIT_CONFIG } from '../constants';

interface Props {
    units: GameUnit[];
    pois: POI[];
    localPlayerId: string;
    enabled: boolean;
}

// Vision radius multiplier (base vision in km)
const BASE_VISION_KM = 50;

// Unit-specific vision modifiers
const VISION_MODIFIERS: Record<string, number> = {
    'RECON_DRONE': 3.0,      // Scouts see 3x
    'FIGHTER_JET': 2.0,      // Air units see 2x
    'HELICOPTER': 1.8,
    'HEAVY_BOMBER': 1.5,
    'SUBMARINE': 0.3,        // Limited surface visibility
    'COMMAND_CENTER': 2.5,   // HQ has good intel
    'AIRBASE': 1.5,
    'MILITARY_BASE': 1.5,
};

const FogOfWarCanvas: React.FC<Props> = ({ units, pois, localPlayerId, enabled }) => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameId = useRef<number | null>(null);

    // Refs for data access
    const unitsRef = useRef(units);
    const poisRef = useRef(pois);
    const localPlayerRef = useRef(localPlayerId);
    const enabledRef = useRef(enabled);

    useEffect(() => {
        unitsRef.current = units;
        poisRef.current = pois;
        localPlayerRef.current = localPlayerId;
        enabledRef.current = enabled;
    }, [units, pois, localPlayerId, enabled]);

    useEffect(() => {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated') as HTMLCanvasElement;
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '550'; // Below units (600), above territory
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';

        const container = map.getContainer();
        container.appendChild(canvas);
        canvasRef.current = canvas;

        const draw = () => {
            if (!canvas || !map || !enabledRef.current) {
                animationFrameId.current = requestAnimationFrame(draw);
                return;
            }

            const size = map.getSize();
            const pixelRatio = window.devicePixelRatio || 1;

            if (canvas.width !== size.x * pixelRatio || canvas.height !== size.y * pixelRatio) {
                canvas.width = size.x * pixelRatio;
                canvas.height = size.y * pixelRatio;
                canvas.style.width = `${size.x}px`;
                canvas.style.height = `${size.y}px`;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                animationFrameId.current = requestAnimationFrame(draw);
                return;
            }

            ctx.resetTransform();
            ctx.scale(pixelRatio, pixelRatio);

            // Fill entire canvas with fog
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, size.x, size.y);

            // Set composite operation to reveal areas
            ctx.globalCompositeOperation = 'destination-out';

            const currentUnits = unitsRef.current;
            const currentPois = poisRef.current;
            const playerId = localPlayerRef.current;

            // Reveal areas around player's units
            const playerUnits = currentUnits.filter(u => u.factionId === playerId && u.hp > 0);

            for (const unit of playerUnits) {
                const pos = map.latLngToContainerPoint([unit.position.lat, unit.position.lng]);

                // Calculate vision radius based on unit type
                const modifier = VISION_MODIFIERS[unit.unitClass] || 1.0;
                const visionKm = BASE_VISION_KM * modifier;

                // Convert km to pixels at current zoom
                const center = L.latLng(unit.position.lat, unit.position.lng);
                const edge = L.latLng(
                    unit.position.lat + (visionKm / 111), // ~111km per degree
                    unit.position.lng
                );
                const radiusPixels = map.latLngToContainerPoint(center).distanceTo(
                    map.latLngToContainerPoint(edge)
                );

                // Create radial gradient for smooth edge
                const gradient = ctx.createRadialGradient(
                    pos.x, pos.y, 0,
                    pos.x, pos.y, radiusPixels
                );
                gradient.addColorStop(0, 'rgba(255,255,255,1)');
                gradient.addColorStop(0.7, 'rgba(255,255,255,0.8)');
                gradient.addColorStop(1, 'rgba(255,255,255,0)');

                ctx.beginPath();
                ctx.fillStyle = gradient;
                ctx.arc(pos.x, pos.y, radiusPixels, 0, Math.PI * 2);
                ctx.fill();
            }

            // Reveal areas around player's cities
            const playerCities = currentPois.filter(
                p => p.ownerFactionId === playerId && p.type === POIType.CITY
            );

            for (const poi of playerCities) {
                const pos = map.latLngToContainerPoint([poi.position.lat, poi.position.lng]);
                const cityVisionKm = 80; // Cities have good vision

                const center = L.latLng(poi.position.lat, poi.position.lng);
                const edge = L.latLng(poi.position.lat + (cityVisionKm / 111), poi.position.lng);
                const radiusPixels = map.latLngToContainerPoint(center).distanceTo(
                    map.latLngToContainerPoint(edge)
                );

                const gradient = ctx.createRadialGradient(
                    pos.x, pos.y, 0,
                    pos.x, pos.y, radiusPixels
                );
                gradient.addColorStop(0, 'rgba(255,255,255,1)');
                gradient.addColorStop(0.6, 'rgba(255,255,255,0.9)');
                gradient.addColorStop(1, 'rgba(255,255,255,0)');

                ctx.beginPath();
                ctx.fillStyle = gradient;
                ctx.arc(pos.x, pos.y, radiusPixels, 0, Math.PI * 2);
                ctx.fill();
            }

            // Reset composite operation
            ctx.globalCompositeOperation = 'source-over';

            animationFrameId.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            if (canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
        };
    }, [map]);

    return null;
};

export default FogOfWarCanvas;

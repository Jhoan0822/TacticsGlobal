import React, { useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { GameUnit, Faction, UnitClass, Projectile, Explosion, WeaponType, POI, POIType } from '../types';
import { globalParticleSystem, ParticleType } from '../services/ParticleSystem';

interface Props {
    units: GameUnit[];
    factions: Faction[];
    selectedUnitIds: string[];
    projectiles: Projectile[];
    explosions: Explosion[];
    pois: POI[];
}

const UNIT_COLORS: Record<string, string> = {
    'PLAYER': '#3b82f6',
    'NEUTRAL': '#9ca3af',
    'NEUTRAL_DEFENDER': '#6b7280', // Gray for neutral city defenders
};

// --- SPRITE CACHE ---
const spriteCache: Record<string, HTMLCanvasElement> = {};

// --- PERFORMANCE: Pre-render POI icons to offscreen canvases ---
const poiSpriteCache: Record<string, HTMLCanvasElement> = {};

const getPoiSprite = (type: POIType, color: string, size: number = 48): HTMLCanvasElement => {
    const key = `${type}-${color}-${size}`;
    if (poiSpriteCache[key]) return poiSpriteCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;

    if (type === POIType.CITY) {
        // City shape with glow pre-rendered
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = color;
        ctx.fillRect(cx - 12, cy - 12, 24, 24);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 12, cy - 12, 24, 24);
        ctx.shadowBlur = 0;
        // Icon
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', cx, cy);
    } else if (type === POIType.OIL_RIG) {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy + 8);
        ctx.lineTo(cx + 8, cy + 8);
        ctx.lineTo(cx, cy - 12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OIL', cx, cy + 4);
    } else if (type === POIType.GOLD_MINE) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 10);
        ctx.lineTo(cx + 10, cy);
        ctx.lineTo(cx, cy + 10);
        ctx.lineTo(cx - 10, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#78350f';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Au', cx, cy);
    }

    poiSpriteCache[key] = canvas;
    return canvas;
};

const getUnitSprite = (type: UnitClass, color: string): HTMLCanvasElement => {
    const key = `${type}-${color}`;
    if (spriteCache[key]) return spriteCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Center is 16, 16
    ctx.translate(16, 16);

    // Draw the shape
    ctx.fillStyle = color;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';

    switch (type) {
        case UnitClass.FIGHTER_JET:
        case UnitClass.RECON_DRONE:
            // Triangle with tail
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(-6, 6);
            ctx.lineTo(0, 3);
            ctx.lineTo(6, 6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Wings
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(-10, 3);
            ctx.moveTo(0, -6);
            ctx.lineTo(10, 3);
            ctx.stroke();
            break;
        case UnitClass.HEAVY_BOMBER:
            // Large Triangle
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(-10, 4);
            ctx.lineTo(0, 2);
            ctx.lineTo(10, 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case UnitClass.HELICOPTER:
            // Circle with rotor
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-10, 0);
            ctx.lineTo(10, 0);
            ctx.moveTo(0, -10);
            ctx.lineTo(0, 10);
            ctx.stroke();
            break;
        case UnitClass.GROUND_TANK:
            // Rectangle body
            ctx.fillRect(-5, -7, 10, 14);
            ctx.strokeRect(-5, -7, 10, 14);
            // Turret
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#333';
            ctx.fill();
            // Barrel
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -12);
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.stroke();
            break;
        case UnitClass.INFANTRY:
        case UnitClass.SPECIAL_FORCES:
            // Circle with dot
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        case UnitClass.MISSILE_LAUNCHER:
        case UnitClass.SAM_LAUNCHER:
            // Box with tubes
            ctx.fillRect(-6, -6, 12, 12);
            ctx.strokeRect(-6, -6, 12, 12);
            ctx.beginPath();
            ctx.moveTo(-3, -3); ctx.lineTo(-3, 6);
            ctx.moveTo(3, -3); ctx.lineTo(3, 6);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.stroke();
            break;
        case UnitClass.MOBILE_COMMAND_CENTER:
        case UnitClass.COMMAND_CENTER:
            // Large Box with HQ text
            ctx.fillStyle = color;
            ctx.fillRect(-8, -8, 16, 16);
            ctx.strokeStyle = '#fbbf24'; // Gold
            ctx.lineWidth = 2;
            ctx.strokeRect(-8, -8, 16, 16);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('HQ', 0, 0);
            break;
        case UnitClass.AIRBASE:
            // Rect with runway line
            ctx.fillRect(-8, -10, 16, 20);
            ctx.strokeRect(-8, -10, 16, 20);
            ctx.beginPath();
            ctx.moveTo(0, -8); ctx.lineTo(0, 8);
            ctx.strokeStyle = 'white';
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
            break;
        case UnitClass.MILITARY_BASE:
            // Pentagon-ish or Fort
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(10, -2);
            ctx.lineTo(8, 10);
            ctx.lineTo(-8, 10);
            ctx.lineTo(-10, -2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case UnitClass.PORT:
            // Anchor shape or Circle with dock
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-4, 0); ctx.lineTo(4, 0);
            ctx.moveTo(0, -4); ctx.lineTo(0, 4);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            break;
        case UnitClass.MINELAYER:
            // Square
            ctx.fillRect(-6, -6, 12, 12);
            ctx.strokeRect(-6, -6, 12, 12);
            break;
        case UnitClass.DESTROYER:
        case UnitClass.FRIGATE:
        case UnitClass.PATROL_BOAT:
            // Ship shape
            ctx.beginPath();
            ctx.moveTo(0, -12);
            ctx.quadraticCurveTo(6, -6, 6, 8);
            ctx.lineTo(0, 10);
            ctx.lineTo(-6, 8);
            ctx.quadraticCurveTo(-6, -6, 0, -12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case UnitClass.BATTLESHIP:
        case UnitClass.AIRCRAFT_CARRIER:
            // Large Ship
            ctx.beginPath();
            ctx.moveTo(0, -16);
            ctx.quadraticCurveTo(8, -8, 8, 12);
            ctx.lineTo(0, 14);
            ctx.lineTo(-8, 12);
            ctx.quadraticCurveTo(-8, -8, 0, -16);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case UnitClass.SUBMARINE:
            // Sub shape
            ctx.beginPath();
            ctx.ellipse(0, 0, 4, 12, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        case UnitClass.TROOP_TRANSPORT:
            // Rect with rounded front
            ctx.beginPath();
            ctx.moveTo(-6, -8);
            ctx.lineTo(4, -8);
            ctx.quadraticCurveTo(8, 0, 4, 8);
            ctx.lineTo(-6, 8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Windows
            ctx.fillStyle = '#111';
            ctx.fillRect(0, -4, 3, 8);
            break;
        default:
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
    }

    spriteCache[key] = canvas;
    return canvas;
};

const GameCanvas: React.FC<Props> = ({ units, factions, selectedUnitIds, projectiles, explosions, pois }) => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameId = useRef<number | null>(null);

    // Refs for data access in loop
    const unitsRef = useRef(units);
    const factionsRef = useRef(factions);
    const selectedRef = useRef(selectedUnitIds);
    const projectilesRef = useRef(projectiles);
    const explosionsRef = useRef(explosions);
    const poisRef = useRef(pois);

    useEffect(() => {
        unitsRef.current = units;
        factionsRef.current = factions;
        selectedRef.current = selectedUnitIds;
        projectilesRef.current = projectiles;
        explosionsRef.current = explosions;
        poisRef.current = pois;
    }, [units, factions, selectedUnitIds, projectiles, explosions, pois]);

    useEffect(() => {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated') as HTMLCanvasElement;
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '600'; // TOP LAYER (Above Territory)
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        // Transparent background for Unit Layer

        const container = map.getContainer();
        container.appendChild(canvas);
        canvasRef.current = canvas;

        const draw = (time: number) => {
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

            // --- 1. DRAW POIS (CITIES) ---
            const currentPois = poisRef.current;
            const currentFactions = factionsRef.current;
            const mapSize = map.getSize();
            const buffer = 100;

            currentPois.forEach(poi => {
                const pos = map.latLngToContainerPoint([poi.position.lat, poi.position.lng]);
                if (pos.x < -buffer || pos.y < -buffer || pos.x > mapSize.x + buffer || pos.y > mapSize.y + buffer) return;

                const owner = currentFactions.find(f => f.id === poi.ownerFactionId);
                const color = owner?.color || '#64748b';

                ctx.save();
                ctx.translate(pos.x, pos.y);

                // PERFORMANCE: Use cached sprite instead of drawing shapes every frame
                const sprite = getPoiSprite(poi.type, color);
                ctx.drawImage(sprite, -24, -24);

                // Only draw dynamic elements (health bar, name label)
                if (poi.type === POIType.CITY) {
                    // Name Label
                    ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    ctx.fillRect(-20, 16, 40, 14);
                    ctx.fillStyle = 'white';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(poi.name, 0, 23);

                    // Health Bar
                    const hpPct = Math.max(0, Math.min(1, poi.hp / poi.maxHp));
                    const hpColor = hpPct < 0.3 ? '#ef4444' : hpPct < 0.6 ? '#eab308' : '#22c55e';

                    ctx.fillStyle = 'rgba(0,0,0,0.8)';
                    ctx.fillRect(-16, -20, 32, 4);
                    ctx.fillStyle = hpColor;
                    ctx.fillRect(-16, -20, 32 * hpPct, 4);
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(-16, -20, 32, 4);
                }

                ctx.restore();
            });

            // --- 2. DRAW UNITS & COMBAT ---
            const currentUnits = unitsRef.current;
            const currentSelected = selectedRef.current;
            const currentProjectiles = projectilesRef.current;
            const currentExplosions = explosionsRef.current;

            // Projectiles
            currentProjectiles.forEach(p => {
                const lat = p.fromPos.lat + (p.toPos.lat - p.fromPos.lat) * p.progress;
                const lng = p.fromPos.lng + (p.toPos.lng - p.fromPos.lng) * p.progress;
                const pos = map.latLngToContainerPoint([lat, lng]);

                if (pos.x < -buffer || pos.y < -buffer || pos.x > mapSize.x + buffer || pos.y > mapSize.y + buffer) return;

                ctx.save();
                ctx.translate(pos.x, pos.y);

                if (p.weaponType === WeaponType.MISSILE) {
                    const dx = p.toPos.lng - p.fromPos.lng;
                    const dy = p.toPos.lat - p.fromPos.lat;
                    const heading = Math.atan2(dx, dy);
                    ctx.rotate(heading);

                    // Trail
                    ctx.beginPath();
                    ctx.moveTo(0, 0); ctx.lineTo(0, -10);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Body
                    ctx.beginPath();
                    ctx.arc(0, 0, 2, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = 'yellow';
                    ctx.fill();
                }
                ctx.restore();
            });

            // Units - INTERPOLATION: Use visual position for smooth rendering
            currentUnits.forEach(unit => {
                // PERFORMANCE: Use visual position if available, otherwise use authoritative position
                const renderLat = unit.visualPosition?.lat ?? unit.position.lat;
                const renderLng = unit.visualPosition?.lng ?? unit.position.lng;
                const renderHeading = unit.visualHeading ?? unit.heading;

                const pos = map.latLngToContainerPoint([renderLat, renderLng]);
                if (pos.x < -buffer || pos.y < -buffer || pos.x > mapSize.x + buffer || pos.y > mapSize.y + buffer) return;

                const faction = currentFactions.find(f => f.id === unit.factionId);
                // DEBUG: Log first unit to check faction lookup
                if (!faction && currentUnits.indexOf(unit) < 3) {
                    console.log('[DEBUG] Unit factionId:', unit.factionId, 'Available factions:', currentFactions.map(f => ({ id: f.id, color: f.color })));
                }
                const color = faction?.color || UNIT_COLORS[unit.factionId] || '#ff0000';
                const isSelected = currentSelected.includes(unit.id);
                const isBoosting = unit.isBoosting;
                const isDamaged = unit.hp < unit.maxHp * 0.5;

                ctx.save();
                ctx.translate(pos.x, pos.y);

                if (isBoosting) {
                    const pulse = (Math.sin(time / 100) + 1) / 2;
                    ctx.save();
                    ctx.rotate((renderHeading * Math.PI) / 180);
                    ctx.strokeStyle = 'cyan';
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.6 * pulse;
                    ctx.beginPath();
                    ctx.moveTo(-5, 10); ctx.lineTo(-5, 25);
                    ctx.moveTo(5, 10); ctx.lineTo(5, 25);
                    ctx.stroke();
                    ctx.restore();
                }

                if (isSelected) {
                    const pulse = (Math.sin(time / 200) + 1) / 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, 14 + (pulse * 2), 0, Math.PI * 2);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.8;
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }

                ctx.save();
                ctx.rotate((renderHeading * Math.PI) / 180);

                // USE SPRITE CACHE
                const sprite = getUnitSprite(unit.unitClass, color);
                ctx.drawImage(sprite, -16, -16);

                ctx.restore();

                if (isDamaged) {
                    const flicker = Math.random() > 0.5 ? 1 : 0.5;
                    ctx.beginPath();
                    ctx.arc(5, -5, 3, 0, Math.PI * 2);
                    ctx.fillStyle = unit.hp < unit.maxHp * 0.25 ? `rgba(255, 0, 0, ${flicker})` : `rgba(255, 165, 0, ${flicker})`;
                    ctx.fill();
                }

                if (unit.hp < unit.maxHp) {
                    ctx.fillStyle = 'rgba(0,0,0,0.8)';
                    ctx.fillRect(-8, 12, 16, 3);
                    ctx.fillStyle = unit.hp < unit.maxHp * 0.3 ? '#ef4444' : '#22c55e';
                    ctx.fillRect(-8, 12, 16 * (unit.hp / unit.maxHp), 3);
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(-8, 12, 16, 3);
                }

                ctx.restore();
            });

            // Explosions
            currentExplosions.forEach(exp => {
                const age = Date.now() - exp.timestamp;
                if (age > 500) return;

                const pos = map.latLngToContainerPoint([exp.position.lat, exp.position.lng]);
                if (pos.x < -buffer || pos.y < -buffer || pos.x > mapSize.x + buffer || pos.y > mapSize.y + buffer) return;

                const progress = age / 500;
                const radius = (exp.size === 'MEDIUM' ? 20 : 10) * Math.sin(progress * Math.PI);
                const alpha = 1 - progress;

                ctx.save();
                ctx.translate(pos.x, pos.y);
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 100, 0, ${alpha})`;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
                ctx.fill();
                ctx.restore();
            });

            animationFrameId.current = requestAnimationFrame(draw);
        };

        animationFrameId.current = requestAnimationFrame(draw);

        const onMove = () => {
            // Handled by rAF loop using latest map state
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

export default React.memo(GameCanvas);

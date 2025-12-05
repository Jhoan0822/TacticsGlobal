import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { GameUnit, Faction, UnitClass, Projectile, Explosion, WeaponType } from '../types';

interface Props {
    units: GameUnit[];
    factions: Faction[];
    selectedUnitIds: string[];
    projectiles: Projectile[];
    explosions: Explosion[];
}

const UNIT_COLORS: Record<string, string> = {
    'PLAYER': '#3b82f6',
    'NEUTRAL': '#9ca3af',
};
// --- OPTIMIZATION: OFF-SCREEN CANVAS CACHE ---
const spriteCache: Record<string, HTMLCanvasElement> = {};

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

    // Draw the shape (Original logic moved here)
    ctx.fillStyle = color;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;

    switch (type) {
        case UnitClass.INFANTRY:
        case UnitClass.SPECIAL_FORCES:
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        case UnitClass.GROUND_TANK:
        case UnitClass.MISSILE_LAUNCHER:
        case UnitClass.SAM_LAUNCHER:
            ctx.fillRect(-6, -8, 12, 16);
            ctx.strokeRect(-6, -8, 12, 16);
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'black';
            ctx.fill();
            break;
        case UnitClass.FIGHTER_JET:
        case UnitClass.HEAVY_BOMBER:
        case UnitClass.HELICOPTER:
        case UnitClass.RECON_DRONE:
        case UnitClass.TROOP_TRANSPORT:
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(8, 6);
            ctx.lineTo(0, 4);
            ctx.lineTo(-8, 6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case UnitClass.COMMAND_CENTER:
        case UnitClass.MOBILE_COMMAND_CENTER:
            ctx.fillStyle = color;
            ctx.fillRect(-8, -8, 16, 16);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.strokeRect(-8, -8, 16, 16);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('HQ', 0, 0);
            break;
        case UnitClass.AIRBASE:
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
            ctx.fillRect(-6, -6, 12, 12);
            ctx.strokeRect(-6, -6, 12, 12);
            break;
        case UnitClass.MISSILE_SILO:
            // Nuclear silo - distinctive hazard icon with radiation triangles
            ctx.fillStyle = '#7c2d12';  // Dark orange-brown base
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fbbf24';  // Yellow warning border
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw radiation symbol (3 triangular segments)
            ctx.fillStyle = '#fbbf24';
            for (let i = 0; i < 3; i++) {
                ctx.save();
                ctx.rotate((i * 2 * Math.PI) / 3);
                ctx.beginPath();
                ctx.moveTo(0, -3);
                ctx.lineTo(4, -9);
                ctx.lineTo(-4, -9);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            // Center dot
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
            break;
        case UnitClass.DESTROYER:
        case UnitClass.FRIGATE:
        case UnitClass.PATROL_BOAT:
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
            ctx.beginPath();
            ctx.ellipse(0, 0, 4, 12, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        default:
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
    }

    spriteCache[key] = canvas;
    return canvas;
};

const CanvasUnitLayer: React.FC<Props> = ({ units, factions, selectedUnitIds, projectiles, explosions }) => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const unitsRef = useRef(units);
    const factionsRef = useRef(factions);
    const selectedRef = useRef(selectedUnitIds);
    const projectilesRef = useRef(projectiles);
    const explosionsRef = useRef(explosions);
    const animationFrameId = useRef<number | null>(null);
    const timeRef = useRef(0);

    useEffect(() => {
        unitsRef.current = units;
        factionsRef.current = factions;
        selectedRef.current = selectedUnitIds;
        projectilesRef.current = projectiles;
        explosionsRef.current = explosions;
    }, [units, factions, selectedUnitIds, projectiles, explosions]);

    useEffect(() => {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated') as HTMLCanvasElement;
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '400';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';

        // Use Screen Space (getContainer) to match VectorMapLayer and prevent drift/deformation
        const container = map.getContainer();
        container.appendChild(canvas);
        canvasRef.current = canvas;

        const draw = (time: number) => {
            if (!canvas || !map) return;
            timeRef.current = time;

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

            const currentUnits = unitsRef.current;
            const currentFactions = factionsRef.current;
            const currentSelected = selectedRef.current;
            const currentProjectiles = projectilesRef.current;
            const currentExplosions = explosionsRef.current;
            const mapSize = map.getSize();

            // Culling Buffer
            const buffer = 100;

            // --- DRAW PROJECTILES ---
            currentProjectiles.forEach(p => {
                const lat = p.fromPos.lat + (p.toPos.lat - p.fromPos.lat) * p.progress;
                const lng = p.fromPos.lng + (p.toPos.lng - p.fromPos.lng) * p.progress;

                const pos = map.latLngToContainerPoint([lat, lng]);

                // CULLING
                if (pos.x < -buffer || pos.y < -buffer || pos.x > mapSize.x + buffer || pos.y > mapSize.y + buffer) return;

                ctx.save();
                ctx.translate(pos.x, pos.y);

                if (p.weaponType === WeaponType.MISSILE) {
                    const dx = p.toPos.lng - p.fromPos.lng;
                    const dy = p.toPos.lat - p.fromPos.lat;
                    const heading = Math.atan2(dx, dy); // Rads

                    ctx.rotate(heading);

                    // Trail
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, -10);
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

            // --- DRAW UNITS ---
            currentUnits.forEach(unit => {
                const pos = map.latLngToContainerPoint([unit.position.lat, unit.position.lng]);

                // CULLING
                if (pos.x < -buffer || pos.y < -buffer || pos.x > mapSize.x + buffer || pos.y > mapSize.y + buffer) return;

                const faction = currentFactions.find(f => f.id === unit.factionId);
                const color = faction?.color || UNIT_COLORS[unit.factionId] || '#ff0000';
                const isSelected = currentSelected.includes(unit.id);
                const isBoosting = unit.isBoosting;
                const isDamaged = unit.hp < unit.maxHp * 0.5;

                ctx.save();
                ctx.translate(pos.x, pos.y);

                // 1. BOOSTING TRAILS
                if (isBoosting) {
                    const pulse = (Math.sin(time / 100) + 1) / 2;
                    ctx.save();
                    ctx.rotate((unit.heading * Math.PI) / 180);
                    ctx.strokeStyle = 'cyan';
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.6 * pulse;
                    ctx.beginPath();
                    ctx.moveTo(-5, 10); ctx.lineTo(-5, 25);
                    ctx.moveTo(5, 10); ctx.lineTo(5, 25);
                    ctx.stroke();
                    ctx.restore();
                }

                // 2. SELECTION RING
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

                // 3. UNIT SHAPE (OPTIMIZED)
                ctx.save();
                ctx.rotate((unit.heading * Math.PI) / 180);
                const sprite = getUnitSprite(unit.unitClass, color);
                // Sprite is 32x32, centered at 16,16
                ctx.drawImage(sprite, -16, -16);
                ctx.restore();

                // 4. DAMAGE INDICATOR
                if (isDamaged) {
                    const flicker = Math.random() > 0.5 ? 1 : 0.5;
                    ctx.beginPath();
                    ctx.arc(5, -5, 3, 0, Math.PI * 2);
                    ctx.fillStyle = unit.hp < unit.maxHp * 0.25 ? `rgba(255, 0, 0, ${flicker})` : `rgba(255, 165, 0, ${flicker})`;
                    ctx.fill();
                }

                // 5. HEALTH BAR
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

            // --- DRAW EXPLOSIONS ---
            currentExplosions.forEach(exp => {
                const age = Date.now() - exp.timestamp;
                const duration = exp.size === 'NUCLEAR' ? 3000 : 500;
                if (age > duration) return;

                const pos = map.latLngToContainerPoint([exp.position.lat, exp.position.lng]);

                // CULLING
                if (pos.x < -buffer || pos.y < -buffer || pos.x > mapSize.x + buffer || pos.y > mapSize.y + buffer) return;

                const progress = age / duration;

                ctx.save();
                ctx.translate(pos.x, pos.y);

                if (exp.size === 'NUCLEAR') {
                    // Nuclear explosion - massive multi-ring effect
                    const baseRadius = 80;
                    const scale = 0.5 + progress * 3;  // Expand rapidly
                    const alpha = Math.max(0, 1 - progress);

                    // Outer shockwave ring
                    ctx.beginPath();
                    ctx.arc(0, 0, baseRadius * scale * 1.5, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
                    ctx.lineWidth = 4;
                    ctx.stroke();

                    // Main fireball (gradient)
                    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, baseRadius * scale);
                    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
                    gradient.addColorStop(0.2, `rgba(255, 200, 100, ${alpha})`);
                    gradient.addColorStop(0.5, `rgba(255, 100, 0, ${alpha * 0.8})`);
                    gradient.addColorStop(0.8, `rgba(200, 50, 50, ${alpha * 0.5})`);
                    gradient.addColorStop(1, `rgba(100, 0, 50, 0)`);

                    ctx.beginPath();
                    ctx.arc(0, 0, baseRadius * scale, 0, Math.PI * 2);
                    ctx.fillStyle = gradient;
                    ctx.fill();

                    // Inner core
                    ctx.beginPath();
                    ctx.arc(0, 0, baseRadius * scale * 0.3, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
                    ctx.fill();
                } else {
                    // Standard explosion
                    const radius = (exp.size === 'MEDIUM' ? 20 : (exp.size === 'LARGE' ? 30 : 10)) * Math.sin(progress * Math.PI);
                    const alpha = 1 - progress;

                    ctx.beginPath();
                    ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 100, 0, ${alpha})`;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
                    ctx.fill();
                }
                ctx.restore();
            });

            animationFrameId.current = requestAnimationFrame(draw);
        };

        animationFrameId.current = requestAnimationFrame(draw);

        const onResize = () => {
            // Handled in draw loop
        };
        map.on('resize', onResize);

        return () => {
            map.off('resize', onResize);
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        };
    }, [map]);

    return null;
};

export default CanvasUnitLayer;

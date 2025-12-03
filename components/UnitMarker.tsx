import React, { useMemo, useRef, useEffect } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { GameUnit, UnitClass } from '../types';

const getUnitShapes = (type: UnitClass, color: string) => {
  const s = `stroke="white" stroke-width="1" stroke-linejoin="round"`;
  switch (type) {
    case UnitClass.FIGHTER_JET:
    case UnitClass.RECON_DRONE:
      return `<path d="M12 2 L6 18 L12 15 L18 18 Z" fill="${color}" ${s} /><path d="M12 6 L12 15" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>`;
    case UnitClass.HEAVY_BOMBER:
      return `<path d="M12 2 L2 16 L12 14 L22 16 Z" fill="${color}" ${s} /><rect x="11" y="8" width="2" height="6" fill="rgba(0,0,0,0.3)"/>`;
    case UnitClass.TROOP_TRANSPORT:
      return `<path d="M12 2 C 14 2, 16 6, 16 12 L 20 18 L 12 16 L 4 18 L 8 12 C 8 6, 10 2, 12 2 Z" fill="${color}" ${s} />`;
    case UnitClass.HELICOPTER:
      return `<circle cx="12" cy="12" r="5" fill="${color}" ${s} /><line x1="2" y1="12" x2="22" y2="12" stroke="white" stroke-width="1"/><path d="M12 12 L18 18" stroke="white" />`;
    case UnitClass.GROUND_TANK:
      return `<rect x="7" y="5" width="10" height="14" rx="2" fill="${color}" ${s} /><circle cx="12" cy="12" r="3" fill="rgba(0,0,0,0.5)" /><line x1="12" y1="12" x2="12" y2="2" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;
    case UnitClass.INFANTRY:
      return `<circle cx="12" cy="8" r="3" fill="${color}" ${s} /><path d="M12 11 L12 18 M9 22 L12 18 L15 22 M8 14 L16 14" stroke="${color}" stroke-width="2" />`;
    case UnitClass.SPECIAL_FORCES:
      return `<path d="M12 2 L15 8 L21 8 L16 12 L18 18 L12 14 L6 18 L8 12 L3 8 L9 8 Z" fill="${color}" ${s} />`;
    case UnitClass.MISSILE_LAUNCHER:
      return `<rect x="6" y="6" width="12" height="12" fill="${color}" ${s} /><path d="M12 6 L12 18 M8 10 L16 10" stroke="white" stroke-width="1"/>`;
    case UnitClass.SAM_LAUNCHER:
      return `<rect x="6" y="8" width="12" height="10" fill="${color}" ${s} /><circle cx="12" cy="12" r="4" stroke="white" fill="none" />`;
    case UnitClass.MOBILE_COMMAND_CENTER:
      return `<rect x="5" y="5" width="14" height="14" fill="${color}" stroke="#fbbf24" stroke-width="2" /><text x="12" y="16" font-size="8" text-anchor="middle" fill="white">HQ</text>`;
    case UnitClass.MILITARY_BASE:
        return `<path d="M12 2 L22 22 L2 22 Z" fill="${color}" ${s} /><rect x="10" y="14" width="4" height="8" fill="white" />`;
    case UnitClass.AIRBASE:
        return `<rect x="6" y="4" width="12" height="16" fill="${color}" ${s} /><line x1="12" y1="6" x2="12" y2="18" stroke="white" stroke-width="2" stroke-dasharray="2,2"/>`;
    case UnitClass.PORT:
        return `<circle cx="12" cy="12" r="8" fill="${color}" ${s} /><path d="M12 6 L12 16 M8 10 L12 14 L16 10" stroke="white" stroke-width="2" />`;
    case UnitClass.AIRCRAFT_CARRIER:
      return `<polygon points="8,2 16,2 16,22 8,22" fill="${color}" ${s} /><line x1="14" y1="4" x2="14" y2="20" stroke="rgba(255,255,255,0.4)" stroke-width="1" stroke-dasharray="2,2"/><rect x="6" y="8" width="2" height="6" fill="#333" />`;
    case UnitClass.DESTROYER:
      return `<path d="M12 2 L16 8 L16 20 L12 22 L8 20 L8 8 Z" fill="${color}" ${s} />`;
    case UnitClass.FRIGATE:
      return `<path d="M12 2 L15 6 L15 18 L12 20 L9 18 L9 6 Z" fill="${color}" ${s} /><line x1="12" y1="8" x2="12" y2="16" stroke="white" />`;
    case UnitClass.BATTLESHIP:
      return `<rect x="8" y="4" width="8" height="20" fill="${color}" ${s} /><circle cx="12" cy="10" r="2" fill="black"/><circle cx="12" cy="18" r="2" fill="black"/>`;
    case UnitClass.SUBMARINE:
      return `<rect x="10" y="4" width="4" height="16" rx="2" fill="${color}" ${s} /><path d="M10 10 L14 10" stroke="white" />`;
    case UnitClass.PATROL_BOAT:
      return `<path d="M12 4 L15 20 L9 20 Z" fill="${color}" ${s} />`;
    case UnitClass.MINELAYER:
        return `<rect x="8" y="8" width="8" height="8" fill="${color}" ${s} />`;
    case UnitClass.COMMAND_CENTER:
      return `<path d="M12 2 L14.5 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9.5 9 Z" fill="${color}" stroke="#fbbf24" stroke-width="2"/>`;
    default:
      return `<circle cx="12" cy="12" r="6" fill="${color}" ${s} />`;
  }
};

interface Props {
  unit: GameUnit;
  isSelected: boolean;
  factionColor: string; 
  factionName: string; 
  onClick: (unitId: string) => void;
  onRightClick: (unitId: string) => void;
  onAction: (action: string, unitId: string) => void;
}

const UnitMarker: React.FC<Props> = ({ unit, isSelected, factionColor, onClick, onRightClick }) => {
  const markerRef = useRef<L.Marker>(null);
  const baseColor = factionColor;
  
  const isDamaged = unit.hp < unit.maxHp * 0.5;
  const isCritical = unit.hp < unit.maxHp * 0.25;
  const isMoving = !!unit.destination || !!unit.targetId;
  const isBoosting = unit.isBoosting;

  useEffect(() => {
    if (markerRef.current) {
        const el = markerRef.current.getElement();
        if (el) {
            const rotator = el.querySelector('.unit-rotator') as HTMLElement;
            if (rotator) rotator.style.transform = `rotate(${unit.heading}deg)`;
        }
    }
  }, [unit.heading]);

  useEffect(() => {
    if (markerRef.current) {
        const el = markerRef.current.getElement();
        if (el) {
            const barFill = el.querySelector('.unit-health-bar-fill') as HTMLElement;
            if (barFill) {
                const pct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
                let color = '#22c55e';
                if (pct <= 50) color = '#eab308';
                if (pct <= 25) color = '#ef4444';
                barFill.style.width = `${pct}%`;
                barFill.style.backgroundColor = color;
            }
        }
    }
  }, [unit.hp, unit.maxHp]);

  const icon = useMemo(() => {
      // Boosting Trail
      const trails = isBoosting ? `
         <g opacity="0.8">
           <path d="M9 20 L9 35" stroke="cyan" stroke-width="3" stroke-linecap="round" filter="drop-shadow(0 0 4px cyan)" class="animate-pulse" />
           <path d="M15 20 L15 35" stroke="cyan" stroke-width="3" stroke-linecap="round" filter="drop-shadow(0 0 4px cyan)" class="animate-pulse" />
         </g>
      ` : isMoving ? `
        <g opacity="0.6"><line x1="9" y1="20" x2="9" y2="28" stroke="${baseColor}" stroke-width="2" stroke-dasharray="2,2" /><line x1="15" y1="20" x2="15" y2="28" stroke="${baseColor}" stroke-width="2" stroke-dasharray="2,2" /></g>
      ` : '';

      const damageIndicator = isDamaged ? `<circle cx="18" cy="6" r="4" fill="${isCritical ? '#ff0000' : '#ffa500'}" class="animate-ping" opacity="0.8" /><circle cx="18" cy="6" r="2" fill="white" />` : '';

      const selectionOverlay = isSelected ? `
        <div style="position: absolute; top: -12px; left: -12px; width: 48px; height: 48px; border: 2px solid ${baseColor}; border-radius: 4px; box-shadow: 0 0 10px ${baseColor}; pointer-events: none; animation: pulse 1.5s infinite;"></div>
      ` : '';

      const healthBarHtml = `
        <div style="position: absolute; top: -4px; left: 50%; transform: translateX(-50%); width: 28px; height: 3px; background: rgba(0,0,0,0.8); border: 0.5px solid ${baseColor}; pointer-events: none;">
            <div class="unit-health-bar-fill" style="width: ${(unit.hp / unit.maxHp) * 100}%; height: 100%; background-color: #22c55e;"></div>
        </div>
      `;

      const iconHtml = `
        <div style="position: relative; width: 48px; height: 48px; display: flex; justify-content: center; align-items: center; background: transparent; pointer-events: auto;">
          ${healthBarHtml}
          ${selectionOverlay}
          <div class="unit-rotator" style="width: 24px; height: 24px; transition: transform 0.1s linear; pointer-events: none;">
            <svg width="24" height="40" viewBox="0 0 24 40" style="overflow: visible; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.5));">
              ${trails}
              <g transform="translate(0, 0)">${getUnitShapes(unit.unitClass, baseColor)}</g>
              ${damageIndicator}
            </svg>
          </div>
        </div>
      `;

      return L.divIcon({ className: 'custom-unit-icon', html: iconHtml, iconSize: [48, 48], iconAnchor: [24, 24] });
  }, [unit.unitClass, unit.factionId, isSelected, isDamaged, isMoving, isCritical, baseColor, isBoosting]);

  return (
    <Marker 
      ref={markerRef}
      position={[unit.position.lat, unit.position.lng]} 
      icon={icon}
      eventHandlers={{
        click: (e) => { L.DomEvent.stopPropagation(e); e.originalEvent.stopPropagation(); onClick(unit.id); },
        contextmenu: (e) => { L.DomEvent.stopPropagation(e); e.originalEvent.stopPropagation(); e.originalEvent.preventDefault(); onRightClick(unit.id); }
      }}
    />
  );
};
export default UnitMarker;

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, useMap, useMapEvents, Polyline, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { GameUnit, Projectile, Faction, POI, POIType, WeaponType, Explosion } from '../types';
import UnitMarker from './UnitMarker';
import TerritoryLayer from './TerritoryLayer';

interface Props {
  units: GameUnit[];
  factions: Faction[];
  pois?: POI[];
  projectiles: Projectile[];
  explosions: Explosion[];
  center: { lat: number; lng: number };
  selectedUnitIds: string[];
  onUnitClick: (id: string, multiSelect: boolean) => void;
  onUnitRightClick: (id: string) => void;
  onUnitAction: (action: string, id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  onMapRightClick: (lat: number, lng: number) => void;
  onPoiClick: (id: string) => void;
  onPoiRightClick: (id: string) => void;
  onMultiSelect: (ids: string[]) => void;
  gameMode: 'SELECT_BASE' | 'PLAYING' | 'PLACING_STRUCTURE';
}

// DRAG SELECTION OVERLAY
const DragSelection: React.FC<{ 
    units: GameUnit[];
    onSelectionComplete: (ids: string[]) => void;
}> = ({ units, onSelectionComplete }) => {
    const map = useMap();
    const [startPoint, setStartPoint] = useState<L.Point | null>(null);
    const [currentPoint, setCurrentPoint] = useState<L.Point | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const container = map.getContainer();

        const onMouseDown = (e: MouseEvent) => {
            if (e.shiftKey && e.button === 0) {
                L.DomEvent.disableClickPropagation(container);
                const point = map.mouseEventToContainerPoint(e);
                setStartPoint(point);
                setCurrentPoint(point);
                setIsDragging(true);
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                const point = map.mouseEventToContainerPoint(e);
                setCurrentPoint(point);
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            if (isDragging && startPoint && currentPoint) {
                // Determine Bounds in LatLng
                const p1 = map.containerPointToLatLng(startPoint);
                const p2 = map.containerPointToLatLng(currentPoint);
                const bounds = L.latLngBounds(p1, p2);

                // Find units inside bounds
                const selectedIds = units.filter(u => 
                    u.factionId === 'PLAYER' && 
                    bounds.contains({ lat: u.position.lat, lng: u.position.lng })
                ).map(u => u.id);

                onSelectionComplete(selectedIds);
                
                setStartPoint(null);
                setCurrentPoint(null);
                setIsDragging(false);
            }
        };

        container.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            container.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [map, isDragging, startPoint, currentPoint, units, onSelectionComplete]);

    if (!isDragging || !startPoint || !currentPoint) return null;

    const left = Math.min(startPoint.x, currentPoint.x);
    const top = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(startPoint.x - currentPoint.x);
    const height = Math.abs(startPoint.y - currentPoint.y);

    return (
        <div style={{
            position: 'absolute',
            left, top, width, height,
            border: '2px solid cyan',
            backgroundColor: 'rgba(0, 255, 255, 0.2)',
            zIndex: 1000,
            pointerEvents: 'none'
        }}></div>
    );
};

const MapInteraction: React.FC<{ onMapClick: (lat: number, lng: number) => void, onMapRightClick: (lat: number, lng: number) => void, gameMode: string }> = ({ onMapClick, onMapRightClick, gameMode }) => {
  useMapEvents({
    click(e) { if (!e.originalEvent.shiftKey) onMapClick(e.latlng.lat, e.latlng.lng); },
    contextmenu(e) { onMapRightClick(e.latlng.lat, e.latlng.lng); }
  });
  useEffect(() => {
    const container = document.querySelector('.leaflet-container') as HTMLElement;
    if (container) {
        if (gameMode === 'SELECT_BASE') container.style.cursor = 'crosshair';
        else if (gameMode === 'PLACING_STRUCTURE') container.style.cursor = 'copy';
        else container.style.cursor = 'default';
    }
  }, [gameMode]);
  return null;
};

const MapController: React.FC<{ center: { lat: number; lng: number }, gameMode: string }> = ({ center, gameMode }) => {
  const map = useMap();
  useEffect(() => {
      if (gameMode === 'SELECT_BASE') map.setView([center.lat, center.lng], 3);
      else map.flyTo([center.lat, center.lng], 10, { duration: 2 });
  }, [center, map, gameMode]);
  return null;
};

const ViewportCuller: React.FC<{ 
    units: GameUnit[], 
    factions: Faction[], 
    selectedUnitIds: string[],
    onUnitClick: (id: string, multiSelect: boolean) => void,
    onUnitRightClick: (id: string) => void,
    onUnitAction: (action: string, id: string) => void 
}> = ({ units, factions, selectedUnitIds, onUnitClick, onUnitRightClick, onUnitAction }) => {
    const map = useMap();
    const [bounds, setBounds] = useState(map.getBounds());

    useMapEvents({
        moveend: () => setBounds(map.getBounds()),
        zoomend: () => setBounds(map.getBounds())
    });

    const visibleUnits = useMemo(() => {
        return units.filter(u => bounds.contains([u.position.lat, u.position.lng]));
    }, [units, bounds]);

    return (
        <>
            {visibleUnits.map(unit => {
                const faction = factions.find(f => f.id === unit.factionId);
                return (
                  <UnitMarker 
                    key={unit.id} 
                    unit={unit} 
                    isSelected={selectedUnitIds.includes(unit.id)}
                    factionColor={faction?.color || '#999'}
                    factionName={faction?.name || 'Unknown'}
                    onClick={(id) => onUnitClick(id, false)} 
                    onRightClick={onUnitRightClick}
                    onAction={onUnitAction}
                  />
                )
            })}
        </>
    );
}

const CombatLayer: React.FC<{ projectiles: Projectile[], explosions: Explosion[], units: GameUnit[], factions: Faction[] }> = ({ projectiles, explosions, units, factions }) => {
  return (
    <>
      {/* PROJECTILES */}
      {projectiles.map((p) => {
        const attacker = units.find(u => u.id === p.fromId);
        const faction = factions.find(f => f.id === attacker?.factionId);
        const color = faction?.color || '#3388ff';
        const isPlayer = attacker?.factionId === 'PLAYER';
        
        // Render different visuals based on WeaponType
        const isMissile = p.weaponType === WeaponType.MISSILE;

        if (isMissile) {
             // Calculate current position based on interpolation
             const lat = p.fromPos.lat + (p.toPos.lat - p.fromPos.lat) * p.progress;
             const lng = p.fromPos.lng + (p.toPos.lng - p.fromPos.lng) * p.progress;
             
             return (
                 <Marker 
                    key={p.id}
                    position={[lat, lng]}
                    icon={L.divIcon({
                        className: 'missile-icon',
                        html: `<div style="width: 8px; height: 8px; background: white; border-radius: 50%; box-shadow: 0 0 5px ${color};"></div><div class="missile-trail" style="position:absolute; width: 40px; height: 2px; background: rgba(255,255,255,0.5); transform: rotate(${45}deg); transform-origin: left;"></div>`,
                        iconSize: [8, 8]
                    })}
                 />
             )
        } else {
             // Tracer / Laser
             return (
                <Polyline 
                    key={`${p.fromId}-${p.toId}`} 
                    positions={[[p.fromPos.lat, p.fromPos.lng], [p.toPos.lat, p.toPos.lng]]}
                    pathOptions={{ color: color, className: `tracer-beam non-interactive-layer ${isPlayer ? 'laser-player' : 'laser-enemy'}`, weight: 3, opacity: 1, dashArray: '6, 40' }}
                    interactive={false} 
                />
            );
        }
      })}

      {/* EXPLOSIONS */}
      {explosions.map(exp => (
          <Marker
            key={exp.id}
            position={[exp.position.lat, exp.position.lng]}
            icon={L.divIcon({
                className: 'explosion-icon',
                html: `<div class="explosion-visual explosion-${exp.size.toLowerCase()}" style="animation: explosion-fade 0.5s forwards;"></div>`,
                iconSize: [0, 0]
            })}
          />
      ))}
    </>
  );
}

const POIMarker: React.FC<{ poi: POI, factions: Faction[], onClick: (id: string) => void, onRightClick: (id: string) => void }> = ({ poi, factions, onClick, onRightClick }) => {
    const isCity = poi.type === POIType.CITY;
    const owner = factions.find(f => f.id === poi.ownerFactionId);
    const color = owner?.color || '#64748b';
    
    // City Health Bar
    const hpPct = Math.max(0, Math.min(100, (poi.hp / poi.maxHp) * 100));
    const hpColor = hpPct < 30 ? '#ef4444' : hpPct < 60 ? '#eab308' : '#22c55e';

    const iconHtml = isCity ? `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
            <div style="width: 32px; height: 4px; background: rgba(0,0,0,0.8); margin-bottom: 2px; border: 1px solid #000;"><div style="width: ${hpPct}%; height: 100%; background: ${hpColor};"></div></div>
            <div style="width: 24px; height: 24px; background: ${color}; border: 2px solid white; box-shadow: 0 0 10px ${color}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: white; transition: transform 0.1s;">$</div>
            <div style="background: rgba(0,0,0,0.7); color: white; padding: 2px 4px; border-radius: 4px; font-size: 10px; margin-top: 4px; white-space: nowrap; font-weight: bold;">${poi.name}</div>
        </div>
    ` : `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="width: 20px; height: 20px; background: ${color}; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; color: white;">O</div>
        </div>
    `;
    const icon = L.divIcon({ className: 'custom-poi-icon', html: iconHtml, iconSize: [40, 40], iconAnchor: [20, 20] });
    
    return <Marker 
        position={[poi.position.lat, poi.position.lng]} 
        icon={icon} 
        interactive={true} 
        eventHandlers={{
            click: (e) => {
                L.DomEvent.stopPropagation(e);
                onClick(poi.id);
            },
            contextmenu: (e) => {
                L.DomEvent.stopPropagation(e);
                e.originalEvent.preventDefault();
                onRightClick(poi.id);
            }
        }}
    />
}

const GameMap: React.FC<Props> = ({ units, factions, pois = [], projectiles, explosions, center, selectedUnitIds, onUnitClick, onUnitRightClick, onUnitAction, onMapClick, onMapRightClick, onPoiClick, onPoiRightClick, onMultiSelect, gameMode }) => {
  return (
    <div className="w-full h-screen relative z-0">
      <MapContainer 
        center={[center.lat, center.lng]} 
        zoom={3} 
        minZoom={3} 
        style={{ height: '100%', width: '100%', backgroundColor: '#000000' }} 
        zoomControl={false}
        preferCanvas={true} 
        worldCopyJump={true} 
      >
        <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={19}
            keepBuffer={4} 
            updateWhenZooming={true}
        />

        <MapController center={center} gameMode={gameMode} />
        <MapInteraction onMapClick={onMapClick} onMapRightClick={onMapRightClick} gameMode={gameMode} />
        
        <DragSelection units={units} onSelectionComplete={onMultiSelect} />
        
        {gameMode !== 'SELECT_BASE' && (
            <>
                <TerritoryLayer units={units} pois={pois} factions={factions} />
                <CombatLayer projectiles={projectiles} explosions={explosions} units={units} factions={factions} />
            </>
        )}

        {pois.map(poi => <POIMarker key={poi.id} poi={poi} factions={factions} onClick={onPoiClick} onRightClick={onPoiRightClick} />)}

        {gameMode !== 'SELECT_BASE' && (
            <ViewportCuller 
                units={units} 
                factions={factions} 
                selectedUnitIds={selectedUnitIds}
                onUnitClick={onUnitClick}
                onUnitRightClick={onUnitRightClick}
                onUnitAction={onUnitAction}
            />
        )}
      </MapContainer>
      
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[500] pointer-events-none">
         <div className="bg-black/70 backdrop-blur text-xs text-white px-4 py-2 rounded-full border border-slate-600 flex gap-4 shadow-xl">
             {gameMode === 'SELECT_BASE' ? <span>CLICK A <span className="text-yellow-400 font-bold">CITY MARKER</span> TO START</span> : <><span><span className="text-yellow-400 font-bold">L-CLICK/DRAG</span> SELECT</span><span><span className="text-blue-400 font-bold">R-CLICK MAP</span> MOVE</span><span><span className="text-red-400 font-bold">R-CLICK ENEMY</span> ATTACK</span></>}
         </div>
      </div>
    </div>
  );
};
export default GameMap;

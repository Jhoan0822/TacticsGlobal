import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, useMap, useMapEvents, Marker } from 'react-leaflet';
import L from 'leaflet';
import { GameUnit, Projectile, Faction, POI, POIType, Explosion, UnitClass, GameMode } from '../types';
import { getNearbyUnits } from '../services/gameLogic';
import TerritoryLayer from './TerritoryLayer';
import PlacementOverlay from './PlacementOverlay';
import GameCanvas from './GameCanvas';
import TerrainLayer from './TerrainLayer';
import SmoothZoom from './SmoothZoom';

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
    gameMode: GameMode;
    placementType?: UnitClass | null;
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
                const p1 = map.containerPointToLatLng(startPoint);
                const p2 = map.containerPointToLatLng(currentPoint);
                const bounds = L.latLngBounds(p1, p2);

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

const MapInteraction: React.FC<{
    onMapClick: (lat: number, lng: number) => void,
    onMapRightClick: (lat: number, lng: number) => void,
    onUnitClick: (id: string, multiSelect: boolean) => void,
    onUnitRightClick: (id: string) => void,
    onPoiClick: (id: string) => void,
    onPoiRightClick: (id: string) => void,
    units: GameUnit[],
    pois: POI[],
    selectedUnitIds: string[],
    gameMode: string
}> = ({ onMapClick, onMapRightClick, onUnitClick, onUnitRightClick, onPoiClick, onPoiRightClick, units, pois, selectedUnitIds, gameMode }) => {
    const map = useMap();

    useMapEvents({
        click(e) {
            const clickPoint = map.latLngToContainerPoint(e.latlng);
            let clickedUnitId: string | null = null;
            let clickedPoiId: string | null = null;

            // Check Units - OPTIMIZED SPATIAL LOOKUP
            const nearbyUnits = getNearbyUnits({ position: { lat: e.latlng.lat, lng: e.latlng.lng } });
            const candidates = nearbyUnits.length > 0 ? nearbyUnits : units;

            const clickedUnits: string[] = [];
            for (const unit of candidates) {
                const unitPos = map.latLngToContainerPoint([unit.position.lat, unit.position.lng]);
                const dx = unitPos.x - clickPoint.x;
                const dy = unitPos.y - clickPoint.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 24) {
                    clickedUnits.push(unit.id);
                }
            }

            if (clickedUnits.length > 0) {
                // Sort by distance
                clickedUnits.sort((a, b) => {
                    const uA = units.find(u => u.id === a)!;
                    const uB = units.find(u => u.id === b)!;
                    if (!uA || !uB) return 0;
                    const posA = map.latLngToContainerPoint([uA.position.lat, uA.position.lng]);
                    const posB = map.latLngToContainerPoint([uB.position.lat, uB.position.lng]);
                    const distA = Math.sqrt(Math.pow(posA.x - clickPoint.x, 2) + Math.pow(posA.y - clickPoint.y, 2));
                    const distB = Math.sqrt(Math.pow(posB.x - clickPoint.x, 2) + Math.pow(posB.y - clickPoint.y, 2));
                    return distA - distB;
                });

                // Cycle Logic
                const currentlySelectedInStack = clickedUnits.find(id => selectedUnitIds.includes(id));

                if (currentlySelectedInStack) {
                    const currentIndex = clickedUnits.indexOf(currentlySelectedInStack);
                    const nextIndex = (currentIndex + 1) % clickedUnits.length;
                    clickedUnitId = clickedUnits[nextIndex];
                } else {
                    clickedUnitId = clickedUnits[0];
                }

                clickedPoiId = null;
            }

            // Check POIs (if no unit clicked)
            if (!clickedUnitId) {
                let minDist = Infinity;
                for (const poi of pois) {
                    const poiPos = map.latLngToContainerPoint([poi.position.lat, poi.position.lng]);
                    const dx = poiPos.x - clickPoint.x;
                    const dy = poiPos.y - clickPoint.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 30) {
                        if (dist < minDist) {
                            minDist = dist;
                            clickedPoiId = poi.id;
                        }
                    }
                }
            }

            if (clickedUnitId) {
                if (gameMode === 'PLAYING') {
                    onUnitClick(clickedUnitId, e.originalEvent.shiftKey);
                }
            } else if (clickedPoiId) {
                onPoiClick(clickedPoiId);
            } else {
                if (!e.originalEvent.shiftKey) onMapClick(e.latlng.lat, e.latlng.lng);
            }
        },
        contextmenu(e) {
            const clickPoint = map.latLngToContainerPoint(e.latlng);
            let clickedUnitId: string | null = null;
            let clickedPoiId: string | null = null;
            let minDist = Infinity;

            const nearbyUnits = getNearbyUnits({ position: { lat: e.latlng.lat, lng: e.latlng.lng } });
            const candidates = nearbyUnits.length > 0 ? nearbyUnits : units;

            // Check Units
            for (const unit of candidates) {
                const unitPos = map.latLngToContainerPoint([unit.position.lat, unit.position.lng]);
                const dx = unitPos.x - clickPoint.x;
                const dy = unitPos.y - clickPoint.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 24) {
                    if (dist < minDist) {
                        minDist = dist;
                        clickedUnitId = unit.id;
                        clickedPoiId = null;
                    }
                }
            }

            // Check POIs
            if (!clickedUnitId) {
                for (const poi of pois) {
                    const poiPos = map.latLngToContainerPoint([poi.position.lat, poi.position.lng]);
                    const dx = poiPos.x - clickPoint.x;
                    const dy = poiPos.y - clickPoint.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 30) {
                        if (dist < minDist) {
                            minDist = dist;
                            clickedPoiId = poi.id;
                        }
                    }
                }
            }

            if (clickedUnitId) {
                onUnitRightClick(clickedUnitId);
            } else if (clickedPoiId) {
                onPoiRightClick(clickedPoiId);
            } else {
                onMapRightClick(e.latlng.lat, e.latlng.lng);
            }
        }
    });

    useEffect(() => {
        const container = document.querySelector('.leaflet-container') as HTMLElement;
        if (container) {
            if (gameMode === 'SELECTION') container.style.cursor = 'crosshair';
            else if (gameMode === 'PLACING_STRUCTURE') container.style.cursor = 'copy';
            else container.style.cursor = 'default';
        }
    }, [gameMode]);
    return null;
};

const MapController: React.FC<{ center: { lat: number; lng: number }, gameMode: string }> = ({ center, gameMode }) => {
    const map = useMap();
    useEffect(() => {
        // ONLY zoom/pan if we are in the initial selection mode.
        // Otherwise, let the user control the camera.
        if (gameMode === 'SELECTION') {
            map.setView([center.lat, center.lng], 3);
        }
        // REMOVED: map.flyTo(...) for other modes to prevent annoying auto-zoom
    }, [center, map, gameMode]);
    return null;
};

const GameMap: React.FC<Props> = ({ units, factions, pois = [], projectiles, explosions, center, selectedUnitIds, onUnitClick, onUnitRightClick, onUnitAction, onMapClick, onMapRightClick, onPoiClick, onPoiRightClick, onMultiSelect, gameMode, placementType }) => {
    return (
        <div className="w-full h-screen relative z-0">
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={3}
                minZoom={3}
                maxZoom={8}
                style={{ height: '100%', width: '100%', backgroundColor: '#000000' }}
                zoomControl={false}
                preferCanvas={true}
                worldCopyJump={true}
                zoomSnap={0} // Allow fractional zoom
                zoomDelta={0.1} // Smaller steps for buttons (if any)
                wheelPxPerZoomLevel={120} // Standard sensitivity
            >
                <SmoothZoom />
                <MapController center={center} gameMode={gameMode} />

                {/* LAYER 1: STATIC TERRAIN (Z: 200) */}
                <TerrainLayer />
                {/* LAYER 3: UNITS & POIS (Z: 600) */}
                <GameCanvas
                    units={units}
                    factions={factions}
                    selectedUnitIds={selectedUnitIds}
                    projectiles={projectiles}
                    explosions={explosions}
                    pois={pois}
                />

                <MapInteraction
                    onMapClick={onMapClick}
                    onMapRightClick={onMapRightClick}
                    onUnitClick={onUnitClick}
                    onUnitRightClick={onUnitRightClick}
                    onPoiClick={onPoiClick}
                    onPoiRightClick={onPoiRightClick}
                    units={units}
                    pois={pois}
                    selectedUnitIds={selectedUnitIds}
                    gameMode={gameMode}
                />

                <DragSelection units={units} onSelectionComplete={onMultiSelect} />

                {gameMode !== 'SELECTION' && (
                    <>
                        {/* LAYER 2: TERRITORY (Z: 400) - Rendered via SVGOverlay inside TerritoryLayer */}
                        <TerritoryLayer units={units} pois={pois} factions={factions} />
                        <PlacementOverlay gameMode={gameMode} placementType={placementType || null} />
                    </>
                )}

            </MapContainer>

            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[500] pointer-events-none">
                <div className="bg-black/70 backdrop-blur text-xs text-white px-4 py-2 rounded-full border border-slate-600 flex gap-4 shadow-xl">
                    {gameMode === 'SELECTION' ? <span>CLICK A <span className="text-yellow-400 font-bold">CITY MARKER</span> TO START</span> :
                        gameMode === 'COUNTDOWN' ? <span className="text-yellow-400 font-bold animate-pulse">PREPARING WARZONE...</span> :
                            <><span><span className="text-yellow-400 font-bold">L-CLICK/DRAG</span> SELECT</span><span><span className="text-blue-400 font-bold">R-CLICK MAP</span> MOVE</span><span><span className="text-red-400 font-bold">R-CLICK ENEMY</span> ATTACK</span></>}
                </div>
            </div>

            {/* START COUNTDOWN OVERLAY */}
            {gameMode === 'COUNTDOWN' && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] pointer-events-none">
                    <div className="bg-black/80 backdrop-blur-md text-white px-8 py-6 rounded-xl border border-yellow-500 shadow-2xl flex flex-col items-center gap-4">
                        <h2 className="text-2xl font-bold text-yellow-400 tracking-widest">PREPARING WARZONE</h2>
                        <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-500 animate-[pulse_2s_infinite]"></div>
                        </div>
                        <p className="text-sm text-slate-300">WAITING FOR ALL COMMANDERS TO DEPLOY...</p>
                    </div>
                </div>
            )}
        </div>
    );
};
export default GameMap;

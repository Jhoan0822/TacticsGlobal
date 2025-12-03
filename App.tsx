import React, { useRef, useState, useEffect } from 'react';
import GameMap from './components/GameMap';
import Sidebar from './components/Sidebar';
import EventLog from './components/EventLog';
import MainMenu from './components/MainMenu';
import { useGameLoop } from './hooks/useGameLoop';
import { TerrainService } from './services/terrainService';
import { AudioService } from './services/audioService';
import { NetworkService } from './services/networkService';
import { spawnUnit } from './services/gameLogic'; // Import spawnUnit
import { Scenario, Faction, LobbyState, Difficulty, UnitClass, POIType } from './types';
import { SCENARIOS, UNIT_CONFIG } from './constants';

const App: React.FC = () => {
    const [isInMenu, setIsInMenu] = useState(true);
    const [lobbyState, setLobbyState] = useState<LobbyState>({
        players: [],
        scenarioId: 'WORLD',
        difficulty: Difficulty.MEDIUM,
        botCount: 3
    });
    const [networkMode, setNetworkMode] = useState<'SINGLE' | 'MULTI_HOST' | 'MULTI_JOIN' | 'LOBBY' | null>(null);

    const {
        gameState,
        setGameState,
        center,
        setCenter,
        selectedUnitIds,
        setSelectedUnitIds,
        handleUnitAction: originalHandleUnitAction,
        handleBuyUnit: originalHandleBuyUnit,
        handleAllianceRequest,
        handlePoiClick,
        handleMapClick,
        setDifficulty,
        startGame
    } = useGameLoop();

    // --- REMOTE ACTION HANDLER (HOST) ---
    const handleRemoteAction = (action: any) => {
        console.log('[HOST] Received Action:', action);
        setGameState(prev => {
            // 1. MOVE UNIT
            if (action.type === 'MOVE_UNIT') {
                return {
                    ...prev,
                    units: prev.units.map(u => {
                        if (action.unitIds.includes(u.id) && u.factionId === action.playerId) {
                            // Validate Move (Optional, but good for security)
                            if (!TerrainService.isValidMove(u.unitClass, action.destination.lat, action.destination.lng, prev.pois)) {
                                console.warn('[HOST] Invalid Move Rejected');
                                return u;
                            }
                            return {
                                ...u,
                                destination: action.destination,
                                targetId: null,
                                isBoosting: action.isBoosting
                            };
                        }
                        return u;
                    })
                };
            }
            // 2. TARGET UNIT
            if (action.type === 'TARGET_UNIT') {
                return {
                    ...prev,
                    units: prev.units.map(u => {
                        if (action.unitIds.includes(u.id) && u.factionId === action.playerId) {
                            return { ...u, targetId: action.targetId, destination: null };
                        }
                        return u;
                    })
                };
            }
            // 3. TARGET POI
            if (action.type === 'TARGET_POI') {
                return {
                    ...prev,
                    units: prev.units.map(u => {
                        if (action.unitIds.includes(u.id) && u.factionId === action.playerId) {
                            return { ...u, targetId: action.targetId, destination: null };
                        }
                        return u;
                    })
                };
            }
            // 4. BUY UNIT
            if (action.type === 'BUY_UNIT') {
                const type = action.unitType as UnitClass;
                const cost = UNIT_CONFIG[type].cost;
                if (!cost) return prev;

                // Check Resources (We need to find the player's resources if we track them separately, 
                // but currently GameState only has 'playerResources' for the LOCAL player.
                // Multi-faction resource tracking is needed for full multiplayer.
                // FOR NOW: We assume 'playerResources' is for the HOST. 
                // Clients need their own resources tracked in 'factions' or a separate map.
                // The current GameState structure might be limited for Multiplayer Resources.
                // However, let's assume we just spawn it for now to get interaction working.
                // TODO: Refactor GameState to track resources per Faction.

                // Quick Fix: Just spawn it without cost check for remote players for now, 
                // OR check if we can find the faction.

                // Spawn Logic (Simplified from useGameLoop)
                let spawnLat: number | null = null;
                let spawnLng: number | null = null;

                // Find spawn site for this player
                const seaUnits = [UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.SUBMARINE, UnitClass.AIRCRAFT_CARRIER, UnitClass.BATTLESHIP, UnitClass.PATROL_BOAT, UnitClass.MINELAYER];
                const isSea = seaUnits.includes(type);

                if (isSea) {
                    const validCities = prev.pois.filter(p => p.ownerFactionId === action.playerId && p.type === POIType.CITY && p.isCoastal);
                    const validPorts = prev.units.filter(u => u.factionId === action.playerId && u.unitClass === UnitClass.PORT);
                    const allSites = [...validCities, ...validPorts];
                    if (allSites.length > 0) {
                        const site = allSites[Math.floor(Math.random() * allSites.length)];
                        spawnLat = site.position.lat; spawnLng = site.position.lng;
                    }
                } else {
                    const validSites = [
                        ...prev.pois.filter(p => p.ownerFactionId === action.playerId && p.type === POIType.CITY),
                        ...prev.units.filter(u => u.factionId === action.playerId && (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MILITARY_BASE || u.unitClass === UnitClass.AIRBASE))
                    ];
                    if (validSites.length > 0) {
                        const site = validSites[Math.floor(Math.random() * validSites.length)];
                        spawnLat = site.position.lat; spawnLng = site.position.lng;
                    }
                }

                if (spawnLat !== null && spawnLng !== null) {
                    const newUnit = spawnUnit(type, spawnLat + (Math.random() - 0.5) * 0.05, spawnLng + (Math.random() - 0.5) * 0.05);
                    newUnit.factionId = action.playerId; // Ensure correct owner
                    return {
                        ...prev,
                        units: [...prev.units, newUnit]
                    };
                }
                return prev;
            }

            return prev;
        });
    };

    // --- NETWORK INITIALIZATION ---
    useEffect(() => {
        if (networkMode === 'MULTI_HOST' || networkMode === 'MULTI_JOIN') {
            NetworkService.initialize((id) => {
                // Peer ID ready
            });

            const handleNetworkEvent = (e: any) => {
                if (e.type === 'CONNECT') {
                    if (networkMode === 'MULTI_HOST') {
                        // Add Client to Lobby
                        setLobbyState(prev => {
                            if (prev.players.find(p => p.id === e.peerId)) return prev;
                            const newState = {
                                ...prev,
                                players: [
                                    ...prev.players,
                                    { id: e.peerId, name: `Player ${prev.players.length + 1}`, factionIndex: 1, isHost: false, isReady: false }
                                ]
                            };
                            NetworkService.sendLobbyUpdate(newState);
                            return newState;
                        });
                    }
                } else if (e.type === 'LOBBY_UPDATE') {
                    setLobbyState(e.state);
                } else if (e.type === 'START_GAME') {
                    // Client Start
                    const scenario = Object.values(SCENARIOS).find(s => s.id === e.scenarioId) || SCENARIOS.WORLD;
                    // Use MY Peer ID as localPlayerId
                    startGame(scenario, NetworkService.myPeerId, e.factions, true);
                    setIsInMenu(false);
                } else if (e.type === 'ACTION') {
                    // Host receives Action
                    handleRemoteAction(e.action);
                }
            };

            const unsub = NetworkService.subscribe(handleNetworkEvent);
            return () => {
                unsub();
            };
        }
    }, [networkMode]);

    // Host Logic: Send Updates when Lobby State changes
    useEffect(() => {
        if (networkMode === 'MULTI_HOST' || networkMode === 'LOBBY') {
            if (lobbyState.players.find(p => p.id === NetworkService.myPeerId)?.isHost) {
                NetworkService.sendLobbyUpdate(lobbyState);
            }
        }
    }, [lobbyState, networkMode]);

    const handleStartGame = (scenario: Scenario, localPlayerId: string, factions: Faction[], isMultiplayer: boolean, isHost: boolean) => {
        startGame(scenario, localPlayerId, factions, isMultiplayer && !isHost);
        setIsInMenu(false);
    };

    const lastRightClick = useRef<number>(0);

    // --- UI HANDLERS (WRAPPERS) ---

    const handleUnitClick = (id: string, multiSelect: boolean) => {
        if (gameState.gameMode === 'PLAYING') {
            if (multiSelect) {
                setSelectedUnitIds(prev => prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]);
            } else {
                setSelectedUnitIds([id]);
            }
            AudioService.playUiClick();
        }
    };

    const handleUnitRightClick = (id: string) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            const targetUnit = gameState.units.find(u => u.id === id);
            if (targetUnit && targetUnit.factionId !== gameState.localPlayerId) {
                // OPTIMISTIC UPDATE + NETWORK ACTION
                if (gameState.isClient) {
                    console.log('[CLIENT] Sending TARGET_UNIT Action', { unitIds: selectedUnitIds, targetId: id });
                    NetworkService.sendAction({
                        type: 'TARGET_UNIT',
                        unitIds: selectedUnitIds,
                        targetId: id,
                        playerId: gameState.localPlayerId
                    });
                    // Optimistic Local Update
                    setGameState(prev => ({
                        ...prev,
                        units: prev.units.map(u => {
                            if (selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
                                return { ...u, targetId: id, destination: null };
                            }
                            return u;
                        })
                    }));
                } else {
                    setGameState(prev => ({
                        ...prev,
                        units: prev.units.map(u => {
                            if (selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
                                return { ...u, targetId: id, destination: null };
                            }
                            return u;
                        })
                    }));
                }
                AudioService.playSuccess();
            }
        }
    };

    const handlePoiRightClick = (id: string) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            const targetPoi = gameState.pois.find(p => p.id === id);
            if (targetPoi && targetPoi.ownerFactionId !== gameState.localPlayerId) {
                // OPTIMISTIC UPDATE + NETWORK ACTION
                if (gameState.isClient) {
                    console.log('[CLIENT] Sending TARGET_POI Action', { unitIds: selectedUnitIds, targetId: id });
                    NetworkService.sendAction({
                        type: 'TARGET_POI',
                        unitIds: selectedUnitIds,
                        targetId: id,
                        playerId: gameState.localPlayerId
                    });
                    // Optimistic Local Update
                    setGameState(prev => ({
                        ...prev,
                        units: prev.units.map(u => {
                            if (selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
                                return { ...u, targetId: id, destination: null };
                            }
                            return u;
                        })
                    }));
                } else {
                    setGameState(prev => ({
                        ...prev,
                        units: prev.units.map(u => {
                            if (selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
                                return { ...u, targetId: id, destination: null };
                            }
                            return u;
                        })
                    }));
                }
                AudioService.playSuccess();
            }
        }
    };

    const handleMapRightClick = (lat: number, lng: number) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {

            const now = Date.now();
            const timeDiff = now - lastRightClick.current;
            lastRightClick.current = now;
            const isDouble = timeDiff < 250;

            // OPTIMISTIC UPDATE + NETWORK ACTION
            if (gameState.isClient) {
                console.log('[CLIENT] Sending MOVE_UNIT Action', { unitIds: selectedUnitIds, lat, lng });
                NetworkService.sendAction({
                    type: 'MOVE_UNIT',
                    unitIds: selectedUnitIds,
                    destination: { lat, lng },
                    isBoosting: isDouble,
                    playerId: gameState.localPlayerId
                });
                // Optimistic Local Update
                setGameState(prev => ({
                    ...prev,
                    units: prev.units.map(u => {
                        if (selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
                            if (!TerrainService.isValidMove(u.unitClass, lat, lng, gameState.pois)) {
                                return u;
                            }
                            return {
                                ...u,
                                destination: { lat, lng },
                                targetId: null,
                                isBoosting: isDouble
                            };
                        }
                        return u;
                    })
                }));
            } else {
                setGameState(prev => ({
                    ...prev,
                    units: prev.units.map(u => {
                        if (selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
                            if (!TerrainService.isValidMove(u.unitClass, lat, lng, gameState.pois)) {
                                return u;
                            }
                            return {
                                ...u,
                                destination: { lat, lng },
                                targetId: null,
                                isBoosting: isDouble
                            };
                        }
                        return u;
                    })
                }));
            }
            AudioService.playUiClick();

        } else if (gameState.gameMode === 'PLACING_STRUCTURE') {
            // Structure Placement for Client is tricky. 
            // Client enters PLACING_STRUCTURE mode locally.
            // Then clicks map -> sends BUY_UNIT action with location?
            // Or sends PLACE_STRUCTURE action.
            // For now, let's stick to basic movement/combat.
            // Structure placement needs more work for Client.
            setGameState(prev => ({ ...prev, gameMode: 'PLAYING', placementType: null }));
        }
    };

    const handleMultiSelect = (ids: string[]) => {
        setSelectedUnitIds(ids);
        if (ids.length > 0) AudioService.playUiClick();
    };

    // Wrapper for Buy Unit
    const handleBuyUnit = (type: UnitClass) => {
        if (gameState.isClient) {
            console.log('[CLIENT] Sending BUY_UNIT Action', { type });
            NetworkService.sendAction({
                type: 'BUY_UNIT',
                unitType: type,
                playerId: gameState.localPlayerId
            });
            AudioService.playUiClick(); // Feedback
        } else {
            originalHandleBuyUnit(type);
        }
    };

    if (isInMenu) {
        return (
            <MainMenu
                onStartGame={handleStartGame}
                lobbyState={lobbyState}
                setLobbyState={setLobbyState}
                networkMode={networkMode}
                setNetworkMode={setNetworkMode}
            />
        );
    }

    return (
        <div className="w-full h-screen relative bg-slate-900 overflow-hidden flex">
            <Sidebar
                gameState={gameState}
                onBuyUnit={handleBuyUnit}
                onAllianceRequest={handleAllianceRequest}
                selectedUnitIds={selectedUnitIds}
                onUnitAction={originalHandleUnitAction} // TODO: Wrap this too if needed
                onSetDifficulty={setDifficulty}
            />
            <div className="flex-1 relative">
                <GameMap
                    units={gameState.units} factions={gameState.factions} pois={gameState.pois} projectiles={gameState.projectiles} explosions={gameState.explosions}
                    center={center} selectedUnitIds={selectedUnitIds}
                    onUnitClick={handleUnitClick} onUnitRightClick={handleUnitRightClick} onUnitAction={originalHandleUnitAction}
                    onMapClick={handleMapClick} onMapRightClick={handleMapRightClick} onPoiClick={handlePoiClick} onPoiRightClick={handlePoiRightClick}
                    onMultiSelect={handleMultiSelect}
                    gameMode={gameState.gameMode}
                    placementType={gameState.placementType}
                />
                <EventLog messages={gameState.messages} />
                <div className="absolute inset-0 pointer-events-none z-[400] hex-overlay"></div>
            </div>
        </div>
    );
};

export default App;

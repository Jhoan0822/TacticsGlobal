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
import { TooltipProvider } from './components/Tooltip';


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
        handleTargetCommand,
        setDifficulty,
        startGame
    } = useGameLoop();

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
                            // Check if player exists
                            const existing = prev.players.find(p => p.id === e.peerId);
                            if (existing) {
                                // Force reference change to trigger useEffect broadcast
                                return { ...prev };
                            }
                            // Add new player
                            return {
                                ...prev,
                                players: [
                                    ...prev.players,
                                    { id: e.peerId, name: `Player ${prev.players.length + 1}`, factionIndex: 1, isHost: false, isReady: false }
                                ]
                            };
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
                }
                // Note: Game events (TURN, INTENT) are handled by useGameLoop subscription
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
            handleTargetCommand(id, false);
        }
    };

    const handlePoiRightClick = (id: string) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            handleTargetCommand(id, true);
        }
    };

    const handleMapRightClick = (lat: number, lng: number) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            // Move Command
            handleMapClick(lat, lng);
        } else if (gameState.gameMode === 'PLACING_STRUCTURE') {
            // Cancel placement? Or just ignore right click
            setGameState(prev => ({ ...prev, gameMode: 'PLAYING', placementType: null }));
        }
    };

    const handleMultiSelect = (ids: string[]) => {
        setSelectedUnitIds(ids);
        if (ids.length > 0) AudioService.playUiClick();
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
        <TooltipProvider>
            <div className="w-full h-screen relative bg-slate-900 overflow-hidden flex">
                <Sidebar
                    gameState={gameState}
                    onBuyUnit={originalHandleBuyUnit}
                    onAllianceRequest={handleAllianceRequest}
                    selectedUnitIds={selectedUnitIds}
                    onUnitAction={originalHandleUnitAction}
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
                        bounds={gameState.bounds}
                    />
                    <EventLog messages={gameState.messages} />
                    <div className="absolute inset-0 pointer-events-none z-[400] hex-overlay"></div>
                </div>
            </div>
        </TooltipProvider>
    );
};

export default App;

import React, { useRef, useState, useEffect, useCallback } from 'react';
import GameMap from './components/GameMap';
import Sidebar from './components/Sidebar';
import EventLog from './components/EventLog';
import MainMenu from './components/MainMenu';
import VictoryScreen from './components/VictoryScreen';
import AudioSettings from './components/AudioSettings';
import { useGameLoop } from './hooks/useGameLoop';
import { useHotkeys } from './hooks/useHotkeys';
import { TerrainService } from './services/terrainService';
import { AudioService } from './services/audioService';
import { NetworkService } from './services/networkService';
import { spawnUnit } from './services/gameLogic'; // Import spawnUnit
import { Scenario, Faction, LobbyState, Difficulty, UnitClass, POIType } from './types';
import { SCENARIOS, UNIT_CONFIG } from './constants';
import { TooltipProvider } from './components/Tooltip';
import { FormationType, calculateFormationPositions, getGroupCenter, getFacingAngle } from './services/formationService';


const App: React.FC = () => {
    const [isInMenu, setIsInMenu] = useState(true);
    const [showAudioSettings, setShowAudioSettings] = useState(false);
    const [lobbyState, setLobbyState] = useState<LobbyState>({
        players: [],
        scenarioId: 'WORLD',
        difficulty: Difficulty.MEDIUM,
        botCount: 3,
        gameMode: 'DOMINATION'
    });
    const [networkMode, setNetworkMode] = useState<'SINGLE' | 'MULTI_HOST' | 'MULTI_JOIN' | 'LOBBY' | 'BATTLE_ROYALE' | null>(null);

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
        handleMapRightClick,
        handleTargetCommand,
        handleAssignGroup,
        handleRecallGroup,
        handleAddToGroup,
        handleRemoveFromGroup,
        handleGroupOrder,
        setDifficulty,
        startGame,
        joinBattleRoyale,
        nukeLaunchMode,
        setNukeLaunchMode
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
                    startGame(scenario, NetworkService.myPeerId, e.factions, true, e.pois);
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

    // --- VICTORY/DEFEAT AUDIO ---
    const prevGameResult = useRef<string | null>(null);
    useEffect(() => {
        if (gameState.gameResult && gameState.gameResult !== prevGameResult.current) {
            if (gameState.gameResult === 'VICTORY') {
                AudioService.stopBackgroundMusic();
                setTimeout(() => AudioService.playVictory(), 300);
            } else if (gameState.gameResult === 'DEFEAT') {
                AudioService.stopBackgroundMusic();
                setTimeout(() => AudioService.playDefeat(), 300);
            }
            prevGameResult.current = gameState.gameResult;
        }
    }, [gameState.gameResult]);

    const handleStartGame = (scenario: Scenario, localPlayerId: string, factions: Faction[], isMultiplayer: boolean, isHost: boolean) => {
        // Host generates POIs here or inside startGame?
        // startGame handles it. But for multiplayer host, we need to generate them and send them.
        // Let's let startGame generate them if not provided, then we grab them from gameState?
        // No, startGame is void.
        // We need to generate POIs *before* calling startGame if we are Host, so we can send them.
        // OR, startGame returns the initial state? No.

        // Better: Let startGame generate them if null.
        // But for Host, we need to send them.
        // Let's modify startGame to RETURN the initial state or POIs?
        // Or just access gameState after? No, setState is async.

        // Solution: Generate POIs here if Host, then pass to startGame AND NetworkService.
        let initialPois = null;
        if (isHost) {
            // We need to import getMockCities or similar?
            // It's not exported from useGameLoop.
            // Let's rely on useGameLoop to generate them if we pass null, 
            // BUT we need to send them.
            // Actually, let's just update useGameLoop to broadcast the start game WITH the POIs it generated.
            startGame(scenario, localPlayerId, factions, isMultiplayer && !isHost);
        } else {
            startGame(scenario, localPlayerId, factions, isMultiplayer && !isHost);
        }
        setIsInMenu(false);
    };

    // Battle Royale Direct Join - injects existing game state in PLAYING mode
    const handleJoinBattleRoyale = (existingGameState: any) => {
        console.log('[APP] Joining Battle Royale with existing state');
        joinBattleRoyale(existingGameState);
        setIsInMenu(false);
    };

    const lastRightClick = useRef<number>(0);

    // --- UI HANDLERS (WRAPPERS) ---

    const handleUnitClick = (id: string, multiSelect: boolean) => {
        if (gameState.gameMode === 'PLAYING') {
            const unit = gameState.units.find(u => u.id === id);

            // Don't select non-actionable structures (they serve only as spawn points)
            const nonSelectableTypes = [UnitClass.AIRBASE];
            if (unit && nonSelectableTypes.includes(unit.unitClass)) {
                return; // Silently ignore clicks on these
            }

            if (multiSelect) {
                setSelectedUnitIds(prev => prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]);
            } else {
                setSelectedUnitIds([id]);
            }
            AudioService.playUnitSelect();
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

    // NOTE: handleMapRightClick is now provided by useGameLoop with terrain-aware logic


    const handleMultiSelect = (ids: string[]) => {
        // Filter out non-actionable structures from multi-select
        const nonSelectableTypes = [UnitClass.AIRBASE];
        const filteredIds = ids.filter(id => {
            const unit = gameState.units.find(u => u.id === id);
            return !unit || !nonSelectableTypes.includes(unit.unitClass);
        });
        setSelectedUnitIds(filteredIds);
        if (filteredIds.length > 0) AudioService.playUnitSelect();
    };

    // Keyboard Shortcuts
    const handleSelectAll = useCallback(() => {
        const myUnits = gameState.units.filter(u => u.factionId === gameState.localPlayerId);
        setSelectedUnitIds(myUnits.map(u => u.id));
    }, [gameState.units, gameState.localPlayerId]);

    const handleDeselectAll = useCallback(() => {
        setSelectedUnitIds([]);
    }, []);

    // Auto-Control: Toggle auto-target for selected units
    const handleToggleAutoTarget = useCallback(() => {
        if (selectedUnitIds.length === 0) return;
        setGameState(prev => ({
            ...prev,
            units: prev.units.map(u =>
                selectedUnitIds.includes(u.id) && u.factionId === prev.localPlayerId
                    ? { ...u, autoTarget: !u.autoTarget }
                    : u
            )
        }));
    }, [selectedUnitIds, setGameState]);

    // Auto-Control: Cycle through auto-modes
    const handleCycleAutoMode = useCallback(() => {
        if (selectedUnitIds.length === 0) return;
        const modes: Array<'NONE' | 'DEFEND' | 'ATTACK' | 'PATROL'> = ['NONE', 'DEFEND', 'ATTACK', 'PATROL'];
        setGameState(prev => ({
            ...prev,
            units: prev.units.map(u => {
                if (selectedUnitIds.includes(u.id) && u.factionId === prev.localPlayerId) {
                    const currentMode = u.autoMode || 'NONE';
                    const nextIdx = (modes.indexOf(currentMode) + 1) % modes.length;
                    const newMode = modes[nextIdx];
                    return {
                        ...u,
                        autoMode: newMode,
                        homePosition: newMode !== 'NONE' ? { ...u.position } : undefined,
                        targetId: null,
                        destination: null
                    };
                }
                return u;
            })
        }));
    }, [selectedUnitIds, setGameState]);

    useHotkeys({
        onBuyUnit: originalHandleBuyUnit,
        onSelectAll: handleSelectAll,
        onDeselectAll: handleDeselectAll,
        onToggleAutoTarget: handleToggleAutoTarget,
        onCycleAutoMode: handleCycleAutoMode,
        // Control group management
        onAssignGroup: handleAssignGroup,
        onRecallGroup: handleRecallGroup,
        onAddToGroup: handleAddToGroup,
        onRemoveFromGroup: handleRemoveFromGroup,
        enabled: !isInMenu && gameState.gameMode === 'PLAYING'
    });

    if (isInMenu) {
        return (
            <MainMenu
                onStartGame={handleStartGame}
                onJoinBattleRoyale={handleJoinBattleRoyale}
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
                    onSetAutoMode={(mode) => {
                        if (selectedUnitIds.length === 0) return;
                        setGameState(prev => ({
                            ...prev,
                            units: prev.units.map(u => {
                                if (selectedUnitIds.includes(u.id) && u.factionId === prev.localPlayerId) {
                                    return {
                                        ...u,
                                        autoMode: mode,
                                        homePosition: mode !== 'NONE' ? { ...u.position } : undefined,
                                        targetId: null,
                                        destination: null
                                    };
                                }
                                return u;
                            })
                        }));
                    }}
                    onToggleAutoTarget={handleToggleAutoTarget}
                    onSetFormation={(formation) => {
                        console.log('[FORMATION] Button clicked:', formation);

                        if (selectedUnitIds.length < 2) return;

                        const selectedUnits = gameState.units.filter(u =>
                            selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId
                        );

                        if (selectedUnits.length < 2) return;

                        // Get current center of the group
                        const groupCenter = getGroupCenter(selectedUnits);

                        // Calculate formation positions (facing north by default)
                        const positions = calculateFormationPositions(
                            selectedUnits,
                            formation,
                            groupCenter.lat,
                            groupCenter.lng,
                            0 // Face north
                        );

                        console.log('[FORMATION] Setting formation with offsets');

                        // Apply formation positions AND save offsets for future moves
                        setGameState(prev => ({
                            ...prev,
                            units: prev.units.map(u => {
                                const pos = positions.find(p => p.unitId === u.id);
                                if (pos) {
                                    // Calculate offset from group center
                                    const offset = {
                                        lat: pos.lat - groupCenter.lat,
                                        lng: pos.lng - groupCenter.lng
                                    };
                                    return {
                                        ...u,
                                        destination: { lat: pos.lat, lng: pos.lng },
                                        targetId: null,
                                        formationOffset: offset // Save offset for future moves
                                    };
                                }
                                return u;
                            })
                        }));

                        AudioService.playUnitSelect();
                    }}
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
                        localPlayerId={gameState.localPlayerId}
                        nukesInFlight={gameState.nukesInFlight}
                    />
                    <EventLog messages={gameState.messages} />
                    <div className="absolute inset-0 pointer-events-none z-[400] hex-overlay"></div>

                    {/* NUCLEAR TARGETING OVERLAY */}
                    {nukeLaunchMode && (
                        <div className="absolute inset-0 z-[450] pointer-events-none">
                            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-900/90 backdrop-blur-sm px-8 py-4 rounded-xl border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse">
                                <div className="flex items-center gap-3">
                                    <span className="text-3xl">☢️</span>
                                    <div>
                                        <p className="text-red-400 font-bold text-lg">NUCLEAR TARGETING MODE</p>
                                        <p className="text-red-200 text-sm">Click on map to select target location</p>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute inset-0 border-4 border-red-500/30 pointer-events-none"></div>
                        </div>
                    )}

                    {/* Settings Button - Gear Icon */}
                    <button
                        onClick={() => setShowAudioSettings(true)}
                        className="absolute top-4 right-4 z-[500] w-10 h-10 bg-slate-800/80 hover:bg-slate-700 
                                   rounded-full flex items-center justify-center transition-all 
                                   border border-slate-600 hover:border-slate-500 shadow-lg"
                        title="Audio Settings"
                    >
                        <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>

                {/* Audio Settings Modal */}
                <AudioSettings isOpen={showAudioSettings} onClose={() => setShowAudioSettings(false)} />

                {/* Victory/Defeat Screen */}
                {gameState.gameResult && (
                    <VictoryScreen
                        isVictory={gameState.gameResult === 'VICTORY'}
                        stats={{
                            unitsKilled: gameState.gameStats?.unitsKilled || 0,
                            unitsLost: gameState.gameStats?.unitsLost || 0,
                            citiesCaptured: gameState.gameStats?.citiesCaptured || 0,
                            goldEarned: gameState.gameStats?.goldEarned || 0,
                            timePlayed: Math.floor((Date.now() - (gameState.gameStats?.startTime || Date.now())) / 1000)
                        }}
                        onPlayAgain={() => {
                            setIsInMenu(true);
                        }}
                        onMainMenu={() => {
                            setIsInMenu(true);
                        }}
                    />
                )}
            </div>
        </TooltipProvider>
    );
};

export default App;

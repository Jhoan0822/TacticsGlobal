
import React, { useRef, useState } from 'react';
import GameMap from './components/GameMap';
import Sidebar from './components/Sidebar';
import EventLog from './components/EventLog';
import MainMenu from './components/MainMenu';
import { useGameLoop } from './hooks/useGameLoop';
import { TerrainService } from './services/terrainService';
import { AudioService } from './services/audioService';
import { Scenario, Faction } from './types';

const App: React.FC = () => {
    const [isInMenu, setIsInMenu] = useState(true);

    const {
        gameState,
        setGameState,
        center,
        setCenter,
        selectedUnitIds,
        setSelectedUnitIds,
        handleUnitAction,
        handleBuyUnit,
        handleAllianceRequest,
        handlePoiClick,
        handleMapClick,
        setDifficulty,
        startGame
    } = useGameLoop();

    const handleStartGame = (scenario: Scenario, localPlayerId: string, factions: Faction[], isMultiplayer: boolean, isHost: boolean) => {
        // If Client, we wait for state, but we need to initialize the view.
        // startGame handles initialization.
        startGame(scenario, localPlayerId, factions, isMultiplayer && !isHost);
        setIsInMenu(false);
    };

    const lastRightClick = useRef<number>(0);

    // --- UI HANDLERS (That depend on local state or refs not in hook) ---

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
            // Allow targeting any non-owned unit (Hostile or not, rules handled in logic)
            if (targetUnit && targetUnit.factionId !== gameState.localPlayerId) {
                // Send Action if Client?
                // For now, we update local state and let the loop/network handle it.
                // If Client, we need to send ACTION.
                // But handleUnitRightClick updates local state directly via setGameState.
                // We need to intercept this for Multiplayer Client.

                // TODO: Implement Action Sending for Client

                setGameState(prev => ({
                    ...prev,
                    units: prev.units.map(u => {
                        if (selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
                            return { ...u, targetId: id, destination: null };
                        }
                        return u;
                    })
                }));
                AudioService.playSuccess();
            }
        }
    };

    const handlePoiRightClick = (id: string) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            const targetPoi = gameState.pois.find(p => p.id === id);
            if (targetPoi && targetPoi.ownerFactionId !== gameState.localPlayerId) {
                setGameState(prev => ({
                    ...prev,
                    units: prev.units.map(u => {
                        if (selectedUnitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
                            return { ...u, targetId: id, destination: null };
                        }
                        return u;
                    })
                }));
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
            AudioService.playUiClick();

        } else if (gameState.gameMode === 'PLACING_STRUCTURE') {
            setGameState(prev => ({ ...prev, gameMode: 'PLAYING', placementType: null }));
        }
    };

    const handleMultiSelect = (ids: string[]) => {
        setSelectedUnitIds(ids);
        if (ids.length > 0) AudioService.playUiClick();
    };

    if (isInMenu) {
        return <MainMenu onStartGame={handleStartGame} />;
    }

    return (
        <div className="w-full h-screen relative bg-slate-900 overflow-hidden flex">
            <Sidebar
                gameState={gameState}
                onBuyUnit={handleBuyUnit}
                onAllianceRequest={handleAllianceRequest}
                selectedUnitIds={selectedUnitIds}
                onUnitAction={handleUnitAction}
                onSetDifficulty={setDifficulty}
            />
            <div className="flex-1 relative">
                <GameMap
                    units={gameState.units} factions={gameState.factions} pois={gameState.pois} projectiles={gameState.projectiles} explosions={gameState.explosions}
                    center={center} selectedUnitIds={selectedUnitIds}
                    onUnitClick={handleUnitClick} onUnitRightClick={handleUnitRightClick} onUnitAction={handleUnitAction}
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

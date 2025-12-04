import { useState, useRef, useEffect, useCallback } from 'react';
import { GameState, GameUnit, POI, UnitClass, POIType, Faction, Difficulty } from '../types';
import { UNIT_CONFIG } from '../constants';
import { processGameTick, spawnUnit } from '../services/gameLogic';
import { NetworkService } from '../services/networkService';
import { AudioService } from '../services/audioService';
import { TerrainService } from '../services/terrainService';
import { GameAction, createAction, SpawnUnitPayload, MoveUnitsPayload, AttackTargetPayload, BuildStructurePayload, SelectBasePayload } from '../services/schemas';
import { applyAction } from '../services/applyAction';
import { Scenario } from '../types';
import { getMockCities } from '../services/mockDataService';

const GAME_TICK_MS = 40; // 25 FPS

export const useGameLoop = () => {
    const [gameState, setGameState] = useState<GameState>({
        units: [],
        pois: [],
        factions: [],
        projectiles: [],
        explosions: [],
        messages: [],
        playerResources: { gold: 5000, oil: 1000, intel: 100 },
        gameMode: 'SELECT_BASE',
        aiUpdateCounter: 0,
        localPlayerId: 'PLAYER',
        isClient: false,
        placementType: null
    });

    const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

    // Game loop control
    const animationFrameId = useRef<number>(0);
    const lastTickTime = useRef<number>(0);
    const isPaused = useRef<boolean>(false);

    // ============================================
    // NETWORK ACTION LISTENER
    // ============================================
    useEffect(() => {
        const unsub = NetworkService.subscribe((event) => {
            console.log('[GAME LOOP] Network event:', event.type);

            if (event.type === 'ACTION') {
                // Received action from another player
                // Apply IMMEDIATELY to state
                setGameState(prev => applyAction(prev, event.action));
            }
            else if (event.type === 'FULL_STATE') {
                // Full state sync (late join or resync)
                console.log('[GAME LOOP] Received full state sync');
                setGameState(prev => ({
                    ...event.gameState,
                    isClient: prev.isClient,
                    localPlayerId: prev.localPlayerId
                }));
            }
        });

        return () => unsub();
    }, []);

    // ============================================
    // GAME LOOP (Simulation Only)
    // ============================================
    const gameLoop = useCallback((timestamp: number) => {
        if (isPaused.current) {
            animationFrameId.current = requestAnimationFrame(gameLoop);
            return;
        }

        if (timestamp - lastTickTime.current >= GAME_TICK_MS) {
            setGameState(prevState => {
                // Only simulate if in PLAYING mode
                if (prevState.gameMode !== 'PLAYING') return prevState;

                const isHost = !prevState.isClient;

                // Run simulation (Host runs AI, Client predicts movement)
                const nextState = processGameTick(prevState, [], isHost);

                // HOST: Broadcast state periodically to ensure sync
                // OPTIMIZATION: Reduced frequency from 10 to 50 ticks (2s) to save bandwidth
                if (isHost && nextState.gameTick % 50 === 0) {
                    NetworkService.broadcastFullState(nextState);
                }

                return nextState;
            });
            lastTickTime.current = timestamp;
        }

        animationFrameId.current = requestAnimationFrame(gameLoop);
    }, []);

    // ============================================
    // START GAME
    // ============================================
    const startGame = (scenario: Scenario, localPlayerId: string, factions: Faction[], isClient: boolean) => {
        console.log('[START GAME]', scenario.id, 'localPlayerId:', localPlayerId, 'isClient:', isClient);

        // Start with empty POIs - they will be loaded separately
        // The App.tsx or terrain service handles POI data loading
        setGameState({
            units: [],
            pois: getMockCities(), // Load all cities!
            factions: factions,
            projectiles: [],
            explosions: [],
            messages: [],
            playerResources: { gold: 5000, oil: 1000, intel: 100 },
            gameMode: 'SELECT_BASE',
            aiUpdateCounter: 0,
            localPlayerId,
            isClient,
            placementType: null
        });

        NetworkService.isHost = !isClient;

        // Set initial camera position
        const myFaction = factions.find(f => f.id === localPlayerId);
        if (myFaction) {
            // Center on faction's region or world center
            setCenter({ lat: 20, lng: 0 });
        }

        AudioService.playSuccess();
    };

    // Start loop
    useEffect(() => {
        animationFrameId.current = requestAnimationFrame(gameLoop);
        return () => cancelAnimationFrame(animationFrameId.current);
    }, [gameLoop]);

    // ============================================
    // IMMEDIATE ACTION HELPERS
    // ============================================

    /**
     * Execute action LOCALLY and BROADCAST to network
     * This is the core of optimistic execution
     */
    const executeAndBroadcast = (action: GameAction) => {
        console.log('[EXECUTE] Action:', action.actionType, 'locally + broadcast');

        // 1. Execute LOCALLY (optimistic)
        setGameState(prev => applyAction(prev, action));

        // 2. Broadcast to ALL other players
        NetworkService.broadcastAction(action);
    };

    // ============================================
    // ACTION HANDLERS
    // ============================================

    const handleBuyUnit = (type: UnitClass) => {
        console.log('[HANDLE BUY UNIT]', type);

        // Structures need manual placement
        const structures = [UnitClass.AIRBASE, UnitClass.PORT, UnitClass.MILITARY_BASE];
        if (structures.includes(type)) {
            console.log('[HANDLE BUY UNIT] Entering PLACING_STRUCTURE mode for', type);
            setGameState(prev => ({
                ...prev,
                gameMode: 'PLACING_STRUCTURE',
                placementType: type
            }));
            AudioService.playUiClick();
            return;
        }

        // Find spawn location for units
        let spawnLat: number | null = null;
        let spawnLng: number | null = null;

        const seaUnits = [UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.SUBMARINE,
        UnitClass.AIRCRAFT_CARRIER, UnitClass.BATTLESHIP, UnitClass.PATROL_BOAT, UnitClass.MINELAYER];
        const isSea = seaUnits.includes(type);

        if (isSea) {
            const validSites = [
                ...gameState.pois.filter(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY && p.isCoastal),
                ...gameState.units.filter(u => u.factionId === gameState.localPlayerId && u.unitClass === UnitClass.PORT)
            ];
            if (validSites.length > 0) {
                const site = validSites[Math.floor(Math.random() * validSites.length)];
                spawnLat = site.position.lat;
                spawnLng = site.position.lng;
            }
        } else {
            const validSites = [
                ...gameState.pois.filter(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY),
                ...gameState.units.filter(u => u.factionId === gameState.localPlayerId &&
                    (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MILITARY_BASE || u.unitClass === UnitClass.AIRBASE))
            ];
            if (validSites.length > 0) {
                const site = validSites[Math.floor(Math.random() * validSites.length)];
                spawnLat = site.position.lat;
                spawnLng = site.position.lng;
            }
        }

        if (spawnLat !== null && spawnLng !== null) {
            const payload: SpawnUnitPayload = {
                unitClass: type,
                lat: spawnLat + (Math.random() - 0.5) * 0.05,
                lng: spawnLng + (Math.random() - 0.5) * 0.05,
                unitId: `UNIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };

            const action = createAction(gameState.localPlayerId, 'SPAWN_UNIT', payload);
            executeAndBroadcast(action);
            AudioService.playUiClick();
        }
    };

    const handleMapClick = (lat: number, lng: number) => {
        if (gameState.gameMode === 'PLACING_STRUCTURE') {
            if (!gameState.placementType) return;

            const type = gameState.placementType;
            if (!TerrainService.isValidPlacement(type, lat, lng, gameState.pois)) {
                alert("Invalid Terrain!");
                AudioService.playAlert();
                return;
            }

            const payload: BuildStructurePayload = {
                structureType: type,
                lat,
                lng,
                unitId: `STRUCT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };

            const action = createAction(gameState.localPlayerId, 'BUILD_STRUCTURE', payload);
            executeAndBroadcast(action);

            setGameState(prev => ({ ...prev, gameMode: 'PLAYING', placementType: null }));
            AudioService.playSuccess();
        }
        else if (gameState.gameMode === 'PLAYING') {
            // Move units
            if (selectedUnitIds.length > 0) {
                const payload: MoveUnitsPayload = {
                    unitIds: selectedUnitIds,
                    targetLat: lat,
                    targetLng: lng,
                    isBoosting: false
                };

                const action = createAction(gameState.localPlayerId, 'MOVE_UNITS', payload);
                executeAndBroadcast(action);
                AudioService.playUiClick();
            }
        }
    };

    const handlePoiClick = (poiId: string) => {
        if (gameState.gameMode === 'SELECT_BASE') {
            const poi = gameState.pois.find(p => p.id === poiId);
            if (poi && poi.type === POIType.CITY) {
                console.log('[HANDLE POI CLICK] Selecting base:', poi.name);

                const payload: SelectBasePayload = {
                    poiId,
                    hqUnitId: `HQ-${gameState.localPlayerId}-${Date.now()}`
                };

                const action = createAction(gameState.localPlayerId, 'SELECT_BASE', payload);
                executeAndBroadcast(action);

                setCenter({ lat: poi.position.lat, lng: poi.position.lng });

                setTimeout(() => {
                    setGameState(prev => ({ ...prev, gameMode: 'PLAYING' }));
                }, 100);

                AudioService.playSuccess();
            }
        }
    };

    const handleTargetCommand = (targetId: string, isPoi: boolean) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            const payload: AttackTargetPayload = {
                attackerIds: selectedUnitIds,
                targetId,
                isPoi
            };

            const action = createAction(gameState.localPlayerId, 'ATTACK_TARGET', payload);
            executeAndBroadcast(action);
            AudioService.playSuccess();
        }
    };

    const handleUnitAction = (unitId: string, actionType: string) => {
        // Legacy - can be removed or adapted
    };

    const handleAllianceRequest = (targetFactionId: string) => {
        // TODO: Implement alliance system
    };

    const setDifficulty = (diff: Difficulty) => {
        // TODO: Implement difficulty setting
    };

    return {
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
        handleTargetCommand,
        setDifficulty,
        startGame
    };
};

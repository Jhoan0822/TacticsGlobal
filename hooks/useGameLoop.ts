import { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, UnitClass, GameUnit, POIType, Difficulty, Scenario, Faction } from '../types';
import { processGameTick, spawnUnit, evaluateAllianceRequest } from '../services/gameLogic';
import { fetchWorldData } from '../services/mockDataService';
import { AudioService } from '../services/audioService';
import { GAME_TICK_MS, UNIT_CONFIG } from '../constants';
import { TerrainService } from '../services/terrainService';
import { NetworkService } from '../services/networkService';
import { Intent, Turn } from '../services/schemas';

export const useGameLoop = () => {
    const [gameState, setGameState] = useState<GameState>({
        factions: [],
        units: [],
        pois: [],
        projectiles: [],
        explosions: [],
        playerResources: { gold: 5000, oil: 2000, intel: 0 },
        controlGroups: {},
        territoryControlled: 0,
        gameTick: 0,
        gameMode: 'SELECT_BASE',
        messages: [],
        difficulty: Difficulty.MEDIUM,
        scenario: { id: 'WORLD', name: 'World', bounds: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 } }, // Default placeholder
        localPlayerId: 'PLAYER'
    });

    const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

    // Refs for loop management
    const lastTickTime = useRef<number>(0);
    const animationFrameId = useRef<number | null>(null);
    const isPaused = useRef<boolean>(false);

    // Multiplayer Refs
    const hostIntentsBuffer = useRef<Intent[]>([]);
    const turnNumber = useRef<number>(0);

    // --- INITIALIZATION ---
    const startGame = async (scenario: Scenario, localPlayerId: string, factions: Faction[], isClient: boolean = false) => {
        const data = await fetchWorldData(0, 0, 10000);

        // Filter POIs by Scenario Bounds
        const bounds = scenario.bounds;
        let filteredPois = data.pois.filter(p =>
            p.position.lat >= bounds.minLat && p.position.lat <= bounds.maxLat &&
            p.position.lng >= bounds.minLng && p.position.lng <= bounds.maxLng
        );

        // Spawn HQs for AI
        const aiUnits: GameUnit[] = [];

        // We need to update POI ownership for AI starts
        filteredPois = filteredPois.map(p => ({ ...p })); // Clone

        factions.forEach(f => {
            if (f.type === 'AI') {
                const validCities = filteredPois.filter(p => p.type === POIType.CITY && !p.ownerFactionId);
                if (validCities.length > 0) {
                    const city = validCities[Math.floor(Math.random() * validCities.length)];
                    city.ownerFactionId = f.id;
                    city.tier = 1;

                    const hq = spawnUnit(UnitClass.COMMAND_CENTER, city.position.lat, city.position.lng);
                    hq.factionId = f.id;
                    aiUnits.push(hq);
                }
            }
        });

        setGameState(prev => ({
            ...prev,
            factions: factions,
            units: aiUnits,
            pois: filteredPois,
            messages: [{ id: 'init', text: 'Global Command Link Established.', type: 'info', timestamp: Date.now() }],
            scenario: scenario,
            localPlayerId: localPlayerId,
            gameMode: 'SELECT_BASE',
            isClient: isClient
        }));

        // Reset buffers
        hostIntentsBuffer.current = [];
        turnNumber.current = 0;

        AudioService.playSuccess();
    };

    // Network Sync
    useEffect(() => {
        const unsub = NetworkService.subscribe((event) => {
            if (event.type === 'STATE_UPDATE') {
                setGameState(prev => {
                    // Full state sync (e.g. join or reconnect)
                    // FIX: Do not overwrite local playerResources with Host's resources.
                    // Derive them from the factions array for the local player.
                    const myFaction = event.state.factions.find(f => f.id === prev.localPlayerId);
                    const myResources = myFaction ? { gold: myFaction.gold, oil: 2000, intel: 0 } : prev.playerResources; // Oil/Intel not fully in Faction yet?

                    // Actually, Faction only has 'gold'. We need to handle oil/intel.
                    // For now, let's keep local resources if we can, or accept that oil/intel might desync if not in Faction.
                    // Ideally Faction should have all resources.
                    // Let's use the received state but override playerResources.

                    return {
                        ...event.state,
                        isClient: true,
                        localPlayerId: prev.localPlayerId,
                        playerResources: myResources
                    };
                });
            } else if (event.type === 'TURN') {
                // Client receives turn from Host
                setGameState(prev => {
                    if (!prev.isClient) return prev; // Host ignores received turns (it generates them)
                    // Execute the turn
                    return processGameTick(prev, event.turn.intents);
                });
            } else if (event.type === 'INTENT' as any) {
                // Host receives intent from Client
                // We need to cast event type because we added INTENT dynamically or need to update NetworkEvent type properly
                // Assuming NetworkService emits 'INTENT' for host.
                const intent = (event as any).intent as Intent;
                hostIntentsBuffer.current.push(intent);
            }
        });
        return () => unsub();
    }, []);

    // --- GAME LOOP (requestAnimationFrame) ---
    const gameLoop = useCallback((timestamp: number) => {
        if (isPaused.current) {
            animationFrameId.current = requestAnimationFrame(gameLoop);
            return;
        }

        if (timestamp - lastTickTime.current >= GAME_TICK_MS) {
            setGameState(prevState => {
                // If Client, we don't simulate on tick, we wait for TURN event.
                if (prevState.isClient) return prevState;

                if (prevState.gameMode !== 'PLAYING' && prevState.gameMode !== 'PLACING_STRUCTURE') return prevState;

                // HOST LOGIC
                // 1. Gather Intents
                const currentIntents = [...hostIntentsBuffer.current];
                hostIntentsBuffer.current = []; // Clear buffer

                // 2. Create Turn
                const turn: Turn = {
                    turnNumber: turnNumber.current++,
                    intents: currentIntents
                };

                // 3. Broadcast Turn
                // RTS OPTIMIZATION: Broadcast EVERY TICK for 60Hz fluidity.
                // This is bandwidth heavy but necessary for smooth RTS movement.
                NetworkService.broadcastTurn(turn);

                // 4. Execute Tick locally
                const nextState = processGameTick(prevState, currentIntents);

                // Broadcast State occasionally for late joiners / resync?
                // Broadcast State every 300 ticks (approx 5s) to reduce lag
                if (nextState.gameTick % 300 === 0) {
                    NetworkService.broadcastState(nextState);
                }

                return nextState;
            });
            lastTickTime.current = timestamp;
        }

        animationFrameId.current = requestAnimationFrame(gameLoop);
    }, []);

    useEffect(() => {
        animationFrameId.current = requestAnimationFrame(gameLoop);
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, [gameLoop]);

    // --- ACTIONS ---
    // Helper to dispatch intent
    const dispatchIntent = (intent: Intent) => {
        // If Host, add to local buffer
        // If Client, send to Host
        if (NetworkService.isHost) {
            hostIntentsBuffer.current.push(intent);
        } else {
            NetworkService.sendIntent(intent);
        }
    };

    const setDifficulty = (difficulty: Difficulty) => {
        setGameState(prev => ({ ...prev, difficulty }));
        AudioService.playUiClick();
    };

    const handleUnitAction = (action: string, unitId: string) => {
        // This logic needs to be converted to Intents.
        // But wait, 'DEPLOY_TANK' etc are spawning units relative to a parent unit?
        // Or is it just spawning?
        // The original logic checked resources and spawned.
        // Now we must send an intent.
        // But we need the unit's position to know where to spawn.
        // We can't easily access 'gameState' here inside the callback without dependency?
        // 'gameState' is available in scope but might be stale if not in dependency array.
        // Actually 'useGameLoop' returns these functions, so they close over 'gameState'.
        // But 'gameState' changes every tick.
        // We should use a ref or functional update?
        // But we need to READ state to create the intent (e.g. position).

        // For now, let's assume we can read 'gameState' from the state variable.
        // React state 'gameState' will be the render cycle's state.

        const unit = gameState.units.find(u => u.id === unitId);
        if (!unit || unit.factionId !== gameState.localPlayerId) return;

        let typeToSpawn: UnitClass | null = null;
        if (action === 'DEPLOY_TANK') typeToSpawn = UnitClass.GROUND_TANK;
        else if (action === 'DEPLOY_SPECOPS') typeToSpawn = UnitClass.SPECIAL_FORCES;
        else if (action === 'DEPLOY_INFANTRY') typeToSpawn = UnitClass.INFANTRY;

        if (typeToSpawn) {
            const offsetLat = (Math.random() - 0.5) * 0.005;
            const offsetLng = (Math.random() - 0.5) * 0.005;

            dispatchIntent({
                type: 'SPAWN',
                clientId: gameState.localPlayerId, // Or NetworkService.myPeerId
                unitClass: typeToSpawn,
                lat: unit.position.lat + offsetLat,
                lng: unit.position.lng + offsetLng,
                unitId: `UNIT-${Math.random().toString(36).substr(2, 9)}`
            });
            AudioService.playSuccess();
        }
    };

    const handleBuyUnit = (type: UnitClass) => {
        // Logic for placing structure vs auto-spawn
        if (type === UnitClass.AIRBASE || type === UnitClass.PORT || type === UnitClass.MILITARY_BASE) {
            AudioService.playUiClick();
            setGameState(prev => ({ ...prev, gameMode: 'PLACING_STRUCTURE', placementType: type }));
            return;
        }

        // Auto-spawn logic
        // We need to find a spawn location.
        // This requires reading state.
        let spawnLat: number | null = null;
        let spawnLng: number | null = null;

        const seaUnits = [UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.SUBMARINE, UnitClass.AIRCRAFT_CARRIER, UnitClass.BATTLESHIP, UnitClass.PATROL_BOAT, UnitClass.MINELAYER];
        const isSea = seaUnits.includes(type);

        if (isSea) {
            const validCities = gameState.pois.filter(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY && p.isCoastal);
            const validPorts = gameState.units.filter(u => u.factionId === gameState.localPlayerId && u.unitClass === UnitClass.PORT);
            const allSites = [...validCities, ...validPorts];

            if (allSites.length > 0) {
                const site = allSites[Math.floor(Math.random() * allSites.length)];
                spawnLat = site.position.lat; spawnLng = site.position.lng;
            }
        } else {
            const validSites = [
                ...gameState.pois.filter(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY),
                ...gameState.units.filter(u => u.factionId === gameState.localPlayerId && (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MILITARY_BASE || u.unitClass === UnitClass.AIRBASE))
            ];
            if (validSites.length > 0) {
                const site = validSites[Math.floor(Math.random() * validSites.length)];
                // @ts-ignore
                spawnLat = site.position.lat; spawnLng = site.position.lng;
            }
        }

        if (spawnLat !== null && spawnLng !== null) {
            dispatchIntent({
                type: 'SPAWN',
                clientId: gameState.localPlayerId,
                unitClass: type,
                lat: spawnLat + (Math.random() - 0.5) * 0.05,
                lng: spawnLng + (Math.random() - 0.5) * 0.05,
                unitId: `UNIT-${Math.random().toString(36).substr(2, 9)}`
            });
            AudioService.playSuccess();
        } else {
            alert(isSea ? "Commander, we need a Coastal City or Port!" : "Commander, we need a secure base or city for production!");
            AudioService.playAlert();
        }
    };

    const handleAllianceRequest = (factionId: string) => {
        // Alliance logic is complex because it involves AI response.
        // For now, let's keep it local or send an intent 'ALLIANCE_REQUEST' (not implemented in schemas yet).
        // If we want to support it, we should add it to schemas.
        // For now, let's just log it locally or ignore.
        console.warn("Alliance request not fully implemented in multiplayer yet.");
    };

    const handlePoiClick = (poiId: string) => {
        // Initial base selection
        if (gameState.gameMode === 'SELECT_BASE') {
            const poi = gameState.pois.find(p => p.id === poiId);
            if (poi && poi.type === POIType.CITY) {
                // This is a special case: Initial Spawn.
                // We should send a SPAWN intent for the HQ.
                // But we also need to update the POI ownership.
                // And change game mode.
                // This might be better handled by a specific 'SELECT_START' intent.
                // For now, let's just do it locally if we are host, or send intent if client?
                // Actually, SELECT_BASE happens before the game loop really starts syncing turns?
                // Or we can just send a SPAWN intent and assume the logic handles the rest?
                // The logic in 'processGameTick' doesn't handle 'SELECT_BASE' mode transitions.
                // We might need to update 'processGameTick' to handle this or keep it local for now.

                // Let's keep it local for simplicity, assuming this happens before multiplayer sync fully kicks in?
                // No, if we are client connecting to host, we might join late.
                // If we are starting a new game, we select base.

                // Let's just implement it as local state change for now, 
                // but we need to notify host if we are client.
                // Since we don't have a 'SELECT_BASE' intent, let's just spawn the HQ unit.

                const hq: GameUnit = {
                    id: 'PLAYER-HQ',
                    unitClass: UnitClass.COMMAND_CENTER,
                    factionId: 'PLAYER',
                    position: { lat: poi.position.lat, lng: poi.position.lng },
                    heading: 0,
                    ...UNIT_CONFIG[UnitClass.COMMAND_CENTER],
                    realWorldIdentity: undefined,
                    isBoosting: false
                };

                // We need to update POI locally and send intent?
                // Let's just send SPAWN intent for HQ.
                dispatchIntent({
                    type: 'SPAWN',
                    clientId: gameState.localPlayerId,
                    unitClass: UnitClass.COMMAND_CENTER,
                    lat: poi.position.lat,
                    lng: poi.position.lng,
                    unitId: `${gameState.localPlayerId}-HQ` // Deterministic ID for HQ
                });

                setCenter({ lat: poi.position.lat, lng: poi.position.lng });
                setSelectedUnitIds([`${gameState.localPlayerId}-HQ`]); // ID might be different from server?
                // Server generates ID. We won't know it immediately.
                // This is a UI issue with authoritative servers.
                // We can use a temporary ID or wait for update.

                setGameState(prev => ({ ...prev, gameMode: 'PLAYING' }));
                AudioService.playSuccess();
            }
        }
    };

    const handleMapClick = (lat: number, lng: number) => {
        if (gameState.gameMode === 'PLACING_STRUCTURE') {
            if (!gameState.placementType) return;

            const type = gameState.placementType;
            // Validate terrain locally
            if (!TerrainService.isValidPlacement(type, lat, lng, gameState.pois)) {
                alert("Invalid Terrain! Ports must be near coast, Airbases on land.");
                AudioService.playAlert();
                return;
            }

            dispatchIntent({
                type: 'BUILD_STRUCTURE',
                clientId: gameState.localPlayerId,
                structureType: type,
                lat: lat,
                lng: lng
            });

            AudioService.playSuccess();
            setGameState(prev => ({ ...prev, gameMode: 'PLAYING', placementType: null }));
        } else if (gameState.gameMode === 'PLAYING') {
            // Move units
            if (selectedUnitIds.length > 0) {
                dispatchIntent({
                    type: 'MOVE',
                    clientId: gameState.localPlayerId,
                    unitIds: selectedUnitIds,
                    lat: lat,
                    lng: lng
                });
                // Show visual feedback?
            }
        }
    };

    const handleTargetCommand = (targetId: string, isPoi: boolean) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            const targetUnit = gameState.units.find(u => u.id === targetId);
            const targetPoi = gameState.pois.find(p => p.id === targetId);

            // Determine if Attack or Set Target (Follow/Guard)
            // For now, if hostile -> Attack, if friendly -> Set Target (Guard/Follow)
            // We need to know relation.
            // Simple logic: If not my faction -> Attack.

            const isHostile = (targetUnit && targetUnit.factionId !== gameState.localPlayerId) ||
                (targetPoi && targetPoi.ownerFactionId !== gameState.localPlayerId);

            if (isHostile) {
                dispatchIntent({
                    type: 'ATTACK',
                    clientId: gameState.localPlayerId,
                    attackerId: selectedUnitIds[0], // Single unit attack for now or iterate?
                    targetId: targetId
                });
                // If multiple units selected, send intent for each?
                // Or update Intent to support multiple attackers?
                // Schema says 'attackerId' is string. So one intent per attacker.
                selectedUnitIds.forEach(id => {
                    if (id !== selectedUnitIds[0]) {
                        dispatchIntent({
                            type: 'ATTACK',
                            clientId: gameState.localPlayerId,
                            attackerId: id,
                            targetId: targetId
                        });
                    }
                });
            } else {
                // Friendly - Set Target (Guard/Follow)
                selectedUnitIds.forEach(id => {
                    dispatchIntent({
                        type: 'SET_TARGET',
                        clientId: gameState.localPlayerId,
                        unitId: id,
                        targetId: targetId
                    });
                });
            }
            AudioService.playSuccess();
        }
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

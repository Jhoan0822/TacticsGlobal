import { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Difficulty, Scenario, Faction } from '../types';
import { processGameTick } from '../services/gameLogic';
import { fetchWorldData } from '../services/mockDataService';
import { AudioService } from '../services/audioService';
import { GAME_TICK_MS } from '../constants';
import { NetworkService } from '../services/networkService';
import { Intent, TurnPacket, SyncPacket } from '../services/schemas';
import { v4 as uuidv4 } from 'uuid'; // We need a UUID generator, or simple random string

const generateId = () => Math.random().toString(36).substr(2, 9);

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
        scenario: { id: 'WORLD', name: 'World', bounds: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 } },
        localPlayerId: 'PLAYER'
    });

    const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

    // Refs
    const lastTickTime = useRef<number>(0);
    const animationFrameId = useRef<number | null>(null);
    const isPaused = useRef<boolean>(false);

    // Multiplayer Buffers
    const pendingIntents = useRef<Intent[]>([]); // Host: Intents to process. Client: Intents waiting to send.
    const processedIntentIds = useRef<Set<string>>(new Set()); // Deduplication Set
    const serverTurnBuffer = useRef<Intent[]>([]); // Client: Intents received from server

    // --- INITIALIZATION ---
    const startGame = async (scenario: Scenario, localPlayerId: string, factions: Faction[], isClient: boolean = false) => {
        const data = await fetchWorldData(0, 0, 10000);

        // Filter POIs
        const bounds = scenario.bounds;
        const filteredPois = data.pois.filter(p =>
            p.position.lat >= bounds.minLat && p.position.lat <= bounds.maxLat &&
            p.position.lng >= bounds.minLng && p.position.lng <= bounds.maxLng
        );

        setGameState(prev => ({
            ...prev,
            factions: factions,
            pois: filteredPois,
            scenario: scenario,
            localPlayerId: localPlayerId,
            gameMode: 'SELECT_BASE',
            isClient: isClient
        }));

        AudioService.playSuccess();
    };

    // --- NETWORK SUBSCRIPTION ---
    useEffect(() => {
        const unsub = NetworkService.subscribe((msg) => {
            if (msg.type === 'SYNC') {
                // Full State Sync (Reconciliation)
                // We should only apply this if we are drifting significantly, or on join.
                // For now, let's trust the server state but keep our local ID.
                setGameState(prev => ({
                    ...msg.state,
                    localPlayerId: prev.localPlayerId, // Keep local ID
                    isClient: true
                }));
            } else if (msg.type === 'TURN') {
                // Client: Receive Turn
                serverTurnBuffer.current.push(...msg.intents);
            } else if (msg.type === 'INTENT') {
                // Host: Receive Client Intent
                pendingIntents.current.push(msg.intent);
            }
        });
        return () => unsub();
    }, []);

    // --- GAME LOOP ---
    const gameLoop = useCallback((timestamp: number) => {
        if (isPaused.current) {
            animationFrameId.current = requestAnimationFrame(gameLoop);
            return;
        }

        if (timestamp - lastTickTime.current >= GAME_TICK_MS) {
            setGameState(prevState => {
                if (prevState.gameMode === 'SELECT_BASE') return prevState;

                let intentsToApply: Intent[] = [];

                if (NetworkService.isHost) {
                    // HOST LOGIC
                    // 1. Gather all pending intents (Local + Clients)
                    intentsToApply = [...pendingIntents.current];
                    pendingIntents.current = [];

                    // 2. Broadcast Turn (Immediate)
                    if (intentsToApply.length > 0) {
                        NetworkService.broadcast({
                            type: 'TURN',
                            turnNumber: prevState.gameTick,
                            intents: intentsToApply
                        });
                    }

                    // 3. Broadcast Sync (Periodic - 1Hz)
                    if (prevState.gameTick % 60 === 0) {
                        NetworkService.broadcast({
                            type: 'SYNC',
                            state: prevState
                        });
                    }
                } else {
                    // CLIENT LOGIC (Prediction + Deduplication)

                    // 1. Get Server Intents
                    const serverIntents = [...serverTurnBuffer.current];
                    serverTurnBuffer.current = [];

                    // 2. Filter out intents we already predicted (Deduplication)
                    const newServerIntents = serverIntents.filter(intent => {
                        if (processedIntentIds.current.has(intent.id)) {
                            // We already ran this locally. Ignore it.
                            processedIntentIds.current.delete(intent.id); // Cleanup
                            return false;
                        }
                        return true;
                    });

                    // 3. Apply ONLY new server intents (other players' actions)
                    // Note: Our own actions were applied immediately when dispatched.
                    intentsToApply = newServerIntents;
                }

                // Execute Tick
                return processGameTick(prevState, intentsToApply);
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
    const dispatchIntent = (intent: Intent) => {
        // 1. Assign ID if missing (should be there from helper)
        if (!intent.id) intent.id = generateId();

        // 2. PREDICTION: Apply locally immediately!
        // We do this by forcing a state update with just this intent?
        // No, we can't force a tick.
        // We should add it to a "Local Prediction Buffer" that gets consumed in the next tick.
        // BUT, if we are Host, we add to pendingIntents.
        // If Client, we add to... pendingIntents? No, pendingIntents is for Host processing.

        if (NetworkService.isHost) {
            pendingIntents.current.push(intent);
        } else {
            // CLIENT PREDICTION
            // Apply locally in next tick
            // We reuse 'serverTurnBuffer' or a separate 'localPredictionBuffer'?
            // Let's use a separate one to be clean, OR just inject it into the loop.
            // Actually, we can just run processGameTick locally right now?
            // No, must be in loop to be thread-safe with state.

            // Hack: Push to serverTurnBuffer? No, that's for server stuff.
            // Let's add a 'localIntents' buffer.
            // Wait, simpler:
            // Just push to 'serverTurnBuffer' but mark it as local?
            // No, logic above filters based on ID.

            // CORRECT APPROACH:
            // 1. Send to Network.
            // 2. Add to 'serverTurnBuffer' (acting as if we received it immediately).
            // 3. Add to 'processedIntentIds' so when real one comes back, we ignore it.

            NetworkService.sendIntent(intent);
            processedIntentIds.current.add(intent.id);
            serverTurnBuffer.current.push(intent); // "Simulate" receiving it
        }
    };

    // UI Handlers
    const handleUnitAction = (action: string, unitId: string) => {
        // Implement specific unit actions
    };

    const handleBuyUnit = (type: any) => {
        const validSpawns = gameState.pois.filter(p => p.ownerFactionId === gameState.localPlayerId && p.type === 'CITY');
        const validUnits = gameState.units.filter(u => u.factionId === gameState.localPlayerId && (u.unitClass === 'COMMAND_CENTER' || u.unitClass === 'MILITARY_BASE'));
        const allSpawns = [...validSpawns, ...validUnits];

        if (allSpawns.length > 0) {
            const spawn = allSpawns[Math.floor(Math.random() * allSpawns.length)];
            const pos = 'position' in spawn ? spawn.position : (spawn as any).position;

            dispatchIntent({
                id: generateId(),
                type: 'SPAWN',
                clientId: gameState.localPlayerId,
                unitClass: type,
                lat: pos.lat + (Math.random() - 0.5) * 0.05,
                lng: pos.lng + (Math.random() - 0.5) * 0.05,
                unitId: `UNIT-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Date.now()
            });
            AudioService.playSuccess();
        } else {
            AudioService.playAlert();
            alert("No base to spawn from!");
        }
    };

    const handlePoiClick = (poiId: string) => {
        if (gameState.gameMode === 'SELECT_BASE') {
            const poi = gameState.pois.find(p => p.id === poiId);
            if (poi) {
                // 1. Claim Base (Robust ID)
                dispatchIntent({
                    id: generateId(),
                    type: 'CLAIM_BASE',
                    clientId: gameState.localPlayerId,
                    poiId: poiId,
                    timestamp: Date.now()
                });
                // 2. Spawn HQ
                dispatchIntent({
                    id: generateId(),
                    type: 'SPAWN',
                    clientId: gameState.localPlayerId,
                    unitClass: 'COMMAND_CENTER' as any,
                    lat: poi.position.lat,
                    lng: poi.position.lng,
                    unitId: `${gameState.localPlayerId}-HQ`,
                    timestamp: Date.now()
                });
                setGameState(prev => ({ ...prev, gameMode: 'PLAYING' }));
                setCenter({ lat: poi.position.lat, lng: poi.position.lng });
            }
        }
    };

    const handleMapClick = (lat: number, lng: number) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            dispatchIntent({
                id: generateId(),
                type: 'MOVE',
                clientId: gameState.localPlayerId,
                unitIds: selectedUnitIds,
                lat,
                lng,
                timestamp: Date.now()
            });
        }
    };

    const handleTargetCommand = (targetId: string, isPoi: boolean) => {
        if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
            const targetUnit = gameState.units.find(u => u.id === targetId);
            const targetPoi = gameState.pois.find(p => p.id === targetId);
            const isHostile = (targetUnit && targetUnit.factionId !== gameState.localPlayerId) ||
                (targetPoi && targetPoi.ownerFactionId !== gameState.localPlayerId);

            if (isHostile) {
                selectedUnitIds.forEach(id => {
                    dispatchIntent({
                        id: generateId(),
                        type: 'ATTACK',
                        clientId: gameState.localPlayerId,
                        attackerId: id,
                        targetId: targetId,
                        timestamp: Date.now()
                    });
                });
            } else {
                selectedUnitIds.forEach(id => {
                    dispatchIntent({
                        id: generateId(),
                        type: 'SET_TARGET',
                        clientId: gameState.localPlayerId,
                        unitId: id,
                        targetId: targetId,
                        timestamp: Date.now()
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
        startGame,
        handlePoiClick,
        handleMapClick,
        handleUnitAction,
        handleBuyUnit,
        setDifficulty: () => { },
        handleAllianceRequest: () => { },
        handleTargetCommand
    };
};

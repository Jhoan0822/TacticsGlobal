import { useState, useRef, useEffect, useCallback } from 'react';
import { GameState, GameUnit, POI, UnitClass, POIType, Faction, Difficulty, NetworkRequest, NetworkResponse, GameMode } from '../types';
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
        gameMode: 'SELECTION', // Start in SELECTION mode (authoritative)
        gameTick: 0,
        controlGroups: {},
        territoryControlled: 0,
        difficulty: Difficulty.MEDIUM,
        scenario: { id: 'default', name: 'Global Conflict', bounds: { minLat: -85, maxLat: 85, minLng: -180, maxLng: 180 } },
        localPlayerId: 'PLAYER',
        isClient: false,
        placementType: null,
        // Network sync fields
        stateVersion: 0,
        hostTick: 0
    });

    const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

    // Game loop control
    const animationFrameId = useRef<number>(0);
    const lastTickTime = useRef<number>(0);
    const isPaused = useRef<boolean>(false);

    // ============================================
    // NETWORK EVENT LISTENER
    // ============================================
    useEffect(() => {
        const unsub = NetworkService.subscribe((event) => {
            // 1. GAMEPLAY ACTIONS
            if (event.type === 'ACTION') {
                setGameState(prev => {
                    // CRITICAL: Clients should NOT apply optimistic actions during PLAYING mode
                    // They receive authoritative state from FULL_STATE broadcasts instead
                    if (prev.isClient && prev.gameMode === 'PLAYING') {
                        console.log('[NET] Client ignoring ACTION during PLAYING - waiting for host state');
                        return prev;
                    }
                    // During SELECTION/LOBBY, apply actions normally (base selection, etc.)
                    return applyAction(prev, event.action);
                });
            }
            // 2. FULL STATE SYNC (Authoritative Update from Host)
            else if (event.type === 'FULL_STATE') {
                setGameState(prev => {
                    // Only clients should process FULL_STATE from host
                    if (!prev.isClient) {
                        console.log('[NET] Ignoring FULL_STATE - I am the host');
                        return prev;
                    }

                    // Log state version for debugging
                    const hostVersion = (event.gameState as any).stateVersion || 0;
                    const hostTick = (event.gameState as any).hostTick || event.gameState.gameTick;
                    console.log('[NET] Applying FULL_STATE from host. Version:', hostVersion, 'Tick:', hostTick);

                    // Preserve local identity and sync resources from faction
                    const myFaction = event.gameState.factions.find((f: any) => f.id === prev.localPlayerId);
                    const syncedResources = myFaction ? {
                        gold: myFaction.gold,
                        oil: myFaction.oil || 0,
                        intel: prev.playerResources.intel
                    } : prev.playerResources;

                    // Apply authoritative state, preserving ONLY local UI state
                    return {
                        ...event.gameState,
                        playerResources: syncedResources,
                        isClient: true,  // Always true for receiving clients
                        localPlayerId: prev.localPlayerId,
                        placementType: prev.placementType,  // UI-only
                        stateVersion: hostVersion,
                        hostTick: hostTick
                    };
                });
            }
            // 3. AUTHORITATIVE RESPONSES (Host -> Client)
            else if (event.type === 'RESPONSE') {
                handleNetworkResponse(event.response);
            }
            // 4. CLIENT REQUESTS (Client -> Host)
            else if (event.type === 'REQUEST') {
                handleNetworkRequest(event.request, event.fromPeerId);
            }
        });

        return () => unsub();
    }, []);

    // ============================================
    // AUTHORITATIVE HANDLERS
    // ============================================

    // HOST ONLY: Process Requests
    const handleNetworkRequest = (req: NetworkRequest, fromPeerId: string) => {
        if (req.type === 'REQUEST_SELECT_BASE') {
            setGameState(prev => {
                const poi = prev.pois.find(p => p.id === req.poiId);

                // VALIDATION: Is POI free? Is Mode SELECTION?
                if (poi && poi.type === POIType.CITY && !poi.ownerFactionId && prev.gameMode === 'SELECTION') {
                    console.log('[HOST] Granting base', poi.name, 'to', req.playerId);

                    // 1. Update Local State (Host Authority)
                    const nextPois = prev.pois.map(p =>
                        p.id === req.poiId ? { ...p, ownerFactionId: req.playerId, tier: 1 } : p
                    );

                    const nextFactions = prev.factions.map(f =>
                        f.id === req.playerId ? { ...f, ready: true } : f
                    );

                    // 2. Broadcast Response (Authoritative Update)
                    NetworkService.broadcastResponse({
                        type: 'BASE_SELECTED',
                        poiId: req.poiId,
                        factionId: req.playerId
                    });

                    // 3. Check for Game Start (All Humans Ready)
                    const humanFactions = nextFactions.filter(f => f.type === 'PLAYER');
                    const allReady = humanFactions.every(f => f.ready);

                    let nextMode = prev.gameMode;
                    let nextStartTime = prev.startTime;
                    let finalPois = nextPois;
                    let finalUnits = prev.units;
                    let finalFactions = nextFactions;

                    if (allReady && prev.gameMode === 'SELECTION') {
                        console.log('[HOST] All players ready. Assigning Bots & Starting Countdown.');
                        nextMode = 'COUNTDOWN';
                        nextStartTime = Date.now() + 5000; // 5s Countdown

                        // --- BOT ASSIGNMENT LOGIC ---
                        const availableCities = finalPois.filter(p => p.type === POIType.CITY && !p.ownerFactionId);
                        const botFactions = finalFactions.filter(f => f.type === 'BOT');

                        // Shuffle cities
                        const shuffledCities = [...availableCities].sort(() => Math.random() - 0.5);

                        // Assign to Bots
                        botFactions.forEach((bot, index) => {
                            if (index < shuffledCities.length) {
                                const city = shuffledCities[index];
                                city.ownerFactionId = bot.id;
                                city.tier = 1;
                                // Mark bot as ready
                                const botIndex = finalFactions.findIndex(f => f.id === bot.id);
                                if (botIndex !== -1) finalFactions[botIndex].ready = true;
                            }
                        });

                        // Spawn Defenders for Neutral/Remaining Cities
                        const neutralCities = finalPois.filter(p => p.type === POIType.CITY && !p.ownerFactionId);
                        const newUnits: GameUnit[] = [];

                        neutralCities.forEach(city => {
                            // Spawn 1-2 defenders
                            const count = 1 + Math.floor(Math.random() * 2);
                            for (let i = 0; i < count; i++) {
                                const isTank = Math.random() > 0.7;
                                const unitId = `DEFENDER-${city.id}-${i}-${Date.now()}`;
                                newUnits.push({
                                    id: unitId,
                                    unitClass: isTank ? UnitClass.GROUND_TANK : UnitClass.INFANTRY,
                                    factionId: 'NEUTRAL',
                                    position: {
                                        lat: city.position.lat + (Math.random() - 0.5) * 0.02,
                                        lng: city.position.lng + (Math.random() - 0.5) * 0.02
                                    },
                                    heading: 0,
                                    hp: 100,
                                    maxHp: 100,
                                    attack: isTank ? 15 : 5,
                                    range: isTank ? 50 : 20,
                                    speed: 0,
                                    vision: 50
                                });
                            }
                        });

                        finalUnits = [...prev.units, ...newUnits];

                        // Broadcast Updates
                        NetworkService.broadcastResponse({
                            type: 'GAME_MODE_UPDATE',
                            mode: 'COUNTDOWN',
                            startTime: nextStartTime
                        });

                        // Force Full Sync to ensure clients see bots/defenders
                        const fullState: GameState = {
                            ...prev,
                            pois: finalPois,
                            factions: finalFactions,
                            units: finalUnits,
                            gameMode: nextMode,
                            startTime: nextStartTime
                        };
                        NetworkService.broadcastFullState(fullState);
                    }

                    return {
                        ...prev,
                        pois: finalPois,
                        factions: finalFactions,
                        units: finalUnits,
                        gameMode: nextMode,
                        startTime: nextStartTime
                    };
                } else {
                    console.warn('[HOST] Denied base selection:', req.poiId, 'for', req.playerId);
                }
                return prev;
            });
        }
    };

    // CLIENT & HOST: Process Responses
    const handleNetworkResponse = (res: NetworkResponse) => {
        setGameState(prev => {
            if (res.type === 'BASE_SELECTED') {
                console.log('[NET] Base Selected:', res.poiId, 'by', res.factionId);

                // Update POI ownership
                const nextPois = prev.pois.map(p =>
                    p.id === res.poiId ? { ...p, ownerFactionId: res.factionId, tier: 1 } : p
                );

                // If it's ME who got the base, center camera
                if (res.factionId === prev.localPlayerId) {
                    const poi = nextPois.find(p => p.id === res.poiId);
                    if (poi) setCenter({ lat: poi.position.lat, lng: poi.position.lng });
                    AudioService.playSuccess();
                }

                return { ...prev, pois: nextPois };
            }
            else if (res.type === 'GAME_MODE_UPDATE') {
                console.log('[NET] Game Mode Update:', res.mode);
                return {
                    ...prev,
                    gameMode: res.mode,
                    startTime: res.startTime
                };
            }
            return prev;
        });
    };

    // ============================================
    // GAME LOOP (Authoritative Host Simulation)
    // ============================================
    const gameLoop = useCallback((timestamp: number) => {
        if (isPaused.current) {
            animationFrameId.current = requestAnimationFrame(gameLoop);
            return;
        }

        setGameState(prevState => {
            // COUNTDOWN TIMER (Both host and client can check this)
            if (prevState.gameMode === 'COUNTDOWN' && prevState.startTime) {
                if (Date.now() >= prevState.startTime) {
                    console.log('[LOOP] Countdown finished! Starting Game.');
                    // Only HOST broadcasts mode change
                    if (!prevState.isClient) {
                        NetworkService.broadcastResponse({
                            type: 'GAME_MODE_UPDATE',
                            mode: 'PLAYING',
                            startTime: undefined
                        });
                    }
                    return { ...prevState, gameMode: 'PLAYING' };
                }
            }
            return prevState;
        });

        if (timestamp - lastTickTime.current >= GAME_TICK_MS) {
            setGameState(prevState => {
                if (prevState.gameMode !== 'PLAYING') return prevState;

                // ============================================
                // CRITICAL: HOST-ONLY SIMULATION
                // ============================================
                // Only the HOST runs the authoritative game simulation.
                // Clients receive state updates via FULL_STATE broadcasts.

                if (prevState.isClient) {
                    // CLIENT: Do NOT run simulation
                    // Only update visual elements that don't affect game state
                    const updatedProjectiles = prevState.projectiles.map(p => {
                        if (p.progress < 1) {
                            return { ...p, progress: Math.min(1, p.progress + (p.speed || 0.1)) };
                        }
                        return p;
                    }).filter(p => p.progress < 1 || Date.now() - p.timestamp < 500);

                    const updatedExplosions = prevState.explosions.filter(
                        e => Date.now() - e.timestamp < 1000
                    );

                    return {
                        ...prevState,
                        projectiles: updatedProjectiles,
                        explosions: updatedExplosions,
                        gameTick: prevState.gameTick + 1
                    };
                }

                // HOST: Run full authoritative simulation
                const nextState = processGameTick(prevState, [], true);

                // HOST: Broadcast state to clients periodically
                // Every 5 ticks (~200ms) for smoother sync
                if (nextState.gameTick % 5 === 0) {
                    NetworkService.incrementStateVersion();
                    NetworkService.broadcastFullState({
                        ...nextState,
                        stateVersion: NetworkService.stateVersion,
                        hostTick: nextState.gameTick
                    });
                }

                return {
                    ...nextState,
                    stateVersion: NetworkService.stateVersion,
                    hostTick: nextState.gameTick
                };
            });
            lastTickTime.current = timestamp;
        }

        animationFrameId.current = requestAnimationFrame(gameLoop);
    }, []);

    // ============================================
    // START GAME (Initialization)
    // ============================================
    const startGame = (scenario: Scenario, localPlayerId: string, factions: Faction[], isClient: boolean, initialPois?: POI[]) => {
        console.log('[START GAME]', scenario.id, 'localPlayerId:', localPlayerId, 'isClient:', isClient);

        let allCities = initialPois || getMockCities();

        // HOST: Initialize Unclaimed Cities
        if (!isClient) {
            if (scenario.bounds) {
                const { minLat, maxLat, minLng, maxLng } = scenario.bounds as any;
                allCities = allCities.filter(city =>
                    city.position.lat >= minLat && city.position.lat <= maxLat &&
                    city.position.lng >= minLng && city.position.lng <= maxLng
                );
            }
            allCities.forEach(city => {
                if (city.type === POIType.CITY) city.ownerFactionId = undefined as any;
            });

            // Broadcast Initial Setup
            if (NetworkService.isHost || (!isClient && NetworkService.myPeerId)) {
                NetworkService.startGame(scenario.id, factions, allCities);
            }
        }

        setGameState({
            units: [],
            pois: allCities,
            factions: factions,
            projectiles: [],
            explosions: [],
            messages: [],
            playerResources: { gold: 10000, oil: 1000, intel: 100 },
            gameMode: 'SELECTION', // Start in Selection
            gameTick: 0,
            controlGroups: {},
            territoryControlled: 0,
            difficulty: Difficulty.MEDIUM,
            scenario: scenario,
            localPlayerId,
            isClient,
            placementType: null,
            pendingBotFactions: factions.filter(f => f.type === 'BOT').map(f => f.id),
            // Network sync fields
            stateVersion: 0,
            hostTick: 0
        });

        NetworkService.isHost = !isClient;
        AudioService.playSuccess();
    };

    // Start loop
    useEffect(() => {
        animationFrameId.current = requestAnimationFrame(gameLoop);
        return () => cancelAnimationFrame(animationFrameId.current);
    }, [gameLoop]);

    // ============================================
    // USER ACTIONS
    // ============================================

    const handlePoiClick = (poiId: string) => {
        // SELECTION MODE: Request Base
        if (gameState.gameMode === 'SELECTION') {
            const poi = gameState.pois.find(p => p.id === poiId);
            if (poi && poi.type === POIType.CITY && !poi.ownerFactionId) {
                console.log('[UI] Requesting base:', poi.name);
                NetworkService.sendRequest({
                    type: 'REQUEST_SELECT_BASE',
                    poiId,
                    playerId: gameState.localPlayerId
                });
            } else {
                AudioService.playError();
            }
        }
    };

    const handleMapClick = (lat: number, lng: number) => {
        if (gameState.gameMode === 'PLACING_STRUCTURE') {
            if (!gameState.placementType) return;
            const type = gameState.placementType;
            const playerUnits = gameState.units.filter(u => u.factionId === gameState.localPlayerId);

            if (!TerrainService.isValidPlacement(type, lat, lng, gameState.pois, playerUnits, gameState.localPlayerId)) {
                alert("Invalid location!");
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
            setGameState(prev => applyAction(prev, action)); // Optimistic
            NetworkService.broadcastAction(action);
            setGameState(prev => ({ ...prev, gameMode: 'PLAYING', placementType: null }));
            AudioService.playSuccess();
        }
        else if (gameState.gameMode === 'PLAYING') {
            // Move Units
            if (selectedUnitIds.length > 0) {
                const payload: MoveUnitsPayload = {
                    unitIds: selectedUnitIds,
                    targetLat: lat,
                    targetLng: lng,
                    isBoosting: false
                };
                const action = createAction(gameState.localPlayerId, 'MOVE_UNITS', payload);
                setGameState(prev => applyAction(prev, action)); // Optimistic
                NetworkService.broadcastAction(action);
                AudioService.playUiClick();
            }
        }
    };

    const handleBuyUnit = (type: UnitClass) => {
        const structures = [UnitClass.AIRBASE, UnitClass.PORT, UnitClass.MILITARY_BASE];
        if (structures.includes(type)) {
            setGameState(prev => ({ ...prev, gameMode: 'PLACING_STRUCTURE', placementType: type }));
            AudioService.playUiClick();
            return;
        }

        const airUnits = [UnitClass.FIGHTER_JET, UnitClass.HEAVY_BOMBER, UnitClass.HELICOPTER, UnitClass.RECON_DRONE, UnitClass.TROOP_TRANSPORT];
        const seaUnits = [UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.SUBMARINE, UnitClass.AIRCRAFT_CARRIER, UnitClass.BATTLESHIP, UnitClass.PATROL_BOAT, UnitClass.MINELAYER];
        const landUnits = [UnitClass.INFANTRY, UnitClass.SPECIAL_FORCES, UnitClass.GROUND_TANK, UnitClass.MISSILE_LAUNCHER, UnitClass.SAM_LAUNCHER];

        let spawnLat: number | null = null;
        let spawnLng: number | null = null;
        let validSites: { position: { lat: number, lng: number } }[] = [];

        if (airUnits.includes(type)) {
            validSites = gameState.units.filter(u => u.factionId === gameState.localPlayerId && u.unitClass === UnitClass.AIRBASE);
        } else if (seaUnits.includes(type)) {
            validSites = gameState.units.filter(u => u.factionId === gameState.localPlayerId && u.unitClass === UnitClass.PORT);
        } else if (landUnits.includes(type)) {
            validSites = [
                ...gameState.pois.filter(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY),
                ...gameState.units.filter(u => u.factionId === gameState.localPlayerId && (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MILITARY_BASE))
            ];
        } else if (type === UnitClass.MOBILE_COMMAND_CENTER) {
            validSites = [
                ...gameState.pois.filter(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY),
                ...gameState.units.filter(u => u.factionId === gameState.localPlayerId && u.unitClass === UnitClass.COMMAND_CENTER)
            ];
        } else {
            validSites = gameState.pois.filter(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY);
        }

        if (validSites.length > 0) {
            const site = validSites[Math.floor(Math.random() * validSites.length)];
            spawnLat = site.position.lat;
            spawnLng = site.position.lng;
        }

        if (spawnLat !== null && spawnLng !== null) {
            const payload: SpawnUnitPayload = {
                unitClass: type,
                lat: spawnLat + (Math.random() - 0.5) * 0.05,
                lng: spawnLng + (Math.random() - 0.5) * 0.05,
                unitId: `UNIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };
            const action = createAction(gameState.localPlayerId, 'SPAWN_UNIT', payload);
            setGameState(prev => applyAction(prev, action));
            NetworkService.broadcastAction(action);
            AudioService.playUiClick();
        } else {
            AudioService.playAlert();
        }
    };

    const handleUnitAction = (actionType: string, unitId: string) => {
        if (actionType.startsWith('DEPLOY')) {
            const unit = gameState.units.find(u => u.id === unitId);
            if (!unit) return;
            let type = UnitClass.INFANTRY;
            if (actionType === 'DEPLOY_TANK') type = UnitClass.GROUND_TANK;
            if (actionType === 'DEPLOY_SPECOPS') type = UnitClass.SPECIAL_FORCES;

            const payload: SpawnUnitPayload = {
                unitClass: type,
                lat: unit.position.lat + (Math.random() - 0.5) * 0.02,
                lng: unit.position.lng + (Math.random() - 0.5) * 0.02,
                unitId: `DEPLOYED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                factionId: gameState.localPlayerId
            };
            const action = createAction(gameState.localPlayerId, 'SPAWN_UNIT', payload);
            setGameState(prev => applyAction(prev, action));
            NetworkService.broadcastAction(action);
            AudioService.playUiClick();
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
            setGameState(prev => applyAction(prev, action));
            NetworkService.broadcastAction(action);
            AudioService.playSuccess();
        }
    };

    const handleAllianceRequest = (targetFactionId: string) => { };
    const setDifficulty = (diff: Difficulty) => { };

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

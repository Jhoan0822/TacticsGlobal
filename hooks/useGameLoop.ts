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
                setGameState(prev => {
                    // CRITICAL FIX: Derive local player resources from the SYNCED FACTION state
                    // The Host sends ITS playerResources, which we must IGNORE.
                    const myFaction = event.gameState.factions.find((f: any) => f.id === prev.localPlayerId);
                    const syncedResources = myFaction ? {
                        gold: myFaction.gold,
                        oil: myFaction.oil || 0,
                        intel: prev.playerResources.intel // Intel is local only for now
                    } : prev.playerResources;

                    return {
                        ...event.gameState,
                        playerResources: syncedResources, // OVERRIDE Host's resources with OURS
                        isClient: prev.isClient,
                        localPlayerId: prev.localPlayerId
                    };
                });
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
                // FREQUENCY INCREASED: Every 10 ticks (300ms) to ensure smooth resource updates
                if (isHost && nextState.gameTick % 10 === 0) {
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
    const startGame = (scenario: Scenario, localPlayerId: string, factions: Faction[], isClient: boolean, initialPois?: POI[]) => {
        console.log('[START GAME]', scenario.id, 'localPlayerId:', localPlayerId, 'isClient:', isClient);

        // Load POIs: Use provided (Client) or Generate (Host/Single)
        let allCities = initialPois || getMockCities();

        // DEBUG: Log POI counts by type
        const cities = allCities.filter(p => p.type === POIType.CITY);
        const oilRigs = allCities.filter(p => p.type === POIType.OIL_RIG);
        const goldMines = allCities.filter(p => p.type === POIType.GOLD_MINE);
        console.log('[START GAME] POI COUNTS:', {
            total: allCities.length,
            cities: cities.length,
            oilRigs: oilRigs.length,
            goldMines: goldMines.length,
            initialPoisProvided: !!initialPois
        });

        // Define initial state object
        const initialState: GameState = {
            units: [],
            pois: allCities,
            factions: factions,
            projectiles: [],
            explosions: [],
            messages: [],
            playerResources: { gold: 10000, oil: 1000, intel: 100 },
            gameMode: 'SELECT_BASE',
            gameTick: 0,
            controlGroups: {},
            territoryControlled: 0,
            difficulty: null as any, // Will be overridden by user selection
            scenario: scenario,
            localPlayerId,
            isClient,
            placementType: null,
            gameResult: null,
            gameStats: {
                unitsKilled: 0,
                unitsLost: 0,
                citiesCaptured: 0,
                goldEarned: 0,
                startTime: Date.now()
            }
        };

        // HOST LOGIC: Assign Cities & Spawn HQs
        if (!isClient) {
            const initialUnits: GameUnit[] = [];

            // Filter by Scenario Bounds
            if (scenario.bounds) {
                const { minLat, maxLat, minLng, maxLng } = scenario.bounds as any;
                allCities = allCities.filter(city =>
                    city.position.lat >= minLat && city.position.lat <= maxLat &&
                    city.position.lng >= minLng && city.position.lng <= maxLng
                );
                initialState.pois = allCities; // Update filtered POIs
            }

            const botFactions = factions.filter(f => f.type === 'BOT');

            // Assign Random City to Bots
            const unassignedCities = [...allCities.filter(p => p.type === POIType.CITY)]; // Only cities

            botFactions.forEach(bot => {
                if (unassignedCities.length > 0) {
                    const randomIndex = Math.floor(Math.random() * unassignedCities.length);
                    const city = unassignedCities.splice(randomIndex, 1)[0];

                    city.ownerFactionId = bot.id;
                    city.tier = 1;

                    // Spawn HQ
                    const hq = spawnUnit(UnitClass.COMMAND_CENTER, city.position.lat, city.position.lng, bot.id);
                    initialUnits.push(hq);

                    // Spawn Guard
                    const guard = spawnUnit(UnitClass.INFANTRY, city.position.lat + 0.01, city.position.lng + 0.01, bot.id);
                    initialUnits.push(guard);

                    console.log('[START GAME] Assigned', city.name, 'to bot', bot.name);
                }
            });

            // CONVERT UNCLAIMED CITIES TO NEUTRAL (after players/bots have selected)
            // Then spawn tier-based defenders for neutral cities
            const allTheCities = allCities.filter(c => c.type === POIType.CITY);

            // Convert undefined/unclaimed to NEUTRAL
            allTheCities.forEach(city => {
                if (!city.ownerFactionId || city.ownerFactionId === 'undefined') {
                    city.ownerFactionId = 'NEUTRAL';
                }
            });

            const ownershipCounts: Record<string, number> = {};
            allTheCities.forEach(c => {
                ownershipCounts[c.ownerFactionId || 'undefined'] = (ownershipCounts[c.ownerFactionId || 'undefined'] || 0) + 1;
            });
            console.log('[START GAME] City ownership breakdown:', ownershipCounts);

            const neutralCities = allTheCities.filter(c => c.ownerFactionId === 'NEUTRAL');
            console.log('[START GAME] Spawning defenders for', neutralCities.length, 'neutral cities');

            // Spawn defenders based on city tier (importance)
            // Tier 1 (capitals): 4 defenders (2 tanks, 2 infantry)
            // Tier 2 (major cities): 2 defenders (1 tank, 1 infantry)
            // Tier 3 (small cities): 1 defender (infantry)
            neutralCities.forEach(city => {
                const tier = city.tier || 3;
                let defenders: UnitClass[] = [];

                if (tier === 1) {
                    // Capital cities: Strong garrison
                    defenders = [UnitClass.GROUND_TANK, UnitClass.GROUND_TANK, UnitClass.INFANTRY, UnitClass.INFANTRY];
                } else if (tier === 2) {
                    // Major cities: Moderate garrison
                    defenders = [UnitClass.GROUND_TANK, UnitClass.INFANTRY];
                } else {
                    // Small cities: Light garrison
                    defenders = [UnitClass.INFANTRY];
                }

                defenders.forEach((unitClass, i) => {
                    const offsetLat = (Math.random() - 0.5) * 0.02;
                    const offsetLng = (Math.random() - 0.5) * 0.02;
                    const defender = spawnUnit(
                        unitClass,
                        city.position.lat + offsetLat,
                        city.position.lng + offsetLng,
                        'NEUTRAL_DEFENDER'
                    );
                    defender.autoMode = 'DEFEND';
                    defender.autoTarget = true;
                    defender.homePosition = { lat: city.position.lat, lng: city.position.lng };
                    initialUnits.push(defender);
                });
            });

            // Update POIs and Units in initial state
            initialState.pois = allCities;
            initialState.units = initialUnits;

            console.log('[START GAME] FINAL COUNTS:', {
                totalPOIs: allCities.length,
                totalUnits: initialUnits.length,
                neutralDefenders: initialUnits.filter(u => u.factionId === 'NEUTRAL_DEFENDER').length
            });

            // BROADCAST START GAME (Host only) - SEND ALL POIs INCLUDING RESOURCES
            if (NetworkService.isHost || (!isClient && NetworkService.myPeerId)) {
                console.log('[START GAME] Broadcasting', allCities.length, 'POIs to clients');
                NetworkService.startGame(scenario.id, factions, allCities);
            }
        }

        setGameState(initialState);

        NetworkService.isHost = !isClient;

        // Set initial camera position
        const myFaction = factions.find(f => f.id === localPlayerId);
        if (myFaction) {
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

    const handleUnitAction = (actionType: string, unitId: string) => {
        console.log('[HANDLE UNIT ACTION]', actionType, unitId);

        // Handle Deployment Actions (Troop Transport / Carrier)
        if (actionType === 'DEPLOY_TANK' || actionType === 'DEPLOY_INFANTRY' || actionType === 'DEPLOY_SPECOPS') {
            const unit = gameState.units.find(u => u.id === unitId);
            if (!unit) return;

            let type = UnitClass.INFANTRY;
            if (actionType === 'DEPLOY_TANK') type = UnitClass.GROUND_TANK;
            if (actionType === 'DEPLOY_SPECOPS') type = UnitClass.SPECIAL_FORCES;

            const cost = UNIT_CONFIG[type].cost;
            const faction = gameState.factions.find(f => f.id === gameState.localPlayerId);

            if (faction && faction.gold >= (cost?.gold || 0) && faction.oil >= (cost?.oil || 0)) {
                // Execute Deployment
                const payload: SpawnUnitPayload = {
                    unitClass: type,
                    lat: unit.position.lat + (Math.random() - 0.5) * 0.02,
                    lng: unit.position.lng + (Math.random() - 0.5) * 0.02,
                    unitId: `DEPLOYED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    factionId: gameState.localPlayerId
                };

                const action = createAction(gameState.localPlayerId, 'SPAWN_UNIT', payload);
                executeAndBroadcast(action);
                AudioService.playUiClick();
            } else {
                console.error('[UNIT ACTION] Insufficient funds');
                AudioService.playError();
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

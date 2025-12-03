import { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, UnitClass, GameUnit, POIType, Difficulty, Scenario, Faction } from '../types';
import { processGameTick, spawnUnit, evaluateAllianceRequest } from '../services/gameLogic';
import { fetchWorldData } from '../services/mockDataService';
import { AudioService } from '../services/audioService';
import { GAME_TICK_MS, UNIT_CONFIG } from '../constants';
import { TerrainService } from '../services/terrainService';
import { NetworkService } from '../services/networkService';

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
        AudioService.playSuccess();
    };

    // Network Sync
    useEffect(() => {
        const unsub = NetworkService.subscribe((event) => {
            if (event.type === 'STATE_UPDATE') {
                setGameState(prev => {
                    if (prev.isClient) {
                        // Preserve local UI state if needed, but for now full sync
                        // We might want to keep 'center' or 'selectedUnitIds' separate (which they are)
                        // But 'gameMode' is in GameState.
                        return { ...event.state, isClient: true, localPlayerId: prev.localPlayerId };
                    }
                    return prev;
                });
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
                // If Client, we don't simulate, we just wait for updates.
                if (prevState.isClient) return prevState;

                if (prevState.gameMode !== 'PLAYING' && prevState.gameMode !== 'PLACING_STRUCTURE') return prevState;

                const nextState = processGameTick(prevState);

                // Broadcast State if Host
                // Optimization: Don't send every tick? Maybe every 2-3 ticks?
                // For LAN/P2P, every tick (40ms) is 25fps, might be heavy.
                // Let's try sending every tick for smoothness first.
                NetworkService.sendState(nextState);

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
    const setDifficulty = (difficulty: Difficulty) => {
        setGameState(prev => ({ ...prev, difficulty }));
        AudioService.playUiClick();
    };

    const handleUnitAction = (action: string, unitId: string) => {
        setGameState(prev => {
            const unit = prev.units.find(u => u.id === unitId);
            if (!unit || unit.factionId !== 'PLAYER') return prev;

            let typeToSpawn: UnitClass | null = null;
            if (action === 'DEPLOY_TANK') typeToSpawn = UnitClass.GROUND_TANK;
            else if (action === 'DEPLOY_SPECOPS') typeToSpawn = UnitClass.SPECIAL_FORCES;
            else if (action === 'DEPLOY_INFANTRY') typeToSpawn = UnitClass.INFANTRY;

            if (typeToSpawn) {
                const cost = UNIT_CONFIG[typeToSpawn].cost;
                if (!cost) return prev;

                if (prev.playerResources.gold >= cost.gold && prev.playerResources.oil >= cost.oil) {
                    const offsetLat = (Math.random() - 0.5) * 0.005;
                    const offsetLng = (Math.random() - 0.5) * 0.005;
                    const newUnit = spawnUnit(typeToSpawn, unit.position.lat + offsetLat, unit.position.lng + offsetLng);
                    AudioService.playSuccess();
                    return {
                        ...prev,
                        playerResources: { ...prev.playerResources, gold: prev.playerResources.gold - cost.gold, oil: prev.playerResources.oil - cost.oil },
                        units: [...prev.units, newUnit]
                    };
                } else {
                    AudioService.playAlert();
                    return prev;
                }
            }
            return prev;
        });
    };

    const handleBuyUnit = (type: UnitClass) => {
        const cost = UNIT_CONFIG[type].cost;
        if (!cost) return;

        setGameState(prev => {
            if (prev.playerResources.gold < cost.gold || prev.playerResources.oil < cost.oil) {
                AudioService.playAlert();
                return prev;
            }

            if (type === UnitClass.AIRBASE || type === UnitClass.PORT || type === UnitClass.MILITARY_BASE) {
                AudioService.playUiClick();
                return { ...prev, gameMode: 'PLACING_STRUCTURE', placementType: type };
            }

            // Auto-spawn logic for non-structures
            let spawnLat: number | null = null;
            let spawnLng: number | null = null;

            const seaUnits = [UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.SUBMARINE, UnitClass.AIRCRAFT_CARRIER, UnitClass.BATTLESHIP, UnitClass.PATROL_BOAT, UnitClass.MINELAYER];
            const isSea = seaUnits.includes(type);

            if (isSea) {
                const validCities = prev.pois.filter(p => p.ownerFactionId === 'PLAYER' && p.type === POIType.CITY && p.isCoastal);
                const validPorts = prev.units.filter(u => u.factionId === 'PLAYER' && u.unitClass === UnitClass.PORT);
                const allSites = [...validCities, ...validPorts];

                if (allSites.length > 0) {
                    const site = allSites[Math.floor(Math.random() * allSites.length)];
                    spawnLat = site.position.lat; spawnLng = site.position.lng;
                }
            } else {
                const validSites = [
                    ...prev.pois.filter(p => p.ownerFactionId === 'PLAYER' && p.type === POIType.CITY),
                    ...prev.units.filter(u => u.factionId === 'PLAYER' && (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MILITARY_BASE || u.unitClass === UnitClass.AIRBASE))
                ];
                if (validSites.length > 0) {
                    const site = validSites[Math.floor(Math.random() * validSites.length)];
                    // @ts-ignore
                    spawnLat = site.position.lat; spawnLng = site.position.lng;
                }
            }

            if (spawnLat !== null && spawnLng !== null) {
                AudioService.playSuccess();
                return {
                    ...prev,
                    playerResources: { ...prev.playerResources, gold: prev.playerResources.gold - cost.gold, oil: prev.playerResources.oil - cost.oil },
                    units: [...prev.units, spawnUnit(type, spawnLat! + (Math.random() - 0.5) * 0.05, spawnLng! + (Math.random() - 0.5) * 0.05)]
                };
            } else {
                alert(isSea ? "Commander, we need a Coastal City or Port!" : "Commander, we need a secure base or city for production!");
                AudioService.playAlert();
                return prev;
            }
        });
    };

    const handleAllianceRequest = (factionId: string) => {
        setGameState(prev => {
            const result = evaluateAllianceRequest(prev, factionId);
            let newFactions = [...prev.factions];
            let newMessages = [...prev.messages];

            if (result.accepted) {
                newFactions = newFactions.map(f => {
                    if (f.id === 'PLAYER') return { ...f, relations: { ...f.relations, [factionId]: 100 } };
                    if (f.id === factionId) return { ...f, relations: { ...f.relations, ['PLAYER']: 100 } };
                    return f;
                });
                newMessages.push({ id: Math.random().toString(), text: `Alliance ACCEPTED by ${newFactions.find(f => f.id === factionId)?.name}`, type: 'success', timestamp: Date.now() });
                AudioService.playSuccess();
            } else {
                newMessages.push({ id: Math.random().toString(), text: `Alliance REJECTED: ${result.reason}`, type: 'alert', timestamp: Date.now() });
                AudioService.playAlert();
            }
            return { ...prev, factions: newFactions, messages: newMessages };
        });
    };

    const handlePoiClick = (poiId: string) => {
        setGameState(prev => {
            if (prev.gameMode === 'SELECT_BASE') {
                const poi = prev.pois.find(p => p.id === poiId);
                if (poi && poi.type === POIType.CITY) {
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
                    const updatedPois = prev.pois.map(p => {
                        if (p.id === poiId) return { ...p, ownerFactionId: 'PLAYER', tier: 1 };
                        return p;
                    });

                    setCenter({ lat: poi.position.lat, lng: poi.position.lng });
                    setSelectedUnitIds([hq.id]);
                    AudioService.playSuccess();

                    return {
                        ...prev,
                        units: [hq, ...prev.units],
                        pois: updatedPois,
                        gameMode: 'PLAYING'
                    };
                }
            }
            return prev;
        });
    };

    const handleMapClick = (lat: number, lng: number) => {
        setGameState(prev => {
            if (prev.gameMode === 'PLACING_STRUCTURE') {
                if (!prev.placementType) return prev;

                const type = prev.placementType;
                const cost = UNIT_CONFIG[type].cost;
                if (!cost) return prev;

                if (!TerrainService.isValidPlacement(type, lat, lng, prev.pois)) {
                    alert("Invalid Terrain! Ports must be near coast, Airbases on land.");
                    AudioService.playAlert();
                    return prev;
                }

                const newUnit = spawnUnit(type, lat, lng);
                AudioService.playSuccess();
                return {
                    ...prev,
                    playerResources: { ...prev.playerResources, gold: prev.playerResources.gold - cost.gold, oil: prev.playerResources.oil - cost.oil },
                    units: [...prev.units, newUnit],
                    gameMode: 'PLAYING',
                    placementType: null
                };
            } else if (prev.gameMode === 'PLAYING') {
                setSelectedUnitIds([]);
                return prev;
            }
            return prev;
        });
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
        setDifficulty,
        startGame
    };
};

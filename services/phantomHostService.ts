/**
 * PhantomHostService - Headless host that keeps Battle Royale rooms alive
 * 
 * This service acts as an invisible host for P2P connections, maintaining
 * the game room even when no real players are connected. It runs the game
 * simulation with bots and handles player connections/disconnections.
 */

import Peer, { DataConnection } from 'peerjs';
import { GameState, Faction, POI, UnitClass, BattleRoyaleState, BattleRoyaleConfig, POIType, Difficulty } from '../types';
import { FACTION_PRESETS, SCENARIOS, UNIT_CONFIG } from '../constants';
import { processGameTick } from './gameLogic';
import { getMockCities } from './mockDataService';

// Fixed room ID for global Battle Royale - everyone joins the same room
const FIXED_ROOM_ID = 'TACTIC-OPS-BR-GLOBAL';
const STORAGE_KEY = 'TACTIC_OPS_BR_STATE';

const DEFAULT_BR_CONFIG: BattleRoyaleConfig = {
    maxPlayers: 20,
    minBots: 2,
    roundDurationMs: 300000, // 5 minutes
    isPermanent: true,
    scenarioRotation: ['WORLD', 'EUROPE', 'ASIA', 'NORTH_AMERICA', 'SOUTH_AMERICA', 'AFRICA']
};

class PhantomHostServiceImpl {
    private phantomPeer: Peer | null = null;
    private connections: DataConnection[] = [];
    private gameState: GameState | null = null;
    private brState: BattleRoyaleState | null = null;
    private gameLoopInterval: NodeJS.Timeout | null = null;
    private isActive: boolean = false;
    private roomId: string = FIXED_ROOM_ID;
    private saveInterval: NodeJS.Timeout | null = null;

    // ============================================
    // INITIALIZATION
    // ============================================

    /**
     * Initialize the phantom host with a fixed room ID
     * Uses localStorage to persist state across page loads
     */
    async initialize(roomId?: string): Promise<string> {
        if (this.isActive) {
            console.log('[PHANTOM] Already active, returning existing room:', this.roomId);
            return this.roomId;
        }

        this.roomId = FIXED_ROOM_ID; // Always use fixed room ID

        // Try to restore state from localStorage
        const restored = this.restoreState();

        return new Promise((resolve, reject) => {
            // Create phantom peer with fixed ID
            this.phantomPeer = new Peer(this.roomId, { debug: 0 });

            this.phantomPeer.on('open', (id) => {
                console.log('[PHANTOM] Phantom host initialized with ID:', id);
                this.isActive = true;

                if (!restored) {
                    // Only create new state if we couldn't restore
                    this.initializeBattleRoyaleState();
                } else {
                    console.log('[PHANTOM] Restored existing game state from storage');
                }

                this.startGameLoop();
                this.startAutoSave();
                resolve(id);
            });

            this.phantomPeer.on('connection', (conn) => {
                console.log('[PHANTOM] Player connecting:', conn.peer);
                this.handlePlayerConnection(conn);
            });

            this.phantomPeer.on('error', (err) => {
                console.error('[PHANTOM] Peer error:', err);
                // If ID is taken, another tab is hosting - we just use local state
                if ((err as any).type === 'unavailable-id') {
                    console.log('[PHANTOM] Room already exists, using local state');
                    this.isActive = true;
                    if (!restored) {
                        this.initializeBattleRoyaleState();
                    }
                    this.startGameLoop();
                    this.startAutoSave();
                    resolve(this.roomId);
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Save state to localStorage for persistence
     */
    private saveState(): void {
        if (!this.gameState || !this.brState) return;

        try {
            const state = {
                gameState: this.gameState,
                brState: this.brState,
                savedAt: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[PHANTOM] Failed to save state:', e);
        }
    }

    /**
     * Restore state from localStorage
     */
    private restoreState(): boolean {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return false;

            const state = JSON.parse(saved);

            // Check if state is too old (more than 10 minutes)
            const age = Date.now() - state.savedAt;
            if (age > 10 * 60 * 1000) {
                console.log('[PHANTOM] Saved state too old, starting fresh');
                localStorage.removeItem(STORAGE_KEY);
                return false;
            }

            this.gameState = state.gameState;
            this.brState = state.brState;

            // Update round time based on elapsed time
            if (this.brState) {
                const elapsed = Date.now() - this.brState.roundStartTime;
                if (elapsed >= this.brState.config.roundDurationMs) {
                    // Round should have ended, start a new one
                    this.brState.roundNumber++;
                    this.brState.currentScenarioIndex =
                        (this.brState.currentScenarioIndex + 1) % this.brState.config.scenarioRotation.length;
                    this.brState.roundStartTime = Date.now();
                }
            }

            console.log('[PHANTOM] Restored state from', Math.round(age / 1000), 'seconds ago');
            return true;
        } catch (e) {
            console.warn('[PHANTOM] Failed to restore state:', e);
            return false;
        }
    }

    /**
     * Start auto-saving state every 5 seconds
     */
    private startAutoSave(): void {
        if (this.saveInterval) clearInterval(this.saveInterval);
        this.saveInterval = setInterval(() => this.saveState(), 5000);
    }

    /**
     * Initialize Battle Royale state with default configuration
     */
    private initializeBattleRoyaleState(): void {
        this.brState = {
            roomId: this.roomId,
            config: { ...DEFAULT_BR_CONFIG },
            players: [],
            roundStartTime: Date.now(),
            roundNumber: 1,
            currentScenarioIndex: 0,
            isRoundActive: true
        };

        // Initialize game state with current scenario and bots
        this.initializeGameState();
    }

    /**
     * Initialize game state for current round with scenario rotation
     */
    private initializeGameState(): void {
        if (!this.brState) return;

        const scenarioId = this.brState.config.scenarioRotation[this.brState.currentScenarioIndex];
        const scenario = SCENARIOS[scenarioId as keyof typeof SCENARIOS] || SCENARIOS.WORLD;

        // Get cities for this scenario
        let cities = getMockCities();
        if (scenario.bounds) {
            cities = cities.filter(city =>
                city.position.lat >= scenario.bounds.minLat &&
                city.position.lat <= scenario.bounds.maxLat &&
                city.position.lng >= scenario.bounds.minLng &&
                city.position.lng <= scenario.bounds.maxLng
            );
        }

        // Reset city ownership
        cities.forEach(city => {
            if (city.type === POIType.CITY) {
                city.ownerFactionId = undefined as any;
            }
        });

        // Create bot factions
        const botFactions: Faction[] = [];
        for (let i = 0; i < this.brState.config.minBots; i++) {
            const preset = FACTION_PRESETS[i % FACTION_PRESETS.length];
            botFactions.push({
                id: `BOT_${i}`,
                name: preset.name,
                color: preset.color,
                type: 'BOT',
                gold: 10000,
                oil: 1000,
                relations: {},
                aggression: 1.0
            });
        }

        // Assign random cities to bots
        const shuffledCities = [...cities.filter(c => c.type === POIType.CITY)]
            .sort(() => Math.random() - 0.5);

        const units: any[] = [];
        botFactions.forEach((bot, idx) => {
            if (idx < shuffledCities.length) {
                const city = shuffledCities[idx];
                city.ownerFactionId = bot.id;
                city.tier = 1;

                // Spawn HQ for bot
                units.push({
                    id: `HQ-${bot.id}-${Date.now()}`,
                    unitClass: UnitClass.COMMAND_CENTER,
                    factionId: bot.id,
                    position: { lat: city.position.lat, lng: city.position.lng },
                    heading: 0,
                    hp: UNIT_CONFIG[UnitClass.COMMAND_CENTER].hp,
                    maxHp: UNIT_CONFIG[UnitClass.COMMAND_CENTER].maxHp,
                    attack: UNIT_CONFIG[UnitClass.COMMAND_CENTER].attack,
                    range: UNIT_CONFIG[UnitClass.COMMAND_CENTER].range,
                    speed: 0,
                    vision: UNIT_CONFIG[UnitClass.COMMAND_CENTER].vision
                });

                // Spawn infantry for bot
                for (let inf = 0; inf < 3; inf++) {
                    units.push({
                        id: `INF-${bot.id}-${inf}-${Date.now()}`,
                        unitClass: UnitClass.INFANTRY,
                        factionId: bot.id,
                        position: {
                            lat: city.position.lat + (Math.random() - 0.5) * 0.03,
                            lng: city.position.lng + (Math.random() - 0.5) * 0.03
                        },
                        heading: Math.random() * 360,
                        hp: UNIT_CONFIG[UnitClass.INFANTRY].hp,
                        maxHp: UNIT_CONFIG[UnitClass.INFANTRY].maxHp,
                        attack: UNIT_CONFIG[UnitClass.INFANTRY].attack,
                        range: UNIT_CONFIG[UnitClass.INFANTRY].range,
                        speed: UNIT_CONFIG[UnitClass.INFANTRY].speed,
                        vision: UNIT_CONFIG[UnitClass.INFANTRY].vision,
                        canCapture: true
                    });
                }
            }

            // Add phantom host as a "player" to track it
            this.brState!.players.push({
                peerId: this.roomId,
                factionId: 'PHANTOM',
                joinTime: Date.now(),
                isBot: false,
                isPhantomHost: true
            });

            // Add bots to player list
            this.brState!.players.push({
                peerId: `BOT_${idx}`,
                factionId: bot.id,
                joinTime: Date.now(),
                isBot: true,
                isPhantomHost: false
            });
        });

        // Mark remaining cities as NEUTRAL
        cities.forEach(city => {
            if (city.type === POIType.CITY && !city.ownerFactionId) {
                city.ownerFactionId = 'NEUTRAL';
            }
        });

        this.gameState = {
            factions: botFactions,
            units,
            pois: cities,
            projectiles: [],
            explosions: [],
            playerResources: { gold: 0, oil: 0, intel: 0 },
            controlGroups: {},
            territoryControlled: 0,
            gameTick: 0,
            gameMode: 'PLAYING',
            messages: [],
            difficulty: Difficulty.MEDIUM,
            scenario,
            localPlayerId: 'PHANTOM', // Phantom is running the simulation
            stateVersion: 0,
            hostTick: 0,
            nukesInFlight: []
        };

        console.log('[PHANTOM] Game initialized with', botFactions.length, 'bots on scenario:', scenarioId);
    }

    // ============================================
    // GAME LOOP
    // ============================================

    private startGameLoop(): void {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
        }

        const TICK_MS = 40; // 25 FPS

        this.gameLoopInterval = setInterval(() => {
            if (!this.gameState || !this.brState?.isRoundActive) return;

            // Run game simulation
            this.gameState = processGameTick(this.gameState, [], true);

            // Check round timer
            const elapsed = Date.now() - this.brState.roundStartTime;
            if (elapsed >= this.brState.config.roundDurationMs) {
                this.endRound();
            }

            // Check instant win (only 1 faction left with units)
            const activeFactions = this.gameState.factions.filter(f =>
                this.gameState!.units.some(u => u.factionId === f.id)
            );
            if (activeFactions.length === 1) {
                this.endRound(activeFactions[0].id, 'ELIMINATION');
            }

            // Broadcast state to all connected players
            if (this.gameState.gameTick % 5 === 0) {
                this.broadcastGameState();
            }
        }, TICK_MS);
    }

    private endRound(winnerId?: string, reason?: string): void {
        if (!this.brState || !this.gameState) return;

        // Calculate winner if not instant win
        if (!winnerId) {
            const scores = this.gameState.factions.map(f => {
                const cities = this.gameState!.pois.filter(
                    p => p.type === POIType.CITY && p.ownerFactionId === f.id
                ).length;
                return {
                    factionId: f.id,
                    score: cities * 1000 + f.gold + f.oil
                };
            }).sort((a, b) => b.score - a.score);

            winnerId = scores[0]?.factionId || 'NONE';
            reason = 'SCORE';
        }

        this.brState.isRoundActive = false;
        this.brState.lastWinner = winnerId;

        console.log('[PHANTOM] Round ended. Winner:', winnerId, 'Reason:', reason);

        // Broadcast round end
        this.broadcastMessage({
            type: 'BR_ROUND_END',
            winnerId,
            reason: reason || 'SCORE',
            score: 0
        });

        // Start next round after 10 seconds
        setTimeout(() => this.startNextRound(), 10000);
    }

    private startNextRound(): void {
        if (!this.brState) return;

        this.brState.roundNumber++;
        this.brState.currentScenarioIndex =
            (this.brState.currentScenarioIndex + 1) % this.brState.config.scenarioRotation.length;
        this.brState.roundStartTime = Date.now();
        this.brState.isRoundActive = true;

        // Reinitialize game with new scenario
        this.initializeGameState();

        // Broadcast new round
        this.broadcastMessage({
            type: 'BR_NEW_ROUND',
            startTime: this.brState.roundStartTime,
            scenarioId: this.brState.config.scenarioRotation[this.brState.currentScenarioIndex]
        });

        console.log('[PHANTOM] New round started. Round:', this.brState.roundNumber,
            'Scenario:', this.brState.config.scenarioRotation[this.brState.currentScenarioIndex]);
    }

    // ============================================
    // CONNECTION HANDLING
    // ============================================

    private handlePlayerConnection(conn: DataConnection): void {
        this.connections.push(conn);

        conn.on('open', () => {
            console.log('[PHANTOM] Player connected:', conn.peer);

            // Send join options
            if (this.gameState && this.brState) {
                const botFactions = this.gameState.factions.filter(f => f.type === 'BOT');
                const availableCities = this.gameState.pois.filter(
                    p => p.type === POIType.CITY &&
                        (p.ownerFactionId === 'NEUTRAL' ||
                            botFactions.some(b => b.id === p.ownerFactionId))
                );

                conn.send({
                    type: 'BR_JOIN_OPTIONS',
                    bots: botFactions,
                    cities: availableCities,
                    brState: this.brState,
                    gameState: this.gameState
                });
            }
        });

        conn.on('data', (data: any) => {
            this.handleMessage(data, conn);
        });

        conn.on('close', () => {
            console.log('[PHANTOM] Player disconnected:', conn.peer);
            this.connections = this.connections.filter(c => c !== conn);
            this.handlePlayerDisconnect(conn.peer);
        });
    }

    private handleMessage(msg: any, conn: DataConnection): void {
        if (msg.type === 'BR_JOIN_REQUEST') {
            this.handleJoinRequest(msg, conn);
        } else if (msg.type === 'ACTION') {
            // Apply player action to game state
            // (Handled by game loop)
        }
    }

    private handleJoinRequest(msg: any, conn: DataConnection): void {
        if (!this.gameState || !this.brState) return;

        const { option, targetCityId, botFactionId } = msg;

        if (option === 'TAKEOVER_BOT' && botFactionId) {
            // Player takes over a bot faction
            const botFaction = this.gameState.factions.find(f => f.id === botFactionId && f.type === 'BOT');
            if (botFaction) {
                // Convert bot to player
                botFaction.type = 'PLAYER';
                botFaction.id = conn.peer; // Use player's peer ID

                // Update all units
                this.gameState.units.forEach(u => {
                    if (u.factionId === botFactionId) {
                        u.factionId = conn.peer;
                    }
                });

                // Update cities
                this.gameState.pois.forEach(p => {
                    if (p.ownerFactionId === botFactionId) {
                        p.ownerFactionId = conn.peer;
                    }
                });

                // Update BR player list
                const botPlayer = this.brState!.players.find(p => p.factionId === botFactionId);
                if (botPlayer) {
                    botPlayer.peerId = conn.peer;
                    botPlayer.factionId = conn.peer;
                    botPlayer.isBot = false;
                    botPlayer.replacedBotId = botFactionId;
                }

                console.log('[PHANTOM] Player', conn.peer, 'took over bot', botFactionId);

                // Broadcast the takeover
                this.broadcastMessage({
                    type: 'BR_PLAYER_JOINED',
                    factionId: conn.peer,
                    peerId: conn.peer,
                    tookOverBot: true
                });

                // Send full state to the new player
                conn.send({
                    type: 'FULL_STATE',
                    gameState: this.gameState,
                    timestamp: Date.now()
                });
            }
        } else if (option === 'NEW_FACTION' && targetCityId) {
            // Player starts new faction at a city
            const city = this.gameState.pois.find(p => p.id === targetCityId);
            if (city && (city.ownerFactionId === 'NEUTRAL' || this.gameState.factions.find(
                f => f.id === city.ownerFactionId && f.type === 'BOT'
            ))) {
                // Create new player faction
                const playerCount = this.brState!.players.filter(p => !p.isBot && !p.isPhantomHost).length;
                const preset = FACTION_PRESETS[playerCount % FACTION_PRESETS.length];

                const newFaction: Faction = {
                    id: conn.peer,
                    name: preset.name,
                    color: preset.color,
                    type: 'PLAYER',
                    gold: 10000,
                    oil: 1000,
                    relations: {},
                    aggression: 0
                };

                this.gameState.factions.push(newFaction);

                // Claim the city
                city.ownerFactionId = conn.peer;
                city.tier = 1;

                // Spawn starting units
                this.gameState.units.push({
                    id: `HQ-${conn.peer}-${Date.now()}`,
                    unitClass: UnitClass.COMMAND_CENTER,
                    factionId: conn.peer,
                    position: { lat: city.position.lat, lng: city.position.lng },
                    heading: 0,
                    hp: UNIT_CONFIG[UnitClass.COMMAND_CENTER].hp,
                    maxHp: UNIT_CONFIG[UnitClass.COMMAND_CENTER].maxHp,
                    attack: UNIT_CONFIG[UnitClass.COMMAND_CENTER].attack,
                    range: UNIT_CONFIG[UnitClass.COMMAND_CENTER].range,
                    speed: 0,
                    vision: UNIT_CONFIG[UnitClass.COMMAND_CENTER].vision
                });

                // Add to BR players
                this.brState!.players.push({
                    peerId: conn.peer,
                    factionId: conn.peer,
                    joinTime: Date.now(),
                    isBot: false,
                    isPhantomHost: false
                });

                console.log('[PHANTOM] Player', conn.peer, 'started new faction at city', city.name);

                // Broadcast
                this.broadcastMessage({
                    type: 'BR_PLAYER_JOINED',
                    factionId: conn.peer,
                    peerId: conn.peer,
                    tookOverBot: false
                });

                // Send full state
                conn.send({
                    type: 'FULL_STATE',
                    gameState: this.gameState,
                    timestamp: Date.now()
                });
            }
        }
    }

    private handlePlayerDisconnect(peerId: string): void {
        if (!this.gameState || !this.brState) return;

        // Find the player's faction
        const player = this.brState.players.find(p => p.peerId === peerId && !p.isPhantomHost);
        if (!player) return;

        // Convert player faction back to bot
        const faction = this.gameState.factions.find(f => f.id === player.factionId);
        if (faction) {
            faction.type = 'BOT';
            faction.aggression = 1.0;
        }

        // Update BR player
        player.isBot = true;
        player.peerId = `BOT_${Date.now()}`;

        console.log('[PHANTOM] Player disconnected, converted to bot:', player.factionId);

        // Ensure minimum bots
        this.ensureMinimumBots();
    }

    private ensureMinimumBots(): void {
        if (!this.brState || !this.gameState) return;

        const botCount = this.brState.players.filter(p => p.isBot).length;
        if (botCount < this.brState.config.minBots) {
            // Add more bots
            const needed = this.brState.config.minBots - botCount;
            for (let i = 0; i < needed; i++) {
                const idx = this.gameState.factions.length;
                const preset = FACTION_PRESETS[idx % FACTION_PRESETS.length];

                const newBot: Faction = {
                    id: `BOT_NEW_${Date.now()}_${i}`,
                    name: preset.name,
                    color: preset.color,
                    type: 'BOT',
                    gold: 10000,
                    oil: 1000,
                    relations: {},
                    aggression: 1.0
                };

                this.gameState.factions.push(newBot);
                this.brState.players.push({
                    peerId: newBot.id,
                    factionId: newBot.id,
                    joinTime: Date.now(),
                    isBot: true,
                    isPhantomHost: false
                });

                // Assign unclaimed city
                const unclaimedCity = this.gameState.pois.find(
                    p => p.type === POIType.CITY && p.ownerFactionId === 'NEUTRAL'
                );
                if (unclaimedCity) {
                    unclaimedCity.ownerFactionId = newBot.id;
                    unclaimedCity.tier = 1;

                    // Spawn units
                    this.gameState.units.push({
                        id: `HQ-${newBot.id}-${Date.now()}`,
                        unitClass: UnitClass.COMMAND_CENTER,
                        factionId: newBot.id,
                        position: { lat: unclaimedCity.position.lat, lng: unclaimedCity.position.lng },
                        heading: 0,
                        hp: UNIT_CONFIG[UnitClass.COMMAND_CENTER].hp,
                        maxHp: UNIT_CONFIG[UnitClass.COMMAND_CENTER].maxHp,
                        attack: UNIT_CONFIG[UnitClass.COMMAND_CENTER].attack,
                        range: UNIT_CONFIG[UnitClass.COMMAND_CENTER].range,
                        speed: 0,
                        vision: UNIT_CONFIG[UnitClass.COMMAND_CENTER].vision
                    });
                }

                console.log('[PHANTOM] Added new bot:', newBot.id);
            }
        }
    }

    // ============================================
    // BROADCASTING
    // ============================================

    private broadcastGameState(): void {
        if (!this.gameState) return;

        const msg = {
            type: 'FULL_STATE',
            gameState: this.gameState,
            timestamp: Date.now()
        };

        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    private broadcastMessage(msg: any): void {
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    // ============================================
    // PUBLIC API
    // ============================================

    getRoomId(): string {
        return this.roomId;
    }

    isRunning(): boolean {
        return this.isActive;
    }

    getBRState(): BattleRoyaleState | null {
        return this.brState;
    }

    getGameState(): GameState | null {
        return this.gameState;
    }

    shutdown(): void {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }

        this.connections.forEach(conn => conn.close());
        this.connections = [];

        if (this.phantomPeer) {
            this.phantomPeer.destroy();
            this.phantomPeer = null;
        }

        this.isActive = false;
        this.gameState = null;
        this.brState = null;

        console.log('[PHANTOM] Shutdown complete');
    }
}

export const PhantomHostService = new PhantomHostServiceImpl();

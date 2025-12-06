/**
 * BattleRoyaleService - Client-side service for Battle Royale mode
 * 
 * Handles connecting to Battle Royale rooms, managing join options,
 * and tracking round state on the client side.
 */

import { GameState, Faction, POI, POIType, BattleRoyaleState, Scenario, UnitClass } from '../types';
import { SCENARIOS, FACTION_PRESETS, UNIT_CONFIG } from '../constants';
import { PhantomHostService } from './phantomHostService';

// Callback for when player successfully joins
type OnJoinSuccessCallback = (gameState: GameState, factionId: string) => void;

class BattleRoyaleServiceImpl {
    private state: BattleRoyaleState | null = null;
    private joinOptions: { bots: Faction[]; cities: POI[] } | null = null;
    private onJoinOptionsReceived: ((options: { bots: Faction[]; cities: POI[] }) => void) | null = null;
    private onRoundEnd: ((winnerId: string, reason: string) => void) | null = null;
    private onNewRound: ((scenarioId: string) => void) | null = null;
    private onJoinSuccess: OnJoinSuccessCallback | null = null;

    // ============================================
    // STATE MANAGEMENT
    // ============================================

    setState(state: BattleRoyaleState): void {
        this.state = state;
    }

    getState(): BattleRoyaleState | null {
        return this.state;
    }

    setJoinOptions(options: { bots: Faction[]; cities: POI[] }): void {
        this.joinOptions = options;
        if (this.onJoinOptionsReceived) {
            this.onJoinOptionsReceived(options);
        }
    }

    getJoinOptions(): { bots: Faction[]; cities: POI[] } | null {
        return this.joinOptions;
    }

    // ============================================
    // SCENARIO ROTATION
    // ============================================

    getCurrentScenario(): Scenario | null {
        if (!this.state) return null;
        const idx = this.state.currentScenarioIndex % this.state.config.scenarioRotation.length;
        const scenarioId = this.state.config.scenarioRotation[idx];
        return SCENARIOS[scenarioId as keyof typeof SCENARIOS] || SCENARIOS.WORLD;
    }

    getRoundTimeRemaining(): number {
        if (!this.state || !this.state.isRoundActive) return 0;
        const elapsed = Date.now() - this.state.roundStartTime;
        return Math.max(0, this.state.config.roundDurationMs - elapsed);
    }

    // ============================================
    // WIN CONDITION CALCULATION (for UI display)
    // ============================================

    calculateScores(gameState: GameState): Array<{ factionId: string; name: string; score: number; cities: number; gold: number; oil: number }> {
        return gameState.factions
            .filter(f => f.type === 'PLAYER' || f.type === 'BOT')
            .map(f => {
                const cities = gameState.pois.filter(
                    p => p.type === POIType.CITY && p.ownerFactionId === f.id
                ).length;
                return {
                    factionId: f.id,
                    name: f.name,
                    score: cities * 1000 + f.gold + f.oil,
                    cities,
                    gold: f.gold,
                    oil: f.oil
                };
            })
            .sort((a, b) => b.score - a.score);
    }

    // ============================================
    // JOIN ACTIONS (Local - same browser as PhantomHost)
    // ============================================

    /**
     * Set callback for when join succeeds
     */
    onJoinSuccessCallback(callback: OnJoinSuccessCallback): void {
        this.onJoinSuccess = callback;
    }

    /**
     * Join Battle Royale by taking over a bot faction (LOCAL)
     * Uses immutable updates to prevent React rendering issues
     */
    requestTakeoverBot(botFactionId: string): boolean {
        const gameState = PhantomHostService.getGameState();
        const brState = PhantomHostService.getBRState();

        if (!gameState || !brState) {
            console.error('[BR] Cannot join - no game state');
            return false;
        }

        // Find the bot faction
        const botFaction = gameState.factions.find(f => f.id === botFactionId && f.type === 'BOT');
        if (!botFaction) {
            console.error('[BR] Bot faction not found:', botFactionId);
            return false;
        }

        // Generate unique player ID with random component to prevent collisions on rapid joins
        const playerId = 'PLAYER_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
        const oldId = botFaction.id;

        // IMMUTABLE UPDATES - don't mutate original objects!
        // Update factions array
        const newFactions = gameState.factions.map(f =>
            f.id === botFactionId
                ? { ...f, type: 'PLAYER' as const, id: playerId }
                : f
        );
        gameState.factions = newFactions;

        // Update all units owned by bot (immutable)
        const newUnits = gameState.units.map(u =>
            u.factionId === oldId
                ? { ...u, factionId: playerId }
                : u
        );
        gameState.units = newUnits;

        // Update cities owned by bot (immutable)
        const newPois = gameState.pois.map(p =>
            p.ownerFactionId === oldId
                ? { ...p, ownerFactionId: playerId }
                : p
        );
        gameState.pois = newPois;

        // Update BR state (immutable)
        const newPlayers = brState.players.map(p =>
            p.factionId === oldId
                ? { ...p, peerId: playerId, factionId: playerId, isBot: false, replacedBotId: oldId }
                : p
        );
        brState.players = newPlayers;

        console.log('[BR] Player took over bot:', oldId, '-> new ID:', playerId);

        // Update local player ID in game state
        gameState.localPlayerId = playerId;

        // Trigger callback
        if (this.onJoinSuccess) {
            this.onJoinSuccess(gameState, playerId);
        }

        return true;
    }

    /**
     * Join Battle Royale with a new faction at a specific city (LOCAL)
     * Uses immutable updates to prevent React rendering issues
     */
    requestNewFaction(targetCityId: string): boolean {
        const gameState = PhantomHostService.getGameState();
        const brState = PhantomHostService.getBRState();

        if (!gameState || !brState) {
            console.error('[BR] Cannot join - no game state');
            return false;
        }

        // Find target city
        const city = gameState.pois.find(p => p.id === targetCityId);
        if (!city) {
            console.error('[BR] City not found:', targetCityId);
            return false;
        }

        // Generate unique player ID with random component
        const playerId = 'PLAYER_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);

        // Find a faction preset that's not already used
        const usedColors = gameState.factions.map(f => f.color);
        let preset = FACTION_PRESETS.find(p => !usedColors.includes(p.color));

        // If all colors used, cycle through
        if (!preset) {
            const idx = gameState.factions.length % FACTION_PRESETS.length;
            preset = FACTION_PRESETS[idx];
        }

        const newFaction: Faction = {
            id: playerId,
            name: preset.name,
            color: preset.color,
            type: 'PLAYER',
            gold: 10000,
            oil: 1000,
            relations: {},
            aggression: 0
        };

        // IMMUTABLE UPDATES
        gameState.factions = [...gameState.factions, newFaction];

        // Claim city (immutable)
        gameState.pois = gameState.pois.map(p =>
            p.id === targetCityId
                ? { ...p, ownerFactionId: playerId, tier: 1 }
                : p
        );

        // Spawn HQ (immutable)
        const hqUnit = {
            id: `HQ-${playerId}-${Date.now()}`,
            unitClass: UnitClass.COMMAND_CENTER,
            factionId: playerId,
            position: { lat: city.position.lat, lng: city.position.lng },
            heading: 0,
            hp: UNIT_CONFIG[UnitClass.COMMAND_CENTER].hp,
            maxHp: UNIT_CONFIG[UnitClass.COMMAND_CENTER].maxHp,
            attack: UNIT_CONFIG[UnitClass.COMMAND_CENTER].attack,
            range: UNIT_CONFIG[UnitClass.COMMAND_CENTER].range,
            speed: 0,
            vision: UNIT_CONFIG[UnitClass.COMMAND_CENTER].vision
        } as any;
        gameState.units = [...gameState.units, hqUnit];

        // Add to BR players (immutable)
        brState.players = [...brState.players, {
            peerId: playerId,
            factionId: playerId,
            joinTime: Date.now(),
            isBot: false,
            isPhantomHost: false
        }];

        console.log('[BR] Player started new faction at:', city.name, 'ID:', playerId);

        // Update local player ID
        gameState.localPlayerId = playerId;

        // Trigger callback
        if (this.onJoinSuccess) {
            this.onJoinSuccess(gameState, playerId);
        }

        return true;
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    onJoinOptions(callback: (options: { bots: Faction[]; cities: POI[] }) => void): void {
        this.onJoinOptionsReceived = callback;
    }

    onRoundEnded(callback: (winnerId: string, reason: string) => void): void {
        this.onRoundEnd = callback;
    }

    onNewRoundStarted(callback: (scenarioId: string) => void): void {
        this.onNewRound = callback;
    }

    handleRoundEnd(winnerId: string, reason: string): void {
        if (this.state) {
            this.state.isRoundActive = false;
            this.state.lastWinner = winnerId;
        }
        if (this.onRoundEnd) {
            this.onRoundEnd(winnerId, reason);
        }
    }

    handleNewRound(startTime: number, scenarioId: string): void {
        if (this.state) {
            this.state.roundNumber++;
            this.state.roundStartTime = startTime;
            this.state.isRoundActive = true;
            const scenarioIndex = this.state.config.scenarioRotation.indexOf(scenarioId);
            if (scenarioIndex >= 0) {
                this.state.currentScenarioIndex = scenarioIndex;
            }
        }
        if (this.onNewRound) {
            this.onNewRound(scenarioId);
        }
    }

    // ============================================
    // HELPERS
    // ============================================

    getAvailableBots(): Faction[] {
        return this.joinOptions?.bots || [];
    }

    getAvailableCities(): POI[] {
        return this.joinOptions?.cities || [];
    }

    isRoundActive(): boolean {
        return this.state?.isRoundActive ?? false;
    }

    getRoundNumber(): number {
        return this.state?.roundNumber ?? 0;
    }

    getPlayerCount(): number {
        if (!this.state) return 0;
        return this.state.players.filter(p => !p.isBot && !p.isPhantomHost).length;
    }

    reset(): void {
        this.state = null;
        this.joinOptions = null;
        this.onJoinOptionsReceived = null;
        this.onRoundEnd = null;
        this.onNewRound = null;
    }
}

export const BattleRoyaleService = new BattleRoyaleServiceImpl();

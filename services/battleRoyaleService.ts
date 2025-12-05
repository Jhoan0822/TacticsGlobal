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

        // Generate player ID
        const playerId = 'PLAYER_' + Date.now().toString(36);

        // Convert bot to player
        botFaction.type = 'PLAYER';
        const oldId = botFaction.id;
        botFaction.id = playerId;

        // Update all units owned by bot
        gameState.units.forEach(u => {
            if (u.factionId === oldId) {
                u.factionId = playerId;
            }
        });

        // Update cities owned by bot
        gameState.pois.forEach(p => {
            if (p.ownerFactionId === oldId) {
                p.ownerFactionId = playerId;
            }
        });

        // Update BR state
        const botPlayer = brState.players.find(p => p.factionId === oldId);
        if (botPlayer) {
            botPlayer.peerId = playerId;
            botPlayer.factionId = playerId;
            botPlayer.isBot = false;
            botPlayer.replacedBotId = oldId;
        }

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

        // Generate player ID and create faction
        const playerId = 'PLAYER_' + Date.now().toString(36);
        const playerCount = brState.players.filter(p => !p.isBot && !p.isPhantomHost).length;
        const preset = FACTION_PRESETS[playerCount % FACTION_PRESETS.length];

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

        gameState.factions.push(newFaction);

        // Claim city
        city.ownerFactionId = playerId;
        city.tier = 1;

        // Spawn HQ
        gameState.units.push({
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
        } as any);

        // Add to BR players
        brState.players.push({
            peerId: playerId,
            factionId: playerId,
            joinTime: Date.now(),
            isBot: false,
            isPhantomHost: false
        });

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

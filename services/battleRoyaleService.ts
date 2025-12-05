/**
 * BattleRoyaleService - Client-side service for Battle Royale mode
 * 
 * Handles connecting to Battle Royale rooms, managing join options,
 * and tracking round state on the client side.
 */

import { GameState, Faction, POI, POIType, BattleRoyaleState, Scenario } from '../types';
import { SCENARIOS } from '../constants';
import { NetworkService } from './networkService';

class BattleRoyaleServiceImpl {
    private state: BattleRoyaleState | null = null;
    private joinOptions: { bots: Faction[]; cities: POI[] } | null = null;
    private onJoinOptionsReceived: ((options: { bots: Faction[]; cities: POI[] }) => void) | null = null;
    private onRoundEnd: ((winnerId: string, reason: string) => void) | null = null;
    private onNewRound: ((scenarioId: string) => void) | null = null;

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
    // JOIN ACTIONS
    // ============================================

    /**
     * Request to join Battle Royale by taking over a bot faction
     */
    requestTakeoverBot(botFactionId: string): void {
        NetworkService.sendRequest({
            type: 'BR_JOIN_REQUEST',
            peerId: NetworkService.myPeerId,
            option: 'TAKEOVER_BOT',
            botFactionId
        });
    }

    /**
     * Request to join Battle Royale with a new faction at a specific city
     */
    requestNewFaction(targetCityId: string): void {
        NetworkService.sendRequest({
            type: 'BR_JOIN_REQUEST',
            peerId: NetworkService.myPeerId,
            option: 'NEW_FACTION',
            targetCityId
        });
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

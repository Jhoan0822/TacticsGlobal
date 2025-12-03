
import { GameState, Faction, POIType, UnitClass, Difficulty } from '../types';
import { AI_CONFIG, UNIT_CONFIG, POI_CONFIG, DIFFICULTY_CONFIG } from '../constants';
import { spawnUnit } from './gameLogic';

// AI DIRECTOR: Manages pacing, waves, and overall difficulty
export class AIDirector {
    private static instance: AIDirector;
    private intensity: number = 0;
    private lastWaveTime: number = 0;
    private waveInterval: number = 60000; // 1 minute default
    private difficultyMultiplier: number = 1.0;

    private constructor() { }

    public static getInstance(): AIDirector {
        if (!AIDirector.instance) {
            AIDirector.instance = new AIDirector();
        }
        return AIDirector.instance;
    }

    public update(gameState: GameState): GameState {
        const now = Date.now();
        const config = DIFFICULTY_CONFIG[gameState.difficulty || Difficulty.MEDIUM];

        // 1. Manage Intensity
        // Intensity increases with combat, decreases with time
        if (gameState.projectiles.length > 0) {
            this.intensity = Math.min(100, this.intensity + config.INTENSITY_GAIN);
        } else {
            this.intensity = Math.max(0, this.intensity - 0.05);
        }

        // 2. Wave Spawning (Frenetic Pacing)
        if (now - this.lastWaveTime > (this.waveInterval || config.WAVE_INTERVAL_MS)) {
            // Trigger Wave?
            // If intensity is LOW, trigger a wave to spice things up.
            // If intensity is HIGH, maybe wait a bit to give player a breather (L4D style), OR punish them if "Frenetic" is maxed.

            if (this.intensity < 50) {
                gameState = this.spawnWave(gameState, config);
                this.lastWaveTime = now;
                // Decrease interval for next wave to ramp up pressure
                this.waveInterval = Math.max(config.WAVE_INTERVAL_MS * 0.5, (this.waveInterval || config.WAVE_INTERVAL_MS) * 0.9);
            }
        }

        return gameState;
    }

    private spawnWave(gameState: GameState, config: any): GameState {
        // Find a hostile faction to spawn units for
        const hostileFactions = gameState.factions.filter(f => f.type === 'AI' && f.id !== 'NEUTRAL');
        if (hostileFactions.length === 0) return gameState;

        const faction = hostileFactions[Math.floor(Math.random() * hostileFactions.length)];

        // Find a spawn point (City or Edge of map)
        const myCities = gameState.pois.filter(p => p.ownerFactionId === faction.id);
        if (myCities.length === 0) return gameState;

        const spawnCity = myCities[Math.floor(Math.random() * myCities.length)];

        // Spawn a "Strike Team"
        // Scale squad size by difficulty
        const baseSquadSize = gameState.difficulty === Difficulty.EASY ? 3 : gameState.difficulty === Difficulty.HARD ? 8 : 5;
        const squadSize = baseSquadSize + Math.floor(gameState.gameTick / 1000); // Ramp up over time
        const newUnits = [...gameState.units];

        for (let i = 0; i < squadSize; i++) {
            const type = Math.random() > 0.5 ? UnitClass.GROUND_TANK : UnitClass.HELICOPTER;
            const offsetLat = (Math.random() - 0.5) * 0.05;
            const offsetLng = (Math.random() - 0.5) * 0.05;

            const unit = spawnUnit(type, spawnCity.position.lat + offsetLat, spawnCity.position.lng + offsetLng, faction.id);
            // Give them an immediate target: The Player's HQ or nearest city
            const playerHq = gameState.units.find(u => u.factionId === 'PLAYER' && u.unitClass === UnitClass.COMMAND_CENTER);
            if (playerHq) {
                unit.targetId = playerHq.id;
            }
            newUnits.push(unit);
        }

        // Notify Player
        const newMessages = [...gameState.messages, {
            id: Math.random().toString(),
            text: `WARNING: ${faction.name} is launching a major offensive!`,
            type: 'alert',
            timestamp: Date.now()
        } as any];

        return { ...gameState, units: newUnits, messages: newMessages };
    }
}

// --- UTILITY AI FOR INDIVIDUAL FACTIONS ---
export const updateAI = (gameState: GameState): GameState => {
    // Run Director first
    let newState = AIDirector.getInstance().update(gameState);

    // Then standard faction AI (Economy, Expansion)
    // ... (Keep existing logic or enhance)
    // For now, we'll keep the existing simple AI but boost its aggression based on Director

    return newState;
};

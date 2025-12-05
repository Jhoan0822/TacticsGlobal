
import { GameState, Faction, POIType, UnitClass, Difficulty, BotPersonality } from '../types';
import { AI_CONFIG, UNIT_CONFIG, POI_CONFIG, DIFFICULTY_CONFIG, PERSONALITY_CONFIG } from '../constants';
import { spawnUnit } from './gameLogic';

// AI DIRECTOR: Manages pacing, waves, and overall difficulty
// This is the "Left 4 Dead" style director that keeps tension high
export class AIDirector {
    private static instance: AIDirector;
    private intensity: number = 0;
    private lastWaveTime: number = 0;
    private waveNumber: number = 0;

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

        // 1. Track Intensity (based on combat activity)
        const combatActive = gameState.projectiles.length > 0 || gameState.explosions.length > 0;
        if (combatActive) {
            this.intensity = Math.min(100, this.intensity + config.INTENSITY_GAIN);
        } else {
            this.intensity = Math.max(0, this.intensity - 0.1);
        }

        // 2. Wave Spawning (Aggressive)
        const timeSinceLastWave = now - this.lastWaveTime;
        const waveInterval = config.WAVE_INTERVAL_MS;

        // Spawn wave if:
        // - Enough time has passed
        // - OR intensity is low (game is too calm, need to spice it up!)
        if (timeSinceLastWave > waveInterval || (this.intensity < 30 && timeSinceLastWave > waveInterval * 0.5)) {
            // Only spawn waves if there are BOT factions
            const botFactions = gameState.factions.filter(f => f.type === 'BOT');
            if (botFactions.length > 0) {
                gameState = this.spawnWave(gameState, config);
                this.lastWaveTime = now;
                this.waveNumber++;
            }
        }

        return gameState;
    }

    private spawnWave(gameState: GameState, config: any): GameState {
        // Find a BOT faction to spawn units for
        const botFactions = gameState.factions.filter(f => f.type === 'BOT' && f.id !== 'NEUTRAL');
        if (botFactions.length === 0) return gameState;

        // Pick a random bot faction
        const faction = botFactions[Math.floor(Math.random() * botFactions.length)];

        // Find spawn points (faction's cities)
        const myCities = gameState.pois.filter(p => p.ownerFactionId === faction.id && p.type === POIType.CITY);
        if (myCities.length === 0) return gameState;

        const spawnCity = myCities[Math.floor(Math.random() * myCities.length)];

        // Calculate wave size based on difficulty and time
        const baseSize = gameState.difficulty === Difficulty.EASY ? 2 :
            gameState.difficulty === Difficulty.HARD ? 6 : 4;
        const waveBonus = Math.floor(this.waveNumber / 2); // Grows over time
        const squadSize = Math.min(10, baseSize + waveBonus);

        const newUnits = [...gameState.units];

        // Find targets: Player AND neutral cities (for expansion)
        const playerFaction = gameState.factions.find(f => f.type === 'PLAYER');
        const playerCity = playerFaction
            ? gameState.pois.find(p => p.ownerFactionId === playerFaction.id && p.type === POIType.CITY)
            : null;
        const playerHQ = playerFaction
            ? gameState.units.find(u => u.factionId === playerFaction.id && u.unitClass === UnitClass.COMMAND_CENTER)
            : null;

        // EXPANSION: Find nearest neutral city
        const neutralCities = gameState.pois.filter(p => p.ownerFactionId === 'NEUTRAL' && p.type === POIType.CITY);
        let nearestNeutral: typeof neutralCities[0] | null = null;
        let nearestDist = Infinity;

        neutralCities.forEach(nc => {
            const dist = Math.sqrt(
                Math.pow(nc.position.lat - spawnCity.position.lat, 2) +
                Math.pow(nc.position.lng - spawnCity.position.lng, 2)
            );
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestNeutral = nc;
            }
        });

        // Spawn a diverse squad - PERSONALITY AWARE
        const personality = faction.personality || BotPersonality.TACTICAL;
        const personalityConfig = PERSONALITY_CONFIG[personality];
        const preferredUnits = personalityConfig.preferredUnits || [UnitClass.GROUND_TANK, UnitClass.INFANTRY];

        for (let i = 0; i < squadSize; i++) {
            // Unit type variety - check if faction has airbase for air units
            const hasAirbase = gameState.units.some(u =>
                u.factionId === faction.id && u.unitClass === UnitClass.AIRBASE
            );

            let unitType: UnitClass;
            const rand = Math.random();

            // Personality-based unit selection
            if (personality === BotPersonality.AGGRESSIVE) {
                // Aggressive: Fast attack units
                if (rand < 0.30) unitType = UnitClass.FIGHTER_JET;
                else if (rand < 0.60) unitType = UnitClass.GROUND_TANK;
                else if (rand < 0.80) unitType = UnitClass.INFANTRY;
                else unitType = UnitClass.HELICOPTER;
            } else if (personality === BotPersonality.DEFENSIVE) {
                // Defensive: Ranged and fortification units
                if (rand < 0.30) unitType = UnitClass.MISSILE_LAUNCHER;
                else if (rand < 0.50) unitType = UnitClass.SAM_LAUNCHER;
                else if (rand < 0.75) unitType = UnitClass.GROUND_TANK;
                else unitType = UnitClass.INFANTRY;
            } else if (personality === BotPersonality.ECONOMIC) {
                // Economic: Capture units and heavy hitters
                if (rand < 0.40) unitType = UnitClass.INFANTRY;
                else if (rand < 0.70) unitType = UnitClass.GROUND_TANK;
                else unitType = UnitClass.HEAVY_BOMBER;
            } else {
                // Tactical: Balanced combined arms
                if (rand < 0.25) unitType = UnitClass.GROUND_TANK;
                else if (rand < 0.40) unitType = UnitClass.INFANTRY;
                else if (rand < 0.55 && hasAirbase) unitType = UnitClass.FIGHTER_JET;
                else if (rand < 0.70 && hasAirbase) unitType = UnitClass.HELICOPTER;
                else if (rand < 0.85) unitType = UnitClass.MISSILE_LAUNCHER;
                else unitType = UnitClass.INFANTRY;
            }

            const offsetLat = (Math.random() - 0.5) * 0.05;
            const offsetLng = (Math.random() - 0.5) * 0.05;

            const unit = spawnUnit(unitType, spawnCity.position.lat + offsetLat, spawnCity.position.lng + offsetLng, faction.id);

            // PERSONALITY-BASED TARGETING
            // ALL personalities prioritize neutral cities for capture
            const prioritizeNeutrals = personality !== BotPersonality.AGGRESSIVE || nearestNeutral;

            if (unitType === UnitClass.INFANTRY && nearestNeutral) {
                // Infantry ALWAYS targets neutral cities (capture priority)
                unit.targetId = nearestNeutral.id;
            } else if (prioritizeNeutrals && nearestNeutral && (i < squadSize * 0.6 || !playerHQ)) {
                // 60% of units go for neutrals (or all if no player target)
                unit.targetId = nearestNeutral.id;
            } else if (playerHQ) {
                unit.targetId = playerHQ.id;
            } else if (playerCity) {
                unit.targetId = playerCity.id;
            } else if (nearestNeutral) {
                unit.targetId = nearestNeutral.id;
            }

            newUnits.push(unit);
        }

        // Alert message with personality info
        const personalityName = PERSONALITY_CONFIG[personality]?.name || 'Unknown';
        const newMessages = [...gameState.messages, {
            id: Math.random().toString(),
            text: `[INTEL] ${faction.name} (${personalityName}) is launching an assault! (Wave ${this.waveNumber + 1})`,
            type: 'alert',
            timestamp: Date.now()
        } as any];

        return { ...gameState, units: newUnits, messages: newMessages };
    }
}

// Legacy export for compatibility
export const updateAI = (gameState: GameState): GameState => {
    return AIDirector.getInstance().update(gameState);
};

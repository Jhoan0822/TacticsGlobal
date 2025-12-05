// =============================================================================
// WORLD-CLASS ADVANCED BOT AI SYSTEM v2.0
// =============================================================================
// Architecture: Utility AI + Task-Based Planning + Behavior Trees
// 
// This is a complete strategic AI system that:
// 1. UNDERSTANDS the game - knows capture requires infantry within 5km
// 2. PLANS strategically - creates goals and assigns task forces
// 3. EXECUTES tactically - moves units precisely to objectives
// 4. ADAPTS dynamically - responds to threats and opportunities
// 5. COORDINATES units - task forces attack together
// =============================================================================

import {
    GameState, Faction, GameUnit, UnitClass, POI, POIType,
    BotPersonality, StrategicGoal, ThreatMemory
} from '../types';
import {
    UNIT_CONFIG, DIPLOMACY, PERSONALITY_CONFIG, POI_CONFIG
} from '../constants';
import { spawnUnit, getDistanceKm } from './gameLogic';

// =============================================================================
// CONSTANTS - CRITICAL GAME MECHANICS
// =============================================================================

const CAPTURE_RANGE_KM = 5;        // Infantry must be THIS CLOSE to capture!
const COMBAT_ENGAGEMENT_RANGE = 50; // Distance to start fighting
const THREAT_DETECTION_RANGE = 100; // Distance to detect incoming enemies
const CITY_ATTACK_RANGE = 10;       // Distance to attack a city
const DEFENSE_PERIMETER = 30;       // How far defenders patrol from city

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface TaskForce {
    id: string;
    type: 'CAPTURE' | 'ASSAULT' | 'DEFENSE' | 'RAID' | 'ESCORT';
    targetId: string;
    targetPosition: { lat: number; lng: number };
    unitIds: string[];
    status: 'FORMING' | 'MOVING' | 'ENGAGED' | 'COMPLETE' | 'FAILED';
    requiredInfantry: number;
    requiredCombat: number;
    createdAt: number;
}

interface BotBrain {
    factionId: string;
    taskForces: TaskForce[];
    lastThinkTime: number;
    expansionPhase: 'EARLY' | 'MID' | 'LATE';
    economyScore: number;
    militaryScore: number;
    threatLevel: number;
}

// Global bot brains cache (persists across ticks)
const botBrains: Map<string, BotBrain> = new Map();

// =============================================================================
// MAIN AI ENTRY POINT
// =============================================================================

export const updateAdvancedBotAI = (gameState: GameState): GameState => {
    let newState = { ...gameState };
    const now = Date.now();

    // Process each BOT faction
    for (const faction of newState.factions) {
        if (faction.type !== 'BOT') continue;

        // Get or create brain for this bot
        let brain = botBrains.get(faction.id);
        if (!brain) {
            brain = createBotBrain(faction.id);
            botBrains.set(faction.id, brain);
        }

        // Throttle thinking (but not too much - 300ms is good)
        const thinkInterval = 300;
        if (brain.lastThinkTime && (now - brain.lastThinkTime < thinkInterval)) {
            continue;
        }
        brain.lastThinkTime = now;

        // ================================================================
        // PHASE 1: SITUATION ANALYSIS
        // ================================================================
        const analysis = analyzeGameState(faction, newState, brain);

        // ================================================================
        // PHASE 2: STRATEGIC PLANNING
        // ================================================================
        updateStrategicPlan(brain, analysis, faction, newState);

        // ================================================================
        // PHASE 3: PRODUCTION DECISIONS
        // ================================================================
        newState = executeProduction(brain, analysis, faction, newState);

        // ================================================================
        // PHASE 4: UNIT COMMANDS
        // ================================================================
        newState = executeCommands(brain, analysis, faction, newState);
    }

    return newState;
};

// =============================================================================
// BOT BRAIN CREATION
// =============================================================================

function createBotBrain(factionId: string): BotBrain {
    return {
        factionId,
        taskForces: [],
        lastThinkTime: 0,
        expansionPhase: 'EARLY',
        economyScore: 0,
        militaryScore: 0,
        threatLevel: 0
    };
}

// =============================================================================
// SITUATION ANALYSIS
// =============================================================================

interface GameAnalysis {
    myUnits: GameUnit[];
    myCities: POI[];
    myInfantry: GameUnit[];
    myCombatUnits: GameUnit[];
    idleUnits: GameUnit[];

    neutralCities: POI[];
    enemyCities: POI[];
    enemyUnits: GameUnit[];

    nearestNeutralCity: POI | null;
    nearestNeutralDistance: number;

    totalArmyPower: number;
    enemyArmyPower: number;

    personality: any;

    // Critical metrics
    infantryCount: number;
    combatUnitCount: number;
    needMoreInfantry: boolean;
    needMoreCombat: boolean;

    // Map control
    citiesOwned: number;
    totalCities: number;
    neutralCitiesAvailable: number;
}

function analyzeGameState(faction: Faction, state: GameState, brain: BotBrain): GameAnalysis {
    const personality = PERSONALITY_CONFIG[faction.personality || BotPersonality.TACTICAL];

    // Gather my assets
    const myUnits = state.units.filter(u => u.factionId === faction.id && u.hp > 0);
    const myCities = state.pois.filter(p => p.ownerFactionId === faction.id && p.type === POIType.CITY);

    // Categorize units
    const myInfantry = myUnits.filter(u =>
        u.unitClass === UnitClass.INFANTRY || u.unitClass === UnitClass.SPECIAL_FORCES
    );
    const myCombatUnits = myUnits.filter(u =>
        u.unitClass === UnitClass.GROUND_TANK ||
        u.unitClass === UnitClass.FIGHTER_JET ||
        u.unitClass === UnitClass.HELICOPTER ||
        u.unitClass === UnitClass.MISSILE_LAUNCHER
    );

    // Find idle units (not assigned to any task force)
    const assignedUnitIds = new Set(brain.taskForces.flatMap(tf => tf.unitIds));
    const idleUnits = myUnits.filter(u =>
        !assignedUnitIds.has(u.id) &&
        !u.targetId &&
        u.unitClass !== UnitClass.COMMAND_CENTER &&
        u.unitClass !== UnitClass.MILITARY_BASE &&
        u.unitClass !== UnitClass.AIRBASE &&
        u.unitClass !== UnitClass.PORT
    );

    // Enemy analysis
    const enemyFactionIds = state.factions
        .filter(f => f.id !== faction.id && f.type !== 'NEUTRAL' && isHostile(faction, f.id))
        .map(f => f.id);

    const enemyUnits = state.units.filter(u =>
        enemyFactionIds.includes(u.factionId) && u.hp > 0
    );

    // Cities
    const neutralCities = state.pois.filter(p =>
        (p.ownerFactionId === 'NEUTRAL' || !p.ownerFactionId) && p.type === POIType.CITY
    );
    const enemyCities = state.pois.filter(p =>
        enemyFactionIds.includes(p.ownerFactionId || '') && p.type === POIType.CITY
    );

    // Find nearest neutral city
    let nearestNeutralCity: POI | null = null;
    let nearestNeutralDistance = Infinity;

    if (myCities.length > 0) {
        const homeCity = myCities[0];
        for (const nc of neutralCities) {
            const dist = getDistanceKm(
                homeCity.position.lat, homeCity.position.lng,
                nc.position.lat, nc.position.lng
            );
            if (dist < nearestNeutralDistance) {
                nearestNeutralDistance = dist;
                nearestNeutralCity = nc;
            }
        }
    }

    // Army power calculations
    const totalArmyPower = myUnits.reduce((sum, u) => sum + u.hp + u.attack * 2, 0);
    const enemyArmyPower = enemyUnits.reduce((sum, u) => sum + u.hp + u.attack * 2, 0);

    // Critical needs
    const infantryCount = myInfantry.length;
    const combatUnitCount = myCombatUnits.length;

    // We NEED infantry to capture! At least 2 per city we want to take
    const needMoreInfantry = infantryCount < Math.max(3, neutralCities.length * 2);
    const needMoreCombat = combatUnitCount < infantryCount * 2; // Combat should escort infantry

    return {
        myUnits,
        myCities,
        myInfantry,
        myCombatUnits,
        idleUnits,
        neutralCities,
        enemyCities,
        enemyUnits,
        nearestNeutralCity,
        nearestNeutralDistance,
        totalArmyPower,
        enemyArmyPower,
        personality,
        infantryCount,
        combatUnitCount,
        needMoreInfantry,
        needMoreCombat,
        citiesOwned: myCities.length,
        totalCities: state.pois.filter(p => p.type === POIType.CITY).length,
        neutralCitiesAvailable: neutralCities.length
    };
}

function isHostile(faction: Faction, otherFactionId: string): boolean {
    if (otherFactionId === 'NEUTRAL') return false;
    return (faction.relations[otherFactionId] || 0) <= DIPLOMACY.WAR_THRESHOLD;
}

// =============================================================================
// STRATEGIC PLANNING
// =============================================================================

function updateStrategicPlan(brain: BotBrain, analysis: GameAnalysis, faction: Faction, state: GameState): void {
    const now = Date.now();

    // Clean up completed/failed task forces
    brain.taskForces = brain.taskForces.filter(tf =>
        tf.status !== 'COMPLETE' && tf.status !== 'FAILED'
    );

    // Check task force completion
    for (const tf of brain.taskForces) {
        if (tf.type === 'CAPTURE') {
            const targetCity = state.pois.find(p => p.id === tf.targetId);
            if (targetCity && targetCity.ownerFactionId === faction.id) {
                tf.status = 'COMPLETE';
                console.log(`[BOT AI] ${faction.name}: Captured ${targetCity.name}!`);
            }
        }

        // Check if units are still alive
        const aliveUnits = tf.unitIds.filter(uid =>
            state.units.some(u => u.id === uid && u.hp > 0)
        );
        if (aliveUnits.length === 0 && tf.unitIds.length > 0) {
            tf.status = 'FAILED';
        }
        tf.unitIds = aliveUnits;
    }

    // ================================================================
    // PRIORITY 1: CAPTURE NEUTRAL CITIES (MOST IMPORTANT!)
    // ================================================================
    const captureTFs = brain.taskForces.filter(tf => tf.type === 'CAPTURE');
    const citiesBeingCaptured = new Set(captureTFs.map(tf => tf.targetId));

    // Create capture task forces for unclaimed neutral cities
    for (const neutralCity of analysis.neutralCities) {
        if (citiesBeingCaptured.has(neutralCity.id)) continue;

        // Limit simultaneous capture operations based on available infantry
        if (captureTFs.length >= Math.max(1, Math.floor(analysis.infantryCount / 2))) continue;

        const homeCity = analysis.myCities[0];
        if (!homeCity) continue;

        const distance = getDistanceKm(
            homeCity.position.lat, homeCity.position.lng,
            neutralCity.position.lat, neutralCity.position.lng
        );

        // Create capture task force
        const taskForce: TaskForce = {
            id: `TF_${Math.random().toString(36).substr(2, 8)}`,
            type: 'CAPTURE',
            targetId: neutralCity.id,
            targetPosition: { ...neutralCity.position },
            unitIds: [],
            status: 'FORMING',
            requiredInfantry: 2, // At least 2 infantry to capture
            requiredCombat: 1,   // At least 1 combat unit for escort
            createdAt: now
        };

        brain.taskForces.push(taskForce);
        console.log(`[BOT AI] ${faction.name}: Created capture TF for ${neutralCity.name} (${distance.toFixed(0)}km away)`);
    }

    // ================================================================
    // PRIORITY 2: DEFEND OWN CITIES
    // ================================================================
    const threatenedCities = findThreatenedCities(analysis, state);
    for (const city of threatenedCities) {
        const hasDefenseForce = brain.taskForces.some(
            tf => tf.type === 'DEFENSE' && tf.targetId === city.id
        );
        if (!hasDefenseForce) {
            brain.taskForces.push({
                id: `TF_${Math.random().toString(36).substr(2, 8)}`,
                type: 'DEFENSE',
                targetId: city.id,
                targetPosition: { ...city.position },
                unitIds: [],
                status: 'FORMING',
                requiredInfantry: 0,
                requiredCombat: 3,
                createdAt: now
            });
        }
    }

    // ================================================================
    // ASSIGN IDLE UNITS TO TASK FORCES
    // ================================================================
    assignUnitsToTaskForces(brain, analysis, state);
}

function findThreatenedCities(analysis: GameAnalysis, state: GameState): POI[] {
    const threatened: POI[] = [];

    for (const city of analysis.myCities) {
        const nearbyEnemies = analysis.enemyUnits.filter(u =>
            getDistanceKm(u.position.lat, u.position.lng, city.position.lat, city.position.lng) < THREAT_DETECTION_RANGE
        );
        if (nearbyEnemies.length >= 2) {
            threatened.push(city);
        }
    }

    return threatened;
}

function assignUnitsToTaskForces(brain: BotBrain, analysis: GameAnalysis, state: GameState): void {
    // Get all assigned unit IDs
    const assignedIds = new Set(brain.taskForces.flatMap(tf => tf.unitIds));

    // Get available units by type
    const availableInfantry = analysis.myInfantry.filter(u => !assignedIds.has(u.id));
    const availableCombat = analysis.myCombatUnits.filter(u => !assignedIds.has(u.id));

    // Prioritize CAPTURE task forces (they need infantry!)
    const captureTFs = brain.taskForces.filter(tf => tf.type === 'CAPTURE' && tf.status === 'FORMING');

    for (const tf of captureTFs) {
        // Assign infantry first (REQUIRED for capture!)
        const currentInfantry = tf.unitIds.filter(uid =>
            analysis.myInfantry.some(u => u.id === uid)
        ).length;

        const neededInfantry = tf.requiredInfantry - currentInfantry;
        for (let i = 0; i < neededInfantry && availableInfantry.length > 0; i++) {
            const unit = availableInfantry.shift()!;
            tf.unitIds.push(unit.id);
            assignedIds.add(unit.id);
        }

        // Assign combat escorts
        const currentCombat = tf.unitIds.filter(uid =>
            analysis.myCombatUnits.some(u => u.id === uid)
        ).length;

        const neededCombat = tf.requiredCombat - currentCombat;
        for (let i = 0; i < neededCombat && availableCombat.length > 0; i++) {
            const unit = availableCombat.shift()!;
            tf.unitIds.push(unit.id);
            assignedIds.add(unit.id);
        }

        // Check if task force is ready to move
        if (tf.unitIds.length >= tf.requiredInfantry) {
            tf.status = 'MOVING';
        }
    }

    // Assign to defense task forces
    const defenseTFs = brain.taskForces.filter(tf => tf.type === 'DEFENSE' && tf.status === 'FORMING');
    for (const tf of defenseTFs) {
        for (let i = 0; i < tf.requiredCombat && availableCombat.length > 0; i++) {
            const unit = availableCombat.shift()!;
            tf.unitIds.push(unit.id);
            assignedIds.add(unit.id);
        }
        if (tf.unitIds.length >= tf.requiredCombat) {
            tf.status = 'MOVING';
        }
    }
}

// =============================================================================
// PRODUCTION DECISIONS
// =============================================================================

function executeProduction(brain: BotBrain, analysis: GameAnalysis, faction: Faction, state: GameState): GameState {
    let newState = { ...state };

    // Check if we can produce
    if (analysis.myCities.length === 0) return newState;

    const personality = analysis.personality;
    const maxUnits = faction.maxUnits || 30;

    if (analysis.myUnits.length >= maxUnits) return newState;

    // Calculate gold reserve based on personality
    const reserve = faction.gold * (personality.goldReserve || 0.1);
    const spendable = faction.gold - reserve;

    if (spendable < 50) return newState;

    // ================================================================
    // PRODUCTION PRIORITY: INFANTRY FIRST FOR CAPTURE!
    // ================================================================
    let unitToSpawn: UnitClass | null = null;

    // CRITICAL: We need infantry to capture cities!
    if (analysis.needMoreInfantry && analysis.neutralCitiesAvailable > 0) {
        // Check if any capture task force needs infantry
        const needsInfantry = brain.taskForces.some(tf =>
            tf.type === 'CAPTURE' &&
            tf.unitIds.filter(uid => analysis.myInfantry.some(u => u.id === uid)).length < tf.requiredInfantry
        );

        if (needsInfantry || analysis.infantryCount < 3) {
            unitToSpawn = UnitClass.INFANTRY;
        }
    }

    // Then produce combat units
    if (!unitToSpawn && analysis.needMoreCombat) {
        // Personality-based combat unit selection
        if (faction.personality === BotPersonality.AGGRESSIVE) {
            unitToSpawn = Math.random() > 0.5 ? UnitClass.FIGHTER_JET : UnitClass.GROUND_TANK;
        } else if (faction.personality === BotPersonality.DEFENSIVE) {
            unitToSpawn = Math.random() > 0.5 ? UnitClass.SAM_LAUNCHER : UnitClass.MISSILE_LAUNCHER;
        } else {
            unitToSpawn = UnitClass.GROUND_TANK; // Default to reliable tanks
        }
    }

    // Fallback: produce infantry if we have none
    if (!unitToSpawn && analysis.infantryCount < 2) {
        unitToSpawn = UnitClass.INFANTRY;
    }

    // If still nothing, just make tanks
    if (!unitToSpawn && spendable > 400) {
        unitToSpawn = UnitClass.GROUND_TANK;
    }

    if (!unitToSpawn) return newState;

    // Check cost
    const cost = UNIT_CONFIG[unitToSpawn]?.cost;
    if (!cost || spendable < cost.gold || (faction.oil || 0) < (cost.oil || 0)) {
        // Can't afford, try infantry (cheapest)
        unitToSpawn = UnitClass.INFANTRY;
        const infCost = UNIT_CONFIG[UnitClass.INFANTRY].cost;
        if (!infCost || spendable < infCost.gold) return newState;
    }

    // Spawn at random city
    const spawnCity = analysis.myCities[Math.floor(Math.random() * analysis.myCities.length)];
    const finalCost = UNIT_CONFIG[unitToSpawn].cost!;

    const offsetLat = (Math.random() - 0.5) * 0.02;
    const offsetLng = (Math.random() - 0.5) * 0.02;

    const newUnit = spawnUnit(
        unitToSpawn,
        spawnCity.position.lat + offsetLat,
        spawnCity.position.lng + offsetLng,
        faction.id
    );

    console.log(`[BOT AI] ${faction.name}: Spawned ${unitToSpawn}`);

    return {
        ...newState,
        units: [...newState.units, newUnit],
        factions: newState.factions.map(f =>
            f.id === faction.id
                ? { ...f, gold: f.gold - finalCost.gold, oil: (f.oil || 0) - (finalCost.oil || 0) }
                : f
        )
    };
}

// =============================================================================
// UNIT COMMANDS - THE CRITICAL PART!
// =============================================================================

function executeCommands(brain: BotBrain, analysis: GameAnalysis, faction: Faction, state: GameState): GameState {
    const newUnits = [...state.units];

    for (const tf of brain.taskForces) {
        if (tf.status !== 'MOVING' && tf.status !== 'ENGAGED') continue;

        // Get units in this task force
        const tfUnits = tf.unitIds.map(uid => newUnits.find(u => u.id === uid)).filter(Boolean) as GameUnit[];
        if (tfUnits.length === 0) continue;

        // ================================================================
        // CAPTURE TASK FORCE LOGIC
        // ================================================================
        if (tf.type === 'CAPTURE') {
            const targetCity = state.pois.find(p => p.id === tf.targetId);
            if (!targetCity) {
                tf.status = 'FAILED';
                continue;
            }

            // Check if we've captured it
            if (targetCity.ownerFactionId === faction.id) {
                tf.status = 'COMPLETE';
                continue;
            }

            // Check distance of units to target
            for (const unit of tfUnits) {
                const distToTarget = getDistanceKm(
                    unit.position.lat, unit.position.lng,
                    targetCity.position.lat, targetCity.position.lng
                );

                const unitIdx = newUnits.findIndex(u => u.id === unit.id);
                if (unitIdx === -1) continue;

                // Infantry: Move to EXACT city position then STAY for capture
                if (unit.unitClass === UnitClass.INFANTRY || unit.unitClass === UnitClass.SPECIAL_FORCES) {
                    if (distToTarget > CAPTURE_RANGE_KM) {
                        // Move directly to city center
                        newUnits[unitIdx] = {
                            ...newUnits[unitIdx],
                            destination: {
                                lat: targetCity.position.lat,
                                lng: targetCity.position.lng
                            },
                            targetId: null // Don't shoot, just move!
                        };
                    } else {
                        // In capture range - STAY PUT and capture!
                        newUnits[unitIdx] = {
                            ...newUnits[unitIdx],
                            destination: null,
                            targetId: null
                        };
                    }
                }
                // Combat units: escort and attack defenders
                else {
                    if (distToTarget > CITY_ATTACK_RANGE) {
                        // Move towards city
                        newUnits[unitIdx] = {
                            ...newUnits[unitIdx],
                            destination: {
                                lat: targetCity.position.lat + (Math.random() - 0.5) * 0.05,
                                lng: targetCity.position.lng + (Math.random() - 0.5) * 0.05
                            },
                            targetId: null
                        };
                    } else {
                        // Attack the city or nearby enemies
                        const nearbyEnemy = findNearbyEnemy(unit, analysis.enemyUnits);
                        if (nearbyEnemy) {
                            newUnits[unitIdx] = {
                                ...newUnits[unitIdx],
                                destination: null,
                                targetId: nearbyEnemy.id
                            };
                        } else {
                            // Attack the city itself
                            newUnits[unitIdx] = {
                                ...newUnits[unitIdx],
                                destination: null,
                                targetId: targetCity.id
                            };
                        }
                    }
                }
            }

            // Check if engaged (units near target)
            const unitsNearTarget = tfUnits.filter(u =>
                getDistanceKm(u.position.lat, u.position.lng, targetCity.position.lat, targetCity.position.lng) < 30
            );
            if (unitsNearTarget.length > 0) {
                tf.status = 'ENGAGED';
            }
        }

        // ================================================================
        // DEFENSE TASK FORCE LOGIC
        // ================================================================
        else if (tf.type === 'DEFENSE') {
            const targetCity = state.pois.find(p => p.id === tf.targetId);
            if (!targetCity) {
                tf.status = 'FAILED';
                continue;
            }

            for (const unit of tfUnits) {
                const distToCity = getDistanceKm(
                    unit.position.lat, unit.position.lng,
                    targetCity.position.lat, targetCity.position.lng
                );

                const unitIdx = newUnits.findIndex(u => u.id === unit.id);
                if (unitIdx === -1) continue;

                // Find nearby enemies
                const nearbyEnemy = findNearbyEnemy(unit, analysis.enemyUnits);

                if (nearbyEnemy) {
                    // Attack the enemy!
                    newUnits[unitIdx] = {
                        ...newUnits[unitIdx],
                        destination: null,
                        targetId: nearbyEnemy.id
                    };
                } else if (distToCity > DEFENSE_PERIMETER) {
                    // Return to city
                    newUnits[unitIdx] = {
                        ...newUnits[unitIdx],
                        destination: {
                            lat: targetCity.position.lat + (Math.random() - 0.5) * 0.03,
                            lng: targetCity.position.lng + (Math.random() - 0.5) * 0.03
                        },
                        targetId: null
                    };
                }
            }
        }
    }

    // ================================================================
    // HANDLE UNASSIGNED UNITS - They should capture too!
    // ================================================================
    const assignedIds = new Set(brain.taskForces.flatMap(tf => tf.unitIds));

    for (let i = 0; i < newUnits.length; i++) {
        const unit = newUnits[i];
        if (unit.factionId !== faction.id) continue;
        if (assignedIds.has(unit.id)) continue;
        if (unit.destination || unit.targetId) continue;
        if (unit.unitClass === UnitClass.COMMAND_CENTER) continue;

        // Unassigned infantry: go capture nearest neutral!
        if (unit.unitClass === UnitClass.INFANTRY || unit.unitClass === UnitClass.SPECIAL_FORCES) {
            if (analysis.nearestNeutralCity) {
                newUnits[i] = {
                    ...newUnits[i],
                    destination: {
                        lat: analysis.nearestNeutralCity.position.lat,
                        lng: analysis.nearestNeutralCity.position.lng
                    },
                    targetId: null
                };
            }
        }
        // Unassigned combat: follow infantry or defend
        else if (unit.unitClass === UnitClass.GROUND_TANK ||
            unit.unitClass === UnitClass.FIGHTER_JET ||
            unit.unitClass === UnitClass.MISSILE_LAUNCHER) {
            // Find nearest friendly infantry and follow
            const nearestInfantry = analysis.myInfantry.find(inf =>
                getDistanceKm(unit.position.lat, unit.position.lng, inf.position.lat, inf.position.lng) < 100
            );

            if (nearestInfantry && nearestInfantry.destination) {
                newUnits[i] = {
                    ...newUnits[i],
                    destination: {
                        lat: nearestInfantry.destination.lat + (Math.random() - 0.5) * 0.02,
                        lng: nearestInfantry.destination.lng + (Math.random() - 0.5) * 0.02
                    },
                    targetId: null
                };
            } else if (analysis.myCities.length > 0) {
                // Patrol home city
                const homeCity = analysis.myCities[0];
                const distToHome = getDistanceKm(
                    unit.position.lat, unit.position.lng,
                    homeCity.position.lat, homeCity.position.lng
                );
                if (distToHome > DEFENSE_PERIMETER * 2) {
                    newUnits[i] = {
                        ...newUnits[i],
                        destination: {
                            lat: homeCity.position.lat + (Math.random() - 0.5) * 0.05,
                            lng: homeCity.position.lng + (Math.random() - 0.5) * 0.05
                        },
                        targetId: null
                    };
                }
            }
        }
    }

    return { ...state, units: newUnits };
}

function findNearbyEnemy(unit: GameUnit, enemies: GameUnit[]): GameUnit | null {
    let nearest: GameUnit | null = null;
    let nearestDist = Infinity;

    for (const enemy of enemies) {
        const dist = getDistanceKm(
            unit.position.lat, unit.position.lng,
            enemy.position.lat, enemy.position.lng
        );
        if (dist < unit.range && dist < nearestDist) {
            nearest = enemy;
            nearestDist = dist;
        }
    }

    return nearest;
}

// =============================================================================
// BATTLE ASSESSMENT (for future expansion)
// =============================================================================

export const assessBattle = (
    myUnits: GameUnit[],
    enemyUnits: GameUnit[]
): { canWin: boolean; forceRatio: number } => {
    const myPower = myUnits.reduce((sum, u) => sum + u.hp + u.attack * 2, 0);
    const enemyPower = enemyUnits.reduce((sum, u) => sum + u.hp + u.attack * 2, 0);
    const forceRatio = enemyPower > 0 ? myPower / enemyPower : 100;

    return { canWin: forceRatio >= 0.8, forceRatio };
};

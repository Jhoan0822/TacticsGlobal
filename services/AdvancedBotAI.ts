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
import { TerrainService } from './terrainService';

// =============================================================================
// CONSTANTS - CRITICAL GAME MECHANICS
// =============================================================================

const CAPTURE_RANGE_KM = 5;        // Infantry must be THIS CLOSE to capture!
const COMBAT_ENGAGEMENT_RANGE = 50; // Distance to start fighting
const THREAT_DETECTION_RANGE = 100; // Distance to detect incoming enemies
const CITY_ATTACK_RANGE = 10;       // Distance to attack a city
const DEFENSE_PERIMETER = 30;       // How far defenders patrol from city

// =============================================================================
// HELPER: CLAMP POSITION TO SCENARIO BOUNDS
// =============================================================================

function clampToScenarioBounds(
    lat: number,
    lng: number,
    state: GameState
): { lat: number; lng: number } {
    const bounds = state.scenario?.bounds;
    if (!bounds) return { lat, lng };

    return {
        lat: Math.max(bounds.minLat, Math.min(bounds.maxLat, lat)),
        lng: Math.max(bounds.minLng, Math.min(bounds.maxLng, lng))
    };
}

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
    priority?: number; // Dynamic priority based on threat assessment
}

// =============================================================================
// THREAT ASSESSMENT SYSTEM
// =============================================================================
interface ThreatAssessment {
    targetId: string;           // POI or unit being threatened
    urgency: number;            // 0-100, how fast we must respond
    magnitude: number;          // 0-100, how dangerous
    enemyPower: number;         // Total attack power of incoming enemies
    incomingEnemies: string[];  // IDs of threatening units
    estimatedTimeToImpact: number; // Seconds until enemies reach target
}

interface BotBrain {
    factionId: string;
    taskForces: TaskForce[];
    lastThinkTime: number;
    expansionPhase: 'EARLY' | 'MID' | 'LATE';
    economyScore: number;
    militaryScore: number;
    threatLevel: number;
    // NEW: Threat tracking
    threatMap: Map<string, ThreatAssessment>;
    lastThreatCheck: number;
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
        // PHASE 1.5: THREAT EVALUATION (NEW!)
        // ================================================================
        evaluateThreats(brain, analysis, faction, newState);

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
        threatLevel: 0,
        threatMap: new Map(),
        lastThreatCheck: 0
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

    // === FACILITY TRACKING ===
    myAirbases: GameUnit[];
    myPorts: GameUnit[];
    myMilitaryBases: GameUnit[];
    hasCoastalCity: boolean;

    // Naval units
    myNavalUnits: GameUnit[];
    myAirUnits: GameUnit[];
    myCarriers: GameUnit[];
    myTransports: GameUnit[];

    // Strategic needs
    needsAirbase: boolean;
    needsPort: boolean;
    needsMilitaryBase: boolean;
    needsNavalPower: boolean;
    needsAirPower: boolean;
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

    // === FACILITY TRACKING ===
    const myAirbases = myUnits.filter(u => u.unitClass === UnitClass.AIRBASE);
    const myPorts = myUnits.filter(u => u.unitClass === UnitClass.PORT);
    const myMilitaryBases = myUnits.filter(u => u.unitClass === UnitClass.MILITARY_BASE);
    const hasCoastalCity = myCities.some(c => c.isCoastal);

    // === NAVAL AND AIR UNITS ===
    const myNavalUnits = myUnits.filter(u =>
        u.unitClass === UnitClass.DESTROYER ||
        u.unitClass === UnitClass.FRIGATE ||
        u.unitClass === UnitClass.BATTLESHIP ||
        u.unitClass === UnitClass.SUBMARINE ||
        u.unitClass === UnitClass.PATROL_BOAT ||
        u.unitClass === UnitClass.AIRCRAFT_CARRIER
    );
    const myAirUnits = myUnits.filter(u =>
        u.unitClass === UnitClass.FIGHTER_JET ||
        u.unitClass === UnitClass.HEAVY_BOMBER ||
        u.unitClass === UnitClass.HELICOPTER ||
        u.unitClass === UnitClass.RECON_DRONE ||
        u.unitClass === UnitClass.TROOP_TRANSPORT
    );
    const myCarriers = myUnits.filter(u => u.unitClass === UnitClass.AIRCRAFT_CARRIER);
    const myTransports = myUnits.filter(u => u.unitClass === UnitClass.TROOP_TRANSPORT);

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

    // Check enemy naval/air presence
    const enemyNavalUnits = enemyUnits.filter(u =>
        u.unitClass === UnitClass.DESTROYER ||
        u.unitClass === UnitClass.AIRCRAFT_CARRIER ||
        u.unitClass === UnitClass.BATTLESHIP
    );
    const enemyAirUnits = enemyUnits.filter(u =>
        u.unitClass === UnitClass.FIGHTER_JET ||
        u.unitClass === UnitClass.HEAVY_BOMBER
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

    // === STRATEGIC NEEDS ===
    // Need airbase after owning 2+ cities and having gold
    const needsAirbase = myCities.length >= 2 && myAirbases.length === 0 && faction.gold >= 800;
    // Need port if we have a coastal city and don't have one yet
    const needsPort = hasCoastalCity && myPorts.length === 0 && faction.gold >= 600;
    // Need military base when expanding
    const needsMilitaryBase = myCities.length >= 3 && myMilitaryBases.length === 0 && faction.gold >= 500;
    // Need naval power if enemies have ships or coastal targets exist
    const needsNavalPower = myPorts.length > 0 && (enemyNavalUnits.length > 0 || hasCoastalCity) && myNavalUnits.length < 3;
    // Need air power if enemies have air or we have an airbase
    const needsAirPower = myAirbases.length > 0 && (enemyAirUnits.length > 0 || myAirUnits.length < 2);

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
        neutralCitiesAvailable: neutralCities.length,
        // Facility tracking
        myAirbases,
        myPorts,
        myMilitaryBases,
        hasCoastalCity,
        // Naval and Air units
        myNavalUnits,
        myAirUnits,
        myCarriers,
        myTransports,
        // Strategic needs
        needsAirbase,
        needsPort,
        needsMilitaryBase,
        needsNavalPower,
        needsAirPower
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

        // ================================================================
        // DYNAMIC RETARGETING: Abort task forces if home is under threat
        // ================================================================
        if (tf.status === 'MOVING' && shouldAbortTaskForce(tf, brain, analysis)) {
            tf.status = 'FAILED'; // Mark as failed so units become available
            console.log(`[BOT AI] ${faction.name}: ABORTING ${tf.type} mission - home under attack!`);
        }
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

// =============================================================================
// THREAT EVALUATION SYSTEM
// =============================================================================

/**
 * Evaluate all threats to owned cities and populate BotBrain threatMap
 * This enables dynamic retargeting when the base is under attack
 */
function evaluateThreats(brain: BotBrain, analysis: GameAnalysis, faction: Faction, state: GameState): void {
    brain.threatMap.clear();
    const now = Date.now();

    // Only re-evaluate every 2 seconds to reduce CPU load
    if (now - brain.lastThreatCheck < 2000) return;
    brain.lastThreatCheck = now;

    for (const city of analysis.myCities) {
        // Find enemies approaching this city
        const incomingEnemies = analysis.enemyUnits.filter(enemy => {
            const dist = getDistanceKm(
                enemy.position.lat, enemy.position.lng,
                city.position.lat, city.position.lng
            );

            if (dist > THREAT_DETECTION_RANGE) return false;

            // Check if enemy is moving toward this city
            if (enemy.destination) {
                const destDist = getDistanceKm(
                    enemy.destination.lat, enemy.destination.lng,
                    city.position.lat, city.position.lng
                );
                // Enemy is heading toward city if destination is closer than current position
                return destDist < dist;
            }

            // Enemy has this city as target
            if (enemy.targetId === city.id) return true;

            // Static enemy nearby is still a threat
            return dist < DEFENSE_PERIMETER;
        });

        if (incomingEnemies.length > 0) {
            // Calculate threat metrics
            const enemyPower = incomingEnemies.reduce((sum, e) => sum + e.attack + e.hp, 0);
            const closestDist = Math.min(...incomingEnemies.map(e =>
                getDistanceKm(e.position.lat, e.position.lng, city.position.lat, city.position.lng)
            ));

            // Estimate time to impact based on average speed
            const avgSpeed = 5; // km per game tick (approximate)
            const estimatedTicks = closestDist / avgSpeed;

            // Urgency: higher when enemies are closer (exponential)
            const urgency = Math.min(100, Math.pow(1 - closestDist / THREAT_DETECTION_RANGE, 2) * 100);

            // Magnitude: based on enemy power vs our local defense
            const localDefenders = analysis.myUnits.filter(u =>
                getDistanceKm(u.position.lat, u.position.lng, city.position.lat, city.position.lng) < DEFENSE_PERIMETER
            );
            const defenderPower = localDefenders.reduce((sum, u) => sum + u.attack + u.hp, 0);
            const magnitude = Math.min(100, (enemyPower / Math.max(1, defenderPower)) * 50);

            brain.threatMap.set(city.id, {
                targetId: city.id,
                urgency,
                magnitude,
                enemyPower,
                incomingEnemies: incomingEnemies.map(e => e.id),
                estimatedTimeToImpact: estimatedTicks * 40 / 1000 // Convert to seconds
            });

            // Update global threat level
            brain.threatLevel = Math.max(brain.threatLevel, urgency * magnitude / 100);
        }
    }
}

/**
 * Decide whether a task force should abort its current mission to defend
 */
function shouldAbortTaskForce(tf: TaskForce, brain: BotBrain, analysis: GameAnalysis): boolean {
    // Defense task forces never abort
    if (tf.type === 'DEFENSE') return false;

    // Check if any home city is under serious threat
    const criticalThreats = [...brain.threatMap.entries()]
        .filter(([_, threat]) => threat.urgency > 60 && threat.magnitude > 40);

    if (criticalThreats.length === 0) return false;

    // Calculate current objective value
    const objectiveValue = calculateObjectiveValue(tf, brain, analysis);

    // Calculate defense priority (weighted combination of urgency and magnitude)
    const highestThreat = criticalThreats.sort((a, b) =>
        (b[1].urgency * b[1].magnitude) - (a[1].urgency * a[1].magnitude)
    )[0][1];
    const defensePriority = (highestThreat.urgency * 2 + highestThreat.magnitude) / 3;

    // Abort if defense is more important than current objective
    return defensePriority > objectiveValue;
}

/**
 * Calculate the strategic value of a task force's current objective
 */
function calculateObjectiveValue(tf: TaskForce, brain: BotBrain, analysis: GameAnalysis): number {
    // Capture targets are high value
    if (tf.type === 'CAPTURE') {
        const distFromHome = analysis.myCities.length > 0
            ? getDistanceKm(
                analysis.myCities[0].position.lat, analysis.myCities[0].position.lng,
                tf.targetPosition.lat, tf.targetPosition.lng
            ) : 100;
        // Closer targets are more valuable (already invested time/resources)
        return 70 - (distFromHome / 10);
    }

    // Assault targets
    if (tf.type === 'ASSAULT') return 60;

    // Raids (resource capture)
    if (tf.type === 'RAID') return 40;

    // Escort missions
    if (tf.type === 'ESCORT') return 30;

    return 20;
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
    // PRODUCTION PRIORITY SYSTEM (NEW!)
    // 1. FACILITIES (enable new unit types)
    // 2. Infantry (for capture - critical)
    // 3. Naval Units (from Ports)
    // 4. Air Units (from Airbases)
    // 5. Combat Units (tanks, etc)
    // ================================================================

    let unitToSpawn: UnitClass | null = null;
    let spawnLocation: { lat: number; lng: number } | null = null;

    // ================================================================
    // PRIORITY 1: BUILD FACILITIES
    // ================================================================

    // AIRBASE - enables air unit production
    if (!unitToSpawn && analysis.needsAirbase) {
        const airbaseCost = UNIT_CONFIG[UnitClass.AIRBASE]?.cost;
        if (airbaseCost && spendable >= airbaseCost.gold) {
            // Build at first city (inland preferred)
            const targetCity = analysis.myCities[0];
            unitToSpawn = UnitClass.AIRBASE;
            spawnLocation = {
                lat: targetCity.position.lat + (Math.random() - 0.5) * 0.02,
                lng: targetCity.position.lng + (Math.random() - 0.5) * 0.02
            };
            console.log(`[BOT AI] ${faction.name}: Building AIRBASE at ${targetCity.name || 'city'}`);
        }
    }

    // PORT - enables naval unit production (requires coastal city)
    if (!unitToSpawn && analysis.needsPort && analysis.hasCoastalCity) {
        const portCost = UNIT_CONFIG[UnitClass.PORT]?.cost;
        if (portCost && spendable >= portCost.gold) {
            // Find coastal city
            const coastalCity = analysis.myCities.find(c => c.isCoastal);
            if (coastalCity) {
                // Find nearest coast point
                const coastPoint = TerrainService.findNearestCoastPoint(
                    coastalCity.position.lat,
                    coastalCity.position.lng
                );
                if (coastPoint) {
                    unitToSpawn = UnitClass.PORT;
                    spawnLocation = coastPoint;
                    console.log(`[BOT AI] ${faction.name}: Building PORT near ${coastalCity.name || 'coastal city'}`);
                }
            }
        }
    }

    // MILITARY BASE - enables more army production
    if (!unitToSpawn && analysis.needsMilitaryBase) {
        const baseCost = UNIT_CONFIG[UnitClass.MILITARY_BASE]?.cost;
        if (baseCost && spendable >= baseCost.gold) {
            const targetCity = analysis.myCities[Math.floor(Math.random() * analysis.myCities.length)];
            unitToSpawn = UnitClass.MILITARY_BASE;
            spawnLocation = {
                lat: targetCity.position.lat + (Math.random() - 0.5) * 0.03,
                lng: targetCity.position.lng + (Math.random() - 0.5) * 0.03
            };
            console.log(`[BOT AI] ${faction.name}: Building MILITARY_BASE`);
        }
    }

    // ================================================================
    // PRIORITY 2: INFANTRY FOR CAPTURE (Critical!)
    // ================================================================
    if (!unitToSpawn && analysis.needMoreInfantry && analysis.neutralCitiesAvailable > 0) {
        const needsInfantry = brain.taskForces.some(tf =>
            tf.type === 'CAPTURE' &&
            tf.unitIds.filter(uid => analysis.myInfantry.some(u => u.id === uid)).length < tf.requiredInfantry
        );

        if (needsInfantry || analysis.infantryCount < 3) {
            unitToSpawn = UnitClass.INFANTRY;
        }
    }

    // ================================================================
    // PRIORITY 3: NAVAL UNITS (from Ports)
    // ================================================================
    if (!unitToSpawn && analysis.myPorts.length > 0 && analysis.needsNavalPower) {
        // Decide which naval unit to build
        const rand = Math.random();
        if (rand < 0.15 && analysis.myCarriers.length === 0) {
            // Build Aircraft Carrier (powerful mobile airbase)
            const carrierCost = UNIT_CONFIG[UnitClass.AIRCRAFT_CARRIER]?.cost;
            if (carrierCost && spendable >= carrierCost.gold && (faction.oil || 0) >= (carrierCost.oil || 0)) {
                unitToSpawn = UnitClass.AIRCRAFT_CARRIER;
                console.log(`[BOT AI] ${faction.name}: Building AIRCRAFT_CARRIER!`);
            }
        } else if (rand < 0.5) {
            // Build Destroyer (versatile naval combat)
            unitToSpawn = UnitClass.DESTROYER;
        } else {
            // Build Frigate (cheaper naval option)
            unitToSpawn = UnitClass.FRIGATE;
        }

        // Spawn at port location (water) - IMPROVED
        if (unitToSpawn && analysis.myPorts.length > 0) {
            const port = analysis.myPorts[0];
            // Pass POIs to findNearestWater for better terrain type detection
            const waterPoint = TerrainService.findNearestWater(port.position.lat, port.position.lng, state.pois);

            // Add randomness but validate spawn location is still water
            let spawnAttempts = 0;
            let validSpawn = false;
            while (!validSpawn && spawnAttempts < 5) {
                const candidateLat = waterPoint.lat + (Math.random() - 0.5) * 0.02;
                const candidateLng = waterPoint.lng + (Math.random() - 0.5) * 0.02;

                // Validate this is actually water
                if (!TerrainService.isPointLand(candidateLat, candidateLng)) {
                    spawnLocation = { lat: candidateLat, lng: candidateLng };
                    validSpawn = true;
                    console.log(`[BOT AI] Naval spawn at (${candidateLat.toFixed(3)}, ${candidateLng.toFixed(3)}) - VALID WATER`);
                }
                spawnAttempts++;
            }

            // Fallback to exact water point if random failed
            if (!validSpawn) {
                spawnLocation = waterPoint;
                console.log(`[BOT AI] Naval spawn fallback to water point`);
            }
        }
    }

    // ================================================================
    // PRIORITY 4: AIR UNITS (from Airbases)
    // ================================================================
    if (!unitToSpawn && analysis.myAirbases.length > 0 && analysis.needsAirPower) {
        const rand = Math.random();
        if (rand < 0.2 && analysis.myTransports.length < 2 && analysis.infantryCount >= 3) {
            // Build Troop Transport for rapid infantry deployment
            unitToSpawn = UnitClass.TROOP_TRANSPORT;
            console.log(`[BOT AI] ${faction.name}: Building TROOP_TRANSPORT for paradrop ops!`);
        } else if (rand < 0.6) {
            // Build Fighter Jet (air superiority)
            unitToSpawn = UnitClass.FIGHTER_JET;
        } else if (rand < 0.8) {
            // Build Helicopter (close air support)
            unitToSpawn = UnitClass.HELICOPTER;
        } else {
            // Build Heavy Bomber (ground attack)
            unitToSpawn = UnitClass.HEAVY_BOMBER;
        }

        // Spawn at airbase
        if (unitToSpawn && analysis.myAirbases.length > 0) {
            const airbase = analysis.myAirbases[0];
            spawnLocation = {
                lat: airbase.position.lat + (Math.random() - 0.5) * 0.02,
                lng: airbase.position.lng + (Math.random() - 0.5) * 0.02
            };
        }
    }

    // ================================================================
    // PRIORITY 5: COMBAT UNITS (backup production)
    // ================================================================
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
        spawnLocation = null; // Reset to use city
    }

    // Default spawn location: random city
    if (!spawnLocation) {
        const spawnCity = analysis.myCities[Math.floor(Math.random() * analysis.myCities.length)];
        spawnLocation = {
            lat: spawnCity.position.lat + (Math.random() - 0.5) * 0.02,
            lng: spawnCity.position.lng + (Math.random() - 0.5) * 0.02
        };
    }

    const finalCost = UNIT_CONFIG[unitToSpawn].cost!;

    const newUnit = spawnUnit(
        unitToSpawn,
        spawnLocation.lat,
        spawnLocation.lng,
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
                        // Clamp destination to scenario bounds
                        newUnits[unitIdx].destination = clampToScenarioBounds(
                            newUnits[unitIdx].destination!.lat,
                            newUnits[unitIdx].destination!.lng,
                            state
                        );
                    } else {
                        // In capture range - STAY PUT and capture!
                        newUnits[unitIdx] = {
                            ...newUnits[unitIdx],
                            destination: null,
                            targetId: null
                        };
                    }
                }
                // Combat units: escort and attack defenders WITH FLANKING
                else {
                    if (distToTarget > CITY_ATTACK_RANGE) {
                        // Get unit's index in the task force for flanking angle
                        const combatUnits = tfUnits.filter(u =>
                            u.unitClass !== UnitClass.INFANTRY &&
                            u.unitClass !== UnitClass.SPECIAL_FORCES
                        );
                        const unitIdx = combatUnits.findIndex(u => u.id === unit.id);
                        const flankIdx = newUnits.findIndex(u => u.id === unit.id);
                        if (flankIdx === -1) continue;

                        // Calculate flanking position if unit should flank
                        let destLat: number, destLng: number;
                        if (shouldFlank(unit) && combatUnits.length > 1) {
                            const flankPos = calculateFlankingPosition(
                                unitIdx,
                                combatUnits.length,
                                targetCity.position.lat,
                                targetCity.position.lng,
                                20 // 20km flank distance
                            );
                            destLat = flankPos.lat;
                            destLng = flankPos.lng;
                        } else {
                            // Direct approach with slight randomization
                            destLat = targetCity.position.lat + (Math.random() - 0.5) * 0.05;
                            destLng = targetCity.position.lng + (Math.random() - 0.5) * 0.05;
                        }

                        newUnits[flankIdx] = {
                            ...newUnits[flankIdx],
                            destination: clampToScenarioBounds(destLat, destLng, state),
                            targetId: null
                        };
                    } else {
                        // In attack range - engage enemies or attack city
                        const nearbyEnemy = findNearbyEnemy(unit, analysis.enemyUnits);
                        const unitIdx = newUnits.findIndex(u => u.id === unit.id);
                        if (unitIdx === -1) continue;

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
                    // Clamp destination to scenario bounds
                    newUnits[unitIdx].destination = clampToScenarioBounds(
                        newUnits[unitIdx].destination!.lat,
                        newUnits[unitIdx].destination!.lng,
                        state
                    );
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
                const clampedDest = clampToScenarioBounds(
                    analysis.nearestNeutralCity.position.lat,
                    analysis.nearestNeutralCity.position.lng,
                    state
                );
                newUnits[i] = {
                    ...newUnits[i],
                    destination: clampedDest,
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
                const clampedDest = clampToScenarioBounds(
                    nearestInfantry.destination.lat + (Math.random() - 0.5) * 0.02,
                    nearestInfantry.destination.lng + (Math.random() - 0.5) * 0.02,
                    state
                );
                newUnits[i] = {
                    ...newUnits[i],
                    destination: clampedDest,
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
                    const clampedDest = clampToScenarioBounds(
                        homeCity.position.lat + (Math.random() - 0.5) * 0.05,
                        homeCity.position.lng + (Math.random() - 0.5) * 0.05,
                        state
                    );
                    newUnits[i] = {
                        ...newUnits[i],
                        destination: clampedDest,
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
// FLANKING MANEUVER CALCULATION
// =============================================================================

/**
 * Calculate a flanking position around a target.
 * Units will approach from different angles based on their index in the group.
 * @param unitIndex Index of this unit in the attacking group (0-based)
 * @param totalUnits Total units in the attacking group
 * @param targetLat Target latitude
 * @param targetLng Target longitude
 * @param flankDistance Distance from target to set up flanking position (km)
 * @returns Flanking position coordinates
 */
function calculateFlankingPosition(
    unitIndex: number,
    totalUnits: number,
    targetLat: number,
    targetLng: number,
    flankDistance: number = 25
): { lat: number; lng: number } {
    // Distribute units around the target in a semi-circle
    // Index 0 attacks from front, others spread out on flanks
    const baseAngle = unitIndex === 0 ? 0 : Math.PI + (unitIndex / totalUnits) * Math.PI * 2;

    // Add some randomness to prevent predictable patterns
    const angleVariation = (Math.random() - 0.5) * 0.3;
    const finalAngle = baseAngle + angleVariation;

    // Convert distance to degrees (approximate: 1 degree ≈ 111km)
    const distDeg = flankDistance / 111;

    return {
        lat: targetLat + Math.sin(finalAngle) * distDeg,
        lng: targetLng + Math.cos(finalAngle) * distDeg
    };
}

/**
 * Determine if a unit should attempt a flanking maneuver.
 * Tanks and helicopters are best for flanking.
 */
function shouldFlank(unit: GameUnit): boolean {
    const flankingUnits = [
        UnitClass.GROUND_TANK,
        UnitClass.HELICOPTER,
        UnitClass.FIGHTER_JET,
        UnitClass.SPECIAL_FORCES
    ];
    return flankingUnits.includes(unit.unitClass);
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


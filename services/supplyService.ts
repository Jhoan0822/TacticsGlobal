// ============================================
// SUPPLY LINE MECHANICS
// Units far from supply sources gradually lose effectiveness
// ============================================

import { GameUnit, POI, POIType, UnitClass } from '../types';

// Supply configuration
const SUPPLY_CONFIG = {
    BASE_SUPPLY_RADIUS_KM: 100,      // Base supply radius from HQ/cities
    MILITARY_BASE_BONUS_KM: 50,      // Bonus radius from military bases
    CARRIER_SUPPLY_RADIUS_KM: 80,    // Aircraft carriers supply nearby units

    // Attrition settings
    OUT_OF_SUPPLY_THRESHOLD: 0,      // When supply drops below this, attrition begins
    ATTRITION_RATE_PER_TICK: 0.1,    // HP lost per tick when out of supply
    MORALE_PENALTY_PERCENT: 20,      // Attack reduction when low supply
    SPEED_PENALTY_PERCENT: 30,       // Speed reduction when low supply

    // Supply recovery
    SUPPLY_RECOVERY_RATE: 2,         // Supply restored per tick in supply range
    MAX_SUPPLY: 100                  // Maximum supply level
};

// Extend GameUnit with supply (add to types.ts if needed)
type UnitWithSupply = GameUnit & { supply?: number };

/**
 * Calculate distance between two points in km.
 */
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    // Approximate: 1 degree ≈ 111km
    return Math.sqrt(dLat * dLat + dLng * dLng) * 111;
}

/**
 * Check if a unit is within supply range of any friendly supply source.
 */
export function isInSupplyRange(
    unit: GameUnit,
    allUnits: GameUnit[],
    pois: POI[],
    factionId: string
): { inSupply: boolean; nearestSource: string; distance: number } {
    let nearestSource = '';
    let nearestDistance = Infinity;

    // Check distance to friendly cities (primary supply)
    const friendlyCities = pois.filter(
        p => p.ownerFactionId === factionId && p.type === POIType.CITY
    );

    for (const city of friendlyCities) {
        const dist = getDistanceKm(
            unit.position.lat, unit.position.lng,
            city.position.lat, city.position.lng
        );
        if (dist < nearestDistance) {
            nearestDistance = dist;
            nearestSource = city.name || 'City';
        }
    }

    // Check distance to Command Centers/HQ
    const friendlyHQs = allUnits.filter(
        u => u.factionId === factionId &&
            u.unitClass === UnitClass.COMMAND_CENTER &&
            u.hp > 0
    );

    for (const hq of friendlyHQs) {
        const dist = getDistanceKm(
            unit.position.lat, unit.position.lng,
            hq.position.lat, hq.position.lng
        );
        if (dist < nearestDistance) {
            nearestDistance = dist;
            nearestSource = 'HQ';
        }
    }

    // Check Military Bases (extended supply)
    const militaryBases = allUnits.filter(
        u => u.factionId === factionId &&
            u.unitClass === UnitClass.MILITARY_BASE &&
            u.hp > 0
    );

    for (const base of militaryBases) {
        const dist = getDistanceKm(
            unit.position.lat, unit.position.lng,
            base.position.lat, base.position.lng
        );
        const effectiveRange = SUPPLY_CONFIG.BASE_SUPPLY_RADIUS_KM + SUPPLY_CONFIG.MILITARY_BASE_BONUS_KM;
        if (dist < effectiveRange && dist < nearestDistance) {
            nearestDistance = dist;
            nearestSource = 'Military Base';
        }
    }

    // Check Aircraft Carriers for air units
    if (isAirUnit(unit)) {
        const carriers = allUnits.filter(
            u => u.factionId === factionId &&
                u.unitClass === UnitClass.AIRCRAFT_CARRIER &&
                u.hp > 0
        );

        for (const carrier of carriers) {
            const dist = getDistanceKm(
                unit.position.lat, unit.position.lng,
                carrier.position.lat, carrier.position.lng
            );
            if (dist < SUPPLY_CONFIG.CARRIER_SUPPLY_RADIUS_KM && dist < nearestDistance) {
                nearestDistance = dist;
                nearestSource = 'Carrier';
            }
        }
    }

    const inSupply = nearestDistance <= SUPPLY_CONFIG.BASE_SUPPLY_RADIUS_KM;

    return { inSupply, nearestSource, distance: nearestDistance };
}

/**
 * Check if a unit is an air unit.
 */
function isAirUnit(unit: GameUnit): boolean {
    return [
        UnitClass.FIGHTER_JET,
        UnitClass.HEAVY_BOMBER,
        UnitClass.HELICOPTER,
        UnitClass.RECON_DRONE,
        UnitClass.TROOP_TRANSPORT
    ].includes(unit.unitClass);
}

/**
 * Update supply levels for all units.
 * Call this each game tick.
 */
export function updateSupplyLevels(
    units: GameUnit[],
    pois: POI[]
): GameUnit[] {
    return units.map(unit => {
        const unitWithSupply = unit as UnitWithSupply;
        const currentSupply = unitWithSupply.supply ?? SUPPLY_CONFIG.MAX_SUPPLY;

        const supplyStatus = isInSupplyRange(unit, units, pois, unit.factionId);

        let newSupply: number;
        if (supplyStatus.inSupply) {
            // Recover supply when in range
            newSupply = Math.min(
                SUPPLY_CONFIG.MAX_SUPPLY,
                currentSupply + SUPPLY_CONFIG.SUPPLY_RECOVERY_RATE
            );
        } else {
            // Lose supply when out of range
            const distanceFactor = Math.min(2, supplyStatus.distance / SUPPLY_CONFIG.BASE_SUPPLY_RADIUS_KM);
            newSupply = Math.max(0, currentSupply - (1 * distanceFactor));
        }

        return { ...unit, supply: newSupply };
    });
}

/**
 * Apply supply attrition to units with low supply.
 */
export function applySupplyAttrition(units: GameUnit[]): GameUnit[] {
    return units.map(unit => {
        const unitWithSupply = unit as UnitWithSupply;
        const supply = unitWithSupply.supply ?? SUPPLY_CONFIG.MAX_SUPPLY;

        if (supply <= SUPPLY_CONFIG.OUT_OF_SUPPLY_THRESHOLD) {
            // Apply HP loss
            const newHp = Math.max(0, unit.hp - SUPPLY_CONFIG.ATTRITION_RATE_PER_TICK);
            return { ...unit, hp: newHp };
        }

        return unit;
    });
}

/**
 * Get combat modifiers based on supply level.
 */
export function getSupplyModifiers(unit: GameUnit): {
    attackModifier: number;
    speedModifier: number;
    isLowSupply: boolean;
} {
    const unitWithSupply = unit as UnitWithSupply;
    const supply = unitWithSupply.supply ?? SUPPLY_CONFIG.MAX_SUPPLY;

    const supplyPercent = supply / SUPPLY_CONFIG.MAX_SUPPLY;

    if (supplyPercent >= 0.5) {
        return { attackModifier: 1.0, speedModifier: 1.0, isLowSupply: false };
    }

    // Low supply penalties scale with how low supply is
    const penaltyScale = (0.5 - supplyPercent) * 2; // 0 to 1

    return {
        attackModifier: 1.0 - (SUPPLY_CONFIG.MORALE_PENALTY_PERCENT / 100) * penaltyScale,
        speedModifier: 1.0 - (SUPPLY_CONFIG.SPEED_PENALTY_PERCENT / 100) * penaltyScale,
        isLowSupply: true
    };
}

/**
 * Get supply status color for UI display.
 */
export function getSupplyStatusColor(unit: GameUnit): string {
    const unitWithSupply = unit as UnitWithSupply;
    const supply = unitWithSupply.supply ?? SUPPLY_CONFIG.MAX_SUPPLY;
    const percent = supply / SUPPLY_CONFIG.MAX_SUPPLY;

    if (percent >= 0.75) return '#22c55e'; // Green - fully supplied
    if (percent >= 0.5) return '#eab308';  // Yellow - adequate
    if (percent >= 0.25) return '#f97316'; // Orange - low
    return '#ef4444';                       // Red - critical
}

export { SUPPLY_CONFIG };

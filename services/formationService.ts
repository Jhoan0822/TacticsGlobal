// ============================================
// UNIT FORMATIONS SYSTEM
// Allows units to move and fight in coordinated patterns
// ============================================

import { GameUnit, UnitClass } from '../types';

export enum FormationType {
    NONE = 'NONE',           // No formation, free movement
    LINE = 'LINE',           // Units in a horizontal line
    COLUMN = 'COLUMN',       // Units in a vertical column
    WEDGE = 'WEDGE',         // Arrow/chevron pointing forward
    SQUARE = 'SQUARE',       // Defensive box formation
    CIRCLE = 'CIRCLE',       // Defensive circle around a center
    SPREAD = 'SPREAD'        // Maximum spacing to avoid AoE
}

// Formation configuration
const FORMATION_CONFIG = {
    [FormationType.LINE]: {
        spacing: 0.02,    // 2km between units (in degrees)
        description: 'Wide line for maximum firepower'
    },
    [FormationType.COLUMN]: {
        spacing: 0.015,
        description: 'Narrow column for fast movement'
    },
    [FormationType.WEDGE]: {
        spacing: 0.025,
        angle: 45,        // Degrees from center axis
        description: 'Arrow formation for aggressive assault'
    },
    [FormationType.SQUARE]: {
        spacing: 0.02,
        description: 'Defensive box protecting center'
    },
    [FormationType.CIRCLE]: {
        radius: 0.03,     // 3km radius
        description: 'Circular defense pattern'
    },
    [FormationType.SPREAD]: {
        spacing: 0.05,    // Maximum spacing to avoid nukes
        description: 'Wide spread to minimize AoE damage'
    }
};

/**
 * Calculate formation positions for a group of units.
 * Returns an array of target positions for each unit.
 */
export function calculateFormationPositions(
    units: GameUnit[],
    formation: FormationType,
    centerLat: number,
    centerLng: number,
    facingAngle: number = 0  // Direction the formation faces (0 = North, 90 = East)
): { unitId: string; lat: number; lng: number }[] {
    if (formation === FormationType.NONE || units.length === 0) {
        return units.map(u => ({ unitId: u.id, lat: centerLat, lng: centerLng }));
    }

    const positions: { unitId: string; lat: number; lng: number }[] = [];
    const count = units.length;
    const facingRad = (facingAngle * Math.PI) / 180;

    switch (formation) {
        case FormationType.LINE: {
            const spacing = FORMATION_CONFIG[formation].spacing;
            const halfWidth = (count - 1) * spacing / 2;

            units.forEach((unit, i) => {
                const offset = i * spacing - halfWidth;
                // Perpendicular to facing direction
                const lat = centerLat + Math.cos(facingRad + Math.PI / 2) * offset;
                const lng = centerLng + Math.sin(facingRad + Math.PI / 2) * offset;
                positions.push({ unitId: unit.id, lat, lng });
            });
            break;
        }

        case FormationType.COLUMN: {
            const spacing = FORMATION_CONFIG[formation].spacing;
            const halfDepth = (count - 1) * spacing / 2;

            units.forEach((unit, i) => {
                const offset = i * spacing - halfDepth;
                // Along facing direction
                const lat = centerLat + Math.cos(facingRad) * offset;
                const lng = centerLng + Math.sin(facingRad) * offset;
                positions.push({ unitId: unit.id, lat, lng });
            });
            break;
        }

        case FormationType.WEDGE: {
            const spacing = FORMATION_CONFIG[formation].spacing;
            const wedgeAngle = (FORMATION_CONFIG[formation].angle * Math.PI) / 180;

            // Leader at front
            positions.push({ unitId: units[0].id, lat: centerLat, lng: centerLng });

            // Alternating left/right behind leader
            for (let i = 1; i < count; i++) {
                const row = Math.ceil(i / 2);
                const side = i % 2 === 1 ? 1 : -1; // Alternate sides

                const backOffset = row * spacing;
                const sideOffset = row * spacing * Math.tan(wedgeAngle);

                const lat = centerLat - Math.cos(facingRad) * backOffset +
                    Math.cos(facingRad + Math.PI / 2) * sideOffset * side;
                const lng = centerLng - Math.sin(facingRad) * backOffset +
                    Math.sin(facingRad + Math.PI / 2) * sideOffset * side;

                positions.push({ unitId: units[i].id, lat, lng });
            }
            break;
        }

        case FormationType.SQUARE: {
            const spacing = FORMATION_CONFIG[formation].spacing;
            const sideLength = Math.ceil(Math.sqrt(count));
            const halfSize = (sideLength - 1) * spacing / 2;

            units.forEach((unit, i) => {
                const row = Math.floor(i / sideLength);
                const col = i % sideLength;

                const lat = centerLat + (row * spacing - halfSize);
                const lng = centerLng + (col * spacing - halfSize);
                positions.push({ unitId: unit.id, lat, lng });
            });
            break;
        }

        case FormationType.CIRCLE: {
            const radius = FORMATION_CONFIG[formation].radius;

            units.forEach((unit, i) => {
                const angle = (i / count) * Math.PI * 2;
                const lat = centerLat + Math.cos(angle) * radius;
                const lng = centerLng + Math.sin(angle) * radius;
                positions.push({ unitId: unit.id, lat, lng });
            });
            break;
        }

        case FormationType.SPREAD: {
            const spacing = FORMATION_CONFIG[formation].spacing;
            const gridSize = Math.ceil(Math.sqrt(count));
            const halfSize = (gridSize - 1) * spacing / 2;

            units.forEach((unit, i) => {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                // Add randomness to prevent predictable patterns
                const jitterLat = (Math.random() - 0.5) * spacing * 0.3;
                const jitterLng = (Math.random() - 0.5) * spacing * 0.3;

                const lat = centerLat + (row * spacing - halfSize) + jitterLat;
                const lng = centerLng + (col * spacing - halfSize) + jitterLng;
                positions.push({ unitId: unit.id, lat, lng });
            });
            break;
        }
    }

    return positions;
}

/**
 * Calculate the facing angle from a group center to a target.
 */
export function getFacingAngle(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
): number {
    const dLat = toLat - fromLat;
    const dLng = toLng - fromLng;
    return Math.atan2(dLng, dLat) * (180 / Math.PI);
}

/**
 * Get the center position of a group of units.
 */
export function getGroupCenter(units: GameUnit[]): { lat: number; lng: number } {
    if (units.length === 0) return { lat: 0, lng: 0 };

    const sum = units.reduce(
        (acc, u) => ({ lat: acc.lat + u.position.lat, lng: acc.lng + u.position.lng }),
        { lat: 0, lng: 0 }
    );

    return {
        lat: sum.lat / units.length,
        lng: sum.lng / units.length
    };
}

/**
 * Get recommended formation for a unit composition.
 */
export function getRecommendedFormation(units: GameUnit[]): FormationType {
    if (units.length <= 1) return FormationType.NONE;

    const hasInfantry = units.some(u => u.unitClass === UnitClass.INFANTRY);
    const hasTanks = units.some(u => u.unitClass === UnitClass.GROUND_TANK);
    const hasAir = units.some(u =>
        u.unitClass === UnitClass.FIGHTER_JET ||
        u.unitClass === UnitClass.HELICOPTER
    );

    // Large groups should spread against AoE
    if (units.length > 10) return FormationType.SPREAD;

    // Mixed infantry/tank = wedge for assault
    if (hasInfantry && hasTanks) return FormationType.WEDGE;

    // Pure infantry = line for maximum firepower
    if (hasInfantry && !hasTanks) return FormationType.LINE;

    // Pure tanks = column for fast advance
    if (hasTanks && !hasInfantry) return FormationType.COLUMN;

    // Air units = spread for safety
    if (hasAir) return FormationType.SPREAD;

    return FormationType.LINE;
}

export const FormationNames: Record<FormationType, string> = {
    [FormationType.NONE]: 'None',
    [FormationType.LINE]: 'Line',
    [FormationType.COLUMN]: 'Column',
    [FormationType.WEDGE]: 'Wedge',
    [FormationType.SQUARE]: 'Square',
    [FormationType.CIRCLE]: 'Circle',
    [FormationType.SPREAD]: 'Spread'
};

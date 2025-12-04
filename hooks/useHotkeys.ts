import { useEffect, useCallback } from 'react';
import { UnitClass } from '../types';

interface HotkeyConfig {
    onBuyUnit: (type: UnitClass) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    enabled: boolean;
}

// HOTKEY MAPPINGS
// Q = Infantry, W = Tank, E = Helicopter, R = Jet
// A = Destroyer, S = Frigate, D = Submarine
// Z = Missile Launcher, X = SAM
// 1-9 = Control groups (handled elsewhere)
// ESC = Deselect

const PRODUCTION_HOTKEYS: Record<string, UnitClass> = {
    'q': UnitClass.INFANTRY,
    'w': UnitClass.GROUND_TANK,
    'e': UnitClass.HELICOPTER,
    'r': UnitClass.FIGHTER_JET,
    'a': UnitClass.DESTROYER,
    's': UnitClass.FRIGATE,
    'd': UnitClass.SUBMARINE,
    'z': UnitClass.MISSILE_LAUNCHER,
    'x': UnitClass.SAM_LAUNCHER,
    't': UnitClass.HEAVY_BOMBER,
};

export const useHotkeys = ({ onBuyUnit, onSelectAll, onDeselectAll, enabled }: HotkeyConfig) => {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled) return;

        // Ignore if typing in input field
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        const key = e.key.toLowerCase();

        // Production Hotkeys
        if (PRODUCTION_HOTKEYS[key]) {
            e.preventDefault();
            onBuyUnit(PRODUCTION_HOTKEYS[key]);
            return;
        }

        // Select All (Ctrl+A)
        if (e.ctrlKey && key === 'a') {
            e.preventDefault();
            onSelectAll();
            return;
        }

        // Deselect (Escape)
        if (key === 'escape') {
            e.preventDefault();
            onDeselectAll();
            return;
        }
    }, [enabled, onBuyUnit, onSelectAll, onDeselectAll]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};

export const HOTKEY_LABELS: Record<UnitClass, string> = {
    [UnitClass.INFANTRY]: 'Q',
    [UnitClass.GROUND_TANK]: 'W',
    [UnitClass.HELICOPTER]: 'E',
    [UnitClass.FIGHTER_JET]: 'R',
    [UnitClass.HEAVY_BOMBER]: 'T',
    [UnitClass.DESTROYER]: 'A',
    [UnitClass.FRIGATE]: 'S',
    [UnitClass.SUBMARINE]: 'D',
    [UnitClass.MISSILE_LAUNCHER]: 'Z',
    [UnitClass.SAM_LAUNCHER]: 'X',
    // Others without hotkeys
    [UnitClass.SPECIAL_FORCES]: '',
    [UnitClass.MOBILE_COMMAND_CENTER]: '',
    [UnitClass.COMMAND_CENTER]: '',
    [UnitClass.MILITARY_BASE]: '',
    [UnitClass.AIRBASE]: '',
    [UnitClass.PORT]: '',
    [UnitClass.TROOP_TRANSPORT]: '',
    [UnitClass.RECON_DRONE]: '',
    [UnitClass.AIRCRAFT_CARRIER]: '',
    [UnitClass.BATTLESHIP]: '',
    [UnitClass.PATROL_BOAT]: '',
    [UnitClass.MINELAYER]: '',
};

import { useEffect, useCallback } from 'react';
import { UnitClass } from '../types';

interface HotkeyConfig {
    onBuyUnit: (type: UnitClass) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onToggleAutoTarget?: () => void;
    onCycleAutoMode?: () => void;
    // Control group callbacks
    onAssignGroup?: (groupNum: number) => void;
    onRecallGroup?: (groupNum: number) => void;
    onAddToGroup?: (groupNum: number) => void;
    onRemoveFromGroup?: (groupNum: number) => void;
    enabled: boolean;
}

// HOTKEY MAPPINGS
// Q = Infantry, W = Tank, E = Helicopter, R = Jet
// A = Destroyer, S = Frigate, D = Submarine
// Z = Missile Launcher, X = SAM
// G = Toggle Auto-Target, F = Cycle Auto-Mode (NONE -> DEFEND -> ATTACK -> PATROL)
// 1-9 = Recall Control Group
// Ctrl+1-9 = Assign Control Group
// Shift+1-9 = Add to Control Group
// Alt+1-9 = Remove from Control Group
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

export const useHotkeys = ({
    onBuyUnit, onSelectAll, onDeselectAll,
    onToggleAutoTarget, onCycleAutoMode,
    onAssignGroup, onRecallGroup, onAddToGroup, onRemoveFromGroup,
    enabled
}: HotkeyConfig) => {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled) return;

        // Ignore if typing in input field
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        const key = e.key.toLowerCase();

        // ============================================
        // CONTROL GROUPS (1-9)
        // ============================================
        if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
            const groupNum = parseInt(e.key);
            if (groupNum >= 1 && groupNum <= 9) {
                if (e.ctrlKey && onAssignGroup) {
                    // Ctrl+1-9: Assign selected units to group
                    e.preventDefault();
                    onAssignGroup(groupNum);
                    return;
                } else if (e.shiftKey && onAddToGroup) {
                    // Shift+1-9: Add selected units to group
                    e.preventDefault();
                    onAddToGroup(groupNum);
                    return;
                } else if (e.altKey && onRemoveFromGroup) {
                    // Alt+1-9: Remove selected units from group
                    e.preventDefault();
                    onRemoveFromGroup(groupNum);
                    return;
                } else if (!e.ctrlKey && !e.shiftKey && !e.altKey && onRecallGroup) {
                    // Plain 1-9: Recall/select group
                    e.preventDefault();
                    onRecallGroup(groupNum);
                    return;
                }
            }
        }

        // Production Hotkeys
        if (PRODUCTION_HOTKEYS[key]) {
            e.preventDefault();
            onBuyUnit(PRODUCTION_HOTKEYS[key]);
            return;
        }

        // Auto-Target Toggle (G)
        if (key === 'g' && onToggleAutoTarget) {
            e.preventDefault();
            onToggleAutoTarget();
            return;
        }

        // Cycle Auto-Mode (F)
        if (key === 'f' && onCycleAutoMode) {
            e.preventDefault();
            onCycleAutoMode();
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
    }, [enabled, onBuyUnit, onSelectAll, onDeselectAll, onToggleAutoTarget, onCycleAutoMode,
        onAssignGroup, onRecallGroup, onAddToGroup, onRemoveFromGroup]);

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

// Auto-Mode Labels
export const AUTO_MODE_LABELS = {
    NONE: '⚪',
    DEFEND: '🛡️',
    ATTACK: '⚔️',
    PATROL: '🔄'
};

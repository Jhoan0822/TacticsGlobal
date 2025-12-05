import React, { useState } from 'react';
import { GameState, UnitClass, Faction, POIType, Difficulty } from '../types';
import { UNIT_CONFIG, POI_CONFIG, DIPLOMACY } from '../constants';
import { getTacticalAdvice } from '../services/geminiService';
import { evaluateAllianceRequest } from '../services/gameLogic';
import { useTooltip } from './Tooltip';
import { HOTKEY_LABELS, AUTO_MODE_LABELS } from '../hooks/useHotkeys';

interface Props {
    gameState: GameState;
    onBuyUnit: (type: UnitClass) => void;
    onAllianceRequest: (factionId: string) => void;
    selectedUnitIds: string[];
    onUnitAction: (action: string, id: string) => void;
    onSetDifficulty: (diff: Difficulty) => void;
    onSetAutoMode?: (mode: 'NONE' | 'DEFEND' | 'ATTACK' | 'PATROL') => void;
    onToggleAutoTarget?: () => void;
}

const Sidebar: React.FC<Props> = ({ gameState, onBuyUnit, onAllianceRequest, selectedUnitIds, onUnitAction, onSetDifficulty, onSetAutoMode, onToggleAutoTarget }) => {
    const [advice, setAdvice] = useState<string | null>(null);
    const [loadingAi, setLoadingAi] = useState(false);
    const [activeTab, setActiveTab] = useState<'UNITS' | 'BUILD' | 'DIPLOMACY'>('BUILD');

    // ============================================
    // SELECT BASE MODE
    // ============================================
    if (gameState.gameMode === 'SELECTION') {
        return (
            <div className="absolute top-6 left-6 glass-panel rounded-2xl p-6 z-[2000] max-w-sm animate-slide-up border border-cyan-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                        <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="font-display text-xl font-bold text-white tracking-wider">INITIALIZE</h1>
                        <p className="text-xs text-slate-400">Establish your headquarters</p>
                    </div>
                </div>

                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 mb-4">
                    <p className="text-sm text-slate-300">
                        Click on a <span className="text-yellow-400 font-bold">CITY</span> to set your command center.
                    </p>
                </div>

                <div>
                    <div className="text-xs font-bold text-slate-400 mb-3 tracking-wider uppercase">Difficulty</div>
                    <div className="flex gap-2">
                        {[Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD].map(diff => (
                            <button
                                key={diff}
                                onClick={() => onSetDifficulty(diff)}
                                className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border ${gameState.difficulty === diff
                                    ? diff === Difficulty.HARD
                                        ? 'bg-red-500/20 border-red-500/50 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                                        : diff === Difficulty.MEDIUM
                                            ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                                            : 'bg-green-500/20 border-green-500/50 text-green-300'
                                    : 'bg-slate-800/50 border-slate-600/30 text-slate-500 hover:bg-slate-700/50'
                                    }`}
                            >
                                {diff}
                            </button>
                        ))}
                    </div>
                    <p className="mt-3 text-xs text-slate-500 italic text-center">
                        {gameState.difficulty === Difficulty.EASY ? "Relaxed pace. Slower enemy waves." :
                            gameState.difficulty === Difficulty.HARD ? "FRENETIC. Relentless enemy assaults." :
                                "Standard tactical simulation."}
                    </p>
                </div>
            </div>
        )
    }

    // ============================================
    // PLACING STRUCTURE MODE
    // ============================================
    if (gameState.gameMode === 'PLACING_STRUCTURE') {
        return (
            <div className="absolute top-6 left-6 glass-panel rounded-2xl p-5 z-[2000] animate-slide-up border border-yellow-500/30">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center animate-pulse">
                        <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="font-display text-lg font-bold text-yellow-400 tracking-wider">CONSTRUCTION</h1>
                        <p className="text-xs text-slate-400">Select a valid location</p>
                    </div>
                </div>
            </div>
        )
    }

    // ============================================
    // MAIN SIDEBAR
    // ============================================
    const playerFaction = gameState.factions.find(f => f.id === gameState.localPlayerId);
    const playerUnits = gameState.units.filter(u => u.factionId === gameState.localPlayerId);
    const selectedUnit = selectedUnitIds.length === 1 ? gameState.units.find(u => u.id === selectedUnitIds[0]) : null;
    const isMultiSelect = selectedUnitIds.length > 1;

    const baseIncomeGold = 5 + (playerUnits.length * 0.5);
    const baseIncomeOil = 2;
    let poiGold = 0; let poiOil = 0;
    gameState.pois?.forEach(poi => {
        if (poi.ownerFactionId === gameState.localPlayerId) {
            poiGold += POI_CONFIG[poi.type].incomeGold; poiOil += POI_CONFIG[poi.type].incomeOil;
        }
    });

    const goldPerSec = Math.floor((baseIncomeGold + poiGold) * 0.83);
    const oilPerSec = Math.floor((baseIncomeOil + poiOil) * 0.83);

    const handleAiAdvice = async () => {
        setLoadingAi(true);
        const result = await getTacticalAdvice(gameState);
        setAdvice(result);
        setLoadingAi(false);
    };

    const structures = [UnitClass.AIRBASE, UnitClass.PORT, UnitClass.MILITARY_BASE];
    const seaUnits = [UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.SUBMARINE, UnitClass.AIRCRAFT_CARRIER, UnitClass.BATTLESHIP, UnitClass.PATROL_BOAT, UnitClass.MINELAYER];
    const airUnits = [UnitClass.FIGHTER_JET, UnitClass.HEAVY_BOMBER, UnitClass.TROOP_TRANSPORT, UnitClass.HELICOPTER];
    const groundUnits = [UnitClass.INFANTRY, UnitClass.GROUND_TANK, UnitClass.MISSILE_LAUNCHER, UnitClass.SAM_LAUNCHER, UnitClass.MOBILE_COMMAND_CENTER];

    const hasCity = gameState.pois.some(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY);
    const hasNavalCap = gameState.pois.some(p => p.ownerFactionId === gameState.localPlayerId && p.type === POIType.CITY && p.isCoastal) ||
        gameState.units.some(u => u.factionId === gameState.localPlayerId && u.unitClass === UnitClass.PORT);
    const hasAirCap = hasCity || gameState.units.some(u => u.factionId === gameState.localPlayerId && (u.unitClass === UnitClass.AIRBASE || u.unitClass === UnitClass.MILITARY_BASE));

    const { showTooltip, hideTooltip } = useTooltip();

    const renderBuildList = (list: UnitClass[], title: string, reqMet: boolean, reqText: string) => (
        <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">{title}</span>
                {!reqMet && <span className="text-[10px] text-red-400/70">{reqText}</span>}
            </div>
            <div className="space-y-2">
                {list.map(type => {
                    const stats = UNIT_CONFIG[type];
                    const costGold = stats.cost?.gold || 0;
                    const costOil = stats.cost?.oil || 0;
                    const currentGold = playerFaction?.gold || 0;
                    const currentOil = playerFaction?.oil || 0;
                    const canAfford = currentGold >= costGold && currentOil >= costOil;
                    const disabled = !canAfford || !reqMet;

                    return (
                        <button
                            key={type}
                            onClick={() => onBuyUnit(type)}
                            disabled={disabled}
                            onMouseEnter={(e) => {
                                showTooltip(
                                    type.replace(/_/g, ' '),
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                            <span className="text-slate-400">HP:</span> <span className="text-green-400 font-mono">{stats.maxHp}</span>
                                            <span className="text-slate-400">ATK:</span> <span className="text-red-400 font-mono">{stats.attack}</span>
                                            <span className="text-slate-400">RNG:</span> <span className="text-yellow-400 font-mono">{stats.range}km</span>
                                            <span className="text-slate-400">SPD:</span> <span className="text-cyan-400 font-mono">{stats.speed}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 border-t border-slate-700 pt-2">
                                            {stats.canCapture ? "🎯 Can Capture Cities" : "⚙️ Support Unit"}
                                        </div>
                                    </div>,
                                    e
                                );
                            }}
                            onMouseLeave={hideTooltip}
                            className={`w-full text-left p-3 rounded-xl border flex justify-between items-center transition-all group ${disabled
                                ? 'bg-slate-900/30 border-slate-800/50 opacity-40 cursor-not-allowed'
                                : 'bg-slate-800/40 border-slate-600/30 hover:bg-slate-700/50 hover:border-cyan-500/30 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                {HOTKEY_LABELS[type] && (
                                    <span className="w-6 h-6 bg-slate-700/80 text-xs font-bold text-cyan-400 rounded-lg flex items-center justify-center border border-slate-600/50 group-hover:border-cyan-500/50 group-hover:bg-cyan-500/10 transition-all">
                                        {HOTKEY_LABELS[type]}
                                    </span>
                                )}
                                <span className="font-medium text-slate-200 text-sm">{type.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono">
                                <span className="text-yellow-400">{costGold}G</span>
                                <span className="text-cyan-400">{costOil}O</span>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    );

    return (
        <div className="absolute top-0 left-0 h-full w-80 glass-panel-dark border-r border-slate-700/30 z-[1000] flex flex-col font-sans shadow-2xl pointer-events-auto">
            {/* Header */}
            <div className="p-5 border-b border-slate-700/30">
                <div className="flex items-center justify-between">
                    <h1 className="font-display text-xl font-bold tracking-wider">
                        <span className="text-white">OPEN</span>
                        <span className="gradient-text">FRONT</span>
                    </h1>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
                        LIVE
                    </div>
                </div>
            </div>

            {/* Resources */}
            <div className="grid grid-cols-2 gap-3 p-4 border-b border-slate-700/30">
                <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 p-4 rounded-xl border border-yellow-500/20">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-yellow-500/80 font-medium">GOLD</span>
                        <span className="text-[10px] text-green-400 font-mono">+{Math.floor(baseIncomeGold + poiGold)}/t</span>
                    </div>
                    <div className="text-2xl font-bold text-white font-mono">{Math.floor(playerFaction?.gold || 0).toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 p-4 rounded-xl border border-cyan-500/20">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-cyan-500/80 font-medium">OIL</span>
                        <span className="text-[10px] text-green-400 font-mono">+{Math.floor(baseIncomeOil + poiOil)}/t</span>
                    </div>
                    <div className="text-2xl font-bold text-white font-mono">{Math.floor(playerFaction?.oil || 0).toLocaleString()}</div>
                </div>
            </div>

            {/* Unit Control Panel */}
            {selectedUnitIds.length > 0 && (
                <div className="p-4 border-b border-slate-700/30 bg-slate-800/30">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-slate-400 tracking-wider uppercase font-medium">
                            {selectedUnitIds.length} Unit{selectedUnitIds.length > 1 ? 's' : ''} Selected
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => onSetAutoMode?.('NONE')}
                            className="py-2.5 text-[10px] rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 border border-slate-600/30 hover:border-slate-500/50 transition-all font-medium"
                        >
                            ⚪ MANUAL
                        </button>
                        <button
                            onClick={() => onSetAutoMode?.('DEFEND')}
                            className="py-2.5 text-[10px] rounded-lg bg-green-900/30 hover:bg-green-800/40 text-green-400 border border-green-600/30 hover:border-green-500/50 transition-all font-medium"
                        >
                            🛡️ DEFEND
                        </button>
                        <button
                            onClick={() => onSetAutoMode?.('ATTACK')}
                            className="py-2.5 text-[10px] rounded-lg bg-red-900/30 hover:bg-red-800/40 text-red-400 border border-red-600/30 hover:border-red-500/50 transition-all font-medium"
                        >
                            ⚔️ ATTACK
                        </button>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-700/30">
                {['BUILD', 'UNITS', 'DIPLOMACY'].map(tab => (
                    <button
                        key={tab}
                        className={`flex-1 py-3.5 text-center text-xs tracking-wider transition-all relative font-medium ${activeTab === (tab === 'UNITS' ? 'UNITS' : tab === 'DIPLOMACY' ? 'DIPLOMACY' : 'BUILD')
                            ? 'text-cyan-400 bg-slate-800/30'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/20'
                            }`}
                        onClick={() => setActiveTab(tab === 'UNITS' ? 'UNITS' : tab === 'DIPLOMACY' ? 'DIPLOMACY' : 'BUILD')}
                    >
                        {tab === 'DIPLOMACY' ? 'POLITICS' : tab === 'UNITS' ? 'ASSETS' : tab}
                        {activeTab === (tab === 'UNITS' ? 'UNITS' : tab === 'DIPLOMACY' ? 'DIPLOMACY' : 'BUILD') && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'BUILD' && (
                    <div>
                        {renderBuildList(structures, "Facilities", true, "")}
                        {renderBuildList(groundUnits, "Ground Forces", hasCity, "Requires City")}
                        {renderBuildList(airUnits, "Air Force", hasAirCap, "Requires Airbase")}
                        {renderBuildList(seaUnits, "Naval Fleet", hasNavalCap, "Requires Port")}
                    </div>
                )}
                {activeTab === 'UNITS' && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase">Active Units</h3>
                            <span className="text-xs text-cyan-400 font-mono">{playerUnits.length}</span>
                        </div>
                        <div className="space-y-2">
                            {playerUnits.map(u => {
                                const hpPercent = (u.hp / u.maxHp) * 100;
                                return (
                                    <div key={u.id} className="flex items-center gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/30 hover:border-slate-600/50 transition-all cursor-pointer">
                                        <div className="flex-1">
                                            <span className="text-sm text-slate-200">{u.unitClass.replace(/_/g, ' ')}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all ${hpPercent > 50 ? 'bg-green-500' : hpPercent > 25 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                    style={{ width: `${hpPercent}%` }}
                                                />
                                            </div>
                                            <span className={`text-xs font-mono ${hpPercent > 50 ? 'text-green-400' : hpPercent > 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {Math.floor(u.hp)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {activeTab === 'DIPLOMACY' && (
                    <div className="space-y-3">
                        {gameState.factions.filter(f => f.id !== gameState.localPlayerId && f.id !== 'NEUTRAL').map(faction => {
                            const relation = playerFaction?.relations[faction.id] || 0;
                            const allianceAnalysis = evaluateAllianceRequest(gameState, faction.id);
                            let status = 'NEUTRAL';
                            let statusColor = 'text-slate-400';
                            let bgColor = 'from-slate-500/10';
                            if (relation <= DIPLOMACY.WAR_THRESHOLD) {
                                status = 'HOSTILE';
                                statusColor = 'text-red-400';
                                bgColor = 'from-red-500/10';
                            }
                            else if (relation >= DIPLOMACY.ALLIANCE_THRESHOLD) {
                                status = 'ALLY';
                                statusColor = 'text-green-400';
                                bgColor = 'from-green-500/10';
                            }

                            return (
                                <div key={faction.id} className={`bg-gradient-to-r ${bgColor} to-transparent p-4 rounded-xl border border-slate-600/30`}>
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="font-bold text-sm" style={{ color: faction.color }}>{faction.name}</div>
                                        <div className={`text-xs font-bold ${statusColor}`}>{status}</div>
                                    </div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-xs text-slate-500">Relations</span>
                                        <span className={`text-xs font-mono ${relation > 0 ? 'text-green-400' : relation < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                            {relation > 0 ? '+' : ''}{relation}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-xs text-slate-500">Alliance Chance</span>
                                        <span className={`text-xs font-mono ${allianceAnalysis.chance > 50 ? 'text-green-400' : 'text-red-400'}`}>
                                            {Math.floor(allianceAnalysis.chance)}%
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => onAllianceRequest(faction.id)}
                                        className="w-full bg-slate-700/50 hover:bg-slate-600/50 text-xs py-2.5 rounded-lg text-white disabled:opacity-30 font-medium tracking-wide transition-all border border-slate-600/30 hover:border-slate-500/50"
                                        disabled={status === 'ALLY' || status === 'HOSTILE'}
                                    >
                                        PROPOSE ALLIANCE
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Selected Unit Panel */}
            {selectedUnit && selectedUnit.factionId === gameState.localPlayerId && (
                <div className="p-4 bg-slate-800/50 border-t border-slate-700/30 animate-slide-up">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-yellow-400">{selectedUnit.unitClass.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-slate-500 font-mono">#{selectedUnit.id.substr(0, 6)}</span>
                    </div>
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mb-3 border border-slate-700/50">
                        <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                            style={{ width: `${(selectedUnit.hp / selectedUnit.maxHp) * 100}%` }}
                        />
                    </div>
                    {selectedUnit.unitClass === UnitClass.TROOP_TRANSPORT && (
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => onUnitAction('DEPLOY_TANK', selectedUnit.id)} className="bg-blue-900/40 border border-blue-500/30 hover:bg-blue-800/50 text-xs text-blue-200 py-2.5 rounded-lg transition-all">DEPLOY TANK</button>
                            <button onClick={() => onUnitAction('DEPLOY_INFANTRY', selectedUnit.id)} className="bg-blue-900/40 border border-blue-500/30 hover:bg-blue-800/50 text-xs text-blue-200 py-2.5 rounded-lg transition-all">DEPLOY INF</button>
                        </div>
                    )}
                    {selectedUnit.unitClass === UnitClass.AIRCRAFT_CARRIER && (
                        <button onClick={() => onUnitAction('DEPLOY_SPECOPS', selectedUnit.id)} className="w-full bg-blue-900/40 border border-blue-500/30 hover:bg-blue-800/50 text-xs text-blue-200 py-2.5 rounded-lg transition-all">
                            DEPLOY SPECOPS
                        </button>
                    )}
                </div>
            )}

            {isMultiSelect && (
                <div className="p-4 bg-slate-800/50 border-t border-slate-700/30 animate-slide-up">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-cyan-400">GROUP SELECTION</span>
                        <span className="text-xs text-slate-400 font-mono">{selectedUnitIds.length} units</span>
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                        <p><span className="text-yellow-400 font-mono">CTRL+1-9</span> to assign group</p>
                        <p><span className="text-yellow-400 font-mono">1-9</span> to select group</p>
                    </div>
                </div>
            )}

            {/* AI Advisor */}
            <div className="p-4 bg-gradient-to-r from-purple-900/20 to-transparent border-t border-purple-500/20">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-400 tracking-wider">GEMINI AI</span>
                    <button
                        onClick={handleAiAdvice}
                        disabled={loadingAi}
                        className="text-[10px] bg-purple-900/40 border border-purple-500/30 text-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-800/50 disabled:opacity-50 transition-all"
                    >
                        {loadingAi ? 'ANALYZING...' : 'GET ADVICE'}
                    </button>
                </div>
                <p className="text-xs text-slate-400 italic leading-relaxed min-h-[20px]">
                    {advice ? `"${advice}"` : "Ready for tactical analysis."}
                </p>
            </div>
        </div>
    );
};

export default Sidebar;
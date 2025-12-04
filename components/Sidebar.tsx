import React, { useState } from 'react';
import { GameState, UnitClass, Faction, POIType, Difficulty } from '../types';
import { UNIT_CONFIG, POI_CONFIG, DIPLOMACY } from '../constants';
import { getTacticalAdvice } from '../services/geminiService';
import { evaluateAllianceRequest } from '../services/gameLogic';
import { useTooltip } from './Tooltip';

interface Props {
    gameState: GameState;
    onBuyUnit: (type: UnitClass) => void;
    onAllianceRequest: (factionId: string) => void;
    selectedUnitIds: string[];
    onUnitAction: (action: string, id: string) => void;
    onSetDifficulty: (diff: Difficulty) => void;
}

const Sidebar: React.FC<Props> = ({ gameState, onBuyUnit, onAllianceRequest, selectedUnitIds, onUnitAction, onSetDifficulty }) => {
    const [advice, setAdvice] = useState<string | null>(null);
    const [loadingAi, setLoadingAi] = useState(false);
    const [activeTab, setActiveTab] = useState<'UNITS' | 'BUILD' | 'DIPLOMACY'>('BUILD');

    if (gameState.gameMode === 'SELECT_BASE') {
        return (
            <div className="absolute top-8 left-8 p-6 bg-slate-900/80 border border-blue-500/50 backdrop-blur-md rounded-lg shadow-2xl z-[2000] max-w-md">
                <h1 className="text-2xl font-bold text-white mb-2">INITIALIZE OPERATION</h1>
                <p className="text-slate-300 text-sm mb-4">Click on a <span className="text-yellow-400 font-bold">CITY</span> to establish your HQ.</p>

                <div className="mb-4">
                    <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">DIFFICULTY LEVEL</div>
                    <div className="flex gap-2">
                        {[Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD].map(diff => (
                            <button
                                key={diff}
                                onClick={() => onSetDifficulty(diff)}
                                className={`flex-1 py-2 rounded text-xs font-bold transition-all border ${gameState.difficulty === diff
                                    ? (diff === Difficulty.HARD ? 'bg-red-900/80 border-red-500 text-red-100' : diff === Difficulty.MEDIUM ? 'bg-blue-900/80 border-blue-500 text-blue-100' : 'bg-green-900/80 border-green-500 text-green-100')
                                    : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:bg-slate-700'
                                    }`}
                            >
                                {diff}
                            </button>
                        ))}
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 italic">
                        {gameState.difficulty === Difficulty.EASY ? "Relaxed pace. Slower enemy waves." :
                            gameState.difficulty === Difficulty.HARD ? "FRENETIC. Relentless enemy assaults." :
                                "Standard tactical simulation."}
                    </div>
                </div>
            </div>
        )
    }

    if (gameState.gameMode === 'PLACING_STRUCTURE') {
        return (
            <div className="absolute top-8 left-8 p-4 bg-slate-900/80 border border-yellow-500/50 backdrop-blur-md rounded-lg shadow-2xl z-[2000]">
                <h1 className="text-xl font-bold text-yellow-400 mb-1">CONSTRUCTION MODE</h1>
                <p className="text-slate-300 text-xs">Select a valid location on the map.</p>
            </div>
        )
    }

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
        <div className="mb-4">
            <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">{title}</div>
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
                                <div className="space-y-1">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                                        <span className="text-slate-400">HP:</span> <span className="text-green-400">{stats.maxHp}</span>
                                        <span className="text-slate-400">ATK:</span> <span className="text-red-400">{stats.attack}</span>
                                        <span className="text-slate-400">RNG:</span> <span className="text-yellow-400">{stats.range}km</span>
                                        <span className="text-slate-400">SPD:</span> <span className="text-cyan-400">{stats.speed}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 italic border-t border-slate-700 pt-1 mt-1">
                                        {stats.canCapture ? "Can Capture Cities" : "Support Unit"}
                                    </div>
                                </div>,
                                e
                            );
                        }}
                        onMouseLeave={hideTooltip}
                        className={`w-full text-left p-2 mb-2 rounded border flex justify-between items-center transition-all ${disabled ? 'bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed' : 'bg-slate-800/80 border-slate-600 hover:bg-slate-700 hover:border-blue-400'}`}
                    >
                        <div>
                            <div className="font-bold text-slate-200 text-xs">{type.replace(/_/g, ' ')}</div>
                        </div>
                        <div className="text-right"><span className="text-yellow-500 text-xs mr-2">{costGold} G</span><span className="text-cyan-500 text-xs">{costOil} O</span></div>
                    </button>
                )
            })}
        </div>
    );

    return (
        <div className="absolute top-0 left-0 h-full w-80 bg-slate-900/80 border-r border-slate-700/50 backdrop-blur-md z-[1000] flex flex-col font-mono text-sm shadow-2xl pointer-events-auto">
            <div className="p-4 border-b border-slate-700/50">
                <h1 className="text-xl font-bold text-slate-100 tracking-wider">OPEN<span className="text-blue-500">FRONT</span></h1>
                <div className="text-[10px] text-slate-500 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>LIVE OPERATIONS</div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-4 border-b border-slate-700/50">
                <div className="bg-slate-800/50 p-2 rounded border border-slate-600/50">
                    <div className="text-[10px] text-yellow-500 mb-1">GOLD</div>
                    <div className="text-lg font-bold text-white">{Math.floor(playerFaction?.gold || 0).toLocaleString()}</div>
                    <div className="text-[9px] text-green-400">+{Math.floor(baseIncomeGold + poiGold)}/t</div>
                </div>
                <div className="bg-slate-800/50 p-2 rounded border border-slate-600/50">
                    <div className="text-[10px] text-cyan-500 mb-1">OIL</div>
                    <div className="text-lg font-bold text-white">{Math.floor(playerFaction?.oil || 0).toLocaleString()}</div>
                    <div className="text-[9px] text-green-400">+{Math.floor(baseIncomeOil + poiOil)}/t</div>
                </div>
            </div>

            <div className="flex border-b border-slate-700/50">
                <button className={`flex-1 py-3 text-center text-[10px] tracking-wide transition-colors ${activeTab === 'BUILD' ? 'bg-slate-800/80 text-blue-400 font-bold border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setActiveTab('BUILD')}>BUILD</button>
                <button className={`flex-1 py-3 text-center text-[10px] tracking-wide transition-colors ${activeTab === 'UNITS' ? 'bg-slate-800/80 text-blue-400 font-bold border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setActiveTab('UNITS')}>ASSETS</button>
                <button className={`flex-1 py-3 text-center text-[10px] tracking-wide transition-colors ${activeTab === 'DIPLOMACY' ? 'bg-slate-800/80 text-purple-400 font-bold border-b-2 border-purple-400' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setActiveTab('DIPLOMACY')}>POLITICS</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {activeTab === 'BUILD' && (
                    <div className="space-y-4">
                        {renderBuildList(structures, "Facilities", true, "")}
                        {renderBuildList(groundUnits, "Ground Forces", hasCity, "Requires City")}
                        {renderBuildList(airUnits, "Air Force", hasAirCap, "Requires Airbase/City")}
                        {renderBuildList(seaUnits, "Naval Fleet", hasNavalCap, "Requires Port/Coastal City")}
                    </div>
                )}
                {activeTab === 'UNITS' && (
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-widest">Active Units ({playerUnits.length})</h3>
                        <ul className="space-y-1">{playerUnits.map(u => (<li key={u.id} className="flex justify-between items-center text-xs bg-slate-800/40 p-2 rounded hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-600 cursor-pointer"><span className="text-blue-200">{u.unitClass.replace(/_/g, ' ')}</span><span className={`${u.hp < u.maxHp * 0.5 ? 'text-red-400' : 'text-green-400'} font-mono`}>{Math.floor(u.hp)} HP</span></li>))}</ul>
                    </div>
                )}
                {activeTab === 'DIPLOMACY' && (
                    <div className="space-y-3">
                        {gameState.factions.filter(f => f.id !== gameState.localPlayerId && f.id !== 'NEUTRAL').map(faction => {
                            const relation = playerFaction?.relations[faction.id] || 0;
                            const allianceAnalysis = evaluateAllianceRequest(gameState, faction.id);
                            let status = 'NEUTRAL';
                            let statusColor = 'text-slate-400';
                            if (relation <= DIPLOMACY.WAR_THRESHOLD) { status = 'HOSTILE'; statusColor = 'text-red-500'; }
                            else if (relation >= DIPLOMACY.ALLIANCE_THRESHOLD) { status = 'ALLY'; statusColor = 'text-green-500'; }

                            return (
                                <div key={faction.id} className="bg-slate-800/60 p-3 rounded border border-slate-600/50">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="font-bold text-sm" style={{ color: faction.color }}>{faction.name}</div>
                                        <div className={`text-[10px] font-bold ${statusColor}`}>{status} ({relation})</div>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mb-2">Likelihood: <span className={allianceAnalysis.chance > 50 ? 'text-green-400' : 'text-red-400'}>{Math.floor(allianceAnalysis.chance)}%</span></div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onAllianceRequest(faction.id)}
                                            className="flex-1 bg-slate-700/80 hover:bg-slate-600 text-[10px] py-1.5 rounded text-white disabled:opacity-30 uppercase font-bold tracking-wide transition-colors"
                                            disabled={status === 'ALLY' || status === 'HOSTILE'}
                                        >
                                            Propose Alliance
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* SELECTION PANEL */}
            {selectedUnit && selectedUnit.factionId === gameState.localPlayerId && (
                <div className="p-4 bg-slate-800/90 border-t border-slate-700/50 backdrop-blur-lg animate-slide-up">
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-yellow-400 font-bold text-xs uppercase">{selectedUnit.unitClass.replace(/_/g, ' ')}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {selectedUnit.id.substr(0, 6)}</div>
                    </div>
                    <div className="flex gap-2 mb-3">
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-700">
                            <div className="h-full bg-green-500 transition-all" style={{ width: `${(selectedUnit.hp / selectedUnit.maxHp) * 100}%` }}></div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {selectedUnit.unitClass === UnitClass.TROOP_TRANSPORT && (
                            <>
                                <button onClick={() => onUnitAction('DEPLOY_TANK', selectedUnit.id)} className="bg-blue-900/50 border border-blue-500/30 hover:bg-blue-800 text-[10px] text-blue-200 py-1 rounded">DEPLOY TANK ({UNIT_CONFIG[UnitClass.GROUND_TANK].cost?.gold}G)</button>
                                <button onClick={() => onUnitAction('DEPLOY_INFANTRY', selectedUnit.id)} className="bg-blue-900/50 border border-blue-500/30 hover:bg-blue-800 text-[10px] text-blue-200 py-1 rounded">DEPLOY INF ({UNIT_CONFIG[UnitClass.INFANTRY].cost?.gold}G)</button>
                            </>
                        )}
                        {selectedUnit.unitClass === UnitClass.AIRCRAFT_CARRIER && (
                            <button onClick={() => onUnitAction('DEPLOY_SPECOPS', selectedUnit.id)} className="col-span-2 bg-blue-900/50 border border-blue-500/30 hover:bg-blue-800 text-[10px] text-blue-200 py-1 rounded">DEPLOY SPECOPS ({UNIT_CONFIG[UnitClass.SPECIAL_FORCES].cost?.gold}G)</button>
                        )}
                    </div>
                </div>
            )}
            {isMultiSelect && (
                <div className="p-4 bg-slate-800/90 border-t border-slate-700/50 backdrop-blur-lg animate-slide-up">
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-cyan-400 font-bold text-xs uppercase">GROUP SELECTION</div>
                        <div className="text-[10px] text-slate-400 font-mono">{selectedUnitIds.length} UNITS</div>
                    </div>
                    <div className="text-xs text-slate-300">
                        <p className="mb-1">Press <span className="text-yellow-400 font-mono">CTRL + 1-9</span> to assign Group</p>
                        <p>Press <span className="text-yellow-400 font-mono">1-9</span> to Select Group</p>
                    </div>
                </div>
            )}

            <div className="p-3 bg-slate-900/50 border-t border-slate-700/50">
                <div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-purple-400 tracking-wider">GEMINI AI UPLINK</span><button onClick={handleAiAdvice} disabled={loadingAi} className="text-[9px] bg-purple-900/50 border border-purple-500/30 text-purple-200 px-2 py-1 rounded hover:bg-purple-800 disabled:opacity-50 transition-colors">{loadingAi ? 'COMPUTING...' : 'REQUEST ANALYSIS'}</button></div>
                <div className="text-[10px] text-slate-400 min-h-[30px] italic leading-snug">{advice ? `"${advice}"` : "Awaiting tactical input."}</div>
            </div>
        </div>
    );
};

export default React.memo(Sidebar, (prev, next) => {
    // Custom comparison to reduce re-renders
    if (prev.gameState.gameMode !== next.gameState.gameMode) return false;
    if (prev.selectedUnitIds !== next.selectedUnitIds) return false;
    if (prev.gameState.difficulty !== next.gameState.difficulty) return false; // Fix: Check difficulty

    // Check resources (rounded to avoid flicker on decimals)
    const prevFaction = prev.gameState.factions.find(f => f.id === prev.gameState.localPlayerId);
    const nextFaction = next.gameState.factions.find(f => f.id === next.gameState.localPlayerId);
    if (Math.floor(prevFaction?.gold || 0) !== Math.floor(nextFaction?.gold || 0)) return false;
    if (Math.floor(prevFaction?.oil || 0) !== Math.floor(nextFaction?.oil || 0)) return false;

    // Check unit count
    if (prev.gameState.units.length !== next.gameState.units.length) return false;

    // Check POI ownership changes (Count owned POIs)
    const prevOwned = prev.gameState.pois.filter(p => p.ownerFactionId === prev.gameState.localPlayerId).length;
    const nextOwned = next.gameState.pois.filter(p => p.ownerFactionId === next.gameState.localPlayerId).length;
    if (prevOwned !== nextOwned) return false;

    return true;
});
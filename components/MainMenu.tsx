import React, { useState, useEffect } from 'react';
import { SCENARIOS, FACTION_PRESETS, DIFFICULTY_CONFIG } from '../constants';
import { NetworkService } from '../services/networkService';
import { Scenario, Faction, LobbyState, LobbyPlayer, Difficulty } from '../types';

interface MainMenuProps {
    onStartGame: (scenario: Scenario, localPlayerId: string, factions: Faction[], isMultiplayer: boolean, isHost: boolean) => void;
    lobbyState: LobbyState;
    setLobbyState: React.Dispatch<React.SetStateAction<LobbyState>>;
    networkMode: 'SINGLE' | 'MULTI_HOST' | 'MULTI_JOIN' | 'LOBBY' | null;
    setNetworkMode: React.Dispatch<React.SetStateAction<'SINGLE' | 'MULTI_HOST' | 'MULTI_JOIN' | 'LOBBY' | null>>;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartGame, lobbyState, setLobbyState, networkMode, setNetworkMode }) => {
    const [hostIdInput, setHostIdInput] = useState<string>('');
    const [connectionStatus, setConnectionStatus] = useState<string>('');
    const [selectedFactionIndex, setSelectedFactionIndex] = useState<number>(0);
    const [peerId, setPeerId] = useState<string>('');

    useEffect(() => {
        const checkId = setInterval(() => {
            if (NetworkService.myPeerId) {
                setPeerId(NetworkService.myPeerId);
                setConnectionStatus('Connected. ID: ' + NetworkService.myPeerId);
            }
        }, 1000);
        return () => clearInterval(checkId);
    }, []);

    const handleSinglePlayerStart = () => {
        const scenario = Object.values(SCENARIOS).find(s => s.id === lobbyState.scenarioId) || SCENARIOS.WORLD;
        const playerFaction = {
            ...FACTION_PRESETS[selectedFactionIndex],
            id: 'PLAYER',
            type: 'PLAYER' as const,
            gold: 10000,
            oil: 1000,
            relations: {},
            aggression: 0
        };

        const otherFactions = FACTION_PRESETS
            .filter((_, i) => i !== selectedFactionIndex)
            .slice(0, lobbyState.botCount)
            .map((preset, i) => ({
                ...preset,
                id: `BOT_${i}`,
                type: 'BOT' as const,
                gold: 10000,
                oil: 1000,
                relations: { 'PLAYER': -100 },
                aggression: 1.0
            }));

        const allFactions = [playerFaction, ...otherFactions] as Faction[];
        onStartGame(scenario, 'PLAYER', allFactions, false, true);
    };

    const handleHostLobbyStart = () => {
        if (networkMode !== 'MULTI_HOST' && networkMode !== 'LOBBY') return;

        const scenario = Object.values(SCENARIOS).find(s => s.id === lobbyState.scenarioId) || SCENARIOS.WORLD;
        const factions: Faction[] = [];

        lobbyState.players.forEach((p, idx) => {
            factions.push({
                ...FACTION_PRESETS[p.factionIndex],
                id: p.id,
                name: p.name,
                type: 'PLAYER',
                gold: 10000,
                oil: 1000,
                relations: {},
                aggression: 0
            });
        });

        const usedIndices = lobbyState.players.map(p => p.factionIndex);
        const availablePresets = FACTION_PRESETS.filter((_, i) => !usedIndices.includes(i));

        for (let i = 0; i < lobbyState.botCount; i++) {
            if (i >= availablePresets.length) break;
            factions.push({
                ...availablePresets[i],
                id: `BOT_${i}`,
                type: 'BOT',
                gold: 10000,
                oil: 1000,
                relations: {},
                aggression: 1.0
            });
        }

        factions.forEach(f => {
            factions.forEach(target => {
                if (f.id !== target.id) {
                    f.relations[target.id] = -100;
                }
            });
        });

        onStartGame(scenario, NetworkService.myPeerId, factions, true, true);
    };

    const handleJoin = () => {
        setConnectionStatus('Connecting to Host...');
        NetworkService.connect(hostIdInput);
    };

    const updateLobbySetting = (key: keyof LobbyState, value: any) => {
        setLobbyState(prev => ({ ...prev, [key]: value }));
    };

    useEffect(() => {
        if (networkMode === 'MULTI_HOST' && NetworkService.myPeerId && lobbyState.players.length === 0) {
            setLobbyState({
                players: [{ id: NetworkService.myPeerId, name: 'Host', factionIndex: 0, isHost: true, isReady: true }],
                scenarioId: 'WORLD',
                difficulty: Difficulty.MEDIUM,
                botCount: 2
            });
        }
    }, [networkMode, peerId]);

    // ============================================
    // INITIAL MENU SCREEN
    // ============================================
    if (!networkMode || networkMode === 'SINGLE') {
        if (networkMode === 'SINGLE') {
            // Falls through to shared lobby UI
        } else {
            return (
                <div className="relative flex flex-col items-center justify-center h-screen bg-tactical-900 text-white overflow-hidden">
                    {/* Animated Background */}
                    <div className="absolute inset-0 bg-grid-animated opacity-20"></div>
                    <div className="absolute inset-0 bg-radial-glow"></div>

                    {/* Floating Particles Effect */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-float"></div>
                        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '-1.5s' }}></div>
                        <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }}></div>
                    </div>

                    {/* Scan Line Effect */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" style={{ animation: 'scan-line 4s linear infinite' }}></div>
                    </div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center space-y-14 animate-fade-in">
                        {/* Title */}
                        <div className="text-center space-y-6">
                            <div className="relative">
                                <h1 className="font-display text-8xl font-black tracking-wider">
                                    <span className="gradient-text-holographic">TACTIC</span>
                                    <span className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"> OPS</span>
                                </h1>
                                {/* Glow effect behind title */}
                                <div className="absolute inset-0 -z-10 blur-3xl opacity-30 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500"></div>
                            </div>
                            <p className="text-slate-400 text-sm tracking-[0.4em] uppercase font-medium">Global Strategic Command</p>
                            <div className="flex items-center justify-center gap-3 text-xs">
                                <div className="relative">
                                    <span className="absolute inset-0 w-3 h-3 rounded-full bg-cyan-500 animate-ping opacity-75"></span>
                                    <span className="relative w-3 h-3 rounded-full bg-cyan-400 block shadow-[0_0_12px_rgba(6,182,212,0.8)]"></span>
                                </div>
                                <span className="text-cyan-400/80 tracking-[0.3em] font-medium animate-neon-flicker">SYSTEM ONLINE</span>
                            </div>
                        </div>

                        {/* Menu Buttons */}
                        <div className="flex flex-col gap-5 w-96">
                            <button
                                onClick={() => setNetworkMode('SINGLE')}
                                className="group relative px-8 py-6 rounded-2xl bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-500/40 text-xl font-bold tracking-wider transition-all duration-300 hover:border-cyan-400/80 hover:shadow-[0_0_40px_rgba(6,182,212,0.5)] hover:scale-[1.03] overflow-hidden backdrop-blur-sm"
                            >
                                <span className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/20 to-cyan-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></span>
                                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-cyan-500/10 to-transparent"></span>
                                <span className="relative flex items-center justify-center gap-4">
                                    <svg className="w-7 h-7 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    SINGLE PLAYER
                                </span>
                            </button>

                            <button
                                onClick={() => setNetworkMode('MULTI_HOST')}
                                className="group relative px-8 py-6 rounded-2xl bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/40 text-xl font-bold tracking-wider transition-all duration-300 hover:border-green-400/80 hover:shadow-[0_0_40px_rgba(34,197,94,0.5)] hover:scale-[1.03] overflow-hidden backdrop-blur-sm"
                            >
                                <span className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/20 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></span>
                                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-green-500/10 to-transparent"></span>
                                <span className="relative flex items-center justify-center gap-4">
                                    <svg className="w-7 h-7 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                                    HOST GAME
                                </span>
                            </button>

                            <button
                                onClick={() => setNetworkMode('MULTI_JOIN')}
                                className="group relative px-8 py-6 rounded-2xl bg-gradient-to-r from-purple-900/30 to-violet-900/30 border border-purple-500/40 text-xl font-bold tracking-wider transition-all duration-300 hover:border-purple-400/80 hover:shadow-[0_0_40px_rgba(168,85,247,0.5)] hover:scale-[1.03] overflow-hidden backdrop-blur-sm"
                            >
                                <span className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/20 to-purple-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></span>
                                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-purple-500/10 to-transparent"></span>
                                <span className="relative flex items-center justify-center gap-4">
                                    <svg className="w-7 h-7 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                    JOIN GAME
                                </span>
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="text-center space-y-2">
                            <div className="flex items-center justify-center gap-6 text-slate-500 text-xs tracking-wider">
                                <span className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                                    v2.0.0
                                </span>
                                <span className="w-px h-3 bg-slate-700"></span>
                                <span>Real-Time Strategy</span>
                                <span className="w-px h-3 bg-slate-700"></span>
                                <span>Multiplayer</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    }

    // ============================================
    // JOIN GAME SCREEN
    // ============================================
    if (networkMode === 'MULTI_JOIN' && lobbyState.players.length === 0) {
        return (
            <div className="relative flex flex-col items-center justify-center h-screen bg-tactical-900 text-white overflow-hidden">
                <div className="absolute inset-0 bg-grid-animated opacity-20"></div>
                <div className="absolute inset-0 bg-radial-glow"></div>

                <div className="relative z-10 animate-slide-up">
                    <h2 className="font-display text-4xl font-bold mb-8 text-center tracking-wider text-glow-purple" style={{ textShadow: '0 0 20px rgb(168 85 247 / 0.5)' }}>
                        JOIN GAME
                    </h2>

                    <div className="glass-panel rounded-2xl p-8 w-[420px] space-y-6 border border-purple-500/20">
                        <div>
                            <label className="block text-xs text-slate-400 mb-2 tracking-wider uppercase">Your Connection ID</label>
                            <div className="font-mono text-lg text-cyan-400 bg-black/40 p-4 rounded-xl border border-cyan-500/20 flex items-center justify-between">
                                <span>{peerId || 'Initializing...'}</span>
                                {peerId && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-2 tracking-wider uppercase">Host ID</label>
                            <input
                                type="text"
                                placeholder="Paste the Host's ID here"
                                className="w-full px-4 py-4 bg-black/40 text-white rounded-xl border border-slate-600/50 focus:border-purple-500/60 focus:shadow-[0_0_15px_rgba(168,85,247,0.2)] outline-none transition-all font-mono"
                                value={hostIdInput}
                                onChange={e => setHostIdInput(e.target.value)}
                            />
                        </div>

                        {connectionStatus && (
                            <div className="text-sm text-slate-400 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                {connectionStatus}
                            </div>
                        )}

                        <button
                            onClick={handleJoin}
                            disabled={!hostIdInput}
                            className="w-full px-8 py-4 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 rounded-xl text-lg font-bold tracking-wider shadow-lg transition-all hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                            CONNECT TO HOST
                        </button>

                        <button
                            onClick={() => setNetworkMode(null)}
                            className="w-full text-slate-400 hover:text-white text-sm py-2 transition-colors"
                        >
                            ← Back to Menu
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ============================================
    // LOBBY / SINGLE PLAYER SETUP
    // ============================================
    const isHost = networkMode === 'MULTI_HOST' || (networkMode === 'LOBBY' && lobbyState.players.find(p => p.id === peerId)?.isHost);
    const isSingle = networkMode === 'SINGLE';
    const canEdit = isSingle || isHost;

    return (
        <div className="relative flex flex-col h-screen bg-tactical-900 text-white overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-grid-animated opacity-15"></div>
            <div className="absolute inset-0 bg-radial-glow"></div>

            {/* Header */}
            <div className="relative z-10 flex justify-between items-center p-6 border-b border-slate-700/30">
                <div className="flex items-center gap-4">
                    <h2 className="font-display text-3xl font-bold tracking-wider">
                        {isSingle ? (
                            <span className="gradient-text">MISSION SETUP</span>
                        ) : (
                            <span className="text-glow-cyan" style={{ textShadow: '0 0 15px rgb(6 182 212 / 0.4)' }}>LOBBY</span>
                        )}
                    </h2>
                    <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        {isSingle ? 'OFFLINE' : 'ONLINE'}
                    </span>
                </div>

                {!isSingle && (
                    <div className="glass-panel rounded-xl p-4 border border-cyan-500/20">
                        <p className="text-xs text-slate-400 mb-1">Lobby ID</p>
                        <p className="text-lg font-mono text-cyan-400 select-all">{peerId}</p>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="relative z-10 flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">

                    {/* SETTINGS PANEL */}
                    <div className="glass-panel rounded-2xl p-6 space-y-6 border border-slate-600/20">
                        <h3 className="font-display text-lg font-bold tracking-wider text-cyan-400 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            GAME SETTINGS
                        </h3>

                        {/* Theater Selection */}
                        <div>
                            <label className="block text-xs text-slate-400 mb-3 tracking-wider uppercase">Theater of War</label>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.values(SCENARIOS).map((scen) => (
                                    <button
                                        key={scen.id}
                                        disabled={!canEdit}
                                        onClick={() => isSingle ? setLobbyState(p => ({ ...p, scenarioId: scen.id })) : updateLobbySetting('scenarioId', scen.id)}
                                        className={`p-3 rounded-xl text-sm font-bold border transition-all ${lobbyState.scenarioId === scen.id
                                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                                            : 'bg-slate-800/50 border-slate-600/30 text-slate-400 hover:bg-slate-700/50 hover:border-slate-500/50'
                                            } ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        {scen.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Bot Count */}
                        <div>
                            <label className="block text-xs text-slate-400 mb-3 tracking-wider uppercase">
                                Enemy Factions: <span className="text-red-400 font-bold">{lobbyState.botCount}</span>
                            </label>
                            <input
                                type="range" min="0" max="7"
                                disabled={!canEdit}
                                value={lobbyState.botCount}
                                onChange={(e) => isSingle ? setLobbyState(p => ({ ...p, botCount: parseInt(e.target.value) })) : updateLobbySetting('botCount', parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>0</span><span>7</span>
                            </div>
                        </div>

                        {/* Game Mode */}
                        <div>
                            <label className="block text-xs text-slate-400 mb-3 tracking-wider uppercase">Game Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['DOMINATION', 'SURVIVAL'].map((mode) => (
                                    <button
                                        key={mode}
                                        disabled={!canEdit}
                                        onClick={() => isSingle ? setLobbyState(p => ({ ...p, gameMode: mode as any })) : updateLobbySetting('gameMode', mode)}
                                        className={`p-3 rounded-xl text-sm font-bold border transition-all ${lobbyState.gameMode === mode
                                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                                            : 'bg-slate-800/50 border-slate-600/30 text-slate-400 hover:bg-slate-700/50'
                                            } ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Difficulty */}
                        <div>
                            <label className="block text-xs text-slate-400 mb-3 tracking-wider uppercase">Difficulty</label>
                            <div className="flex gap-2">
                                {Object.values(Difficulty).map((diff) => (
                                    <button
                                        key={diff}
                                        disabled={!canEdit}
                                        onClick={() => isSingle ? setLobbyState(p => ({ ...p, difficulty: diff })) : updateLobbySetting('difficulty', diff)}
                                        className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${lobbyState.difficulty === diff
                                            ? diff === Difficulty.HARD
                                                ? 'bg-red-500/20 border-red-500/50 text-red-300'
                                                : diff === Difficulty.MEDIUM
                                                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                                                    : 'bg-green-500/20 border-green-500/50 text-green-300'
                                            : 'bg-slate-800/50 border-slate-600/30 text-slate-400 hover:bg-slate-700/50'
                                            } ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        {diff}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* FACTION SELECTION */}
                    <div className="glass-panel rounded-2xl p-6 border border-slate-600/20">
                        <h3 className="font-display text-lg font-bold tracking-wider text-red-400 flex items-center gap-2 mb-6">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
                            SELECT FACTION
                        </h3>
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                            {FACTION_PRESETS.map((fac, idx) => {
                                const isSelected = isSingle
                                    ? selectedFactionIndex === idx
                                    : lobbyState.players.find(p => p.id === peerId)?.factionIndex === idx;

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            if (isSingle) setSelectedFactionIndex(idx);
                                            else {
                                                const myIdx = lobbyState.players.findIndex(p => p.id === peerId);
                                                if (myIdx !== -1) {
                                                    const newPlayers = [...lobbyState.players];
                                                    newPlayers[myIdx].factionIndex = idx;
                                                    updateLobbySetting('players', newPlayers);
                                                }
                                            }
                                        }}
                                        className={`w-full p-4 rounded-xl text-left flex items-center gap-4 transition-all border ${isSelected
                                            ? 'bg-slate-700/60 border-white/30 shadow-lg'
                                            : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-700/40 hover:border-slate-600/50'
                                            }`}
                                    >
                                        <div
                                            className="w-4 h-12 rounded-full shadow-lg"
                                            style={{
                                                backgroundColor: fac.color,
                                                boxShadow: isSelected ? `0 0 15px ${fac.color}` : 'none'
                                            }}
                                        />
                                        <div className="flex-1">
                                            <span className="font-bold text-white">{fac.name}</span>
                                            {isSelected && (
                                                <span className="ml-2 text-xs text-cyan-400">SELECTED</span>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* PLAYERS LIST (Multiplayer Only) */}
                    {!isSingle && (
                        <div className="glass-panel rounded-2xl p-6 border border-slate-600/20">
                            <h3 className="font-display text-lg font-bold tracking-wider text-green-400 flex items-center gap-2 mb-6">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                PLAYERS
                            </h3>
                            <div className="space-y-3">
                                {lobbyState.players.map((p, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-3 h-10 rounded-full"
                                                style={{ backgroundColor: FACTION_PRESETS[p.factionIndex].color }}
                                            />
                                            <div>
                                                <div className="font-bold text-white flex items-center gap-2">
                                                    {p.name}
                                                    {p.isHost && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                                            HOST
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm" style={{ color: FACTION_PRESETS[p.factionIndex].color }}>
                                                    {FACTION_PRESETS[p.factionIndex].name}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`w-3 h-3 rounded-full ${p.id ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-slate-600'}`}></div>
                                    </div>
                                ))}
                                {lobbyState.players.length === 0 && (
                                    <div className="text-center py-8 text-slate-500 italic">
                                        Waiting for players...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Actions */}
            <div className="relative z-10 p-6 border-t border-slate-700/30 bg-slate-900/50 backdrop-blur-sm">
                <div className="flex justify-between items-center max-w-7xl mx-auto">
                    <button
                        onClick={() => setNetworkMode(null)}
                        className="px-6 py-3 text-slate-400 hover:text-white font-bold transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        BACK
                    </button>

                    <button
                        onClick={isSingle ? handleSinglePlayerStart : handleHostLobbyStart}
                        disabled={!isSingle && !isHost}
                        className={`px-12 py-4 rounded-xl text-xl font-bold tracking-wider transition-all ${(!isSingle && !isHost)
                            ? 'bg-slate-700 cursor-not-allowed text-slate-500'
                            : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:scale-[1.02]'
                            }`}
                    >
                        <span className="flex items-center gap-3">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {isSingle ? 'DEPLOY' : (isHost ? 'DEPLOY ALL' : 'WAITING FOR HOST...')}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MainMenu;

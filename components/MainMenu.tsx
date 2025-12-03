import React, { useState, useEffect } from 'react';
import { SCENARIOS, FACTION_PRESETS } from '../constants';
import { NetworkService } from '../services/networkService';
import { Scenario, Faction } from '../types';

interface MainMenuProps {
    onStartGame: (scenario: Scenario, localPlayerId: string, factions: Faction[], isMultiplayer: boolean, isHost: boolean) => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartGame }) => {
    const [mode, setMode] = useState<'SINGLE' | 'MULTI_HOST' | 'MULTI_JOIN' | 'MENU'>('MENU');
    const [selectedScenario, setSelectedScenario] = useState<Scenario>(SCENARIOS.WORLD);
    const [selectedFactionIndex, setSelectedFactionIndex] = useState<number>(0);
    const [peerId, setPeerId] = useState<string>('');
    const [hostIdInput, setHostIdInput] = useState<string>('');
    const [connectionStatus, setConnectionStatus] = useState<string>('');

    // Initialize Network if Multiplayer
    useEffect(() => {
        if (mode === 'MULTI_HOST' || mode === 'MULTI_JOIN') {
            NetworkService.initialize((id) => {
                setPeerId(id);
                setConnectionStatus('Network Ready. ID: ' + id);
            });

            const handleConnect = (e: any) => {
                if (e.type === 'CONNECT') {
                    setConnectionStatus(`Connected to ${e.peerId}`);
                }
            };

            const unsub = NetworkService.subscribe(handleConnect);
            return () => { unsub(); NetworkService.disconnect(); };
        }
    }, [mode]);

    const handleStart = () => {
        // Create 4 Factions
        // Player is selectedFaction
        // Enemy is random or specific

        const playerFaction = {
            ...FACTION_PRESETS[selectedFactionIndex],
            id: 'PLAYER',
            type: 'PLAYER' as const,
            gold: 5000,
            relations: {},
            aggression: 0
        };

        // Create 3 AI/Enemy Factions
        const otherFactions = FACTION_PRESETS
            .filter((_, i) => i !== selectedFactionIndex)
            .slice(0, 3)
            .map((preset, i) => ({
                ...preset,
                id: `ENEMY_${i}`,
                type: 'AI' as const, // Or PLAYER_2 if multiplayer
                gold: 5000,
                relations: { 'PLAYER': -100 }, // Hostile
                aggression: 1.0
            }));

        // If Multiplayer Host, assign one enemy as Remote Player?
        // For 1v1, let's say ENEMY_0 is the remote player.
        if (mode === 'MULTI_HOST') {
            (otherFactions[0] as any).type = 'PLAYER'; // Remote Player
            otherFactions[0].id = 'REMOTE_PLAYER';
            // Ensure hostility
            playerFaction.relations['REMOTE_PLAYER'] = -100;
            otherFactions[0].relations['PLAYER'] = -100;
        }

        const allFactions = [playerFaction, ...otherFactions] as Faction[];

        onStartGame(selectedScenario, 'PLAYER', allFactions, mode !== 'SINGLE', mode === 'MULTI_HOST');
    };

    const handleJoin = () => {
        setConnectionStatus('Connecting...');
        NetworkService.connect(hostIdInput);
        // Client waits for game state from Host
        // We start the game engine but in "Client Mode"
        onStartGame(selectedScenario, 'REMOTE_PLAYER', [], true, false);
    };

    if (mode === 'MENU') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white space-y-8 font-sans">
                <h1 className="text-6xl font-bold text-blue-500 tracking-widest drop-shadow-lg">TACTIC OPS</h1>
                <div className="flex space-x-4">
                    <button onClick={() => setMode('SINGLE')} className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded text-xl font-bold shadow-lg transition-transform hover:scale-105">SINGLE PLAYER</button>
                    <button onClick={() => setMode('MULTI_HOST')} className="px-8 py-4 bg-green-600 hover:bg-green-500 rounded text-xl font-bold shadow-lg transition-transform hover:scale-105">HOST GAME</button>
                    <button onClick={() => setMode('MULTI_JOIN')} className="px-8 py-4 bg-purple-600 hover:bg-purple-500 rounded text-xl font-bold shadow-lg transition-transform hover:scale-105">JOIN GAME</button>
                </div>
            </div>
        );
    }

    if (mode === 'MULTI_JOIN') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white space-y-8">
                <h2 className="text-4xl font-bold">JOIN GAME</h2>
                <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-96 space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Your ID</label>
                        <div className="font-mono text-green-400 bg-black p-2 rounded">{peerId || 'Generating...'}</div>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Host ID</label>
                        <input
                            type="text"
                            placeholder="Enter Host ID"
                            className="w-full px-4 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 outline-none"
                            value={hostIdInput}
                            onChange={e => setHostIdInput(e.target.value)}
                        />
                    </div>
                    <button onClick={handleJoin} className="w-full px-8 py-4 bg-purple-600 hover:bg-purple-500 rounded text-xl font-bold shadow-lg">CONNECT</button>
                    <button onClick={() => setMode('MENU')} className="w-full text-gray-400 hover:text-white text-sm">Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-4xl font-bold tracking-wider">{mode === 'SINGLE' ? 'SINGLE PLAYER' : 'HOST GAME'}</h2>
                {mode === 'MULTI_HOST' && (
                    <div className="bg-slate-800 p-4 rounded border border-slate-700">
                        <p className="text-sm text-gray-400">Share this ID with your friend:</p>
                        <p className="text-2xl font-mono text-green-400 select-all cursor-pointer" onClick={() => navigator.clipboard.writeText(peerId)} title="Click to Copy">{peerId || 'Loading...'}</p>
                        <p className="text-xs text-gray-500 mt-1 flex items-center">
                            <span className={`w-2 h-2 rounded-full mr-2 ${connectionStatus.includes('Connected') ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                            {connectionStatus}
                        </p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* SCENARIO SELECTION */}
                <div className="space-y-4">
                    <h3 className="text-2xl font-bold text-blue-400 border-b border-blue-400/30 pb-2">SELECT THEATER</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {Object.values(SCENARIOS).map((scen) => (
                            <button
                                key={scen.id}
                                onClick={() => setSelectedScenario(scen)}
                                className={`p-4 rounded border-2 text-left transition-all relative overflow-hidden group ${selectedScenario.id === scen.id ? 'border-blue-500 bg-blue-900/40' : 'border-slate-700 hover:border-slate-500 bg-slate-800'}`}
                            >
                                <div className="font-bold text-lg relative z-10">{scen.name}</div>
                                <div className="text-xs text-gray-400 relative z-10">
                                    {Math.abs(scen.bounds.maxLat - scen.bounds.minLat).toFixed(0)}° Lat / {Math.abs(scen.bounds.maxLng - scen.bounds.minLng).toFixed(0)}° Lng
                                </div>
                                {selectedScenario.id === scen.id && <div className="absolute inset-0 bg-blue-500/10 z-0"></div>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* FACTION SELECTION */}
                <div className="space-y-4">
                    <h3 className="text-2xl font-bold text-red-400 border-b border-red-400/30 pb-2">SELECT FACTION</h3>
                    <div className="grid grid-cols-1 gap-3">
                        {FACTION_PRESETS.slice(0, 4).map((fac, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelectedFactionIndex(idx)}
                                className={`p-4 rounded border-l-8 text-left flex justify-between items-center transition-all ${selectedFactionIndex === idx ? 'bg-slate-800 border-r border-t border-b border-slate-600' : 'bg-slate-800/50 hover:bg-slate-800 border-transparent'}`}
                                style={{ borderLeftColor: fac.color }}
                            >
                                <span className="font-bold text-lg">{fac.name}</span>
                                {selectedFactionIndex === idx && <span className="text-xs bg-white text-black px-2 py-1 rounded font-bold">SELECTED</span>}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-auto pt-8 flex justify-end space-x-4">
                <button onClick={() => setMode('MENU')} className="px-6 py-3 text-gray-400 hover:text-white font-bold">BACK</button>
                <button
                    onClick={handleStart}
                    disabled={mode === 'MULTI_HOST' && !connectionStatus.includes('Connected')}
                    className={`px-12 py-4 rounded text-2xl font-bold shadow-lg transition-all ${mode === 'MULTI_HOST' && !connectionStatus.includes('Connected')
                        ? 'bg-gray-700 cursor-not-allowed text-gray-500'
                        : 'bg-blue-600 hover:bg-blue-500 hover:scale-105 text-white'
                        }`}
                >
                    {mode === 'MULTI_HOST' ? (connectionStatus.includes('Connected') ? 'DEPLOY' : 'WAITING FOR PLAYER...') : 'DEPLOY'}
                </button>
            </div>
        </div>
    );
};

export default MainMenu;

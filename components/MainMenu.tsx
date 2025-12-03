import React, { useState, useEffect, useRef } from 'react';
import { SCENARIOS, FACTION_PRESETS, DIFFICULTY_CONFIG } from '../constants';
import { NetworkService } from '../services/networkService';
import { Scenario, Faction, LobbyState, LobbyPlayer, Difficulty } from '../types';

interface MainMenuProps {
    onStartGame: (scenario: Scenario, localPlayerId: string, factions: Faction[], isMultiplayer: boolean, isHost: boolean) => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartGame }) => {
    const [mode, setMode] = useState<'SINGLE' | 'MULTI_HOST' | 'MULTI_JOIN' | 'MENU' | 'LOBBY'>('MENU');
    const [peerId, setPeerId] = useState<string>('');
    const [hostIdInput, setHostIdInput] = useState<string>('');
    const [connectionStatus, setConnectionStatus] = useState<string>('');

    // Lobby State (Local or Synced)
    const [lobbyState, setLobbyState] = useState<LobbyState>({
        players: [],
        scenarioId: 'WORLD',
        difficulty: Difficulty.MEDIUM,
        botCount: 3 // Default 3 bots
    });

    const [localPlayerName, setLocalPlayerName] = useState<string>('Player 1');
    const [selectedFactionIndex, setSelectedFactionIndex] = useState<number>(0);

    const isStartingGame = useRef(false);

    // Initialize Network if Multiplayer
    useEffect(() => {
        const isNetworkMode = mode === 'MULTI_HOST' || mode === 'MULTI_JOIN' || mode === 'LOBBY';

        if (isNetworkMode) {
            NetworkService.initialize((id) => {
                setPeerId(id);
                setConnectionStatus('Network Ready. ID: ' + id);
            });

            const handleNetworkEvent = (e: any) => {
                if (e.type === 'CONNECT') {
                    setConnectionStatus(`Connected to ${e.peerId}`);
                    if (mode === 'MULTI_HOST') {
                        // Add Client to Lobby
                        setLobbyState(prev => {
                            // Check if player already exists
                            if (prev.players.find(p => p.id === e.peerId)) return prev;

                            const newState = {
                                ...prev,
                                players: [
                                    ...prev.players,
                                    { id: e.peerId, name: `Player ${prev.players.length + 1}`, factionIndex: 1, isHost: false, isReady: false }
                                ]
                            };
                            NetworkService.sendLobbyUpdate(newState);
                            return newState;
                        });
                        setMode('LOBBY');
                    }
                } else if (e.type === 'LOBBY_UPDATE') {
                    setLobbyState(e.state);
                    setMode('LOBBY'); // Switch to Lobby view on update
                } else if (e.type === 'START_GAME') {
                    // Client Start
                    isStartingGame.current = true;
                    const scenario = Object.values(SCENARIOS).find(s => s.id === e.scenarioId) || SCENARIOS.WORLD;
                    onStartGame(scenario, e.localPlayerId, e.factions, true, false);
                }
            };

            const unsub = NetworkService.subscribe(handleNetworkEvent);
            return () => {
                unsub();
                if (!isStartingGame.current) {
                    NetworkService.disconnect();
                }
            };
        }
    }, [mode === 'MULTI_HOST' || mode === 'MULTI_JOIN' || mode === 'LOBBY']); // Only re-run if entering/leaving network mode group

    // Host Logic: Send Updates when Lobby State changes
    useEffect(() => {
        if (mode === 'LOBBY' && lobbyState.players.find(p => p.id === peerId)?.isHost) {
            NetworkService.sendLobbyUpdate(lobbyState);
        }
    }, [lobbyState, mode, peerId]);

    const handleSinglePlayerStart = () => {
        const scenario = Object.values(SCENARIOS).find(s => s.id === lobbyState.scenarioId) || SCENARIOS.WORLD;

        const playerFaction = {
            ...FACTION_PRESETS[selectedFactionIndex],
            id: 'PLAYER',
            type: 'PLAYER' as const,
            gold: 5000,
            relations: {},
            aggression: 0
        };

        // Generate Bots
        const otherFactions = FACTION_PRESETS
            .filter((_, i) => i !== selectedFactionIndex)
            .slice(0, lobbyState.botCount)
            .map((preset, i) => ({
                ...preset,
                id: `ENEMY_${i}`,
                type: 'AI' as const,
                gold: 5000,
                relations: { 'PLAYER': -100 },
                aggression: 1.0
            }));

        const allFactions = [playerFaction, ...otherFactions] as Faction[];
        onStartGame(scenario, 'PLAYER', allFactions, false, true);
    };

    const handleHostLobbyStart = () => {
        if (mode !== 'LOBBY') return;

        const scenario = Object.values(SCENARIOS).find(s => s.id === lobbyState.scenarioId) || SCENARIOS.WORLD;

        // Construct Factions from Lobby Players + Bots
        const factions: Faction[] = [];

        // 1. Players
        lobbyState.players.forEach((p, idx) => {
            factions.push({
                ...FACTION_PRESETS[p.factionIndex],
                id: p.id === peerId ? 'PLAYER' : 'REMOTE_PLAYER', // Host is PLAYER, Client is REMOTE
                name: p.name,
                type: 'PLAYER',
                gold: 5000,
                relations: {},
                aggression: 0
            });
        });

        // 2. Bots
        const usedIndices = lobbyState.players.map(p => p.factionIndex);
        const availablePresets = FACTION_PRESETS.filter((_, i) => !usedIndices.includes(i));

        for (let i = 0; i < lobbyState.botCount; i++) {
            if (i >= availablePresets.length) break;
            factions.push({
                ...availablePresets[i],
                id: `BOT_${i}`,
                type: 'AI',
                gold: 5000,
                relations: { 'PLAYER': -100, 'REMOTE_PLAYER': -100 },
                aggression: 1.0
            });
        }

        // Set Hostility between players?
        // For now, everyone is hostile to everyone not in their faction (which is unique)
        factions.forEach(f => {
            factions.forEach(target => {
                if (f.id !== target.id) {
                    f.relations[target.id] = -100;
                }
            });
        });

        // Start for Host
        isStartingGame.current = true;
        onStartGame(scenario, 'PLAYER', factions, true, true);

        // Signal Client to Start
        // We need to send the Client's ID as 'PLAYER' for them, and Host as 'REMOTE_PLAYER'
        // Actually, the game logic uses 'PLAYER' for local. 
        // So we send the same factions array, but the Client needs to know which ID maps to their 'PLAYER'
        // Wait, the engine expects 'PLAYER' to be the local player.
        // So we need to swap IDs for the client? 
        // Or we just use PeerIDs as FactionIDs and 'PLAYER' is an alias?
        // Let's stick to 'PLAYER' = Local.

        // Client Factions:
        // Host -> REMOTE_PLAYER
        // Client -> PLAYER
        // Bots -> BOT_X

        const clientFactions = factions.map(f => {
            if (f.id === 'PLAYER') return { ...f, id: 'REMOTE_PLAYER' }; // Host becomes Remote
            if (f.id === 'REMOTE_PLAYER') return { ...f, id: 'PLAYER' }; // Client becomes Local
            return f;
        });

        NetworkService.startGame(scenario.id, clientFactions, 'PLAYER');
    };

    const handleJoin = () => {
        setConnectionStatus('Connecting...');
        NetworkService.connect(hostIdInput);
    };

    const updateLobbySetting = (key: keyof LobbyState, value: any) => {
        setLobbyState(prev => ({ ...prev, [key]: value }));
    };

    // Initial Host Setup
    useEffect(() => {
        if (mode === 'MULTI_HOST' && peerId && lobbyState.players.length === 0) {
            setLobbyState({
                players: [{ id: peerId, name: 'Host', factionIndex: 0, isHost: true, isReady: true }],
                scenarioId: 'WORLD',
                difficulty: Difficulty.MEDIUM,
                botCount: 2
            });
        }
    }, [mode, peerId]);

    // RENDERERS

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

    if (mode === 'MULTI_JOIN' && !connectionStatus.includes('Connected')) {
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

    // SHARED LOBBY / SINGLE PLAYER SETUP UI
    const isHost = mode === 'MULTI_HOST' || (mode === 'LOBBY' && lobbyState.players.find(p => p.id === peerId)?.isHost);
    const isSingle = mode === 'SINGLE';
    const canEdit = isSingle || isHost;

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-4xl font-bold tracking-wider">{isSingle ? 'SINGLE PLAYER' : 'LOBBY'}</h2>
                {!isSingle && (
                    <div className="bg-slate-800 p-4 rounded border border-slate-700">
                        <p className="text-sm text-gray-400">Lobby ID:</p>
                        <p className="text-xl font-mono text-green-400 select-all">{peerId}</p>
                        <p className="text-xs text-gray-500 mt-1">{connectionStatus}</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* SETTINGS COLUMN */}
                <div className="space-y-6 lg:col-span-1">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-lg space-y-6">
                        <h3 className="text-2xl font-bold text-blue-400">Game Settings</h3>

                        {/* SCENARIO */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Theater</label>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.values(SCENARIOS).map((scen) => (
                                    <button
                                        key={scen.id}
                                        disabled={!canEdit}
                                        onClick={() => isSingle ? setLobbyState(p => ({ ...p, scenarioId: scen.id })) : updateLobbySetting('scenarioId', scen.id)}
                                        className={`p-2 rounded text-sm font-bold border ${lobbyState.scenarioId === scen.id ? 'bg-blue-600 border-blue-400' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'} ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        {scen.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* BOTS */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Enemy Factions (Bots): {lobbyState.botCount}</label>
                            <input
                                type="range" min="0" max="7"
                                disabled={!canEdit}
                                value={lobbyState.botCount}
                                onChange={(e) => isSingle ? setLobbyState(p => ({ ...p, botCount: parseInt(e.target.value) })) : updateLobbySetting('botCount', parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>0</span><span>7</span>
                            </div>
                        </div>

                        {/* DIFFICULTY */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Difficulty</label>
                            <div className="flex space-x-2">
                                {Object.values(Difficulty).map((diff) => (
                                    <button
                                        key={diff}
                                        disabled={!canEdit}
                                        onClick={() => isSingle ? setLobbyState(p => ({ ...p, difficulty: diff })) : updateLobbySetting('difficulty', diff)}
                                        className={`flex-1 p-2 rounded text-xs font-bold border ${lobbyState.difficulty === diff ? 'bg-red-600 border-red-400' : 'bg-slate-700 border-slate-600'} ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        {diff}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* FACTION SELECTION */}
                <div className="space-y-6 lg:col-span-1">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-lg h-full overflow-y-auto">
                        <h3 className="text-2xl font-bold text-red-400 mb-4">Select Faction</h3>
                        <div className="space-y-2">
                            {FACTION_PRESETS.map((fac, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        if (isSingle) setSelectedFactionIndex(idx);
                                        else {
                                            // Update My Faction in Lobby
                                            const myIdx = lobbyState.players.findIndex(p => p.id === peerId);
                                            if (myIdx !== -1) {
                                                const newPlayers = [...lobbyState.players];
                                                newPlayers[myIdx].factionIndex = idx;
                                                updateLobbySetting('players', newPlayers);
                                            }
                                        }
                                    }}
                                    className={`w-full p-3 rounded border-l-4 text-left flex justify-between items-center transition-all ${(isSingle ? selectedFactionIndex === idx : lobbyState.players.find(p => p.id === peerId)?.factionIndex === idx)
                                            ? 'bg-slate-700 border-white' : 'bg-slate-900/50 border-transparent hover:bg-slate-700'
                                        }`}
                                    style={{ borderLeftColor: fac.color }}
                                >
                                    <span className="font-bold">{fac.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* PLAYERS LIST (Multiplayer Only) */}
                {!isSingle && (
                    <div className="space-y-6 lg:col-span-1">
                        <div className="bg-slate-800 p-6 rounded-lg shadow-lg h-full">
                            <h3 className="text-2xl font-bold text-green-400 mb-4">Lobby Players</h3>
                            <div className="space-y-4">
                                {lobbyState.players.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-900 p-4 rounded border border-slate-700">
                                        <div>
                                            <div className="font-bold text-lg">{p.name} {p.isHost && '(Host)'}</div>
                                            <div className="text-sm text-gray-400" style={{ color: FACTION_PRESETS[p.factionIndex].color }}>
                                                {FACTION_PRESETS[p.factionIndex].name}
                                            </div>
                                        </div>
                                        <div className={`w-3 h-3 rounded-full ${p.id ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                                    </div>
                                ))}
                                {lobbyState.players.length === 0 && <div className="text-gray-500 italic">Waiting for players...</div>}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-auto pt-8 flex justify-end space-x-4">
                <button onClick={() => setMode('MENU')} className="px-6 py-3 text-gray-400 hover:text-white font-bold">BACK</button>
                <button
                    onClick={isSingle ? handleSinglePlayerStart : handleHostLobbyStart}
                    disabled={!isSingle && !isHost}
                    className={`px-12 py-4 rounded text-2xl font-bold shadow-lg transition-all ${(!isSingle && !isHost)
                            ? 'bg-gray-700 cursor-not-allowed text-gray-500'
                            : 'bg-blue-600 hover:bg-blue-500 hover:scale-105 text-white'
                        }`}
                >
                    {isSingle ? 'DEPLOY' : (isHost ? 'DEPLOY ALL' : 'WAITING FOR HOST...')}
                </button>
            </div>
        </div>
    );
};

export default MainMenu;

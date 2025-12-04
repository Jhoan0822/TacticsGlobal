import React from 'react';

interface VictoryScreenProps {
    isVictory: boolean;
    stats: {
        unitsKilled: number;
        unitsLost: number;
        citiesCaptured: number;
        goldEarned: number;
        timePlayed: number; // in seconds
    };
    onPlayAgain: () => void;
    onMainMenu: () => void;
}

const VictoryScreen: React.FC<VictoryScreenProps> = ({
    isVictory,
    stats,
    onPlayAgain,
    onMainMenu
}) => {
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className={`
                p-8 rounded-2xl border-4 shadow-2xl text-center max-w-lg
                ${isVictory
                    ? 'bg-gradient-to-br from-yellow-900/90 to-amber-800/90 border-yellow-500'
                    : 'bg-gradient-to-br from-red-900/90 to-slate-800/90 border-red-500'}
            `}>
                {/* Title */}
                <div className={`text-6xl font-black mb-4 ${isVictory ? 'text-yellow-400' : 'text-red-400'}`}>
                    {isVictory ? '🏆 VICTORY!' : '💀 DEFEAT'}
                </div>

                <p className="text-white/80 text-lg mb-6">
                    {isVictory
                        ? 'You have conquered your enemies and achieved global domination!'
                        : 'Your forces have been eliminated. The enemy prevails.'}
                </p>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                    <div className="bg-black/40 p-3 rounded-lg">
                        <div className="text-xs text-white/60 uppercase">Units Destroyed</div>
                        <div className="text-2xl font-bold text-green-400">{stats.unitsKilled}</div>
                    </div>
                    <div className="bg-black/40 p-3 rounded-lg">
                        <div className="text-xs text-white/60 uppercase">Units Lost</div>
                        <div className="text-2xl font-bold text-red-400">{stats.unitsLost}</div>
                    </div>
                    <div className="bg-black/40 p-3 rounded-lg">
                        <div className="text-xs text-white/60 uppercase">Cities Captured</div>
                        <div className="text-2xl font-bold text-blue-400">{stats.citiesCaptured}</div>
                    </div>
                    <div className="bg-black/40 p-3 rounded-lg">
                        <div className="text-xs text-white/60 uppercase">Time Played</div>
                        <div className="text-2xl font-bold text-purple-400">{formatTime(stats.timePlayed)}</div>
                    </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={onPlayAgain}
                        className={`
                            px-6 py-3 rounded-xl font-bold text-lg transition-all
                            ${isVictory
                                ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
                                : 'bg-red-500 hover:bg-red-400 text-white'}
                        `}
                    >
                        🔄 Play Again
                    </button>
                    <button
                        onClick={onMainMenu}
                        className="px-6 py-3 rounded-xl font-bold text-lg bg-slate-600 hover:bg-slate-500 text-white transition-all"
                    >
                        🏠 Main Menu
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VictoryScreen;

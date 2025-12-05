import React, { useEffect, useState } from 'react';

interface VictoryScreenProps {
    isVictory: boolean;
    stats: {
        unitsKilled: number;
        unitsLost: number;
        citiesCaptured: number;
        goldEarned: number;
        timePlayed: number;
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
    const [animatedStats, setAnimatedStats] = useState({
        unitsKilled: 0,
        unitsLost: 0,
        citiesCaptured: 0,
        goldEarned: 0
    });

    // Animate stats counting up
    useEffect(() => {
        const duration = 1500;
        const steps = 30;
        const interval = duration / steps;
        let step = 0;

        const timer = setInterval(() => {
            step++;
            const progress = step / steps;
            setAnimatedStats({
                unitsKilled: Math.floor(stats.unitsKilled * progress),
                unitsLost: Math.floor(stats.unitsLost * progress),
                citiesCaptured: Math.floor(stats.citiesCaptured * progress),
                goldEarned: Math.floor(stats.goldEarned * progress)
            });
            if (step >= steps) clearInterval(timer);
        }, interval);

        return () => clearInterval(timer);
    }, [stats]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
            {/* Animated Background */}
            <div className={`absolute inset-0 ${isVictory ? 'bg-gradient-to-br from-yellow-900/90 via-amber-900/80 to-slate-900' : 'bg-gradient-to-br from-red-900/90 via-slate-900/80 to-slate-900'}`} />
            <div className="absolute inset-0 bg-grid-animated opacity-10"></div>

            {/* Radial Glow */}
            <div className={`absolute inset-0 ${isVictory ? 'bg-[radial-gradient(ellipse_at_center,_rgba(251,191,36,0.2)_0%,_transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,_rgba(239,68,68,0.2)_0%,_transparent_70%)]'}`}></div>

            {/* Content */}
            <div className="relative z-10 text-center max-w-2xl mx-auto px-8 animate-slide-up">
                {/* Icon */}
                <div className={`text-8xl mb-6 animate-float ${isVictory ? 'drop-shadow-[0_0_30px_rgba(251,191,36,0.5)]' : 'drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]'}`}>
                    {isVictory ? '🏆' : '💀'}
                </div>

                {/* Title */}
                <h1 className={`font-display text-6xl md:text-7xl font-black mb-4 tracking-wider ${isVictory ? 'text-yellow-400 text-glow-gold' : 'text-red-400'}`} style={{ textShadow: isVictory ? '0 0 40px rgba(251,191,36,0.6)' : '0 0 40px rgba(239,68,68,0.6)' }}>
                    {isVictory ? 'VICTORY' : 'DEFEAT'}
                </h1>

                <p className="text-white/70 text-lg mb-10 max-w-md mx-auto">
                    {isVictory
                        ? 'Congratulations, Commander. Global domination achieved.'
                        : 'Your forces have been eliminated. The enemy prevails.'}
                </p>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    <div className="glass-panel rounded-xl p-5 border border-white/10">
                        <div className="text-xs text-white/50 uppercase tracking-wider mb-2">Destroyed</div>
                        <div className="text-3xl font-bold text-green-400 font-mono">{animatedStats.unitsKilled}</div>
                    </div>
                    <div className="glass-panel rounded-xl p-5 border border-white/10">
                        <div className="text-xs text-white/50 uppercase tracking-wider mb-2">Lost</div>
                        <div className="text-3xl font-bold text-red-400 font-mono">{animatedStats.unitsLost}</div>
                    </div>
                    <div className="glass-panel rounded-xl p-5 border border-white/10">
                        <div className="text-xs text-white/50 uppercase tracking-wider mb-2">Cities</div>
                        <div className="text-3xl font-bold text-blue-400 font-mono">{animatedStats.citiesCaptured}</div>
                    </div>
                    <div className="glass-panel rounded-xl p-5 border border-white/10">
                        <div className="text-xs text-white/50 uppercase tracking-wider mb-2">Duration</div>
                        <div className="text-3xl font-bold text-purple-400 font-mono">{formatTime(stats.timePlayed)}</div>
                    </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={onPlayAgain}
                        className={`group relative px-8 py-4 rounded-xl font-bold text-lg transition-all overflow-hidden ${isVictory
                                ? 'bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black shadow-[0_0_30px_rgba(251,191,36,0.3)] hover:shadow-[0_0_40px_rgba(251,191,36,0.5)]'
                                : 'bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_rgba(239,68,68,0.5)]'
                            } hover:scale-105`}
                    >
                        <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></span>
                        <span className="relative flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Play Again
                        </span>
                    </button>
                    <button
                        onClick={onMainMenu}
                        className="group relative px-8 py-4 rounded-xl font-bold text-lg bg-slate-700/50 hover:bg-slate-600/50 text-white transition-all border border-slate-500/30 hover:border-slate-400/50 hover:scale-105 overflow-hidden"
                    >
                        <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></span>
                        <span className="relative flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                            Main Menu
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VictoryScreen;

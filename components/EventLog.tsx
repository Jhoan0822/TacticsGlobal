import React, { useState } from 'react';
import { LogMessage } from '../types';

interface Props {
    messages: LogMessage[];
}

const EventLog: React.FC<Props> = ({ messages }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const visibleMessages = messages.slice(-5);

    const getIcon = (type: string) => {
        switch (type) {
            case 'alert': return '⚠️';
            case 'success': return '✅';
            default: return '📡';
        }
    };

    return (
        <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end gap-2 w-96">
            {/* Toggle Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/90 backdrop-blur-md border border-slate-700/50 hover:bg-slate-700/90 transition-all shadow-lg"
            >
                <span className="text-sm">📋</span>
                <span className="text-xs text-slate-300">Events</span>
                <span className={`text-xs text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                </span>
                {!isExpanded && messages.length > 0 && (
                    <span className="bg-cyan-500/20 text-cyan-400 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                        {Math.min(messages.length, 5)}
                    </span>
                )}
            </button>

            {/* Messages Panel */}
            {isExpanded && (
                <div className="flex flex-col gap-2 pointer-events-none">
                    {visibleMessages.map((msg, idx) => {
                        let colorClass = 'notification-card info border-l-cyan-500';
                        if (msg.type === 'alert') colorClass = 'notification-card alert border-l-red-500';
                        if (msg.type === 'success') colorClass = 'notification-card success border-l-green-500';

                        return (
                            <div
                                key={msg.id}
                                className={`${colorClass} px-4 py-3 rounded-lg backdrop-blur-md text-sm shadow-xl animate-slide-in-right`}
                                style={{ animationDelay: `${idx * 50}ms` }}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="text-base">{getIcon(msg.type)}</span>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] text-slate-500 font-mono">
                                                {new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-slate-200 text-xs leading-relaxed">{msg.text}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default EventLog;
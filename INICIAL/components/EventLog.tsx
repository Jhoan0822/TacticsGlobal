
import React from 'react';
import { LogMessage } from '../types';

interface Props {
    messages: LogMessage[];
}

const EventLog: React.FC<Props> = ({ messages }) => {
    const visibleMessages = messages.slice(-5); // Show last 5

    return (
        <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end gap-1 pointer-events-none w-80">
            {visibleMessages.map(msg => {
                let colorClass = 'text-slate-300 border-slate-600 bg-slate-900/50';
                if (msg.type === 'alert') colorClass = 'text-red-300 border-red-900/50 bg-red-900/30';
                if (msg.type === 'success') colorClass = 'text-green-300 border-green-900/50 bg-green-900/30';

                return (
                    <div key={msg.id} className={`px-3 py-1.5 rounded border backdrop-blur-sm text-xs font-mono shadow-sm animate-fade-in ${colorClass}`}>
                        <span className="opacity-70 text-[10px] mr-2">{new Date(msg.timestamp).toLocaleTimeString([], {hour12: false, hour: '2-digit', minute:'2-digit'})}</span>
                        {msg.text}
                    </div>
                );
            })}
        </div>
    );
};
export default EventLog;
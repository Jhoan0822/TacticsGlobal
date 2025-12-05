import React, { createContext, useContext, useState, useEffect } from 'react';

interface TooltipData {
    title: string;
    content: React.ReactNode;
    x: number;
    y: number;
}

interface TooltipContextType {
    showTooltip: (title: string, content: React.ReactNode, e: React.MouseEvent | { clientX: number, clientY: number }) => void;
    hideTooltip: () => void;
}

const TooltipContext = createContext<TooltipContextType | null>(null);

export const useTooltip = () => {
    const context = useContext(TooltipContext);
    if (!context) throw new Error("useTooltip must be used within a TooltipProvider");
    return context;
};

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);

    const showTooltip = (title: string, content: React.ReactNode, e: React.MouseEvent | { clientX: number, clientY: number }) => {
        setTooltip({
            title,
            content,
            x: e.clientX,
            y: e.clientY
        });
    };

    const hideTooltip = () => {
        setTooltip(null);
    };

    return (
        <TooltipContext.Provider value={{ showTooltip, hideTooltip }}>
            {children}
            {tooltip && (
                <div
                    className="fixed z-[9999] glass-panel rounded-xl shadow-2xl p-4 pointer-events-none animate-fade-in border-t border-cyan-500/30"
                    style={{
                        top: tooltip.y + 12,
                        left: tooltip.x + 12,
                        minWidth: '200px',
                        maxWidth: '280px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(6, 182, 212, 0.1)'
                    }}
                >
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2 pb-2 border-b border-slate-700/50 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        {tooltip.title}
                    </div>
                    <div className="text-xs text-slate-300">
                        {tooltip.content}
                    </div>
                </div>
            )}
        </TooltipContext.Provider>
    );
};

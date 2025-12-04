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
                    className="fixed z-[9999] bg-slate-900/95 border border-blue-500/50 rounded shadow-xl p-3 pointer-events-none animate-fade-in backdrop-blur-sm"
                    style={{
                        top: tooltip.y + 15,
                        left: tooltip.x + 15,
                        minWidth: '200px'
                    }}
                >
                    <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1 border-b border-slate-700 pb-1">
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

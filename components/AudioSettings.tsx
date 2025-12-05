import React, { useState, useEffect } from 'react';
import { AudioService } from '../services/audioService';

interface AudioSettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AudioSettings: React.FC<AudioSettingsProps> = ({ isOpen, onClose }) => {
    const [masterVolume, setMasterVolume] = useState(40);
    const [musicVolume, setMusicVolume] = useState(8);
    const [effectsVolume, setEffectsVolume] = useState(50);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        // Initialize from AudioService
        const config = AudioService.getConfig();
        setMasterVolume(Math.round(config.masterVolume * 100));
        setMusicVolume(Math.round(config.musicVolume * 100));
        setEffectsVolume(Math.round(config.effectsVolume * 100));
        setIsMuted(config.isMuted);
    }, [isOpen]);

    const handleMasterChange = (value: number) => {
        setMasterVolume(value);
        AudioService.setMasterVolume(value / 100);
    };

    const handleMusicChange = (value: number) => {
        setMusicVolume(value);
        AudioService.setMusicVolume(value / 100);
    };

    const handleEffectsChange = (value: number) => {
        setEffectsVolume(value);
        AudioService.setEffectsVolume(value / 100);
    };

    const handleMuteToggle = () => {
        const newMuted = AudioService.toggleMute();
        setIsMuted(newMuted);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl p-6 w-80 shadow-2xl border border-slate-600"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        🔊 Audio Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl"
                    >
                        ×
                    </button>
                </div>

                {/* Master Volume */}
                <div className="mb-5">
                    <label className="text-sm text-gray-300 block mb-2">
                        Master Volume: {masterVolume}%
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={masterVolume}
                        onChange={(e) => handleMasterChange(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                                   [&::-webkit-slider-thumb]:appearance-none
                                   [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                   [&::-webkit-slider-thumb]:rounded-full
                                   [&::-webkit-slider-thumb]:bg-blue-500
                                   [&::-webkit-slider-thumb]:shadow-lg"
                    />
                </div>

                {/* Music Volume */}
                <div className="mb-5">
                    <label className="text-sm text-gray-300 block mb-2">
                        🎵 Music Volume: {musicVolume}%
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="50"
                        value={musicVolume}
                        onChange={(e) => handleMusicChange(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                                   [&::-webkit-slider-thumb]:appearance-none
                                   [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                   [&::-webkit-slider-thumb]:rounded-full
                                   [&::-webkit-slider-thumb]:bg-purple-500
                                   [&::-webkit-slider-thumb]:shadow-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Music volume adapts dynamically to combat
                    </p>
                </div>

                {/* Effects Volume */}
                <div className="mb-5">
                    <label className="text-sm text-gray-300 block mb-2">
                        💥 Effects Volume: {effectsVolume}%
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={effectsVolume}
                        onChange={(e) => handleEffectsChange(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                                   [&::-webkit-slider-thumb]:appearance-none
                                   [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                   [&::-webkit-slider-thumb]:rounded-full
                                   [&::-webkit-slider-thumb]:bg-orange-500
                                   [&::-webkit-slider-thumb]:shadow-lg"
                    />
                </div>

                {/* Mute Button */}
                <button
                    onClick={handleMuteToggle}
                    className={`w-full py-3 rounded-lg font-medium transition-all ${isMuted
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                        }`}
                >
                    {isMuted ? '🔇 Unmute All' : '🔊 Mute All'}
                </button>

                {/* Info */}
                <p className="text-xs text-gray-500 mt-4 text-center">
                    Press ESC or click outside to close
                </p>
            </div>
        </div>
    );
};

export default AudioSettings;

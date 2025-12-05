
// ============================================
// TACTICSGLOBAL AUDIO SERVICE
// Comprehensive synthesized audio system for tactical gameplay
// ============================================

import { WeaponType, UnitClass } from '../types';

// Audio Context Singleton
const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
let ctx: AudioContext | null = null;

const getContext = (): AudioContext => {
    if (!ctx) {
        ctx = new AudioContextClass();
    }
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    return ctx;
};

// ============================================
// AUDIO STATE & CONFIGURATION
// ============================================
interface AudioConfig {
    masterVolume: number;
    effectsVolume: number;
    musicVolume: number;
    isMuted: boolean;
}

const audioConfig: AudioConfig = {
    masterVolume: 0.5,
    effectsVolume: 0.7,
    musicVolume: 0.3,
    isMuted: false
};

// Combat intensity for dynamic music (0-1)
let combatIntensity = 0;
let combatDecayInterval: number | null = null;

// Background music nodes
let musicOscillators: OscillatorNode[] = [];
let musicGain: GainNode | null = null;
let isMusicPlaying = false;

// ============================================
// CORE SYNTHESIS HELPERS
// ============================================

const getVolume = (baseVol: number): number => {
    if (audioConfig.isMuted) return 0;
    return baseVol * audioConfig.effectsVolume * audioConfig.masterVolume;
};

const getMusicVolume = (): number => {
    if (audioConfig.isMuted) return 0;
    return audioConfig.musicVolume * audioConfig.masterVolume;
};

const playTone = (freq: number, type: OscillatorType, duration: number, vol: number = 0.1) => {
    const audio = getContext();
    const finalVol = getVolume(vol);
    if (finalVol <= 0) return;

    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audio.currentTime);

    gain.gain.setValueAtTime(finalVol, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start();
    osc.stop(audio.currentTime + duration);
};

const playNoise = (duration: number, vol: number = 0.1, lowpass?: number) => {
    const audio = getContext();
    const finalVol = getVolume(vol);
    if (finalVol <= 0) return;

    const bufferSize = Math.floor(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audio.createBufferSource();
    noise.buffer = buffer;

    const gain = audio.createGain();
    gain.gain.setValueAtTime(finalVol, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);

    if (lowpass) {
        const filter = audio.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = lowpass;
        noise.connect(filter);
        filter.connect(gain);
    } else {
        noise.connect(gain);
    }

    gain.connect(audio.destination);
    noise.start();
};

const playFrequencySweep = (startFreq: number, endFreq: number, duration: number, type: OscillatorType, vol: number = 0.1) => {
    const audio = getContext();
    const finalVol = getVolume(vol);
    if (finalVol <= 0) return;

    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, audio.currentTime + duration);

    gain.gain.setValueAtTime(finalVol, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start();
    osc.stop(audio.currentTime + duration);
};

// ============================================
// WEAPON FIRING SOUNDS
// ============================================

const playTracerFire = () => {
    // Rapid machine gun burst - multiple quick pops
    const audio = getContext();
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            playTone(120 + Math.random() * 40, 'square', 0.04, 0.06);
            playNoise(0.03, 0.04, 2000);
        }, i * 30);
    }
};

const playMissileLaunch = () => {
    // Whoosh + ignition
    playFrequencySweep(200, 800, 0.3, 'sawtooth', 0.08);
    playNoise(0.4, 0.06, 1500);
    // Rocket burn sustain
    setTimeout(() => {
        playTone(150, 'sawtooth', 0.2, 0.04);
    }, 100);
};

const playLaserFire = () => {
    // High-pitched electronic zap
    playFrequencySweep(2000, 400, 0.15, 'sine', 0.05);
    playTone(1200, 'square', 0.08, 0.03);
};

// ============================================
// EXPLOSION SOUNDS
// ============================================

const playExplosionSmall = () => {
    // Quick impact pop
    playTone(80, 'sawtooth', 0.15, 0.08);
    playNoise(0.12, 0.06, 800);
};

const playExplosionMedium = () => {
    // Standard vehicle explosion
    playTone(50, 'sawtooth', 0.4, 0.15);
    playNoise(0.35, 0.1, 600);
    setTimeout(() => {
        playTone(35, 'sine', 0.3, 0.08);
    }, 50);
};

const playExplosionLarge = () => {
    // Massive boom - ships/structures
    playTone(30, 'sawtooth', 0.6, 0.2);
    playNoise(0.5, 0.15, 400);
    setTimeout(() => {
        playTone(25, 'sine', 0.5, 0.12);
        playNoise(0.4, 0.08, 300);
    }, 100);
    setTimeout(() => {
        playTone(40, 'triangle', 0.3, 0.06);
    }, 250);
};

// ============================================
// UNIT LIFECYCLE SOUNDS
// ============================================

const playUnitSpawn = () => {
    // Radio confirmation beep - ascending tones
    playTone(600, 'sine', 0.08, 0.06);
    setTimeout(() => playTone(800, 'sine', 0.08, 0.06), 80);
    setTimeout(() => playTone(1000, 'sine', 0.1, 0.08), 160);
};

const playUnitDeath = () => {
    // Mechanical failure / static burst
    playFrequencySweep(400, 80, 0.3, 'sawtooth', 0.08);
    playNoise(0.25, 0.06, 1000);
};

const playUnitPromotion = () => {
    // Achievement chime - pleasant ascending arpeggio
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
        setTimeout(() => playTone(freq, 'sine', 0.15, 0.07), i * 100);
    });
};

// ============================================
// CITY/POI EVENT SOUNDS
// ============================================

const playCityCapture = () => {
    // Victory horn fanfare
    playTone(392, 'triangle', 0.2, 0.1); // G4
    setTimeout(() => {
        playTone(523, 'triangle', 0.2, 0.1); // C5
        playTone(659, 'triangle', 0.2, 0.08); // E5
    }, 150);
    setTimeout(() => {
        playTone(784, 'triangle', 0.3, 0.12); // G5
    }, 300);
};

const playCityUnderAttack = () => {
    // Alert siren - oscillating
    const audio = getContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, audio.currentTime);
    osc.frequency.linearRampToValueAtTime(600, audio.currentTime + 0.15);
    osc.frequency.linearRampToValueAtTime(400, audio.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(600, audio.currentTime + 0.45);

    gain.gain.setValueAtTime(getVolume(0.08), audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.5);
};

const playIncomeReceived = () => {
    // Subtle coin chime
    playTone(1200, 'sine', 0.05, 0.03);
    setTimeout(() => playTone(1600, 'sine', 0.08, 0.04), 40);
};

// ============================================
// PLAYER COMMAND SOUNDS
// ============================================

const playUnitSelect = () => {
    // Quick selection click
    playTone(800, 'sine', 0.03, 0.04);
    playTone(1000, 'sine', 0.02, 0.03);
};

const playMoveCommand = () => {
    // Blip confirmation
    playTone(600, 'sine', 0.05, 0.04);
    setTimeout(() => playTone(700, 'sine', 0.04, 0.03), 50);
};

const playAttackCommand = () => {
    // Aggressive confirmation tone
    playTone(300, 'sawtooth', 0.06, 0.05);
    setTimeout(() => playTone(400, 'sawtooth', 0.08, 0.06), 60);
};

// ============================================
// GAME RESULT SOUNDS
// ============================================

const playVictory = () => {
    // Triumphant fanfare
    const fanfare = [
        { freq: 523, delay: 0 },     // C5
        { freq: 659, delay: 150 },   // E5
        { freq: 784, delay: 300 },   // G5
        { freq: 1047, delay: 450 },  // C6
        { freq: 1319, delay: 600 },  // E6
        { freq: 1568, delay: 750 },  // G6
    ];
    fanfare.forEach(({ freq, delay }) => {
        setTimeout(() => playTone(freq, 'triangle', 0.3, 0.1), delay);
    });
    // Final chord
    setTimeout(() => {
        playTone(1047, 'triangle', 0.8, 0.12);
        playTone(1319, 'triangle', 0.8, 0.1);
        playTone(1568, 'triangle', 0.8, 0.1);
    }, 900);
};

const playDefeat = () => {
    // Somber descending notes
    const notes = [
        { freq: 440, delay: 0 },    // A4
        { freq: 392, delay: 300 },  // G4
        { freq: 349, delay: 600 },  // F4
        { freq: 294, delay: 900 },  // D4
    ];
    notes.forEach(({ freq, delay }) => {
        setTimeout(() => playTone(freq, 'sine', 0.5, 0.08), delay);
    });
    // Final low drone
    setTimeout(() => {
        playTone(147, 'sine', 1.5, 0.1);
    }, 1200);
};

// ============================================
// BACKGROUND MUSIC SYSTEM
// ============================================

const startBackgroundMusic = () => {
    if (isMusicPlaying) return;

    const audio = getContext();
    isMusicPlaying = true;

    // Create master gain for music
    musicGain = audio.createGain();
    musicGain.gain.setValueAtTime(getMusicVolume() * 0.3, audio.currentTime);
    musicGain.connect(audio.destination);

    // Base drone layer - low rumble
    const drone = audio.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(55, audio.currentTime); // A1

    const droneGain = audio.createGain();
    droneGain.gain.setValueAtTime(0.4, audio.currentTime);
    drone.connect(droneGain);
    droneGain.connect(musicGain);
    drone.start();
    musicOscillators.push(drone);

    // Tension layer - filtered noise
    const tensionLoop = () => {
        if (!isMusicPlaying) return;

        const intensity = Math.max(0.1, combatIntensity);
        const bufferSize = Math.floor(audio.sampleRate * 2);
        const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }

        const noise = audio.createBufferSource();
        noise.buffer = buffer;

        const filter = audio.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200 + intensity * 400, audio.currentTime);

        const noiseGain = audio.createGain();
        noiseGain.gain.setValueAtTime(intensity * 0.15, audio.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 2);

        noise.connect(filter);
        filter.connect(noiseGain);
        if (musicGain) noiseGain.connect(musicGain);

        noise.start();

        setTimeout(tensionLoop, 2000);
    };
    tensionLoop();

    // Pulse layer - rhythmic element that intensifies with combat
    const pulseLoop = () => {
        if (!isMusicPlaying) return;

        const intensity = combatIntensity;
        if (intensity > 0.2) {
            const osc = audio.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(110, audio.currentTime);

            const pulseGain = audio.createGain();
            pulseGain.gain.setValueAtTime(intensity * 0.2, audio.currentTime);
            pulseGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);

            osc.connect(pulseGain);
            if (musicGain) pulseGain.connect(musicGain);

            osc.start();
            osc.stop(audio.currentTime + 0.2);
        }

        // Faster pulse during intense combat
        const interval = intensity > 0.5 ? 400 : 800;
        setTimeout(pulseLoop, interval);
    };
    pulseLoop();

    // Start combat decay - gradually reduce intensity when not in combat
    if (combatDecayInterval) clearInterval(combatDecayInterval);
    combatDecayInterval = window.setInterval(() => {
        combatIntensity = Math.max(0, combatIntensity - 0.02);
    }, 500);
};

const stopBackgroundMusic = () => {
    isMusicPlaying = false;

    // Fade out and stop oscillators
    const audio = getContext();
    if (musicGain) {
        musicGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 1);
    }

    setTimeout(() => {
        musicOscillators.forEach(osc => {
            try { osc.stop(); } catch (e) { }
        });
        musicOscillators = [];
        musicGain = null;
    }, 1100);

    if (combatDecayInterval) {
        clearInterval(combatDecayInterval);
        combatDecayInterval = null;
    }
};

const setCombatIntensity = (level: number) => {
    combatIntensity = Math.min(1, Math.max(0, level));

    // Adjust music gain based on intensity
    if (musicGain) {
        const audio = getContext();
        const baseVol = getMusicVolume() * 0.3;
        const intensityBoost = combatIntensity * 0.4;
        musicGain.gain.setTargetAtTime(baseVol + intensityBoost, audio.currentTime, 0.5);
    }
};

const increaseCombatIntensity = (amount: number = 0.1) => {
    setCombatIntensity(combatIntensity + amount);
};

// ============================================
// VOLUME CONTROLS
// ============================================

const setMasterVolume = (vol: number) => {
    audioConfig.masterVolume = Math.min(1, Math.max(0, vol));
};

const setEffectsVolume = (vol: number) => {
    audioConfig.effectsVolume = Math.min(1, Math.max(0, vol));
};

const setMusicVolume = (vol: number) => {
    audioConfig.musicVolume = Math.min(1, Math.max(0, vol));
    if (musicGain) {
        const audio = getContext();
        musicGain.gain.setTargetAtTime(getMusicVolume() * 0.3, audio.currentTime, 0.1);
    }
};

const toggleMute = () => {
    audioConfig.isMuted = !audioConfig.isMuted;
    return audioConfig.isMuted;
};

const setMuted = (muted: boolean) => {
    audioConfig.isMuted = muted;
};

// ============================================
// CONVENIENCE METHODS
// ============================================

const playWeaponFire = (weaponType: WeaponType) => {
    switch (weaponType) {
        case WeaponType.TRACER:
            playTracerFire();
            break;
        case WeaponType.MISSILE:
            playMissileLaunch();
            break;
        case WeaponType.LASER:
            playLaserFire();
            break;
    }
    increaseCombatIntensity(0.05);
};

const playExplosion = (size: 'SMALL' | 'MEDIUM' | 'LARGE') => {
    switch (size) {
        case 'SMALL':
            playExplosionSmall();
            break;
        case 'MEDIUM':
            playExplosionMedium();
            break;
        case 'LARGE':
            playExplosionLarge();
            break;
    }
    increaseCombatIntensity(size === 'LARGE' ? 0.15 : size === 'MEDIUM' ? 0.1 : 0.03);
};

// ============================================
// LEGACY API (Backwards Compatibility)
// ============================================
const playGunfire = playTracerFire;
const playUiClick = playUnitSelect;
const playSuccess = () => {
    playTone(400, 'sine', 0.1, 0.1);
    setTimeout(() => playTone(600, 'sine', 0.2, 0.1), 100);
};
const playAlert = playCityUnderAttack;
const playError = () => {
    playTone(100, 'square', 0.3, 0.1);
};

// ============================================
// EXPORT
// ============================================

export const AudioService = {
    // Volume Controls
    setMasterVolume,
    setEffectsVolume,
    setMusicVolume,
    toggleMute,
    setMuted,
    getConfig: () => ({ ...audioConfig }),

    // Weapon Sounds
    playTracerFire,
    playMissileLaunch,
    playLaserFire,
    playWeaponFire,

    // Explosions
    playExplosionSmall,
    playExplosionMedium,
    playExplosionLarge,
    playExplosion,

    // Unit Lifecycle
    playUnitSpawn,
    playUnitDeath,
    playUnitPromotion,

    // City/POI Events
    playCityCapture,
    playCityUnderAttack,
    playIncomeReceived,

    // Player Commands
    playUnitSelect,
    playMoveCommand,
    playAttackCommand,

    // Game Results
    playVictory,
    playDefeat,

    // Background Music
    startBackgroundMusic,
    stopBackgroundMusic,
    setCombatIntensity,
    increaseCombatIntensity,

    // Legacy API
    playGunfire,
    playUiClick,
    playSuccess,
    playAlert,
    playError,
};

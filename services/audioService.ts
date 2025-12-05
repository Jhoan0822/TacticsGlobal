
// ============================================
// TACTICSGLOBAL AUDIO SERVICE
// Professional tactical/war game audio system  
// Inspired by C&C Red Alert, Bastion, Soul Reaver
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
    musicVolume: 0.15, // LOWERED - background music should be subtle
    isMuted: false
};

// Combat intensity for dynamic music (0-1)
let combatIntensity = 0;
let combatDecayInterval: number | null = null;

// Background music nodes
let musicOscillators: OscillatorNode[] = [];
let musicGain: GainNode | null = null;
let isMusicPlaying = false;
let musicLoopTimeouts: number[] = [];
let beatCount = 0; // For musical variation

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

const playNoise = (duration: number, vol: number = 0.1, lowpass?: number, highpass?: number) => {
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

    let lastNode: AudioNode = noise;

    if (highpass) {
        const hpFilter = audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.value = highpass;
        lastNode.connect(hpFilter);
        lastNode = hpFilter;
    }

    if (lowpass) {
        const lpFilter = audio.createBiquadFilter();
        lpFilter.type = 'lowpass';
        lpFilter.frequency.value = lowpass;
        lastNode.connect(lpFilter);
        lastNode = lpFilter;
    }

    lastNode.connect(gain);
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
// TACTICAL WEAPON SOUNDS
// ============================================

const playTracerFire = () => {
    playNoise(0.02, 0.08, 8000, 2000);
    setTimeout(() => {
        playTone(200, 'triangle', 0.05, 0.06);
        playNoise(0.04, 0.05, 1500, 400);
    }, 5);
    setTimeout(() => {
        playNoise(0.08, 0.02, 800, 200);
    }, 30);
};

const playMissileLaunch = () => {
    playNoise(0.03, 0.06, 3000, 500);
    setTimeout(() => {
        playFrequencySweep(150, 600, 0.25, 'sawtooth', 0.05);
        playNoise(0.3, 0.04, 2000, 300);
    }, 20);
    setTimeout(() => {
        playTone(180, 'triangle', 0.15, 0.03);
        playNoise(0.2, 0.025, 1200, 200);
    }, 150);
};

const playLaserFire = () => {
    playFrequencySweep(1500, 800, 0.08, 'sine', 0.04);
    setTimeout(() => {
        playTone(900, 'sine', 0.12, 0.05);
        playTone(1800, 'sine', 0.1, 0.02);
    }, 30);
    setTimeout(() => {
        playNoise(0.05, 0.02, 4000, 1000);
    }, 100);
};

// ============================================
// TACTICAL EXPLOSIONS  
// ============================================

const playExplosionSmall = () => {
    playNoise(0.02, 0.1, 3000, 400);
    setTimeout(() => {
        playTone(100, 'triangle', 0.12, 0.08);
        playNoise(0.1, 0.06, 600, 80);
    }, 10);
    setTimeout(() => {
        playNoise(0.15, 0.03, 2000, 300);
    }, 60);
};

const playExplosionMedium = () => {
    playNoise(0.025, 0.12, 4000, 500);
    setTimeout(() => {
        playTone(90, 'triangle', 0.2, 0.1);
        playTone(140, 'sawtooth', 0.15, 0.06);
        playNoise(0.18, 0.08, 800, 80);
    }, 15);
    setTimeout(() => {
        playTone(110, 'sine', 0.25, 0.04);
        playNoise(0.2, 0.04, 400, 100);
    }, 100);
};

const playExplosionLarge = () => {
    playNoise(0.03, 0.15, 5000, 600);
    setTimeout(() => {
        playTone(85, 'triangle', 0.35, 0.12);
        playTone(120, 'sawtooth', 0.3, 0.08);
        playNoise(0.25, 0.1, 1000, 80);
    }, 20);
    setTimeout(() => {
        playTone(100, 'triangle', 0.3, 0.06);
        playNoise(0.25, 0.05, 500, 100);
    }, 150);
    setTimeout(() => {
        playNoise(0.4, 0.03, 2500, 200);
        playTone(130, 'sine', 0.2, 0.02);
    }, 300);
};

// ============================================
// TACTICAL UI SOUNDS
// ============================================

const playUnitSelect = () => {
    playNoise(0.02, 0.03, 6000, 2000);
    setTimeout(() => {
        playTone(1200, 'sine', 0.03, 0.05);
        playTone(900, 'sine', 0.02, 0.03);
    }, 15);
};

const playMoveCommand = () => {
    playTone(800, 'sine', 0.04, 0.04);
    setTimeout(() => {
        playTone(1000, 'sine', 0.06, 0.05);
    }, 40);
    setTimeout(() => {
        playNoise(0.03, 0.015, 4000, 1500);
    }, 80);
};

const playAttackCommand = () => {
    playTone(600, 'sawtooth', 0.04, 0.05);
    setTimeout(() => {
        playTone(800, 'sawtooth', 0.04, 0.05);
    }, 50);
    setTimeout(() => {
        playTone(1000, 'square', 0.08, 0.06);
        playNoise(0.02, 0.02, 3000, 800);
    }, 100);
};

// ============================================
// UNIT LIFECYCLE SOUNDS
// ============================================

const playUnitSpawn = () => {
    playNoise(0.02, 0.02, 5000, 2000);
    setTimeout(() => playTone(700, 'sine', 0.06, 0.05), 25);
    setTimeout(() => playTone(900, 'sine', 0.06, 0.05), 90);
    setTimeout(() => playTone(1100, 'sine', 0.1, 0.06), 155);
};

const playUnitDeath = () => {
    playFrequencySweep(500, 120, 0.2, 'sawtooth', 0.06);
    playNoise(0.18, 0.05, 1500, 200);
    setTimeout(() => playNoise(0.15, 0.03, 800, 100), 100);
};

const playUnitPromotion = () => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
        setTimeout(() => {
            playTone(freq, 'sine', 0.12, 0.05);
            if (i === 3) playTone(freq / 2, 'triangle', 0.2, 0.03);
        }, i * 80);
    });
};

// ============================================
// CITY/POI EVENT SOUNDS
// ============================================

const playCityCapture = () => {
    playTone(392, 'triangle', 0.15, 0.07);
    setTimeout(() => {
        playTone(494, 'triangle', 0.15, 0.07);
        playTone(587, 'triangle', 0.15, 0.05);
    }, 120);
    setTimeout(() => {
        playTone(784, 'triangle', 0.25, 0.08);
        playNoise(0.02, 0.02, 4000, 1500);
    }, 240);
};

const playCityUnderAttack = () => {
    const audio = getContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500, audio.currentTime);
    osc.frequency.linearRampToValueAtTime(700, audio.currentTime + 0.12);
    osc.frequency.linearRampToValueAtTime(500, audio.currentTime + 0.24);
    osc.frequency.linearRampToValueAtTime(700, audio.currentTime + 0.36);

    gain.gain.setValueAtTime(getVolume(0.06), audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.4);
};

const playIncomeReceived = () => {
    playTone(1400, 'sine', 0.04, 0.025);
    setTimeout(() => playTone(1800, 'sine', 0.06, 0.03), 35);
};

// ============================================
// GAME RESULT SOUNDS
// ============================================

const playVictory = () => {
    const fanfare = [
        { freq: 523, delay: 0 },
        { freq: 659, delay: 120 },
        { freq: 784, delay: 240 },
        { freq: 880, delay: 360 },
        { freq: 1047, delay: 480 },
    ];
    fanfare.forEach(({ freq, delay }) => {
        setTimeout(() => playTone(freq, 'triangle', 0.25, 0.08), delay);
    });
    setTimeout(() => {
        playTone(1047, 'triangle', 0.6, 0.08);
        playTone(1319, 'triangle', 0.6, 0.06);
        playTone(1568, 'triangle', 0.6, 0.06);
        playTone(523, 'sine', 0.8, 0.04);
    }, 600);
};

const playDefeat = () => {
    const notes = [
        { freq: 392, delay: 0 },
        { freq: 349, delay: 250 },
        { freq: 330, delay: 500 },
        { freq: 294, delay: 750 },
    ];
    notes.forEach(({ freq, delay }) => {
        setTimeout(() => playTone(freq, 'sine', 0.4, 0.06), delay);
    });
    setTimeout(() => {
        playTone(294, 'sine', 1.0, 0.05);
        playTone(349, 'sine', 1.0, 0.04);
    }, 1000);
};

// ============================================
// TACTICAL BACKGROUND MUSIC SYSTEM
// Inspired by C&C Red Alert, Hell March style
// Industrial, driving, military rhythms
// QUIET - sits in background without overwhelming
// ============================================

const startBackgroundMusic = () => {
    if (isMusicPlaying) return;

    const audio = getContext();
    isMusicPlaying = true;
    beatCount = 0;

    // Create master gain for music - QUIET level
    musicGain = audio.createGain();
    musicGain.gain.setValueAtTime(getMusicVolume() * 0.3, audio.currentTime);
    musicGain.connect(audio.destination);

    // BPM: 110-130 (Hell March territory)
    const baseBPM = 115;

    // ========================================
    // LAYER 1: Industrial Kick Drum Pattern
    // Hell March inspired driving beat
    // ========================================
    const createKickLayer = () => {
        if (!isMusicPlaying) return;

        const intensity = Math.max(0.2, combatIntensity);
        const bpm = baseBPM + intensity * 15;
        const beatInterval = 60000 / bpm;

        // Create punchy kick
        const osc = audio.createOscillator();
        const oscGain = audio.createGain();

        osc.type = 'sine';
        // Pitch envelope for punch
        osc.frequency.setValueAtTime(150, audio.currentTime);
        osc.frequency.exponentialRampToValueAtTime(55, audio.currentTime + 0.08);

        oscGain.gain.setValueAtTime(0.15, audio.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);

        osc.connect(oscGain);
        if (musicGain) oscGain.connect(musicGain);

        osc.start();
        osc.stop(audio.currentTime + 0.2);

        beatCount++;

        const timeoutId = window.setTimeout(createKickLayer, beatInterval);
        musicLoopTimeouts.push(timeoutId);
    };

    // ========================================
    // LAYER 2: Snare/Industrial Hit on 2 and 4
    // ========================================
    const createSnareLayer = () => {
        if (!isMusicPlaying) return;

        const intensity = Math.max(0.2, combatIntensity);
        const bpm = baseBPM + intensity * 15;
        const beatInterval = 60000 / bpm;

        // Only on beats 2 and 4
        if (beatCount % 2 === 1) {
            // Industrial snare - noise burst
            const bufferSize = Math.floor(audio.sampleRate * 0.08);
            const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
            }

            const noise = audio.createBufferSource();
            noise.buffer = buffer;

            const hpFilter = audio.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = 200;

            const lpFilter = audio.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.value = 8000;

            const noiseGain = audio.createGain();
            noiseGain.gain.setValueAtTime(0.08, audio.currentTime);

            noise.connect(hpFilter);
            hpFilter.connect(lpFilter);
            lpFilter.connect(noiseGain);
            if (musicGain) noiseGain.connect(musicGain);
            noise.start();

            // Add body tone
            const bodyOsc = audio.createOscillator();
            const bodyGain = audio.createGain();
            bodyOsc.type = 'triangle';
            bodyOsc.frequency.value = 180;
            bodyGain.gain.setValueAtTime(0.05, audio.currentTime);
            bodyGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.1);
            bodyOsc.connect(bodyGain);
            if (musicGain) bodyGain.connect(musicGain);
            bodyOsc.start();
            bodyOsc.stop(audio.currentTime + 0.1);
        }

        const timeoutId = window.setTimeout(createSnareLayer, beatInterval);
        musicLoopTimeouts.push(timeoutId);
    };

    // ========================================
    // LAYER 3: Hi-hat pattern (8th notes during combat)
    // ========================================
    const createHiHatLayer = () => {
        if (!isMusicPlaying) return;

        const intensity = combatIntensity;
        const bpm = baseBPM + intensity * 15;
        const beatInterval = 60000 / bpm / 2; // 8th notes

        if (intensity > 0.25) {
            const bufferSize = Math.floor(audio.sampleRate * 0.02);
            const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            }

            const noise = audio.createBufferSource();
            noise.buffer = buffer;

            const filter = audio.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 7000;

            const noiseGain = audio.createGain();
            noiseGain.gain.setValueAtTime(intensity * 0.04, audio.currentTime);

            noise.connect(filter);
            filter.connect(noiseGain);
            if (musicGain) noiseGain.connect(musicGain);
            noise.start();
        }

        const timeoutId = window.setTimeout(createHiHatLayer, beatInterval);
        musicLoopTimeouts.push(timeoutId);
    };

    // ========================================
    // LAYER 4: Bass Line (E minor power chord feel)
    // C&C style driving bass
    // ========================================
    const createBassLayer = () => {
        if (!isMusicPlaying) return;

        const intensity = Math.max(0.15, combatIntensity);
        const bpm = baseBPM + intensity * 15;
        const beatInterval = 60000 / bpm;

        // E minor bass pattern
        const bassNotes = [82.4, 82.4, 98, 82.4]; // E2, E2, G2, E2
        const noteIndex = beatCount % 4;
        const freq = bassNotes[noteIndex];

        const osc = audio.createOscillator();
        const oscGain = audio.createGain();
        const filter = audio.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, audio.currentTime);

        filter.type = 'lowpass';
        filter.frequency.value = 400;
        filter.Q.value = 2;

        oscGain.gain.setValueAtTime(0.12, audio.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);

        osc.connect(filter);
        filter.connect(oscGain);
        if (musicGain) oscGain.connect(musicGain);

        osc.start();
        osc.stop(audio.currentTime + 0.25);

        const timeoutId = window.setTimeout(createBassLayer, beatInterval);
        musicLoopTimeouts.push(timeoutId);
    };

    // ========================================
    // LAYER 5: Atmospheric Synth Pad (sparse)
    // Adds tension without overwhelming
    // ========================================
    const createPadLayer = () => {
        if (!isMusicPlaying) return;

        // Only play occasionally (every 8 beats)
        if (beatCount % 8 === 0) {
            const padFreqs = [164.8, 246.9, 329.6]; // E3, B3, E4

            padFreqs.forEach((freq, i) => {
                const osc = audio.createOscillator();
                const oscGain = audio.createGain();
                const filter = audio.createBiquadFilter();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, audio.currentTime);

                filter.type = 'lowpass';
                filter.frequency.value = 800;

                const vol = 0.03 - i * 0.008;
                oscGain.gain.setValueAtTime(0, audio.currentTime);
                oscGain.gain.linearRampToValueAtTime(vol, audio.currentTime + 0.5);
                oscGain.gain.setValueAtTime(vol, audio.currentTime + 1.5);
                oscGain.gain.linearRampToValueAtTime(0, audio.currentTime + 2);

                osc.connect(filter);
                filter.connect(oscGain);
                if (musicGain) oscGain.connect(musicGain);

                osc.start();
                osc.stop(audio.currentTime + 2);
            });
        }

        const bpm = baseBPM + combatIntensity * 15;
        const beatInterval = 60000 / bpm;
        const timeoutId = window.setTimeout(createPadLayer, beatInterval);
        musicLoopTimeouts.push(timeoutId);
    };

    // ========================================
    // LAYER 6: Combat Riff (only during high intensity)
    // Power chord stabs
    // ========================================
    const createRiffLayer = () => {
        if (!isMusicPlaying) return;

        const intensity = combatIntensity;

        if (intensity > 0.5 && beatCount % 4 === 0) {
            // Power chord: E5 (E + B)
            const chordFreqs = [329.6, 493.9]; // E4, B4

            chordFreqs.forEach(freq => {
                const osc = audio.createOscillator();
                const oscGain = audio.createGain();
                const filter = audio.createBiquadFilter();

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, audio.currentTime);

                filter.type = 'lowpass';
                filter.frequency.value = 2000;
                filter.Q.value = 1;

                oscGain.gain.setValueAtTime(intensity * 0.06, audio.currentTime);
                oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);

                osc.connect(filter);
                filter.connect(oscGain);
                if (musicGain) oscGain.connect(musicGain);

                osc.start();
                osc.stop(audio.currentTime + 0.15);
            });
        }

        const bpm = baseBPM + intensity * 15;
        const beatInterval = 60000 / bpm;
        const timeoutId = window.setTimeout(createRiffLayer, beatInterval);
        musicLoopTimeouts.push(timeoutId);
    };

    // Start all layers with slight offsets
    createKickLayer();
    setTimeout(createSnareLayer, 50);
    setTimeout(createHiHatLayer, 100);
    setTimeout(createBassLayer, 25);
    setTimeout(createPadLayer, 200);
    setTimeout(createRiffLayer, 150);

    // Combat decay
    if (combatDecayInterval) clearInterval(combatDecayInterval);
    combatDecayInterval = window.setInterval(() => {
        combatIntensity = Math.max(0, combatIntensity - 0.01);
    }, 500);
};

const stopBackgroundMusic = () => {
    isMusicPlaying = false;

    musicLoopTimeouts.forEach(id => clearTimeout(id));
    musicLoopTimeouts = [];

    const audio = getContext();
    if (musicGain) {
        musicGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5);
    }

    setTimeout(() => {
        musicOscillators.forEach(osc => {
            try { osc.stop(); } catch (e) { }
        });
        musicOscillators = [];
        musicGain = null;
    }, 600);

    if (combatDecayInterval) {
        clearInterval(combatDecayInterval);
        combatDecayInterval = null;
    }
};

const setCombatIntensity = (level: number) => {
    combatIntensity = Math.min(1, Math.max(0, level));

    if (musicGain) {
        const audio = getContext();
        const baseVol = getMusicVolume() * 0.3;
        const intensityBoost = combatIntensity * 0.15;
        musicGain.gain.setTargetAtTime(baseVol + intensityBoost, audio.currentTime, 0.3);
    }
};

const increaseCombatIntensity = (amount: number = 0.06) => {
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
    increaseCombatIntensity(0.04);
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
    increaseCombatIntensity(size === 'LARGE' ? 0.12 : size === 'MEDIUM' ? 0.08 : 0.03);
};

// ============================================
// LEGACY API
// ============================================
const playGunfire = playTracerFire;
const playUiClick = playUnitSelect;
const playSuccess = () => {
    playTone(600, 'sine', 0.08, 0.08);
    setTimeout(() => playTone(800, 'sine', 0.15, 0.08), 80);
};
const playAlert = playCityUnderAttack;
const playError = () => {
    playTone(200, 'triangle', 0.15, 0.08);
    setTimeout(() => playTone(150, 'triangle', 0.2, 0.06), 100);
};

// ============================================
// EXPORT
// ============================================

export const AudioService = {
    setMasterVolume,
    setEffectsVolume,
    setMusicVolume,
    toggleMute,
    setMuted,
    getConfig: () => ({ ...audioConfig }),

    playTracerFire,
    playMissileLaunch,
    playLaserFire,
    playWeaponFire,

    playExplosionSmall,
    playExplosionMedium,
    playExplosionLarge,
    playExplosion,

    playUnitSpawn,
    playUnitDeath,
    playUnitPromotion,

    playCityCapture,
    playCityUnderAttack,
    playIncomeReceived,

    playUnitSelect,
    playMoveCommand,
    playAttackCommand,

    playVictory,
    playDefeat,

    startBackgroundMusic,
    stopBackgroundMusic,
    setCombatIntensity,
    increaseCombatIntensity,

    playGunfire,
    playUiClick,
    playSuccess,
    playAlert,
    playError,
};

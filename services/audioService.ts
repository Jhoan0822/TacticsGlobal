
// ============================================
// TACTICSGLOBAL AUDIO SERVICE
// Professional tactical/war game audio system
// Designed for extended gameplay without fatigue
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
    musicVolume: 0.4,
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
// Punchy, realistic, military-grade feel
// ============================================

const playTracerFire = () => {
    const audio = getContext();

    // Layer 1: Sharp transient crack (high freq click)
    playNoise(0.02, 0.08, 8000, 2000);

    // Layer 2: Mid-frequency punch (the "body" of the shot)
    setTimeout(() => {
        playTone(200, 'triangle', 0.05, 0.06);
        playNoise(0.04, 0.05, 1500, 400);
    }, 5);

    // Layer 3: Subtle tail/reverb simulation
    setTimeout(() => {
        playNoise(0.08, 0.02, 800, 200);
    }, 30);
};

const playMissileLaunch = () => {
    const audio = getContext();

    // Ignition crack
    playNoise(0.03, 0.06, 3000, 500);

    // Whoosh buildup
    setTimeout(() => {
        playFrequencySweep(150, 600, 0.25, 'sawtooth', 0.05);
        playNoise(0.3, 0.04, 2000, 300);
    }, 20);

    // Sustained rocket burn
    setTimeout(() => {
        playTone(180, 'triangle', 0.15, 0.03);
        playNoise(0.2, 0.025, 1200, 200);
    }, 150);
};

const playLaserFire = () => {
    const audio = getContext();

    // Electronic charge-up
    playFrequencySweep(1500, 800, 0.08, 'sine', 0.04);

    // Main beam
    setTimeout(() => {
        playTone(900, 'sine', 0.12, 0.05);
        playTone(1800, 'sine', 0.1, 0.02);
    }, 30);

    // Discharge crackle
    setTimeout(() => {
        playNoise(0.05, 0.02, 4000, 1000);
    }, 100);
};

// ============================================
// TACTICAL EXPLOSIONS
// Powerful but not jarring, no sub-bass fatigue
// ============================================

const playExplosionSmall = () => {
    // Initial crack
    playNoise(0.02, 0.1, 3000, 400);

    // Body (no sub-bass below 80Hz)
    setTimeout(() => {
        playTone(100, 'triangle', 0.12, 0.08);
        playNoise(0.1, 0.06, 600, 80);
    }, 10);

    // Debris scatter
    setTimeout(() => {
        playNoise(0.15, 0.03, 2000, 300);
    }, 60);
};

const playExplosionMedium = () => {
    // Sharp crack
    playNoise(0.025, 0.12, 4000, 500);

    // Main body - powerful but comfortable
    setTimeout(() => {
        playTone(90, 'triangle', 0.2, 0.1);
        playTone(140, 'sawtooth', 0.15, 0.06);
        playNoise(0.18, 0.08, 800, 80);
    }, 15);

    // Rumble tail
    setTimeout(() => {
        playTone(110, 'sine', 0.25, 0.04);
        playNoise(0.2, 0.04, 400, 100);
    }, 100);
};

const playExplosionLarge = () => {
    // Initial shockwave crack
    playNoise(0.03, 0.15, 5000, 600);

    // Massive body (kept above 80Hz for comfort)
    setTimeout(() => {
        playTone(85, 'triangle', 0.35, 0.12);
        playTone(120, 'sawtooth', 0.3, 0.08);
        playNoise(0.25, 0.1, 1000, 80);
    }, 20);

    // Secondary rumble
    setTimeout(() => {
        playTone(100, 'triangle', 0.3, 0.06);
        playNoise(0.25, 0.05, 500, 100);
    }, 150);

    // Debris and echo
    setTimeout(() => {
        playNoise(0.4, 0.03, 2500, 200);
        playTone(130, 'sine', 0.2, 0.02);
    }, 300);
};

// ============================================
// TACTICAL UI SOUNDS
// Military radio / command center feel
// ============================================

const playUnitSelect = () => {
    const audio = getContext();

    // Radio squelch simulation
    playNoise(0.02, 0.03, 6000, 2000);

    // Tactical confirmation click
    setTimeout(() => {
        playTone(1200, 'sine', 0.03, 0.05);
        playTone(900, 'sine', 0.02, 0.03);
    }, 15);
};

const playMoveCommand = () => {
    // Military acknowledgment - two-tone beep
    playTone(800, 'sine', 0.04, 0.04);
    setTimeout(() => {
        playTone(1000, 'sine', 0.06, 0.05);
    }, 40);

    // Subtle static tail
    setTimeout(() => {
        playNoise(0.03, 0.015, 4000, 1500);
    }, 80);
};

const playAttackCommand = () => {
    // Targeting lock sound - more aggressive
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
    // Radio confirmation - tactical deployment acknowledgment
    playNoise(0.02, 0.02, 5000, 2000); // Static burst

    setTimeout(() => {
        playTone(700, 'sine', 0.06, 0.05);
    }, 25);

    setTimeout(() => {
        playTone(900, 'sine', 0.06, 0.05);
    }, 90);

    setTimeout(() => {
        playTone(1100, 'sine', 0.1, 0.06);
    }, 155);
};

const playUnitDeath = () => {
    // System failure / destruction sound
    playFrequencySweep(500, 120, 0.2, 'sawtooth', 0.06);
    playNoise(0.18, 0.05, 1500, 200);

    setTimeout(() => {
        playNoise(0.15, 0.03, 800, 100);
    }, 100);
};

const playUnitPromotion = () => {
    // Achievement / rank up - triumphant but subtle
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
        setTimeout(() => {
            playTone(freq, 'sine', 0.12, 0.05);
            if (i === 3) {
                playTone(freq / 2, 'triangle', 0.2, 0.03);
            }
        }, i * 80);
    });
};

// ============================================
// CITY/POI EVENT SOUNDS
// ============================================

const playCityCapture = () => {
    // Victory horn - tactical triumph
    playTone(392, 'triangle', 0.15, 0.07); // G4

    setTimeout(() => {
        playTone(494, 'triangle', 0.15, 0.07); // B4
        playTone(587, 'triangle', 0.15, 0.05); // D5
    }, 120);

    setTimeout(() => {
        playTone(784, 'triangle', 0.25, 0.08); // G5
        playNoise(0.02, 0.02, 4000, 1500);
    }, 240);
};

const playCityUnderAttack = () => {
    const audio = getContext();

    // Warning klaxon - urgent but not painful
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
    // Subtle resource notification
    playTone(1400, 'sine', 0.04, 0.025);
    setTimeout(() => playTone(1800, 'sine', 0.06, 0.03), 35);
};

// ============================================
// GAME RESULT SOUNDS
// ============================================

const playVictory = () => {
    // Triumphant fanfare - heroic but not overwhelming
    const fanfare = [
        { freq: 523, delay: 0 },     // C5
        { freq: 659, delay: 120 },   // E5
        { freq: 784, delay: 240 },   // G5
        { freq: 880, delay: 360 },   // A5
        { freq: 1047, delay: 480 },  // C6
    ];

    fanfare.forEach(({ freq, delay }) => {
        setTimeout(() => playTone(freq, 'triangle', 0.25, 0.08), delay);
    });

    // Triumphant chord
    setTimeout(() => {
        playTone(1047, 'triangle', 0.6, 0.08);
        playTone(1319, 'triangle', 0.6, 0.06);
        playTone(1568, 'triangle', 0.6, 0.06);
        playTone(523, 'sine', 0.8, 0.04);
    }, 600);
};

const playDefeat = () => {
    // Somber - respectful, not depressing
    const notes = [
        { freq: 392, delay: 0 },    // G4
        { freq: 349, delay: 250 },  // F4
        { freq: 330, delay: 500 },  // E4
        { freq: 294, delay: 750 },  // D4
    ];

    notes.forEach(({ freq, delay }) => {
        setTimeout(() => playTone(freq, 'sine', 0.4, 0.06), delay);
    });

    // Final minor chord
    setTimeout(() => {
        playTone(294, 'sine', 1.0, 0.05);
        playTone(349, 'sine', 1.0, 0.04);
    }, 1000);
};

// ============================================
// TACTICAL BACKGROUND MUSIC SYSTEM
// Layered ambient - engaging yet comfortable for hours
// NO sub-bass below 80Hz to prevent fatigue
// ============================================

const startBackgroundMusic = () => {
    if (isMusicPlaying) return;

    const audio = getContext();
    isMusicPlaying = true;

    // Create master gain for music
    musicGain = audio.createGain();
    musicGain.gain.setValueAtTime(getMusicVolume() * 0.5, audio.currentTime);
    musicGain.connect(audio.destination);

    // ========================================
    // LAYER 1: Atmospheric Pad (comfortable frequencies 150-400Hz)
    // ========================================
    const createPadLayer = () => {
        if (!isMusicPlaying) return;

        const padFreqs = [165, 220, 330]; // E3, A3, E4 - open fifth, military feel

        padFreqs.forEach((freq, i) => {
            const osc = audio.createOscillator();
            const oscGain = audio.createGain();
            const filter = audio.createBiquadFilter();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audio.currentTime);

            // Subtle vibrato for warmth
            const lfo = audio.createOscillator();
            const lfoGain = audio.createGain();
            lfo.frequency.value = 0.3 + Math.random() * 0.2;
            lfoGain.gain.value = 2;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start();

            filter.type = 'lowpass';
            filter.frequency.value = 600;
            filter.Q.value = 0.5;

            oscGain.gain.setValueAtTime(0, audio.currentTime);
            oscGain.gain.linearRampToValueAtTime(0.08 - i * 0.02, audio.currentTime + 2);
            oscGain.gain.setValueAtTime(0.08 - i * 0.02, audio.currentTime + 6);
            oscGain.gain.linearRampToValueAtTime(0, audio.currentTime + 8);

            osc.connect(filter);
            filter.connect(oscGain);
            if (musicGain) oscGain.connect(musicGain);

            osc.start();
            osc.stop(audio.currentTime + 8);

            musicOscillators.push(osc);
        });

        const timeoutId = window.setTimeout(createPadLayer, 7000);
        musicLoopTimeouts.push(timeoutId);
    };

    // ========================================
    // LAYER 2: Tactical Rhythmic Pulse
    // ========================================
    const createRhythmLayer = () => {
        if (!isMusicPlaying) return;

        const intensity = Math.max(0.1, combatIntensity);
        const bpm = 80 + intensity * 40; // 80-120 BPM based on combat
        const beatInterval = 60000 / bpm;

        // Main beat
        const playBeat = () => {
            if (!isMusicPlaying) return;

            const osc = audio.createOscillator();
            const oscGain = audio.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(110, audio.currentTime);

            oscGain.gain.setValueAtTime(intensity * 0.12, audio.currentTime);
            oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);

            osc.connect(oscGain);
            if (musicGain) oscGain.connect(musicGain);

            osc.start();
            osc.stop(audio.currentTime + 0.15);
        };

        playBeat();

        // Off-beat hi-hat (only during higher intensity)
        if (intensity > 0.3) {
            setTimeout(() => {
                if (!isMusicPlaying) return;
                const bufferSize = Math.floor(audio.sampleRate * 0.03);
                const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
                }

                const noise = audio.createBufferSource();
                noise.buffer = buffer;

                const filter = audio.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.value = 8000;

                const noiseGain = audio.createGain();
                noiseGain.gain.setValueAtTime(intensity * 0.03, audio.currentTime);

                noise.connect(filter);
                filter.connect(noiseGain);
                if (musicGain) noiseGain.connect(musicGain);
                noise.start();
            }, beatInterval / 2);
        }

        const timeoutId = window.setTimeout(createRhythmLayer, beatInterval);
        musicLoopTimeouts.push(timeoutId);
    };

    // ========================================
    // LAYER 3: Melodic Phrases (tactical/military feel)
    // ========================================
    const createMelodyLayer = () => {
        if (!isMusicPlaying) return;

        // D dorian mode phrases - military yet engaging
        const phrases = [
            [294, 330, 349, 330],        // D E F E
            [294, 392, 349, 330],        // D G F E  
            [440, 392, 349, 294],        // A G F D
            [294, 330, 392, 440, 392],   // D E G A G
        ];

        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        const noteDuration = 0.3;

        phrase.forEach((freq, i) => {
            setTimeout(() => {
                if (!isMusicPlaying) return;

                const osc = audio.createOscillator();
                const oscGain = audio.createGain();
                const filter = audio.createBiquadFilter();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, audio.currentTime);

                filter.type = 'lowpass';
                filter.frequency.value = 1200;

                const vol = 0.04 + combatIntensity * 0.02;
                oscGain.gain.setValueAtTime(0, audio.currentTime);
                oscGain.gain.linearRampToValueAtTime(vol, audio.currentTime + 0.02);
                oscGain.gain.setValueAtTime(vol, audio.currentTime + noteDuration - 0.05);
                oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + noteDuration);

                osc.connect(filter);
                filter.connect(oscGain);
                if (musicGain) oscGain.connect(musicGain);

                osc.start();
                osc.stop(audio.currentTime + noteDuration);
            }, i * noteDuration * 1000);
        });

        // Random interval between phrases (8-16 seconds)
        const nextPhrase = 8000 + Math.random() * 8000;
        const timeoutId = window.setTimeout(createMelodyLayer, nextPhrase);
        musicLoopTimeouts.push(timeoutId);
    };

    // ========================================
    // LAYER 4: Tension Texture (responds to combat)
    // ========================================
    const createTensionLayer = () => {
        if (!isMusicPlaying) return;

        const intensity = combatIntensity;

        if (intensity > 0.2) {
            // Filtered noise texture
            const bufferSize = Math.floor(audio.sampleRate * 1.5);
            const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.3;
            }

            const noise = audio.createBufferSource();
            noise.buffer = buffer;

            const lpFilter = audio.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.setValueAtTime(200 + intensity * 600, audio.currentTime);

            const hpFilter = audio.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = 100;

            const noiseGain = audio.createGain();
            noiseGain.gain.setValueAtTime(0, audio.currentTime);
            noiseGain.gain.linearRampToValueAtTime(intensity * 0.08, audio.currentTime + 0.3);
            noiseGain.gain.setValueAtTime(intensity * 0.08, audio.currentTime + 1.2);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 1.5);

            noise.connect(lpFilter);
            lpFilter.connect(hpFilter);
            hpFilter.connect(noiseGain);
            if (musicGain) noiseGain.connect(musicGain);

            noise.start();
        }

        const timeoutId = window.setTimeout(createTensionLayer, 1500);
        musicLoopTimeouts.push(timeoutId);
    };

    // Start all layers with staggered timing
    createPadLayer();
    setTimeout(createRhythmLayer, 500);
    setTimeout(createMelodyLayer, 2000);
    setTimeout(createTensionLayer, 1000);

    // Start combat decay
    if (combatDecayInterval) clearInterval(combatDecayInterval);
    combatDecayInterval = window.setInterval(() => {
        combatIntensity = Math.max(0, combatIntensity - 0.015);
    }, 500);
};

const stopBackgroundMusic = () => {
    isMusicPlaying = false;

    // Clear all loop timeouts
    musicLoopTimeouts.forEach(id => clearTimeout(id));
    musicLoopTimeouts = [];

    // Fade out
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

    if (musicGain) {
        const audio = getContext();
        const baseVol = getMusicVolume() * 0.5;
        const intensityBoost = combatIntensity * 0.3;
        musicGain.gain.setTargetAtTime(baseVol + intensityBoost, audio.currentTime, 0.5);
    }
};

const increaseCombatIntensity = (amount: number = 0.08) => {
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
        musicGain.gain.setTargetAtTime(getMusicVolume() * 0.5, audio.currentTime, 0.1);
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
// LEGACY API (Backwards Compatibility)
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

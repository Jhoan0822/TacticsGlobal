
// ============================================
// TACTICSGLOBAL AUDIO SERVICE
// Professional tactical/war game audio system  
// Uses TableTop Audio for background music streaming
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
    musicVolume: 0.35, // Music volume
    isMuted: false
};

// Combat intensity for dynamic music (0-1)
let combatIntensity = 0;
let combatDecayInterval: number | null = null;

// ============================================
// TABLETOP AUDIO STREAMING SYSTEM
// ============================================

// Track URLs from TableTop Audio
const TRACK_URLS = {
    // Menu/Lobby - calm, atmospheric
    menu: [
        'https://sounds.tabletopaudio.com/Medieval_Library.mp3',
        'https://sounds.tabletopaudio.com/Antiquarian_Study.mp3',
    ],
    // Lobby - preparing for battle
    lobby: [
        'https://sounds.tabletopaudio.com/Battle_Stations.mp3',
        'https://sounds.tabletopaudio.com/High_Alert.mp3',
        'https://sounds.tabletopaudio.com/Covert_Ops.mp3',
    ],
    // Gameplay - calm/strategic
    gameplay: [
        'https://sounds.tabletopaudio.com/Skirmish.mp3',
        'https://sounds.tabletopaudio.com/Fog_of_War.mp3',
        'https://sounds.tabletopaudio.com/Western_Watchtower.mp3',
    ],
    // Combat - intense
    combat: [
        'https://sounds.tabletopaudio.com/War_Zone.mp3',
        'https://sounds.tabletopaudio.com/Cry_Havoc.mp3',
        'https://sounds.tabletopaudio.com/City_Under_Siege.mp3',
    ]
};

// Music state
type MusicMode = 'menu' | 'lobby' | 'gameplay' | 'combat' | 'none';
let currentMode: MusicMode = 'none';
let currentAudio: HTMLAudioElement | null = null;
let secondaryAudio: HTMLAudioElement | null = null; // For combat crossfade
let isMusicPlaying = false;
let volumeUpdateInterval: number | null = null;

// Fallback synth
let useFallbackSynth = false;
let musicGain: GainNode | null = null;
let musicLoopTimeouts: number[] = [];
let beatCount = 0;

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
// STREAMING BACKGROUND MUSIC SYSTEM
// ============================================

const createStreamingAudio = (url: string): HTMLAudioElement => {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = 'auto';
    return audio;
};

const fadeAudio = (audio: HTMLAudioElement, targetVol: number, duration: number = 1000) => {
    const startVol = audio.volume;
    const startTime = Date.now();

    const fade = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        audio.volume = startVol + (targetVol - startVol) * progress;

        if (progress < 1) {
            requestAnimationFrame(fade);
        }
    };
    fade();
};

const playMusicMode = async (mode: MusicMode) => {
    if (mode === 'none') {
        stopAllMusic();
        return;
    }

    // If same mode and already playing, do nothing
    if (mode === currentMode && isMusicPlaying) return;

    const tracks = TRACK_URLS[mode];
    if (!tracks || tracks.length === 0) return;

    // Pick random track
    const trackUrl = tracks[Math.floor(Math.random() * tracks.length)];

    // Fade out current audio if playing
    if (currentAudio) {
        fadeAudio(currentAudio, 0, 500);
        setTimeout(() => {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }
        }, 600);
    }

    // Create new audio
    currentAudio = createStreamingAudio(trackUrl);
    currentMode = mode;
    isMusicPlaying = true;

    // Handle errors - fall back to synth
    currentAudio.onerror = (e) => {
        console.warn('TableTop Audio failed, using synth fallback:', e);
        useFallbackSynth = true;
        startFallbackSynth();
    };

    // Loop to next track when this one ends
    currentAudio.onended = () => {
        if (isMusicPlaying && currentMode === mode) {
            // Pick next track
            const nextTrack = tracks[Math.floor(Math.random() * tracks.length)];
            if (currentAudio) {
                currentAudio.src = nextTrack;
                currentAudio.play().catch(() => { });
            }
        }
    };

    try {
        await currentAudio.play();
        // Fade in
        fadeAudio(currentAudio, getMusicVolume(), 1000);

        // For gameplay mode, also prepare combat audio for crossfade
        if (mode === 'gameplay') {
            const combatTrack = TRACK_URLS.combat[Math.floor(Math.random() * TRACK_URLS.combat.length)];
            secondaryAudio = createStreamingAudio(combatTrack);
            secondaryAudio.play().catch(() => { });

            // Start combat crossfade updates
            if (combatDecayInterval) clearInterval(combatDecayInterval);
            combatDecayInterval = window.setInterval(() => {
                combatIntensity = Math.max(0, combatIntensity - 0.008);
                updateCombatCrossfade();
            }, 500);
        }
    } catch (error) {
        console.warn('Streaming failed:', error);
        useFallbackSynth = true;
        startFallbackSynth();
    }
};

const updateCombatCrossfade = () => {
    if (!isMusicPlaying || currentMode !== 'gameplay') return;

    const baseVol = getMusicVolume();
    const gameplayVol = baseVol * (1 - combatIntensity * 0.6);
    const combatVol = baseVol * combatIntensity * 0.8;

    if (currentAudio) currentAudio.volume = Math.max(0, Math.min(1, gameplayVol));
    if (secondaryAudio) secondaryAudio.volume = Math.max(0, Math.min(1, combatVol));
};

const stopAllMusic = () => {
    isMusicPlaying = false;
    currentMode = 'none';

    if (currentAudio) {
        fadeAudio(currentAudio, 0, 500);
        setTimeout(() => {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }
        }, 600);
    }

    if (secondaryAudio) {
        fadeAudio(secondaryAudio, 0, 500);
        setTimeout(() => {
            if (secondaryAudio) {
                secondaryAudio.pause();
                secondaryAudio = null;
            }
        }, 600);
    }

    if (combatDecayInterval) {
        clearInterval(combatDecayInterval);
        combatDecayInterval = null;
    }

    stopFallbackSynth();
};

// ============================================
// FALLBACK SYNTH
// ============================================

const startFallbackSynth = () => {
    const audio = getContext();
    beatCount = 0;

    musicGain = audio.createGain();
    musicGain.gain.setValueAtTime(getMusicVolume() * 0.3, audio.currentTime);
    musicGain.connect(audio.destination);

    const createBeat = () => {
        if (!isMusicPlaying || !useFallbackSynth) return;

        const osc = audio.createOscillator();
        const oscGain = audio.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, audio.currentTime);
        osc.frequency.exponentialRampToValueAtTime(55, audio.currentTime + 0.08);

        oscGain.gain.setValueAtTime(0.15, audio.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);

        osc.connect(oscGain);
        if (musicGain) oscGain.connect(musicGain);

        osc.start();
        osc.stop(audio.currentTime + 0.2);

        beatCount++;
        const timeoutId = window.setTimeout(createBeat, 520);
        musicLoopTimeouts.push(timeoutId);
    };

    createBeat();
};

const stopFallbackSynth = () => {
    useFallbackSynth = false;
    musicLoopTimeouts.forEach(id => clearTimeout(id));
    musicLoopTimeouts = [];

    if (musicGain) {
        const audio = getContext();
        musicGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5);
    }

    setTimeout(() => {
        musicGain = null;
    }, 600);
};

// ============================================
// PUBLIC MUSIC API
// ============================================

const startMenuMusic = () => playMusicMode('menu');
const startLobbyMusic = () => playMusicMode('lobby');
const startBackgroundMusic = () => playMusicMode('gameplay');
const stopBackgroundMusic = () => stopAllMusic();

const setCombatIntensity = (level: number) => {
    combatIntensity = Math.min(1, Math.max(0, level));
    updateCombatCrossfade();
};

const increaseCombatIntensity = (amount: number = 0.08) => {
    setCombatIntensity(combatIntensity + amount);
};

// ============================================
// VOLUME CONTROLS
// ============================================

const setMasterVolume = (vol: number) => {
    audioConfig.masterVolume = Math.min(1, Math.max(0, vol));
    updateCombatCrossfade();
};

const setEffectsVolume = (vol: number) => {
    audioConfig.effectsVolume = Math.min(1, Math.max(0, vol));
};

const setMusicVolume = (vol: number) => {
    audioConfig.musicVolume = Math.min(1, Math.max(0, vol));
    updateCombatCrossfade();
};

const toggleMute = () => {
    audioConfig.isMuted = !audioConfig.isMuted;
    if (currentAudio) currentAudio.volume = audioConfig.isMuted ? 0 : getMusicVolume();
    if (secondaryAudio) secondaryAudio.volume = 0;
    return audioConfig.isMuted;
};

const setMuted = (muted: boolean) => {
    audioConfig.isMuted = muted;
    if (currentAudio) currentAudio.volume = muted ? 0 : getMusicVolume();
    if (secondaryAudio) secondaryAudio.volume = 0;
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
    increaseCombatIntensity(0.06);
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
    increaseCombatIntensity(size === 'LARGE' ? 0.15 : size === 'MEDIUM' ? 0.1 : 0.04);
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

    // Music modes
    startMenuMusic,
    startLobbyMusic,
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

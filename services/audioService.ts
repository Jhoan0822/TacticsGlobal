
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
    masterVolume: 0.6,
    effectsVolume: 0.7,
    musicVolume: 0.4, // Music volume - raised for audibility
    isMuted: false
};

// Combat intensity for dynamic music (0-1)
let combatIntensity = 0;
let combatDecayInterval: number | null = null;

// ============================================
// SYNTH MUSIC STATE
// ============================================

// Music state
type MusicMode = 'menu' | 'lobby' | 'gameplay' | 'combat' | 'none';
let currentMode: MusicMode = 'none';
let isMusicPlaying = false;

// Synth music state
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
// WORLD-CLASS UNIT-SPECIFIC SOUND EFFECTS
// Every unit has a unique, identifiable audio signature
// ============================================

// ---- AIR UNITS ----

// HEAVY BOMBER - Deep engine rumble, heavy and slow
const playHeavyBomberEngine = () => {
    const audio = getContext();
    // Deep propeller drone
    playTone(55, 'sawtooth', 0.4, 0.06);
    playTone(110, 'triangle', 0.35, 0.04);
    // Engine vibration
    setTimeout(() => {
        playTone(82, 'sawtooth', 0.3, 0.04);
        playNoise(0.25, 0.02, 400, 50);
    }, 100);
};

const playHeavyBomberMove = () => {
    // Slow, heavy engine rev
    playFrequencySweep(50, 80, 0.3, 'sawtooth', 0.05);
    playTone(65, 'triangle', 0.4, 0.04);
    playNoise(0.3, 0.02, 300, 40);
};

const playHeavyBomberAttack = () => {
    // Bomb bay doors
    playNoise(0.08, 0.04, 600, 100);
    setTimeout(() => {
        // Bombs falling whistle
        playFrequencySweep(800, 200, 0.5, 'sine', 0.05);
    }, 100);
    setTimeout(() => {
        // Multiple bomb impacts
        playExplosionLarge();
    }, 500);
};

// FIGHTER JET - High-speed whoosh, sonic jet engine
const playFighterJetEngine = () => {
    // Jet turbine whine
    playTone(2000, 'sine', 0.15, 0.03);
    playTone(4000, 'sine', 0.1, 0.02);
    // Afterburner
    playNoise(0.2, 0.04, 6000, 2000);
    playFrequencySweep(500, 2000, 0.15, 'sawtooth', 0.03);
};

const playFighterJetMove = () => {
    // Sonic whoosh
    playFrequencySweep(3000, 500, 0.2, 'sine', 0.04);
    playNoise(0.15, 0.03, 8000, 3000);
    // Afterburner kick
    setTimeout(() => {
        playNoise(0.1, 0.04, 4000, 1000);
        playTone(800, 'sawtooth', 0.08, 0.03);
    }, 50);
};

const playFighterJetAttack = () => {
    // Cannon burst - rapid fire
    for (let i = 0; i < 4; i++) {
        setTimeout(() => {
            playNoise(0.02, 0.06, 6000, 2000);
            playTone(300, 'square', 0.02, 0.04);
        }, i * 40);
    }
};

// HELICOPTER - Distinctive rotor chop
const playHelicopterRotor = () => {
    const audio = getContext();
    // Rotor blade chop pattern
    for (let i = 0; i < 6; i++) {
        setTimeout(() => {
            playTone(80, 'triangle', 0.04, 0.05);
            playNoise(0.03, 0.02, 400, 100);
        }, i * 70);
    }
    // Turbine whine
    playTone(1200, 'sine', 0.3, 0.02);
};

const playHelicopterMove = () => {
    // Rotor speed up
    playHelicopterRotor();
    playFrequencySweep(150, 200, 0.3, 'triangle', 0.03);
};

const playHelicopterAttack = () => {
    // Minigun burst
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            playNoise(0.015, 0.05, 5000, 1500);
        }, i * 25);
    }
};

// RECON DRONE - Electric buzz, high-pitched
const playDroneHum = () => {
    playTone(800, 'square', 0.2, 0.02);
    playTone(1600, 'sine', 0.15, 0.015);
    // Electric motor buzz
    playNoise(0.15, 0.015, 3000, 1000);
};

const playDroneMove = () => {
    // Quick electric adjustment
    playFrequencySweep(1000, 1500, 0.1, 'square', 0.02);
    playNoise(0.1, 0.02, 4000, 1500);
};

// TROOP TRANSPORT - Cargo plane engines
const playTransportEngine = () => {
    playTone(100, 'sawtooth', 0.3, 0.04);
    playTone(200, 'triangle', 0.25, 0.03);
    playNoise(0.2, 0.025, 600, 80);
};

// ---- GROUND UNITS ----

// INFANTRY - Radio clicks, footsteps
const playInfantrySelect = () => {
    // Radio squelch
    playNoise(0.03, 0.04, 6000, 2000);
    setTimeout(() => {
        // "Copy that" beep
        playTone(1000, 'sine', 0.05, 0.04);
        playTone(1200, 'sine', 0.03, 0.03);
    }, 40);
};

const playInfantryMove = () => {
    // Boot steps and gear rattle
    playNoise(0.04, 0.03, 800, 200);
    setTimeout(() => {
        playNoise(0.03, 0.02, 600, 150);
    }, 100);
    // Radio confirmation
    setTimeout(() => {
        playTone(900, 'sine', 0.04, 0.03);
    }, 150);
};

const playInfantryAttack = () => {
    // Rifle fire burst
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            playNoise(0.02, 0.06, 4000, 1000);
            playTone(150, 'triangle', 0.03, 0.04);
        }, i * 80);
    }
};

// SPECIAL FORCES - Suppressed weapons, stealthy
const playSpecOpsSelect = () => {
    // Tactical click
    playTone(1400, 'sine', 0.02, 0.03);
    setTimeout(() => playTone(1600, 'sine', 0.02, 0.025), 30);
};

const playSpecOpsAttack = () => {
    // Suppressed rifle - quiet thud
    playNoise(0.03, 0.04, 2000, 500);
    playTone(100, 'sine', 0.04, 0.03);
};

// GROUND TANK - Heavy treads, diesel engine
const playTankEngine = () => {
    // Diesel rumble
    playTone(40, 'sawtooth', 0.4, 0.05);
    playTone(80, 'triangle', 0.35, 0.04);
    // Track clatter
    playNoise(0.3, 0.03, 500, 50);
};

const playTankMove = () => {
    // Heavy treads grinding
    playTankEngine();
    playFrequencySweep(60, 100, 0.25, 'sawtooth', 0.04);
    // Metal track links
    setTimeout(() => {
        playNoise(0.15, 0.025, 800, 100);
    }, 100);
};

const playTankAttack = () => {
    // Main cannon fire
    playNoise(0.04, 0.12, 3000, 200);
    playTone(60, 'triangle', 0.15, 0.1);
    setTimeout(() => {
        playNoise(0.1, 0.05, 600, 80);
    }, 50);
};

// MISSILE LAUNCHER - Hydraulics and ignition
const playMissileLauncherSelect = () => {
    // Hydraulic servo
    playFrequencySweep(200, 400, 0.2, 'triangle', 0.03);
    playNoise(0.15, 0.02, 1000, 200);
};

const playMissileLauncherAttack = () => {
    // Missile ignition sequence
    playNoise(0.05, 0.04, 2000, 500);
    setTimeout(() => {
        // Rocket motor ignition
        playFrequencySweep(200, 1200, 0.3, 'sawtooth', 0.06);
        playNoise(0.4, 0.05, 4000, 500);
    }, 80);
};

// SAM LAUNCHER - Radar lock + launch
const playSAMSelect = () => {
    // Radar sweep sound
    playFrequencySweep(2000, 4000, 0.15, 'sine', 0.03);
    setTimeout(() => playFrequencySweep(2000, 4000, 0.15, 'sine', 0.025), 200);
};

const playSAMAttack = () => {
    // Lock tone
    for (let i = 0; i < 4; i++) {
        setTimeout(() => playTone(2500, 'sine', 0.05, 0.04), i * 60);
    }
    // Launch
    setTimeout(() => {
        playMissileLaunch();
    }, 300);
};

// ---- SEA UNITS ----

// SUBMARINE - Sonar pings, ballast
const playSubmarineSelect = () => {
    // Sonar ping
    playTone(1500, 'sine', 0.3, 0.04);
    setTimeout(() => {
        playTone(1500, 'sine', 0.15, 0.02);
    }, 400);
};

const playSubmarineMove = () => {
    // Ballast tanks
    playNoise(0.3, 0.03, 400, 50);
    playFrequencySweep(80, 40, 0.4, 'sine', 0.03);
    // Propeller cavitation
    setTimeout(() => {
        playNoise(0.2, 0.02, 600, 100);
    }, 150);
};

const playSubmarineAttack = () => {
    // Torpedo launch tube
    playNoise(0.1, 0.05, 800, 100);
    playTone(100, 'sine', 0.15, 0.04);
    // Torpedo motor
    setTimeout(() => {
        playFrequencySweep(200, 600, 0.3, 'sawtooth', 0.03);
        playNoise(0.25, 0.03, 1000, 200);
    }, 100);
};

// DESTROYER - Ship horn, engine
const playDestroyerSelect = () => {
    // Ship horn (two-tone)
    playTone(180, 'triangle', 0.4, 0.05);
    playTone(220, 'triangle', 0.35, 0.04);
};

const playDestroyerMove = () => {
    // Powerful turbines
    playTone(60, 'sawtooth', 0.3, 0.04);
    playNoise(0.25, 0.03, 400, 40);
    // Wake splash
    setTimeout(() => {
        playNoise(0.2, 0.025, 1500, 200);
    }, 100);
};

const playDestroyerAttack = () => {
    // Naval gun batteries
    for (let i = 0; i < 2; i++) {
        setTimeout(() => {
            playNoise(0.03, 0.1, 2000, 300);
            playTone(80, 'triangle', 0.12, 0.08);
        }, i * 150);
    }
};

// BATTLESHIP - Massive cannons
const playBattleshipSelect = () => {
    // Deep horn
    playTone(80, 'triangle', 0.6, 0.06);
    playTone(120, 'triangle', 0.5, 0.05);
};

const playBattleshipAttack = () => {
    // Main battery salvo - massive
    playNoise(0.05, 0.15, 3000, 400);
    playTone(50, 'triangle', 0.2, 0.12);
    setTimeout(() => {
        playNoise(0.08, 0.12, 2500, 300);
        playTone(55, 'triangle', 0.18, 0.1);
    }, 200);
    setTimeout(() => {
        playNoise(0.06, 0.1, 2000, 250);
    }, 400);
};

// AIRCRAFT CARRIER - Flight deck operations
const playCarrierSelect = () => {
    // Steam catapult ready
    playNoise(0.15, 0.03, 2000, 400);
    playTone(300, 'triangle', 0.2, 0.03);
};

const playCarrierLaunch = () => {
    // Catapult release
    playNoise(0.1, 0.06, 3000, 800);
    playFrequencySweep(400, 2000, 0.3, 'sawtooth', 0.05);
};

// FRIGATE - Smaller, faster
const playFrigateSelect = () => {
    playTone(200, 'triangle', 0.25, 0.04);
    playNoise(0.15, 0.02, 800, 100);
};

// PATROL BOAT - Fast motor
const playPatrolBoatEngine = () => {
    // Outboard motor
    playTone(150, 'sawtooth', 0.2, 0.04);
    playNoise(0.15, 0.03, 1200, 300);
};

// ============================================
// UNIT-SPECIFIC SOUND DISPATCHER
// ============================================

const playUnitSelectByType = (unitClass: UnitClass) => {
    switch (unitClass) {
        // AIR
        case UnitClass.HEAVY_BOMBER: playHeavyBomberEngine(); break;
        case UnitClass.FIGHTER_JET: playFighterJetEngine(); break;
        case UnitClass.HELICOPTER: playHelicopterRotor(); break;
        case UnitClass.RECON_DRONE: playDroneHum(); break;
        case UnitClass.TROOP_TRANSPORT: playTransportEngine(); break;
        // GROUND
        case UnitClass.INFANTRY: playInfantrySelect(); break;
        case UnitClass.SPECIAL_FORCES: playSpecOpsSelect(); break;
        case UnitClass.GROUND_TANK: playTankEngine(); break;
        case UnitClass.MISSILE_LAUNCHER: playMissileLauncherSelect(); break;
        case UnitClass.SAM_LAUNCHER: playSAMSelect(); break;
        // SEA
        case UnitClass.SUBMARINE: playSubmarineSelect(); break;
        case UnitClass.DESTROYER: playDestroyerSelect(); break;
        case UnitClass.BATTLESHIP: playBattleshipSelect(); break;
        case UnitClass.AIRCRAFT_CARRIER: playCarrierSelect(); break;
        case UnitClass.FRIGATE: playFrigateSelect(); break;
        case UnitClass.PATROL_BOAT: playPatrolBoatEngine(); break;
        // STRUCTURES
        default: playUnitSelect(); break;
    }
};

const playUnitMoveByType = (unitClass: UnitClass) => {
    switch (unitClass) {
        // AIR
        case UnitClass.HEAVY_BOMBER: playHeavyBomberMove(); break;
        case UnitClass.FIGHTER_JET: playFighterJetMove(); break;
        case UnitClass.HELICOPTER: playHelicopterMove(); break;
        case UnitClass.RECON_DRONE: playDroneMove(); break;
        case UnitClass.TROOP_TRANSPORT: playTransportEngine(); break;
        // GROUND
        case UnitClass.INFANTRY: playInfantryMove(); break;
        case UnitClass.SPECIAL_FORCES: playInfantryMove(); break;
        case UnitClass.GROUND_TANK: playTankMove(); break;
        case UnitClass.MISSILE_LAUNCHER: playTankMove(); break;
        case UnitClass.SAM_LAUNCHER: playMissileLauncherSelect(); break;
        // SEA
        case UnitClass.SUBMARINE: playSubmarineMove(); break;
        case UnitClass.DESTROYER: playDestroyerMove(); break;
        case UnitClass.BATTLESHIP: playDestroyerMove(); break;
        case UnitClass.AIRCRAFT_CARRIER: playDestroyerMove(); break;
        case UnitClass.FRIGATE: playFrigateSelect(); break;
        case UnitClass.PATROL_BOAT: playPatrolBoatEngine(); break;
        default: playMoveCommand(); break;
    }
};

const playUnitAttackByType = (unitClass: UnitClass) => {
    switch (unitClass) {
        // AIR
        case UnitClass.HEAVY_BOMBER: playHeavyBomberAttack(); break;
        case UnitClass.FIGHTER_JET: playFighterJetAttack(); break;
        case UnitClass.HELICOPTER: playHelicopterAttack(); break;
        case UnitClass.RECON_DRONE: playDroneHum(); break;
        // GROUND
        case UnitClass.INFANTRY: playInfantryAttack(); break;
        case UnitClass.SPECIAL_FORCES: playSpecOpsAttack(); break;
        case UnitClass.GROUND_TANK: playTankAttack(); break;
        case UnitClass.MISSILE_LAUNCHER: playMissileLauncherAttack(); break;
        case UnitClass.SAM_LAUNCHER: playSAMAttack(); break;
        // SEA
        case UnitClass.SUBMARINE: playSubmarineAttack(); break;
        case UnitClass.DESTROYER: playDestroyerAttack(); break;
        case UnitClass.BATTLESHIP: playBattleshipAttack(); break;
        case UnitClass.AIRCRAFT_CARRIER: playCarrierLaunch(); break;
        case UnitClass.FRIGATE: playDestroyerAttack(); break;
        case UnitClass.PATROL_BOAT: playTracerFire(); break;
        default: playAttackCommand(); break;
    }
};

// Order acknowledgment sounds by unit type
const playDefendOrder = (unitClass: UnitClass) => {
    // Defensive stance confirmed
    playTone(600, 'sine', 0.08, 0.04);
    setTimeout(() => {
        playTone(800, 'sine', 0.06, 0.03);
        // Unit-specific confirmation
        if (unitClass.includes('TANK') || unitClass.includes('SAM')) {
            playNoise(0.1, 0.02, 600, 100); // Turret movement
        }
    }, 60);
};

const playPatrolOrder = (unitClass: UnitClass) => {
    // Patrol acknowledged - sweeping tone
    playFrequencySweep(700, 900, 0.1, 'sine', 0.04);
    setTimeout(() => {
        playFrequencySweep(900, 700, 0.1, 'sine', 0.035);
    }, 100);
};

const playAutoAttackOrder = (unitClass: UnitClass) => {
    // Aggressive stance - sharp tones
    playTone(1000, 'sawtooth', 0.04, 0.05);
    setTimeout(() => {
        playTone(1200, 'sawtooth', 0.04, 0.05);
    }, 50);
    setTimeout(() => {
        playTone(1400, 'square', 0.06, 0.04);
    }, 100);
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
// SYNTH-ONLY BACKGROUND MUSIC SYSTEM
// No external audio files - all synthesized
// ============================================

const stopAllMusic = () => {
    isMusicPlaying = false;
    currentMode = 'none';
    stopFallbackSynth();
};

// Map music modes to synth modes
const playMusicMode = async (mode: MusicMode) => {
    if (mode === 'none') {
        stopAllMusic();
        return;
    }

    // If same mode and already playing, do nothing
    if (mode === currentMode && isMusicPlaying) return;

    currentMode = mode;

    // Always use synth - no streaming
    switch (mode) {
        case 'menu':
            startFallbackSynthMode('menu');
            break;
        case 'lobby':
            startFallbackSynthMode('lobby');
            break;
        case 'gameplay':
            startFallbackSynthMode('peace');
            // Start combat decay interval
            if (combatDecayInterval) clearInterval(combatDecayInterval);
            combatDecayInterval = window.setInterval(() => {
                combatIntensity = Math.max(0, combatIntensity - 0.008);
                checkPeaceTransition();
            }, 500);
            break;
        case 'combat':
            startFallbackSynthMode('combat');
            break;
    }
};

// ============================================
// DYNAMIC SYNTH MUSIC SYSTEM
// Distinct music for: Menu, Lobby, Peace, Combat
// Slower tempo, more melodic like Bastion/C&C Generals
// ============================================

// Musical scales and constants
const D_MINOR = [147, 165, 175, 196, 220, 233, 262, 294]; // D3 E3 F3 G3 A3 Bb3 C4 D4
const D_DORIAN = [147, 165, 175, 196, 220, 247, 262, 294]; // D3 E3 F3 G3 A3 B3 C4 D4
let synthMeasure = 0;
let synthMode: 'menu' | 'lobby' | 'peace' | 'combat' = 'peace';
let lastCombatEvent = 0;
let isUnderAttack = false;
let isAttacking = false;

// Start synth with specific mode
const startFallbackSynthMode = (mode: 'menu' | 'lobby' | 'peace' | 'combat') => {
    stopFallbackSynth();
    synthMode = mode;
    useFallbackSynth = true;
    isMusicPlaying = true;

    switch (mode) {
        case 'menu':
            startMenuSynth();
            break;
        case 'lobby':
            startLobbySynth();
            break;
        case 'peace':
        case 'combat':
            startGameplaySynth();
            break;
    }
};

// ============================================
// MENU MUSIC - Calm, atmospheric, ambient
// ============================================
const startMenuSynth = () => {
    const audio = getContext();
    beatCount = 0;

    musicGain = audio.createGain();
    musicGain.gain.setValueAtTime(getMusicVolume() * 0.6, audio.currentTime); // Boosted for audibility
    musicGain.connect(audio.destination);

    // Ambient pad - slow evolving drone
    const createAmbientPad = () => {
        if (!isMusicPlaying || !useFallbackSynth || synthMode !== 'menu') return;

        const chords = [
            [147, 220, 294],  // Dm
            [175, 220, 294],  // F/A
            [165, 220, 330],  // Am/E
            [196, 247, 392],  // G
        ];

        const chord = chords[synthMeasure % chords.length];

        chord.forEach((freq, i) => {
            const osc = audio.createOscillator();
            const oscGain = audio.createGain();
            const filter = audio.createBiquadFilter();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audio.currentTime);

            // Very slow LFO for gentle movement
            const lfo = audio.createOscillator();
            const lfoGain = audio.createGain();
            lfo.frequency.value = 0.1 + Math.random() * 0.1;
            lfoGain.gain.value = 2;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start();

            filter.type = 'lowpass';
            filter.frequency.value = 800;

            // Very slow fade in and out - 8 seconds
            oscGain.gain.setValueAtTime(0, audio.currentTime);
            oscGain.gain.linearRampToValueAtTime(0.06 - i * 0.015, audio.currentTime + 2);
            oscGain.gain.setValueAtTime(0.06 - i * 0.015, audio.currentTime + 6);
            oscGain.gain.linearRampToValueAtTime(0, audio.currentTime + 8);

            osc.connect(filter);
            filter.connect(oscGain);
            if (musicGain) oscGain.connect(musicGain);

            osc.start();
            osc.stop(audio.currentTime + 8.5);
            setTimeout(() => { try { lfo.stop(); } catch (e) { } }, 8500);
        });

        synthMeasure++;
        const timeoutId = window.setTimeout(createAmbientPad, 7000);
        musicLoopTimeouts.push(timeoutId);
    };

    // Occasional melodic phrase - very slow, Bastion-style
    const createMenuMelody = () => {
        if (!isMusicPlaying || !useFallbackSynth || synthMode !== 'menu') return;

        if (Math.random() > 0.5) {
            const melodies = [
                [294, 330, 294],           // D E D
                [294, 262, 220],           // D C A
                [330, 294, 262, 294],      // E D C D
            ];

            const melody = melodies[Math.floor(Math.random() * melodies.length)];
            const noteDuration = 1.2; // Very slow notes

            melody.forEach((freq, i) => {
                setTimeout(() => {
                    if (!isMusicPlaying || !useFallbackSynth || synthMode !== 'menu') return;

                    const osc = audio.createOscillator();
                    const oscGain = audio.createGain();

                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, audio.currentTime);

                    oscGain.gain.setValueAtTime(0, audio.currentTime);
                    oscGain.gain.linearRampToValueAtTime(0.04, audio.currentTime + 0.1);
                    oscGain.gain.setValueAtTime(0.04, audio.currentTime + noteDuration - 0.3);
                    oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + noteDuration);

                    osc.connect(oscGain);
                    if (musicGain) oscGain.connect(musicGain);

                    osc.start();
                    osc.stop(audio.currentTime + noteDuration);
                }, i * noteDuration * 1000);
            });
        }

        const nextMelody = 12000 + Math.random() * 8000; // 12-20 seconds
        const timeoutId = window.setTimeout(createMenuMelody, nextMelody);
        musicLoopTimeouts.push(timeoutId);
    };

    createAmbientPad();
    setTimeout(createMenuMelody, 5000);
};

// ============================================
// LOBBY MUSIC - Building tension, preparing for war
// ============================================
const startLobbySynth = () => {
    const audio = getContext();
    beatCount = 0;
    synthMeasure = 0;

    musicGain = audio.createGain();
    musicGain.gain.setValueAtTime(getMusicVolume() * 0.6, audio.currentTime); // Boosted for audibility
    musicGain.connect(audio.destination);

    const bpm = 75; // Slower, building tension
    const beatInterval = 60000 / bpm;

    // Slow pulsing bass
    const createLobbyPulse = () => {
        if (!isMusicPlaying || !useFallbackSynth || synthMode !== 'lobby') return;

        // Deep pulse
        const bass = audio.createOscillator();
        const bassGain = audio.createGain();
        const bassFilter = audio.createBiquadFilter();

        bass.type = 'sine';
        bass.frequency.setValueAtTime(73, audio.currentTime); // D2

        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = 200;

        bassGain.gain.setValueAtTime(0.1, audio.currentTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);

        bass.connect(bassFilter);
        bassFilter.connect(bassGain);
        if (musicGain) bassGain.connect(musicGain);

        bass.start();
        bass.stop(audio.currentTime + 0.7);

        beatCount++;
        const timeoutId = window.setTimeout(createLobbyPulse, beatInterval);
        musicLoopTimeouts.push(timeoutId);
    };

    // Tension chord stabs
    const createTensionChord = () => {
        if (!isMusicPlaying || !useFallbackSynth || synthMode !== 'lobby') return;

        const chords = [
            [147, 175, 220],   // Dm
            [147, 175, 233],   // Dm7
            [165, 196, 247],   // Em
        ];

        const chord = chords[synthMeasure % chords.length];

        chord.forEach((freq, i) => {
            const osc = audio.createOscillator();
            const oscGain = audio.createGain();
            const filter = audio.createBiquadFilter();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, audio.currentTime);

            filter.type = 'lowpass';
            filter.frequency.value = 600;

            oscGain.gain.setValueAtTime(0.05 - i * 0.01, audio.currentTime);
            oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 2);

            osc.connect(filter);
            filter.connect(oscGain);
            if (musicGain) oscGain.connect(musicGain);

            osc.start();
            osc.stop(audio.currentTime + 2.2);
        });

        synthMeasure++;
        const timeoutId = window.setTimeout(createTensionChord, beatInterval * 4); // Every 4 beats
        musicLoopTimeouts.push(timeoutId);
    };

    createLobbyPulse();
    setTimeout(createTensionChord, beatInterval * 2);
};

// ============================================
// GAMEPLAY MUSIC - Dynamic Peace/Combat
// ============================================
const startGameplaySynth = () => {
    const audio = getContext();
    beatCount = 0;
    synthMeasure = 0;

    musicGain = audio.createGain();
    musicGain.gain.setValueAtTime(getMusicVolume() * 0.5, audio.currentTime); // Boosted for audibility
    musicGain.connect(audio.destination);

    // Dynamic BPM based on combat state
    const getBaseBPM = () => {
        if (synthMode === 'combat') return 80;
        return 65; // Peace mode - very slow
    };

    // Main rhythm - adapts to peace/combat
    const createGameplayBeat = () => {
        if (!isMusicPlaying || !useFallbackSynth) return;
        if (synthMode !== 'peace' && synthMode !== 'combat') return;

        const bpm = getBaseBPM();
        const beatInterval = 60000 / bpm;
        const isCombat = synthMode === 'combat';
        const intensity = isCombat ? Math.max(0.5, combatIntensity) : 0.3;

        // Kick - only on beat 1 in peace, beats 1 and 3 in combat
        const shouldPlayKick = isCombat ?
            (beatCount % 4 === 0 || beatCount % 4 === 2) :
            (beatCount % 8 === 0);

        if (shouldPlayKick) {
            const kick = audio.createOscillator();
            const kickGain = audio.createGain();
            kick.type = 'sine';
            kick.frequency.setValueAtTime(80, audio.currentTime);
            kick.frequency.exponentialRampToValueAtTime(40, audio.currentTime + 0.1);
            kickGain.gain.setValueAtTime(0.1 * intensity, audio.currentTime);
            kickGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);
            kick.connect(kickGain);
            if (musicGain) kickGain.connect(musicGain);
            kick.start();
            kick.stop(audio.currentTime + 0.25);
        }

        // Snare - only in combat mode
        if (isCombat && (beatCount % 4 === 2)) {
            const snare = audio.createOscillator();
            const snareGain = audio.createGain();
            snare.type = 'triangle';
            snare.frequency.setValueAtTime(180, audio.currentTime);
            snare.frequency.exponentialRampToValueAtTime(100, audio.currentTime + 0.06);
            snareGain.gain.setValueAtTime(0.05 * intensity, audio.currentTime);
            snareGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
            snare.connect(snareGain);
            if (musicGain) snareGain.connect(musicGain);
            snare.start();
            snare.stop(audio.currentTime + 0.15);
        }

        beatCount++;
        const timeoutId = window.setTimeout(createGameplayBeat, beatInterval / 2);
        musicLoopTimeouts.push(timeoutId);
    };

    // Bass line - slower in peace, driving in combat
    const createGameplayBass = () => {
        if (!isMusicPlaying || !useFallbackSynth) return;
        if (synthMode !== 'peace' && synthMode !== 'combat') return;

        const isCombat = synthMode === 'combat';
        const bpm = getBaseBPM();
        const noteInterval = isCombat ? (60000 / bpm) : (60000 / bpm * 2); // Slower in peace
        const intensity = isCombat ? 0.6 : 0.35;

        const peacePatterns = [
            [147],             // Just D
            [147, 175],        // D F
            [147, 220],        // D A
        ];

        const combatPatterns = [
            [147, 147, 175, 165],    // D D F E
            [147, 175, 165, 147],    // D F E D
            [147, 165, 147, 220],    // D E D A
        ];

        const patterns = isCombat ? combatPatterns : peacePatterns;
        const pattern = patterns[synthMeasure % patterns.length];

        pattern.forEach((freq, i) => {
            setTimeout(() => {
                if (!isMusicPlaying || !useFallbackSynth) return;
                if (synthMode !== 'peace' && synthMode !== 'combat') return;

                const bass = audio.createOscillator();
                const bassGain = audio.createGain();
                const bassFilter = audio.createBiquadFilter();

                bass.type = 'sawtooth';
                bass.frequency.setValueAtTime(freq, audio.currentTime);

                bassFilter.type = 'lowpass';
                bassFilter.frequency.value = 350;
                bassFilter.Q.value = 1.5;

                bassGain.gain.setValueAtTime(0.07 * intensity, audio.currentTime);
                bassGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + noteInterval / 1200);

                bass.connect(bassFilter);
                bassFilter.connect(bassGain);
                if (musicGain) bassGain.connect(musicGain);

                bass.start();
                bass.stop(audio.currentTime + noteInterval / 1000);
            }, i * noteInterval);
        });

        synthMeasure++;
        const measureDuration = pattern.length * noteInterval;
        const timeoutId = window.setTimeout(createGameplayBass, measureDuration);
        musicLoopTimeouts.push(timeoutId);
    };

    // Melodic layer - appears in peace, less in combat
    const createGameplayMelody = () => {
        if (!isMusicPlaying || !useFallbackSynth) return;
        if (synthMode !== 'peace' && synthMode !== 'combat') return;

        const isCombat = synthMode === 'combat';

        // More likely to play melody in peace mode
        const playChance = isCombat ? 0.8 : 0.5;

        if (Math.random() > playChance) {
            const melodies = [
                [294, 330, 349, 330],      // D E F E
                [294, 349, 330, 294],      // D F E D
                [440, 392, 349, 330],      // A G F E
                [294, 330, 294, 262],      // D E D C
            ];

            const melody = melodies[Math.floor(Math.random() * melodies.length)];
            const noteDuration = isCombat ? 0.5 : 0.9; // Slower notes in peace

            melody.forEach((freq, i) => {
                setTimeout(() => {
                    if (!isMusicPlaying || !useFallbackSynth) return;
                    if (synthMode !== 'peace' && synthMode !== 'combat') return;

                    const osc = audio.createOscillator();
                    const oscGain = audio.createGain();
                    const filter = audio.createBiquadFilter();

                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, audio.currentTime);

                    // Gentle vibrato
                    const lfo = audio.createOscillator();
                    const lfoGain = audio.createGain();
                    lfo.frequency.value = 4;
                    lfoGain.gain.value = 2;
                    lfo.connect(lfoGain);
                    lfoGain.connect(osc.frequency);
                    lfo.start();

                    filter.type = 'lowpass';
                    filter.frequency.value = 1400;

                    oscGain.gain.setValueAtTime(0, audio.currentTime);
                    oscGain.gain.linearRampToValueAtTime(0.035, audio.currentTime + 0.05);
                    oscGain.gain.setValueAtTime(0.035, audio.currentTime + noteDuration * 0.7);
                    oscGain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + noteDuration);

                    osc.connect(filter);
                    filter.connect(oscGain);
                    if (musicGain) oscGain.connect(musicGain);

                    osc.start();
                    osc.stop(audio.currentTime + noteDuration + 0.1);
                    setTimeout(() => { try { lfo.stop(); } catch (e) { } }, noteDuration * 1000 + 100);
                }, i * noteDuration * 1000);
            });
        }

        // Longer intervals between melodies
        const nextMelody = isCombat ?
            (8000 + Math.random() * 6000) :  // 8-14s in combat
            (15000 + Math.random() * 10000); // 15-25s in peace
        const timeoutId = window.setTimeout(createGameplayMelody, nextMelody);
        musicLoopTimeouts.push(timeoutId);
    };

    // Ambient pad layer for peace mode
    const createAmbientLayer = () => {
        if (!isMusicPlaying || !useFallbackSynth) return;
        if (synthMode !== 'peace') return;

        const chord = [147, 220, 294]; // Dm triad

        chord.forEach((freq, i) => {
            const osc = audio.createOscillator();
            const oscGain = audio.createGain();
            const filter = audio.createBiquadFilter();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audio.currentTime);

            filter.type = 'lowpass';
            filter.frequency.value = 500;

            oscGain.gain.setValueAtTime(0, audio.currentTime);
            oscGain.gain.linearRampToValueAtTime(0.04 - i * 0.01, audio.currentTime + 3);
            oscGain.gain.setValueAtTime(0.04 - i * 0.01, audio.currentTime + 10);
            oscGain.gain.linearRampToValueAtTime(0, audio.currentTime + 14);

            osc.connect(filter);
            filter.connect(oscGain);
            if (musicGain) oscGain.connect(musicGain);

            osc.start();
            osc.stop(audio.currentTime + 15);
        });

        const timeoutId = window.setTimeout(createAmbientLayer, 12000);
        musicLoopTimeouts.push(timeoutId);
    };

    // Start all gameplay layers
    createGameplayBeat();
    setTimeout(createGameplayBass, 500);
    setTimeout(createGameplayMelody, 4000);

    // Ambient layer only in peace
    if (synthMode === 'peace') {
        setTimeout(createAmbientLayer, 2000);
    }
};

// Legacy start function
const startFallbackSynth = () => {
    startFallbackSynthMode('peace');
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

// Dynamic combat state transitions
const triggerCombatMode = (attacking: boolean) => {
    if (attacking) isAttacking = true;
    else isUnderAttack = true;

    lastCombatEvent = Date.now();

    if (synthMode === 'peace' && useFallbackSynth) {
        synthMode = 'combat';
        // Don't restart - let layers adapt dynamically
    }
};

const checkPeaceTransition = () => {
    // Return to peace if no combat for 8 seconds
    const timeSinceCombat = Date.now() - lastCombatEvent;
    if (timeSinceCombat > 8000 && synthMode === 'combat') {
        synthMode = 'peace';
        isAttacking = false;
        isUnderAttack = false;
    }
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

    // Trigger combat mode if intensity rises
    if (level > 0.3 && useFallbackSynth) {
        triggerCombatMode(true);
    }

    // Check for peace transition
    checkPeaceTransition();
};

const increaseCombatIntensity = (amount: number = 0.08) => {
    setCombatIntensity(combatIntensity + amount);

    // Any combat action triggers combat mode
    if (useFallbackSynth && synthMode === 'peace') {
        triggerCombatMode(true);
    }
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

    // Combat triggers for dynamic music
    triggerCombatMode,
    checkPeaceTransition,

    // Unit-specific sounds (world-class audio system)
    playUnitSelectByType,
    playUnitMoveByType,
    playUnitAttackByType,
    playDefendOrder,
    playPatrolOrder,
    playAutoAttackOrder,

    playGunfire,
    playUiClick,
    playSuccess,
    playAlert,
    playError,
};

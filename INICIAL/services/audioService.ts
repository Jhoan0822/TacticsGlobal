
// Simple Synthesizer for Sound Effects to avoid external assets
const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
const ctx = new AudioContextClass();

const playTone = (freq: number, type: OscillatorType, duration: number, vol: number = 0.1) => {
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
};

const playNoise = (duration: number) => {
    if (ctx.state === 'suspended') ctx.resume();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    noise.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
};

export const AudioService = {
    playGunfire: () => {
        // Short high pitch noise/pop
        playTone(150, 'square', 0.1, 0.05);
        playNoise(0.1);
    },
    playExplosion: () => {
        // Low rumble
        playTone(50, 'sawtooth', 0.5, 0.2);
        playNoise(0.5);
    },
    playUiClick: () => {
        playTone(800, 'sine', 0.05, 0.05);
    },
    playSuccess: () => {
        playTone(400, 'sine', 0.1, 0.1);
        setTimeout(() => playTone(600, 'sine', 0.2, 0.1), 100);
    },
    playAlert: () => {
        playTone(200, 'sawtooth', 0.2, 0.1);
        setTimeout(() => playTone(150, 'sawtooth', 0.2, 0.1), 150);
    }
};
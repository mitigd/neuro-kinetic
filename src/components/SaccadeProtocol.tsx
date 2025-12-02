import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Target, Play, Brain, RotateCcw, Zap, RefreshCw, Lock } from 'lucide-react';

// --- CONFIGURATION ---
const SPEED_FLOOR = 600; 
const STARTING_SPEED = 1500;
const SPEED_INCREMENT = 50; 
const SHIFT_THRESHOLD_BASE = 15; 

const WORD_BANK = [
  'KIV', 'JOP', 'ZEX', 'VUM', 'QAD', 'WIZ', 'YUP', 'BOK', 'HIX', 'GAV', 
  'LUN', 'REK', 'DAX', 'ZID', 'FOG', 'MUV', 'NIP', 'TEZ', 'WAK', 'SUT'
];

// --- TYPES ---
type Side = 'LEFT' | 'RIGHT';
type GameState = 'IDLE' | 'FIXATION' | 'CUE' | 'TARGET' | 'FEEDBACK';

interface Cipher {
  left: string;
  right: string;
}

interface UserProfile {
  level: number;
  speedWindow: number;
  totalXP: number;
  highScoreStreak: number;
}

const DEFAULT_PROFILE: UserProfile = {
  level: 1,
  speedWindow: STARTING_SPEED, 
  totalXP: 0,
  highScoreStreak: 0
};

// --- AUDIO ENGINE ---
const playTone = (type: 'HIT' | 'MISS' | 'LEVEL_UP' | 'TICK' | 'START' | 'GLITCH') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;

  switch (type) {
    case 'HIT': 
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2); osc.start(now); osc.stop(now + 0.2); break;
    case 'MISS': 
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(80, now + 0.3); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4); osc.start(now); osc.stop(now + 0.4); break;
    case 'LEVEL_UP': 
      osc.type = 'triangle'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554, now + 0.1); osc.frequency.setValueAtTime(659, now + 0.2); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.6); osc.start(now); osc.stop(now + 0.6); break;
    case 'TICK': 
      osc.type = 'square'; osc.frequency.setValueAtTime(1200, now); gain.gain.setValueAtTime(0.01, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03); osc.start(now); osc.stop(now + 0.03); break;
    case 'START':
      osc.type = 'sine'; osc.frequency.setValueAtTime(220, now); osc.frequency.exponentialRampToValueAtTime(880, now + 0.5); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.5); osc.start(now); osc.stop(now + 0.5); break;
    case 'GLITCH': 
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(200, now + 0.15); osc.frequency.linearRampToValueAtTime(1200, now + 0.3); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.3); osc.start(now); osc.stop(now + 0.3); break;
  }
};

const getRandomWord = (exclude?: string) => {
    let word = '';
    do {
        word = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
    } while (word === exclude);
    return word;
};

// --- LOGIC GENERATOR ---
const generateRFTFrame = (level: number, cipher: Cipher) => {
    const target = Math.random() > 0.5 ? 'LEFT' : 'RIGHT';
    const opposite = target === 'LEFT' ? 'RIGHT' : 'LEFT';

    let mode = level;
    if (level >= 5) mode = Math.floor(Math.random() * 5) + 1; 

    // 1. Literal
    if (mode === 1) return { text: target, color: 'text-white', correctSide: target };
    
    // 2. Symbolic (Dynamic Cipher)
    if (mode === 2) {
        const token = target === 'LEFT' ? cipher.left : cipher.right;
        return { text: token, color: 'text-cyan-400', correctSide: target };
    }

    // 3. Contextual (Inhibition)
    if (mode === 3) {
        const isInvert = Math.random() > 0.4;
        return { text: isInvert ? opposite : target, color: isInvert ? 'text-rose-500' : 'text-emerald-500', correctSide: target };
    }

    // 4. Relational (Logic)
    if (mode === 4) {
        const type = Math.random() > 0.5 ? 'SAME' : 'NOT';
        const anchor = Math.random() > 0.5 ? 'LEFT' : 'RIGHT';
        const correct = type === 'SAME' ? anchor : (anchor === 'LEFT' ? 'RIGHT' : 'LEFT');
        return { text: `${type === 'SAME' ? '=' : '≠'} ${anchor}`, color: 'text-amber-400', correctSide: correct };
    }

    // 5. Complex
    if (mode === 5) {
        const baseSide = Math.random() > 0.5 ? 'LEFT' : 'RIGHT'; 
        const baseWord = baseSide === 'LEFT' ? cipher.left : cipher.right;
        const mod = Math.random() > 0.5 ? 'SAME' : 'OPP'; 
        const finalDir = mod === 'SAME' ? baseSide : (baseSide === 'LEFT' ? 'RIGHT' : 'LEFT');
        return { text: `${mod === 'SAME' ? '' : 'NON-'} ${baseWord}`, color: 'text-fuchsia-400', correctSide: finalDir };
    }

    return { text: target, color: 'text-white', correctSide: target };
};

const InfinitePosner = () => {
    // --- UI STATE ---
    const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
    const [phase, setPhase] = useState<GameState>('IDLE');
    const [cue, setCue] = useState({ text: '', color: '', correctSide: 'LEFT' as Side });
    const [feedback, setFeedback] = useState<'HIT' | 'MISS' | null>(null);
    const [targetVisible, setTargetVisible] = useState(false);
    const [cipher, setCipher] = useState<Cipher>({ left: 'ZID', right: 'DAX' });
    const [glitchAnim, setGlitchAnim] = useState(false);
    
    // --- ENGINE STATE (Source of Truth) ---
    const gameRef = useRef({
        isPlaying: false,
        currentState: 'IDLE' as GameState,
        level: 1,
        speedWindow: STARTING_SPEED,
        streak: 0,
        trialsSinceShift: 0,
        currentCipher: { left: 'ZID', right: 'DAX' },
        currentTargetSide: 'LEFT' as Side, // <--- ADDED: This fixes the keyboard bug
        timer: null as ReturnType<typeof setTimeout> | null,
    });

    useEffect(() => {
        const saved = localStorage.getItem('RFT_POSNER_PROFILE');
        if (saved) {
            const parsed = JSON.parse(saved);
            setProfile(parsed);
            gameRef.current.level = parsed.level;
            gameRef.current.speedWindow = parsed.speedWindow;
        }
        regenerateCipher();
    }, []);

    const regenerateCipher = () => {
        const l = getRandomWord();
        const r = getRandomWord(l);
        const newCipher = { left: l, right: r };
        gameRef.current.currentCipher = newCipher;
        setCipher(newCipher);
        setGlitchAnim(true);
        playTone('GLITCH');
        setTimeout(() => setGlitchAnim(false), 500);
    };

    const setGamePhase = (newPhase: GameState) => {
        gameRef.current.currentState = newPhase;
        setPhase(newPhase);
    };

    const runTrial = useCallback(() => {
        if (!gameRef.current.isPlaying) return;

        setGamePhase('FIXATION');
        setTargetVisible(false);
        setFeedback(null);

        const fixationTime = 800 + Math.random() * 400;
        
        gameRef.current.timer = setTimeout(() => {
            if (!gameRef.current.isPlaying) return;

            // Generate Logic
            const logic = generateRFTFrame(gameRef.current.level, gameRef.current.currentCipher);
            
            // KEY FIX: Update the REF with the correct side, not just the state
            gameRef.current.currentTargetSide = logic.correctSide; 
            
            setCue(logic);
            setGamePhase('CUE');
            playTone('TICK');

            gameRef.current.timer = setTimeout(() => {
                if (!gameRef.current.isPlaying) return;
                
                setGamePhase('TARGET');
                setTargetVisible(true);
                setTimeout(() => setTargetVisible(false), 150);

                gameRef.current.timer = setTimeout(() => {
                    handleInput('TIMEOUT');
                }, 800); 

            }, gameRef.current.speedWindow);

        }, fixationTime);
    }, []);

    const handleResult = (result: 'HIT' | 'MISS') => {
        let { level, speedWindow, streak, trialsSinceShift } = gameRef.current;

        if (result === 'HIT') {
            streak++;
            trialsSinceShift++;
            playTone('HIT');
            
            const shiftThreshold = Math.max(5, SHIFT_THRESHOLD_BASE - (level * 2));
            if (level >= 2 && trialsSinceShift >= shiftThreshold) {
                regenerateCipher();
                gameRef.current.trialsSinceShift = 0;
            } else {
                gameRef.current.trialsSinceShift = trialsSinceShift;
            }

            const speedMastery = speedWindow <= 600;
            const streakMastery = streak >= 10;

            if ((speedMastery || streakMastery) && level < 5) {
                level++;
                speedWindow = 1200; 
                streak = 0; 
                playTone('LEVEL_UP');
            } else {
                if (speedWindow > SPEED_FLOOR) {
                    speedWindow -= SPEED_INCREMENT;
                }
            }
        } else {
            streak = 0;
            playTone('MISS');
            speedWindow = Math.min(speedWindow + 200, 2000);
            if (speedWindow >= 1800 && level > 1) {
                level--;
                speedWindow = 1000;
            }
        }

        gameRef.current.level = level;
        gameRef.current.speedWindow = speedWindow;
        gameRef.current.streak = streak;

        setProfile(prev => {
            const updated = {
                ...prev,
                level,
                speedWindow,
                totalXP: result === 'HIT' ? prev.totalXP + (level * 10) : prev.totalXP,
                highScoreStreak: Math.max(prev.highScoreStreak, streak)
            };
            localStorage.setItem('RFT_POSNER_PROFILE', JSON.stringify(updated));
            return updated;
        });

        setFeedback(result);
        setGamePhase('FEEDBACK');

        if (gameRef.current.timer) clearTimeout(gameRef.current.timer);
        gameRef.current.timer = setTimeout(runTrial, 1000);
    };

    const handleInput = (side: Side | 'TIMEOUT') => {
        const current = gameRef.current.currentState;
        if (current !== 'TARGET' && current !== 'CUE') return;

        if (gameRef.current.timer) clearTimeout(gameRef.current.timer);
        gameRef.current.currentState = 'FEEDBACK'; 

        // KEY FIX: Compare against Ref, not State
        const correctSide = gameRef.current.currentTargetSide;

        let result: 'HIT' | 'MISS' = 'MISS';
        if (side === 'TIMEOUT') {
            result = 'MISS';
        } else if (side === correctSide) {
            result = 'HIT';
        }

        handleResult(result);
    };

    const startGame = () => {
        gameRef.current.isPlaying = true;
        regenerateCipher();
        playTone('START');
        runTrial();
    };

    const stopGame = () => {
        gameRef.current.isPlaying = false;
        if (gameRef.current.timer) clearTimeout(gameRef.current.timer);
        setGamePhase('IDLE');
    };

    // Keyboard Handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!gameRef.current.isPlaying) return;
            if (e.key === 'ArrowLeft' || e.key === 'a') handleInput('LEFT');
            if (e.key === 'ArrowRight' || e.key === 'd') handleInput('RIGHT');
            if (e.key === 'Escape') stopGame();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []); 

    // --- RENDER ---
    if (phase === 'IDLE') {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center font-mono select-none">
                <div className="mb-8 relative">
                    <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse"></div>
                    <Brain className="w-20 h-20 text-cyan-400 relative z-10" />
                </div>
                
                <h1 className="text-4xl font-black text-white tracking-tighter mb-2">NEURO-SACCADE</h1>
                <h2 className="text-sm text-cyan-500 tracking-[0.3em] uppercase mb-8">Dynamic RFT Protocol</h2>

                <div className="grid grid-cols-3 gap-4 mb-12 w-full max-w-lg text-xs md:text-sm">
                    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-lg">
                        <div className="text-slate-500 uppercase mb-1">Cortex</div>
                        <div className={`text-xl font-bold ${profile.level >= 5 ? 'text-fuchsia-400' : 'text-white'}`}>
                            {profile.level >= 5 ? 'OMEGA' : `LVL ${profile.level}`}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-lg">
                        <div className="text-slate-500 uppercase mb-1">Processing</div>
                        <div className="text-xl font-bold text-emerald-400">{profile.speedWindow}ms</div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-lg">
                        <div className="text-slate-500 uppercase mb-1">XP</div>
                        <div className="text-xl font-bold text-amber-400">{profile.totalXP}</div>
                    </div>
                </div>

                <div className="flex flex-col gap-2 items-center text-xs text-slate-500 mb-8 max-w-md">
                     <p>Biometric Lock enabled at <span className="text-emerald-400">600ms</span>.</p>
                     <p>Complexity scales laterally via <span className="text-fuchsia-400">Cipher Shifts</span>.</p>
                </div>

                <button 
                    onClick={startGame}
                    className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded flex items-center gap-3 transition-all hover:scale-105"
                >
                    <Play className="fill-current w-5 h-5" />
                    INITIATE
                </button>
            </div>
        );
    }

    return (
        <div className="w-full h-screen bg-slate-950 overflow-hidden relative flex flex-col select-none cursor-crosshair">
            
            {/* TOP BAR: STATS */}
            <div className="w-full p-4 flex justify-between items-start font-mono text-xs z-50 border-b border-slate-900 bg-slate-950/50">
                <div className="flex gap-6">
                    <div>
                        <span className="text-slate-500 uppercase">Level </span>
                        <span className={`font-bold text-lg ${profile.level >= 5 ? 'text-fuchsia-400' : 'text-cyan-400'}`}>
                            {profile.level >= 5 ? 'OMEGA' : profile.level}
                        </span>
                    </div>
                    <div>
                        <span className="text-slate-500 uppercase">Window </span>
                        <span className={`font-bold text-lg ${profile.speedWindow <= SPEED_FLOOR ? 'text-rose-500' : 'text-emerald-400'}`}>
                            {profile.speedWindow}ms
                        </span>
                        {profile.speedWindow <= SPEED_FLOOR && <Lock className="inline w-3 h-3 ml-1 text-rose-500" />}
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                     <div className="flex items-center gap-2 text-slate-500">
                        <Zap className={`w-4 h-4 ${gameRef.current.streak > 5 ? 'text-amber-400 animate-pulse' : ''}`} />
                        <span>Streak: {gameRef.current.streak}</span>
                     </div>
                     <button onClick={stopGame} className="p-2 text-slate-500 hover:text-white transition-colors">
                        <RotateCcw className="w-5 h-5" />
                     </button>
                </div>
            </div>

            {/* THE LIVING CIPHER - ALWAYS VISIBLE */}
            <div className={`w-full flex justify-center py-4 transition-all duration-300 ${glitchAnim ? 'opacity-50 blur-sm scale-105' : 'opacity-100'}`}>
                <div className={`
                    flex gap-8 px-8 py-3 rounded-full border border-slate-800 bg-slate-900/80 backdrop-blur-md shadow-xl
                    ${glitchAnim ? 'border-fuchsia-500/50 bg-fuchsia-900/20' : ''}
                `}>
                    <div className="flex items-center gap-3">
                        <span className="text-fuchsia-400 font-bold text-xl font-mono">{cipher.left}</span>
                        <span className="text-slate-500 text-xs">IS</span>
                        <span className="text-white font-bold text-sm">LEFT</span>
                    </div>
                    <div className="w-px h-full bg-slate-800"></div>
                    <div className="flex items-center gap-3">
                        <span className="text-fuchsia-400 font-bold text-xl font-mono">{cipher.right}</span>
                        <span className="text-slate-500 text-xs">IS</span>
                        <span className="text-white font-bold text-sm">RIGHT</span>
                    </div>
                    <div className="absolute -right-6 top-1/2 -translate-y-1/2">
                        {glitchAnim && <RefreshCw className="w-4 h-4 text-fuchsia-500 animate-spin" />}
                    </div>
                </div>
            </div>

            {/* FIELD */}
            <div className="flex-1 flex items-center justify-between px-4 md:px-20 relative max-w-6xl mx-auto w-full">
                
                {/* LEFT RECEPTOR */}
                <div 
                    onMouseDown={() => handleInput('LEFT')}
                    className={`
                        w-24 h-48 md:w-32 md:h-64 border-2 rounded-lg flex items-center justify-center transition-all duration-100 relative
                        ${phase === 'TARGET' ? 'border-slate-600' : 'border-slate-800 opacity-20'}
                        ${feedback === 'HIT' && cue.correctSide === 'LEFT' ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_50px_rgba(16,185,129,0.3)]' : ''}
                        ${feedback === 'MISS' && cue.correctSide === 'LEFT' ? 'border-rose-500 bg-rose-500/10' : ''}
                    `}
                >
                    {targetVisible && <div className="absolute inset-2 bg-white rounded animate-ping duration-75" />}
                    <div className="w-1 h-1 bg-slate-600 rounded-full" />
                </div>

                {/* CENTER STAGE */}
                <div className="flex flex-col items-center justify-center w-80 h-80 relative">
                    
                    {phase === 'FIXATION' && (
                        <Target className="w-6 h-6 text-slate-600 animate-pulse" />
                    )}

                    {phase === 'CUE' && (
                        <div className="animate-in zoom-in duration-100 flex flex-col items-center">
                            <span className="text-[10px] text-slate-600 font-mono tracking-[0.3em] uppercase mb-4">DECODE</span>
                            <div className={`text-5xl md:text-7xl font-black tracking-tighter ${cue.color} drop-shadow-2xl`}>
                                {cue.text}
                            </div>
                        </div>
                    )}

                    {phase === 'FEEDBACK' && (
                        <div className={`text-4xl font-black tracking-widest ${feedback === 'HIT' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {feedback}
                        </div>
                    )}

                    {/* Timer Bar */}
                    {phase === 'CUE' && (
                        <div className="absolute bottom-10 w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-cyan-500/50"
                                style={{ 
                                    animation: `shrink ${profile.speedWindow}ms linear forwards` 
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* RIGHT RECEPTOR */}
                <div 
                    onMouseDown={() => handleInput('RIGHT')}
                    className={`
                        w-24 h-48 md:w-32 md:h-64 border-2 rounded-lg flex items-center justify-center transition-all duration-100 relative
                        ${phase === 'TARGET' ? 'border-slate-600' : 'border-slate-800 opacity-20'}
                        ${feedback === 'HIT' && cue.correctSide === 'RIGHT' ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_50px_rgba(16,185,129,0.3)]' : ''}
                        ${feedback === 'MISS' && cue.correctSide === 'RIGHT' ? 'border-rose-500 bg-rose-500/10' : ''}
                    `}
                >
                    {targetVisible && <div className="absolute inset-2 bg-white rounded animate-ping duration-75" />}
                    <div className="w-1 h-1 bg-slate-600 rounded-full" />
                </div>

            </div>
            
            <style>{`
                @keyframes shrink { from { width: 100%; } to { width: 0%; } }
            `}</style>
        </div>
    );
};

export default InfinitePosner;
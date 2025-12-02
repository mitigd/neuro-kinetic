import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StreamState, ColorState, ModifierType, GameResult } from '../types';
import { Star, Circle, Zap, Play, Shuffle, AlertTriangle, Activity, Database, RefreshCw, Volume2, VolumeX, Shield, ShieldAlert, Keyboard, GitCommit } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* AUDIO ENGINE                                 */
/* -------------------------------------------------------------------------- */

const playTone = (type: 'SUCCESS' | 'ERROR' | 'TICK' | 'REBOOT' | 'SHIELD_BREAK' | 'LIFE_UP') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;

  switch (type) {
    case 'SUCCESS':
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); osc.start(now); osc.stop(now + 0.3); break;
    case 'ERROR':
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.3); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4); osc.start(now); osc.stop(now + 0.4); break;
    case 'SHIELD_BREAK':
      osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.4); gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4); osc.start(now); osc.stop(now + 0.4); break;
    case 'LIFE_UP':
      osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now); osc.frequency.exponentialRampToValueAtTime(2000, now + 0.4); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.5); osc.start(now); osc.stop(now + 0.5); break;
    case 'TICK':
      osc.type = 'square'; osc.frequency.setValueAtTime(2000, now); gain.gain.setValueAtTime(0.02, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05); osc.start(now); osc.stop(now + 0.05); break;
    case 'REBOOT':
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(50, now); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 1.5); osc.start(now); osc.stop(now + 1.5); break;
  }
};

/* -------------------------------------------------------------------------- */
/* TYPES                                      */
/* -------------------------------------------------------------------------- */

enum ComplexityLevel {
  BASELINE = 0,
  SPEED_UP = 1,
  FLUX_INTRO = 2,
  JITTER_INTRO = 3,
  NOISE_INTRO = 4,
  MAXIMUM_LOAD = 5
}

interface StreamProtocolProps {
  onGameOver: (result: GameResult) => void;
  onExit: () => void;
}

const STORAGE_KEY = 'neurokinetic_stream_data';

const StreamProtocol: React.FC<StreamProtocolProps> = ({ onExit }) => {
  
  // -- STATE --
  const [gameState, setGameState] = useState<StreamState>(StreamState.IDLE);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [buffer, setBuffer] = useState(0); 
  const [isDamaged, setIsDamaged] = useState(false); 
  const [isShieldBreak, setIsShieldBreak] = useState(false); 
  const [isRebooting, setIsRebooting] = useState(false); 
  const [correctFeedback, setCorrectFeedback] = useState<ColorState | null>(null);
  const [warmUpRounds, setWarmUpRounds] = useState(3);
  const [currentState, setCurrentState] = useState<ColorState>(ColorState.RED);
  const [nextModifier, setNextModifier] = useState<ModifierType>(ModifierType.KEEP);
  const [complexity, setComplexity] = useState<ComplexityLevel>(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved).complexity : ComplexityLevel.BASELINE;
  });
  const [history, setHistory] = useState<boolean[]>([]); 
  const [roundDuration, setRoundDuration] = useState(3000); 
  const [timeLeft, setTimeLeft] = useState(100); 
  const [isMuted, setIsMuted] = useState(false);
  const [isFluxActive, setIsFluxActive] = useState(false);   
  const [isInputInverted, setIsInputInverted] = useState(false); 
  const [isLureActive, setIsLureActive] = useState(false);   
  const [startColor, setStartColor] = useState<ColorState>(ColorState.RED);
  const [ruleMapping, setRuleMapping] = useState<Record<ModifierType, 'STAR' | 'CIRCLE'>>({
    [ModifierType.KEEP]: 'CIRCLE',
    [ModifierType.INVERT]: 'STAR'
  });
  const [userAnswer, setUserAnswer] = useState<ColorState | null>(null);

  // -- Refs --
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const hasAnsweredRef = useRef<boolean>(false);
  const gameStateRef = useRef<StreamState>(StreamState.IDLE);
  const roundDurationRef = useRef(3000);

  // Sync Refs & Persistence
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { roundDurationRef.current = roundDuration; }, [roundDuration]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ complexity: complexity, lastPlayed: Date.now() }));
  }, [complexity]);

  const triggerSound = useCallback((type: 'SUCCESS' | 'ERROR' | 'TICK' | 'REBOOT' | 'SHIELD_BREAK' | 'LIFE_UP') => {
      if (!isMuted) playTone(type);
  }, [isMuted]);

  /* -------------------------------------------------------------------------- */
  /* INPUT HANDLING                                 */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (gameState !== StreamState.ACTIVE || hasAnsweredRef.current || isRebooting) return;
        const leftKeys = ['ArrowLeft', 'a', 'A', 'd', 'D'];
        const rightKeys = ['ArrowRight', 'l', 'L', 'j', 'J'];
        let physicalInput: 'LEFT' | 'RIGHT' | null = null;
        if (leftKeys.includes(e.key)) physicalInput = 'LEFT';
        else if (rightKeys.includes(e.key)) physicalInput = 'RIGHT';

        if (!physicalInput) return;

        let logicInput: 'LEFT' | 'RIGHT' = physicalInput;
        if (isInputInverted) {
             logicInput = physicalInput === 'LEFT' ? 'RIGHT' : 'LEFT';
        }
        const selectedColor = logicInput === 'LEFT' ? ColorState.RED : ColorState.BLUE;
        handleInput(selectedColor);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, isInputInverted, isRebooting, currentState, nextModifier, isFluxActive]); 

  /* -------------------------------------------------------------------------- */
  /* GAME LOGIC & LOOP                              */
  /* -------------------------------------------------------------------------- */

  const handleStart = () => {
    const newStartColor = Math.random() > 0.5 ? ColorState.RED : ColorState.BLUE;
    setStartColor(newStartColor);
    const isSwappedRules = Math.random() > 0.5;
    setRuleMapping({
        [ModifierType.KEEP]: isSwappedRules ? 'STAR' : 'CIRCLE',
        [ModifierType.INVERT]: isSwappedRules ? 'CIRCLE' : 'STAR'
    });
    setGameState(StreamState.READY);
  };

  const startGame = () => {
    setScore(0); setLives(3); setBuffer(0); setHistory([]); setWarmUpRounds(3); setRoundDuration(3000); 
    setCurrentState(startColor); 
    setNextModifier(Math.random() > 0.5 ? ModifierType.KEEP : ModifierType.INVERT);
    setIsInputInverted(false); setIsFluxActive(false); setIsLureActive(false);
    setUserAnswer(null); setGameState(StreamState.ACTIVE);
  };

  const gameLoop = () => {
    const now = Date.now();
    const elapsed = now - startTimeRef.current;
    const progress = Math.max(0, 100 - (elapsed / roundDurationRef.current) * 100);
    setTimeLeft(progress);

    if (elapsed >= roundDurationRef.current) {
      if (!hasAnsweredRef.current) handleMistake();
    } else {
      if (gameStateRef.current === StreamState.ACTIVE && !hasAnsweredRef.current && !isRebooting) {
        requestRef.current = requestAnimationFrame(gameLoop);
      }
    }
  };

  useEffect(() => {
    if (gameState === StreamState.ACTIVE && !isRebooting) {
        hasAnsweredRef.current = false;
        startTimeRef.current = Date.now();
        triggerSound('TICK');
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(gameLoop);
    }
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [gameState, score, lives, isRebooting]);

  useEffect(() => {
    if (gameState === StreamState.READY) {
        const timer = setTimeout(() => startGame(), 3000);
        return () => clearTimeout(timer);
    }
  }, [gameState]);

  const updateDifficulty = (wasCorrect: boolean) => {
      const newHistory = [...history, wasCorrect].slice(-5);
      setHistory(newHistory);
      const recentCorrect = newHistory.filter(Boolean).length;
      if (newHistory.length >= 3) {
          if (recentCorrect === newHistory.length && complexity < ComplexityLevel.MAXIMUM_LOAD) {
              setComplexity(c => c + 1); setHistory([]); 
          } else if (!wasCorrect && complexity > ComplexityLevel.BASELINE) {
              setComplexity(c => c - 1); setHistory([]); 
          }
      }
      if (wasCorrect) setRoundDuration(prev => Math.max(1200, prev * 0.95));
      else setRoundDuration(prev => Math.min(3000, prev * 1.3));
  };

  const generateNextRoundConfig = (successfulInput: ColorState) => {
      setCurrentState(successfulInput); 
      if (warmUpRounds > 0) setWarmUpRounds(prev => prev - 1);

      if (complexity >= ComplexityLevel.FLUX_INTRO) setIsFluxActive(Math.random() > 0.7); 
      else setIsFluxActive(false);

      if (complexity >= ComplexityLevel.JITTER_INTRO) {
          if (isFluxActive && complexity < ComplexityLevel.MAXIMUM_LOAD) setIsInputInverted(false);
          else setIsInputInverted(Math.random() > 0.7);
      } else setIsInputInverted(false);

      if (complexity >= ComplexityLevel.NOISE_INTRO) {
          if (!isFluxActive && !isInputInverted) setIsLureActive(Math.random() > 0.7);
          else setIsLureActive(false);
      } else setIsLureActive(false);

      setNextModifier(Math.random() > 0.5 ? ModifierType.KEEP : ModifierType.INVERT);
  };

  const handleInput = (inputColor: ColorState) => {
    if (gameState !== StreamState.ACTIVE || hasAnsweredRef.current || isRebooting) return;
    hasAnsweredRef.current = true;
    setUserAnswer(inputColor);

    let effectiveModifier = nextModifier;
    if (isFluxActive) effectiveModifier = nextModifier === ModifierType.KEEP ? ModifierType.INVERT : ModifierType.KEEP;

    let expectedState = currentState;
    if (effectiveModifier === ModifierType.INVERT) {
      expectedState = currentState === ColorState.RED ? ColorState.BLUE : ColorState.RED;
    }

    if (inputColor === expectedState) {
       triggerSound('SUCCESS');
       updateDifficulty(true);
       setBuffer(prev => {
           const next = prev + 20; 
           if (next >= 100) { if (lives < 5) { setLives(l => l + 1); triggerSound('LIFE_UP'); } return 0; }
           return next;
       });
       setTimeout(() => {
           setScore(s => s + 1); setUserAnswer(null); generateNextRoundConfig(inputColor); 
       }, 100);
    } else {
       setCorrectFeedback(expectedState);
       handleMistake();
    }
  };

  const handleMistake = () => {
      if (lives === 1 && buffer >= 50) {
          triggerSound('SHIELD_BREAK');
          setIsShieldBreak(true); setBuffer(0); updateDifficulty(false);
          setTimeout(() => {
              setIsShieldBreak(false); setCorrectFeedback(null); hasAnsweredRef.current = false; setUserAnswer(null);
              setNextModifier(Math.random() > 0.5 ? ModifierType.KEEP : ModifierType.INVERT);
          }, 800);
          return; 
      }
      triggerSound('ERROR');
      const newLives = lives - 1;
      updateDifficulty(false); setBuffer(0); setIsDamaged(true);
      setTimeout(() => {
        setIsDamaged(false); setCorrectFeedback(null);
        if (newLives <= 0) triggerSystemReboot();
        else {
            setLives(newLives); hasAnsweredRef.current = false; setUserAnswer(null);
            setNextModifier(Math.random() > 0.5 ? ModifierType.KEEP : ModifierType.INVERT);
        }
      }, 800);
  };

  const triggerSystemReboot = () => {
      triggerSound('REBOOT');
      setIsRebooting(true);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      setComplexity(prev => Math.max(ComplexityLevel.BASELINE, prev - 1));
      setLives(3); setBuffer(0); setRoundDuration(3000); setWarmUpRounds(3); 
      setTimeout(() => {
          setIsRebooting(false); hasAnsweredRef.current = false; setUserAnswer(null);
          generateNextRoundConfig(currentState);
      }, 3000);
  };

  /* -------------------------------------------------------------------------- */
  /* UI COMPONENTS                                  */
  /* -------------------------------------------------------------------------- */

  // Fixed Neural Cabling Component (Visible)
  const NeuralCabling = () => (
    <div className="absolute inset-0 z-0 pointer-events-none">
       <svg width="100%" height="100%" className="transition-all duration-500 opacity-50">
           {/* Left Input Wire (Starts left bottom 25%, goes to Left Button area approx 35%) */}
           <path 
             d={isInputInverted 
                ? "M 25% 100% C 25% 60%, 75% 60%, 65% 50%"  // Crosses to Right Button
                : "M 25% 100% C 25% 80%, 35% 80%, 35% 50%"} // Straight to Left Button
             stroke={isInputInverted ? "#f43f5e" : "#475569"} 
             strokeWidth="3" 
             fill="none" 
             strokeDasharray={isInputInverted ? "10,5" : "0"}
             className="transition-all duration-500 ease-in-out"
           />
           
           {/* Right Input Wire (Starts right bottom 75%, goes to Right Button area approx 65%) */}
           <path 
             d={isInputInverted 
                ? "M 75% 100% C 75% 60%, 25% 60%, 35% 50%" // Crosses to Left Button
                : "M 75% 100% C 75% 80%, 65% 80%, 65% 50%"} // Straight to Right Button
             stroke={isInputInverted ? "#06b6d4" : "#475569"} 
             strokeWidth="3" 
             fill="none" 
             strokeDasharray={isInputInverted ? "10,5" : "0"}
             className="transition-all duration-500 ease-in-out"
           />
           
           {/* Decor Nodes */}
           <circle cx="25%" cy="100%" r="6" className="fill-slate-600" />
           <circle cx="75%" cy="100%" r="6" className="fill-slate-600" />
       </svg>
    </div>
  );

  /* -------------------------------------------------------------------------- */
  /* RENDERING                                      */
  /* -------------------------------------------------------------------------- */

  if (gameState === StreamState.IDLE) {
      return (
          <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 p-6 font-mono text-center overflow-y-auto relative z-10">
             <h2 className="text-3xl font-black text-white mb-6 tracking-tighter">STREAM PROTOCOL</h2>
             {complexity > 0 && (
                 <div className="mb-8 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border border-emerald-500/30 rounded text-emerald-400 text-xs">
                     <Database className="w-3 h-3" />
                     <span>RESUMING LOAD LEVEL: {complexity}</span>
                 </div>
             )}
             <div className="max-w-xl text-slate-400 mb-6 space-y-4 text-sm">
                <p>Maintain your <span className="text-white font-bold">Mental State</span> while rules shift.</p>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex justify-between items-center px-8">
                     <span className="text-slate-500 font-bold tracking-widest text-xs">STARTING CONDITION</span>
                     <span className="text-white font-bold text-sm animate-pulse">RANDOMIZED AT START</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-left">
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                        <h4 className="text-white font-bold mb-2 flex items-center gap-2"><Shuffle className="w-4 h-4 text-cyan-400" /> VARIABLE LOGIC</h4>
                        <div className="space-y-2 text-xs text-slate-400">
                             <p>Rules are <span className="text-cyan-400 font-bold">GENERATED</span> every session.</p>
                             <p>You have <span className="text-white font-bold">3 SECONDS</span> to memorize if STAR means Keep or Invert.</p>
                        </div>
                    </div>
                    <div className="bg-purple-950/30 p-4 rounded-lg border border-purple-500/30">
                        <h4 className="text-purple-300 font-bold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> FLUX EVENT</h4>
                        <div className="space-y-1 text-xs text-purple-100/70">
                             <p>When border glows <span className="text-purple-300 font-bold">PURPLE</span>, rules INVERT.</p>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 text-left">
                     <div className="flex justify-between items-start"><h4 className="text-cyan-400 font-bold mb-2 flex items-center gap-2"><Shield className="w-4 h-4" /> NEURAL BUFFER</h4></div>
                     <p className="text-xs mb-2">Correct answers fill your <span className="text-cyan-400 font-bold">SYNAPTIC SHIELD</span>. If Shield {'>'} 50%, it absorbs a fatal mistake.</p>
                </div>
             </div>
             <button onClick={handleStart} className="group flex items-center gap-3 px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-all hover:scale-105">
                <Play className="fill-current" /> INITIATE
             </button>
             <button onClick={onExit} className="mt-8 text-slate-600 hover:text-slate-400 text-xs">DISCONNECT</button>
        </div>
      )
  }

  if (gameState === StreamState.READY) {
    return (
        <div className="w-full h-screen bg-slate-950 flex flex-col items-center justify-center font-mono animate-in fade-in duration-300 select-none relative z-10">
            <h2 className="text-slate-500 text-sm tracking-[0.5em] mb-8 animate-pulse">INITIALIZING RULES...</h2>
            <div className="flex gap-12 mb-12">
                 <div className="text-center">
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-2">ANCHOR STATE</p>
                    <h1 className={`text-6xl font-black tracking-tighter drop-shadow-lg scale-110 ${startColor === ColorState.RED ? 'text-rose-500 shadow-rose-500/50' : 'text-cyan-500 shadow-cyan-500/50'}`}>
                        {startColor}
                    </h1>
                 </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-xl backdrop-blur-sm max-w-md w-full">
                <p className="text-slate-400 text-xs text-center uppercase tracking-widest mb-6 border-b border-slate-800 pb-2">SESSION LOGIC</p>
                <div className="flex justify-between items-center px-4">
                    <div className="flex flex-col items-center gap-2">{ruleMapping[ModifierType.KEEP] === 'CIRCLE' ? <Circle className="w-8 h-8 text-emerald-400" /> : <Star className="w-8 h-8 text-emerald-400" />}<span className="text-emerald-400 font-bold text-sm">= KEEP</span></div>
                    <div className="w-px h-12 bg-slate-800" />
                    <div className="flex flex-col items-center gap-2">{ruleMapping[ModifierType.INVERT] === 'CIRCLE' ? <Circle className="w-8 h-8 text-amber-400" /> : <Star className="w-4 h-4 text-amber-400" />}<span className="text-amber-400 font-bold text-sm">= FLIP</span></div>
                </div>
            </div>
            <div className="text-cyan-500 text-xs mt-8 animate-pulse font-bold tracking-widest">BUFFER SYSTEM ONLINE</div>
        </div>
    )
  }

  // ACTIVE STATE
  return (
    <div className={`
        w-full h-screen flex flex-col bg-slate-950 overflow-hidden font-mono relative select-none transition-all duration-100
        ${isFluxActive ? 'border-[8px] border-purple-500/50 shadow-[inset_0_0_100px_rgba(168,85,247,0.2)]' : ''}
        ${isLureActive ? 'border-[8px] border-blue-500/50' : ''} 
        ${isDamaged ? 'bg-rose-950/30 translate-x-1' : ''} 
        ${isShieldBreak ? 'bg-cyan-950/50' : ''}
    `}>
      
      {isShieldBreak && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-200">
             <div className="bg-cyan-500/20 border border-cyan-400 p-8 rounded-xl backdrop-blur-md flex flex-col items-center text-cyan-100">
                 <ShieldAlert className="w-16 h-16 mb-4 text-cyan-400 animate-bounce" />
                 <h2 className="text-3xl font-black tracking-tighter mb-2">CRITICAL SAVE</h2>
                 <p className="text-xs uppercase tracking-widest">Neural Buffer Deployed</p>
             </div>
          </div>
      )}

      {isRebooting && (
          <div className="absolute inset-0 z-50 bg-slate-950/95 flex flex-col items-center justify-center p-8 text-center backdrop-blur-xl animate-in fade-in duration-300">
              <RefreshCw className="w-12 h-12 text-rose-500 mb-4 animate-spin-slow" />
              <div className="text-4xl font-black text-white mb-2 tracking-tighter">SYSTEM FAILURE</div>
              <div className="text-rose-400 font-mono text-sm animate-pulse mb-8">RECALIBRATING NEURAL LOAD...</div>
              <div className="mb-8 w-full max-w-sm">
                   <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-2 border-b border-slate-800 pb-1">RESTORING MEMORY BLOCK</p>
                   <div className="flex items-center justify-center gap-4 py-4 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-xs">CURRENT ANCHOR:</span>
                        <span className={`text-3xl font-black ${currentState === ColorState.RED ? 'text-rose-500' : 'text-cyan-500'}`}>
                            {currentState}
                        </span>
                   </div>
              </div>
              <div className="w-full max-w-sm">
                   <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-2 border-b border-slate-800 pb-1">RELOADING LOGIC GATES</p>
                   <div className="flex justify-between items-center px-8 py-4 bg-slate-900 rounded-lg border border-slate-800">
                        <div className="flex items-center gap-2">{ruleMapping[ModifierType.KEEP] === 'CIRCLE' ? <Circle className="w-6 h-6 text-emerald-400" /> : <Star className="w-6 h-6 text-emerald-400" />}<span className="text-emerald-400 font-bold text-sm">KEEP</span></div>
                        <div className="w-px h-8 bg-slate-800" />
                        <div className="flex items-center gap-2">{ruleMapping[ModifierType.INVERT] === 'CIRCLE' ? <Circle className="w-6 h-6 text-amber-400" /> : <Star className="w-6 h-6 text-amber-400" />}<span className="text-amber-400 font-bold text-sm">FLIP</span></div>
                   </div>
              </div>
              <div className="w-64 h-1 bg-slate-800 mt-12 overflow-hidden rounded-full"><div className="h-full bg-emerald-500 w-full animate-[shimmer_3s_linear]" /></div>
          </div>
      )}

      {/* Persistent HUD */}
      <div className="absolute bottom-6 left-6 flex gap-6 p-4 rounded-lg bg-slate-900/50 border border-slate-800/50 opacity-40 hover:opacity-100 transition-opacity pointer-events-none z-20">
           <div className="flex items-center gap-2">{ruleMapping[ModifierType.KEEP] === 'CIRCLE' ? <Circle className="w-4 h-4 text-emerald-400" /> : <Star className="w-4 h-4 text-emerald-400" />}<span className="text-emerald-400 font-bold text-[10px] tracking-widest">KEEP</span></div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center gap-2">{ruleMapping[ModifierType.INVERT] === 'CIRCLE' ? <Circle className="w-4 h-4 text-amber-400" /> : <Star className="w-4 h-4 text-amber-400" />}<span className="text-amber-400 font-bold text-[10px] tracking-widest">FLIP</span></div>
      </div>

      {/* HEADER */}
      <div className="relative z-10 w-full p-6 flex justify-between items-center text-slate-500 text-xs uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
              <Activity className={`w-4 h-4 ${lives === 1 ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`} />
              <div className="flex gap-1">
                  {[...Array(lives)].map((_, i) => (<div key={i} className={`w-8 h-2 rounded-sm ${lives === 1 ? 'bg-rose-500' : 'bg-emerald-500'}`} />))}
                  {[...Array(5 - lives)].map((_, i) => (<div key={i} className="w-8 h-2 rounded-sm bg-slate-800/50" />))}
              </div>
          </div>
          <div className="flex items-center gap-2">
              <Shield className={`w-4 h-4 ${buffer >= 50 ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`} />
              <div className="w-24 h-2 bg-slate-800 rounded-sm overflow-hidden"><div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${buffer}%` }} /></div>
          </div>
          <div className="w-px h-4 bg-slate-800" />
          <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /><span>Load: {complexity}</span></div>
        </div>
        <div className="flex items-center gap-4">
            <button onClick={() => setIsMuted(!isMuted)} className="hover:text-white transition-colors">{isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
            <span className="text-white">Chain: {score}</span>
            <button onClick={onExit} className="hover:text-white transition-colors">Abort</button>
        </div>
      </div>

      {/* GAME AREA */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-12">
        <NeuralCabling />
        
        <div className="flex flex-col items-center gap-4 z-10">
           <div className={`text-sm tracking-[0.2em] uppercase ${isFluxActive ? 'text-purple-400 font-bold' : 'text-slate-400'}`}>
                {isFluxActive ? 'INVERTED SIGNAL' : isLureActive ? 'NOISE DETECTED' : isInputInverted ? 'INPUT CROSSOVER ACTIVE' : 'SIGNAL'}
           </div>
           
           <div className={`
                w-40 h-40 flex items-center justify-center
                border-2 rounded-full shadow-2xl backdrop-blur-sm relative overflow-hidden transition-all duration-300
                ${isFluxActive ? 'bg-purple-900/20 border-purple-500' : isLureActive ? 'bg-blue-900/20 border-blue-500' : 'bg-slate-900/80 border-slate-700'}
           `}>
                {correctFeedback ? (
                    <div className={`text-4xl font-black animate-ping ${correctFeedback === ColorState.RED ? 'text-rose-500' : 'text-cyan-500'}`}>
                        {correctFeedback}
                    </div>
                ) : (
                    <>
                        {warmUpRounds > 0 && (
                             <div className={`absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none font-black text-6xl ${currentState === ColorState.RED ? 'text-rose-500' : 'text-cyan-500'}`}>
                                 {currentState === ColorState.RED ? 'R' : 'B'}
                             </div>
                        )}
                        {(() => {
                            const symbol = ruleMapping[nextModifier];
                            let colorClass = isFluxActive ? 'text-purple-400' : isLureActive ? 'text-blue-400' : (symbol === 'CIRCLE' ? 'text-emerald-400' : 'text-amber-400');
                            const Icon = symbol === 'CIRCLE' ? Circle : Star;
                            return <Icon className={`w-16 h-16 ${colorClass} relative z-10`} />;
                        })()}
                    </>
                )}
           </div>
           {warmUpRounds > 0 && <div className="text-[10px] text-slate-500 uppercase tracking-widest animate-pulse">GHOST SIGNAL ACTIVE ({warmUpRounds})</div>}
        </div>

        <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden z-10">
          <div className={`h-full transition-all duration-75 ease-linear ${timeLeft < 30 ? 'bg-rose-500' : 'bg-cyan-500'}`} style={{ width: `${timeLeft}%` }} />
        </div>

        <div className="flex gap-8 mt-8 z-10">
            <button onMouseDown={() => handleInput(isInputInverted ? ColorState.BLUE : ColorState.RED)} className={`w-32 h-32 rounded-xl border-2 flex items-center justify-center transition-all active:scale-95 ${userAnswer === ColorState.RED ? 'bg-rose-500 border-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.5)]' : 'bg-slate-900/50 border-rose-900/50 hover:border-rose-500'}`}>
                <span className={`font-bold text-xl ${userAnswer === ColorState.RED ? 'text-white' : 'text-rose-500'}`}>RED</span>
            </button>
            <button onMouseDown={() => handleInput(isInputInverted ? ColorState.RED : ColorState.BLUE)} className={`w-32 h-32 rounded-xl border-2 flex items-center justify-center transition-all active:scale-95 ${userAnswer === ColorState.BLUE ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.5)]' : 'bg-slate-900/50 border-cyan-900/50 hover:border-cyan-500'}`}>
                <span className={`font-bold text-xl ${userAnswer === ColorState.BLUE ? 'text-white' : 'text-cyan-500'}`}>BLUE</span>
            </button>
        </div>
        
        {isInputInverted && <div className="text-rose-500 text-xs font-black tracking-widest animate-pulse z-10 flex items-center gap-2"><GitCommit className="w-4 h-4" /> NEURAL MAP CROSSED</div>}
      </div>
    </div>
  );
};

export default StreamProtocol;
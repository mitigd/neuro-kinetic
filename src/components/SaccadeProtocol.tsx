import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SaccadeState, GameResult } from '../types';
import { Target, Play, Monitor, Zap, EyeOff, Settings } from 'lucide-react';

interface SaccadeProtocolProps {
  onGameOver: (result: GameResult) => void;
  onExit: () => void;
}

const FIXATION_TIME = 1000;
const BASE_CUE_TIME = 1000; 
const TARGET_FLASH_TIME = 150; // Ms the target is actually visible
const TARGET_TIMEOUT = 800; 

const SaccadeProtocol: React.FC<SaccadeProtocolProps> = ({ onGameOver, onExit }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState<SaccadeState>(SaccadeState.IDLE);
  
  // Settings
  const [totalTrials, setTotalTrials] = useState(10);
  
  const [trialCount, setTrialCount] = useState(0);
  const [score, setScore] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  
  // Trial Logic State
  const [cueText, setCueText] = useState<'ZID' | 'DAX'>('ZID'); 
  const [cueColor, setCueColor] = useState<'GREEN' | 'RED'>('GREEN');
  const [correctSide, setCorrectSide] = useState<'LEFT' | 'RIGHT'>('RIGHT');
  const [feedback, setFeedback] = useState<'HIT' | 'MISS' | 'TIMEOUT' | null>(null);
  
  // Visual Flash State
  const [isTargetVisible, setIsTargetVisible] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Keyboard Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || phase !== SaccadeState.TARGET) return;

      if (['ArrowLeft', 'a', 'A', 'd', 'D'].includes(e.key)) {
        handleInput('LEFT');
      } else if (['ArrowRight', 'l', 'L', 'j', 'J'].includes(e.key)) {
        handleInput('RIGHT');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, phase, correctSide]);

  const startTrial = useCallback(() => {
    if (trialCount >= totalTrials) {
      const avgRT = reactionTimes.length > 0 
        ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length 
        : 0;
        
      onGameOver({
        mode: 'SACCADE',
        score: score,
        avgReactionTime: Math.round(avgRT),
        details: `Accuracy: ${Math.round((score / totalTrials) * 100)}% (${score}/${totalTrials})`
      });
      return;
    }

    setFeedback(null);
    setPhase(SaccadeState.FIXATION);
    setIsTargetVisible(false);
    
    // Adaptive difficulty: Speed up decoding time
    const currentCueTime = Math.max(400, BASE_CUE_TIME - (trialCount * 15));

    // Schedule Cue
    timerRef.current = setTimeout(() => {
      // 1. Generate Logic
      const newText = Math.random() > 0.5 ? 'ZID' : 'DAX'; // ZID=Right, DAX=Left
      const newColor = Math.random() > 0.3 ? 'GREEN' : 'RED'; // 30% chance of interference
      
      let targetSide: 'LEFT' | 'RIGHT';
      
      // Semantic Logic
      const semanticDirection = newText === 'ZID' ? 'RIGHT' : 'LEFT';
      
      // Contextual Interference
      if (newColor === 'GREEN') {
        targetSide = semanticDirection;
      } else {
        targetSide = semanticDirection === 'RIGHT' ? 'LEFT' : 'RIGHT';
      }

      setCueText(newText);
      setCueColor(newColor);
      setCorrectSide(targetSide);
      setPhase(SaccadeState.CUE);

      // Schedule Target
      timerRef.current = setTimeout(() => {
        setPhase(SaccadeState.TARGET);
        startTimeRef.current = Date.now();
        setIsTargetVisible(true);

        // Flash Logic: Hide visual indicators after a brief moment
        flashTimerRef.current = setTimeout(() => {
            setIsTargetVisible(false);
        }, TARGET_FLASH_TIME);

        // Timeout Logic: Fail if no input received
        timerRef.current = setTimeout(() => {
          handleInput('TIMEOUT');
        }, TARGET_TIMEOUT);

      }, currentCueTime);

    }, FIXATION_TIME);
  }, [trialCount, reactionTimes, score, onGameOver, totalTrials]);

  const handleStart = () => {
    setIsPlaying(true);
    setTrialCount(0);
    setScore(0);
    setReactionTimes([]);
    startTrial();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const handleInput = (side: 'LEFT' | 'RIGHT' | 'TIMEOUT') => {
    // Prevent double submissions
    if (timerRef.current) clearTimeout(timerRef.current);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);

    const endTime = Date.now();
    const rt = endTime - startTimeRef.current;

    let result: 'HIT' | 'MISS' | 'TIMEOUT' = 'MISS';

    if (side === 'TIMEOUT') {
      result = 'TIMEOUT';
    } else if (side === correctSide) {
      result = 'HIT';
      setScore(s => s + 1);
      setReactionTimes(prev => [...prev, rt]);
    } else {
      result = 'MISS';
    }

    setFeedback(result);
    setPhase(SaccadeState.FEEDBACK);
    setIsTargetVisible(false); 
    
    // Next Trial Delay
    setTimeout(() => {
      setTrialCount(t => t + 1);
      startTrial();
    }, 1000);
  };

  // Render Helpers
  const getCueColorClass = () => cueColor === 'GREEN' ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/50' : 'text-rose-500 bg-rose-950/30 border-rose-500/50';

  if (!isPlaying) {
    return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 p-6 font-mono text-center">
             <h2 className="text-3xl font-black text-white mb-4 tracking-tighter">SACCADE PROTOCOL</h2>
             
             <div className="max-w-2xl text-slate-400 mb-8 text-sm leading-relaxed space-y-2">
               <p>This is a <span className="text-white font-bold">Semantic Prediction</span> engine.</p>
               <p className="text-amber-400 font-bold">WARNING: BOTH SIDES WILL FLASH.</p>
               <p>You cannot wait for the flash to tell you where to look. You must decode the cipher to know which flash is the target.</p>
             </div>
             
             <div className="grid grid-cols-2 gap-8 mb-8 max-w-2xl w-full">
                <div className="p-6 border border-slate-800 rounded-xl bg-slate-900/50">
                    <h3 className="text-cyan-400 font-bold mb-4">THE CIPHER</h3>
                    <div className="flex flex-col gap-2 text-sm text-slate-300">
                        <p><span className="font-bold text-white">ZID</span> = RIGHT</p>
                        <p><span className="font-bold text-white">DAX</span> = LEFT</p>
                    </div>
                </div>
                <div className="p-6 border border-slate-800 rounded-xl bg-slate-900/50">
                    <h3 className="text-rose-400 font-bold mb-4">THE CONTEXT</h3>
                    <div className="flex flex-col gap-2 text-sm text-slate-300">
                        <p><span className="text-emerald-500 font-bold">GREEN</span> = OBEY</p>
                        <p><span className="text-rose-500 font-bold">RED</span> = INVERT</p>
                    </div>
                </div>
             </div>

             {/* Trial Selector */}
             <div className="flex gap-4 mb-8 items-center">
                <span className="text-slate-500 text-xs font-bold uppercase">Session Length:</span>
                {[10, 25, 50].map(val => (
                    <button 
                        key={val}
                        onClick={() => setTotalTrials(val)}
                        className={`px-4 py-2 rounded text-xs font-bold border ${totalTrials === val ? 'bg-cyan-900/50 border-cyan-500 text-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                    >
                        {val} TRIALS
                    </button>
                ))}
             </div>

             <div className="flex gap-4 mb-12 text-xs font-mono text-slate-500">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded border border-slate-800">
                   <Monitor className="w-4 h-4" />
                   <span>Controls: Mouse OR Keyboard</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded border border-slate-800">
                   <span>← / D = LEFT</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded border border-slate-800">
                   <span>→ / J = RIGHT</span>
                </div>
             </div>

             <button 
                onClick={handleStart}
                className="group flex items-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all hover:scale-105"
             >
                <Play className="fill-current" />
                INITIATE SEQUENCE
             </button>
             <button onClick={onExit} className="mt-8 text-slate-600 hover:text-slate-400 text-xs">ABORT MISSION</button>
        </div>
    )
  }

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-between bg-slate-950 p-6 overflow-hidden select-none">
      
      {/* Header HUD */}
      <div className="w-full max-w-4xl flex justify-between items-center text-slate-500 font-mono text-xs uppercase tracking-widest">
        <div className="flex gap-4">
          <span>Protocol: Saccade</span>
          <span>Trial: {trialCount + 1}/{totalTrials}</span>
        </div>
        <button onClick={onExit} className="hover:text-slate-200 transition-colors">Abort</button>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 w-full max-w-6xl flex items-center justify-between relative">
        
        {/* Left Target Zone */}
        <div 
          onMouseDown={() => handleInput('LEFT')}
          className={`
            w-32 h-64 md:w-48 md:h-96 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-all duration-100 relative overflow-hidden
            ${phase === SaccadeState.TARGET ? 'border-slate-700 hover:border-slate-500 hover:bg-slate-900/50' : 'border-slate-800 opacity-30'}
            ${feedback === 'HIT' && correctSide === 'LEFT' ? 'bg-emerald-500/20 border-emerald-500' : ''}
            ${feedback === 'MISS' && correctSide === 'LEFT' ? 'bg-rose-500/20 border-rose-500' : ''}
          `}
        >
          {/* GHOST FLASH MECHANIC - Shows on BOTH sides */}
          {phase === SaccadeState.TARGET && isTargetVisible && (
             <div className="w-16 h-16 rounded-full animate-pulse shadow-[0_0_30px_rgba(34,211,238,0.8)] bg-cyan-400" />
          )}
          
          <span className="hidden md:block absolute bottom-4 text-slate-800 font-bold text-4xl select-none">L</span>
        </div>

        {/* Center Focus / Cue */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center z-10">
          
          {phase === SaccadeState.FIXATION && (
            <Target className="w-12 h-12 text-slate-600 animate-pulse" />
          )}

          {phase === SaccadeState.CUE && (
            <div className={`text-5xl md:text-7xl font-black font-mono tracking-tighter border px-8 py-4 rounded-sm ${getCueColorClass()}`}>
              {cueText}
            </div>
          )}

          {phase === SaccadeState.FEEDBACK && (
            <div className={`text-2xl font-bold tracking-widest ${feedback === 'HIT' ? 'text-emerald-500' : 'text-rose-500'}`}>
              {feedback}
            </div>
          )}
          
          {phase === SaccadeState.TARGET && (
              <EyeOff className="w-8 h-8 text-slate-800 animate-spin opacity-20" />
          )}

        </div>

        {/* Right Target Zone */}
        <div 
          onMouseDown={() => handleInput('RIGHT')}
          className={`
            w-32 h-64 md:w-48 md:h-96 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-all duration-100 relative overflow-hidden
            ${phase === SaccadeState.TARGET ? 'border-slate-700 hover:border-slate-500 hover:bg-slate-900/50' : 'border-slate-800 opacity-30'}
            ${feedback === 'HIT' && correctSide === 'RIGHT' ? 'bg-emerald-500/20 border-emerald-500' : ''}
            ${feedback === 'MISS' && correctSide === 'RIGHT' ? 'bg-rose-500/20 border-rose-500' : ''}
          `}
        >
           {/* GHOST FLASH MECHANIC - Shows on BOTH sides */}
           {phase === SaccadeState.TARGET && isTargetVisible && (
            <div className="w-16 h-16 rounded-full animate-pulse shadow-[0_0_30px_rgba(34,211,238,0.8)] bg-cyan-400" />
          )}
          <span className="hidden md:block absolute bottom-4 text-slate-800 font-bold text-4xl select-none">R</span>
        </div>

      </div>

      {/* Instructions Overlay (Small) */}
      <div className="text-slate-600 text-xs font-mono mt-4 text-center">
        ZID=Right / DAX=Left • <span className="text-rose-500">RED</span> Inverts • <span className="text-amber-500 font-bold">IGNORE THE FLASH - FOLLOW THE CODE</span>
      </div>
    </div>
  );
};

export default SaccadeProtocol;
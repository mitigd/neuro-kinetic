import React, { useState, useEffect, useRef } from 'react';
import { StreamState, ColorState, ModifierType, GameResult } from '../types';
import { Star, Circle, Zap, Play, Keyboard, Shuffle, AlertTriangle } from 'lucide-react';

interface StreamProtocolProps {
  onGameOver: (result: GameResult) => void;
  onExit: () => void;
}

const StreamProtocol: React.FC<StreamProtocolProps> = ({ onGameOver, onExit }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameState, setGameState] = useState<StreamState>(StreamState.IDLE);
  const [score, setScore] = useState(0);
  
  // Logic State
  const [currentState, setCurrentState] = useState<ColorState>(ColorState.RED);
  const [nextModifier, setNextModifier] = useState<ModifierType>(ModifierType.KEEP);
  const [timeLeft, setTimeLeft] = useState(100); // Percentage
  const [roundDuration, setRoundDuration] = useState(3000); // ms, gets faster

  // Session Config (Randomized at Start)
  const [startColor, setStartColor] = useState<ColorState>(ColorState.RED);
  const [ruleMapping, setRuleMapping] = useState<Record<ModifierType, 'STAR' | 'CIRCLE'>>({
    [ModifierType.KEEP]: 'CIRCLE',
    [ModifierType.INVERT]: 'STAR'
  });

  // Chaos State (RFT Transformations)
  const [isButtonsSwapped, setIsButtonsSwapped] = useState(false);
  const [isFluxActive, setIsFluxActive] = useState(false); // Rule Inversion

  // Visual feedback for button press
  const [userAnswer, setUserAnswer] = useState<ColorState | null>(null);

  // Refs for loop management (Fixes stale closure issues)
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const hasAnsweredRef = useRef<boolean>(false);
  const gameStateRef = useRef<StreamState>(StreamState.IDLE);
  const roundDurationRef = useRef(3000);

  // Sync Refs with State
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    roundDurationRef.current = roundDuration;
  }, [roundDuration]);

  // Keyboard Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (gameState !== StreamState.ACTIVE || hasAnsweredRef.current) return;

        const leftKeys = ['ArrowLeft', 'a', 'A', 'd', 'D'];
        const rightKeys = ['ArrowRight', 'l', 'L', 'j', 'J'];

        let inputPosition: 'LEFT' | 'RIGHT' | null = null;

        if (leftKeys.includes(e.key)) inputPosition = 'LEFT';
        else if (rightKeys.includes(e.key)) inputPosition = 'RIGHT';

        if (!inputPosition) return;

        // Resolve Color based on current Spatial Layout
        let selectedColor: ColorState;
        
        if (isButtonsSwapped) {
            // Swapped: Left is Blue, Right is Red
            selectedColor = inputPosition === 'LEFT' ? ColorState.BLUE : ColorState.RED;
        } else {
            // Standard: Left is Red, Right is Blue
            selectedColor = inputPosition === 'LEFT' ? ColorState.RED : ColorState.BLUE;
        }

        handleInput(selectedColor);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, currentState, nextModifier, isButtonsSwapped, ruleMapping]);

  // Ready Phase Timer
  useEffect(() => {
    if (gameState === StreamState.READY) {
        const timer = setTimeout(() => {
            startGame();
        }, 3000);
        return () => clearTimeout(timer);
    }
  }, [gameState]);

  // Start Loop Trigger
  useEffect(() => {
    if (gameState === StreamState.ACTIVE) {
        // Initialize Loop Variables
        hasAnsweredRef.current = false;
        startTimeRef.current = Date.now();
        
        // Start Loop
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  const handleStart = () => {
      // 1. Randomize Starting Anchor
      const newStartColor = Math.random() > 0.5 ? ColorState.RED : ColorState.BLUE;
      setStartColor(newStartColor);
      
      // 2. Randomize Logic Rules
      // 50% chance to swap standard associations
      const isSwappedRules = Math.random() > 0.5;
      setRuleMapping({
          [ModifierType.KEEP]: isSwappedRules ? 'STAR' : 'CIRCLE',
          [ModifierType.INVERT]: isSwappedRules ? 'CIRCLE' : 'STAR'
      });

      setIsPlaying(true);
      setGameState(StreamState.READY);
  }

  const startGame = () => {
    setScore(0);
    setRoundDuration(3000);
    setCurrentState(startColor); // Use the randomized start color
    setNextModifier(Math.random() > 0.5 ? ModifierType.KEEP : ModifierType.INVERT);
    setIsButtonsSwapped(false);
    setIsFluxActive(false);
    setUserAnswer(null);
    
    // Trigger Effect via State Change
    setGameState(StreamState.ACTIVE);
  };

  const stopLoop = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const gameLoop = () => {
    const now = Date.now();
    const elapsed = now - startTimeRef.current;
    const currentDuration = roundDurationRef.current; // Read from Ref
    
    // Calculate Progress
    const progress = Math.max(0, 100 - (elapsed / currentDuration) * 100);
    setTimeLeft(progress);

    if (elapsed >= currentDuration) {
      // Time Expired
      if (!hasAnsweredRef.current) {
         handleFailure();
      }
    } else {
      // Check Ref for current Game State
      if (gameStateRef.current === StreamState.ACTIVE && !hasAnsweredRef.current) {
        requestRef.current = requestAnimationFrame(gameLoop);
      }
    }
  };

  const advanceRound = () => {
    stopLoop();
    
    // 1. Logic Update for the *next* round's starting state
    let effectiveModifier = nextModifier;
    if (isFluxActive) {
        effectiveModifier = nextModifier === ModifierType.KEEP ? ModifierType.INVERT : ModifierType.KEEP;
    }

    let newReality = currentState;
    if (effectiveModifier === ModifierType.INVERT) {
      newReality = currentState === ColorState.RED ? ColorState.BLUE : ColorState.RED;
    } else {
      newReality = currentState;
    }
    
    setCurrentState(newReality);
    setScore(s => s + 1);

    // 2. Adaptive Speed
    const newDuration = Math.max(1000, roundDuration * 0.98);
    setRoundDuration(newDuration);
    roundDurationRef.current = newDuration; // Manual sync for immediate loop usage

    // 3. New Modifier & Chaos Variables
    setNextModifier(Math.random() > 0.5 ? ModifierType.KEEP : ModifierType.INVERT);
    
    // Chaos 1: Spatial Jitter (40% chance to swap buttons)
    setIsButtonsSwapped(Math.random() > 0.6);

    // Chaos 2: Context Flux (20% chance to invert rules)
    setIsFluxActive(Math.random() > 0.8);

    // 4. Reset Round
    hasAnsweredRef.current = false;
    setUserAnswer(null);
    startTimeRef.current = Date.now();
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const handleFailure = () => {
    stopLoop();
    setGameState(StreamState.FAILURE);
    setTimeout(() => {
        onGameOver({
            mode: 'STREAM',
            score: score,
            details: `Max Chain: ${score}`
        });
    }, 1500);
  };

  const handleInput = (inputColor: ColorState) => {
    if (gameState !== StreamState.ACTIVE || hasAnsweredRef.current) return;

    hasAnsweredRef.current = true;
    setUserAnswer(inputColor); 

    // Calculate Expected Result based on Logic + Chaos
    let effectiveModifier = nextModifier;
    
    // RFT Contextual Control: If Flux is active, function of symbol is inverted
    if (isFluxActive) {
        effectiveModifier = nextModifier === ModifierType.KEEP ? ModifierType.INVERT : ModifierType.KEEP;
    }

    let expectedState = currentState;
    if (effectiveModifier === ModifierType.INVERT) {
      expectedState = currentState === ColorState.RED ? ColorState.BLUE : ColorState.RED;
    } else {
      expectedState = currentState;
    }

    if (inputColor === expectedState) {
       setTimeout(advanceRound, 50);
    } else {
       handleFailure();
    }
  };

  const getModifierIcon = () => {
    const symbol = ruleMapping[nextModifier];
    const colorClass = isFluxActive 
        ? 'text-purple-300 fill-purple-300/20' 
        : (symbol === 'CIRCLE' ? 'text-emerald-400 fill-emerald-400/20' : 'text-amber-400 fill-amber-400/20');

    if (symbol === 'CIRCLE') return <Circle className={`w-16 h-16 ${colorClass}`} />;
    return <Star className={`w-16 h-16 ${colorClass}`} />;
  };

  const getModifierName = () => {
      return ruleMapping[nextModifier];
  };

  if (!isPlaying) {
      return (
          <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 p-6 font-mono text-center overflow-y-auto">
             <h2 className="text-3xl font-black text-white mb-6 tracking-tighter">STREAM PROTOCOL</h2>
             
             <div className="max-w-xl text-slate-400 mb-6 space-y-4 text-sm">
                <p>Maintain your <span className="text-white font-bold">Mental State</span> while rules shift.</p>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex justify-between items-center px-8">
                     <span className="text-slate-500 font-bold tracking-widest text-xs">STARTING CONDITION</span>
                     <span className="text-white font-bold text-sm animate-pulse">RANDOMIZED AT START</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-left">
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                        <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                             <Shuffle className="w-4 h-4 text-cyan-400" />
                             VARIABLE LOGIC
                        </h4>
                        <div className="space-y-2 text-xs text-slate-400">
                             <p>Rules are <span className="text-cyan-400 font-bold">GENERATED</span> every session.</p>
                             <p>You have <span className="text-white font-bold">3 SECONDS</span> during the Ready Phase to memorize if STAR means Keep or Invert.</p>
                        </div>
                    </div>
                    <div className="bg-purple-950/30 p-4 rounded-lg border border-purple-500/30">
                        <h4 className="text-purple-300 font-bold mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" /> 
                            FLUX EVENT
                        </h4>
                        <div className="space-y-1 text-xs text-purple-100/70">
                             <p>When border glows <span className="text-purple-300 font-bold">PURPLE</span>:</p>
                             <p className="font-bold">CURRENT RULES INVERT.</p>
                             <p>(Keep becomes Flip / Flip becomes Keep)</p>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 text-left">
                     <h4 className="text-amber-400 font-bold mb-2 flex items-center gap-2">
                        <Shuffle className="w-4 h-4" /> 
                        SPATIAL JITTER
                    </h4>
                    <p className="text-xs">Controls will physically <span className="text-white font-bold">SWAP POSITIONS</span> randomy. Keys map to screen location.</p>
                </div>
             </div>

             <div className="flex gap-4 mb-8 text-xs font-mono text-slate-500">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded border border-slate-800">
                   <Keyboard className="w-4 h-4" />
                   <span>Keys map to SCREEN LOCATION</span>
                </div>
             </div>

             <button 
                onClick={handleStart}
                className="group flex items-center gap-3 px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-all hover:scale-105"
             >
                <Play className="fill-current" />
                GENERATE SEQUENCE
             </button>
             <button onClick={onExit} className="mt-8 text-slate-600 hover:text-slate-400 text-xs">DISCONNECT</button>
        </div>
      )
  }

  // Ready Phase UI
  if (gameState === StreamState.READY) {
    return (
        <div className="w-full h-screen bg-slate-950 flex flex-col items-center justify-center font-mono animate-in fade-in duration-300 select-none">
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
                    <div className="flex flex-col items-center gap-2">
                        {ruleMapping[ModifierType.KEEP] === 'CIRCLE' 
                            ? <Circle className="w-8 h-8 text-emerald-400" />
                            : <Star className="w-8 h-8 text-emerald-400" />
                        }
                        <span className="text-emerald-400 font-bold text-sm">= KEEP</span>
                    </div>
                    <div className="w-px h-12 bg-slate-800" />
                    <div className="flex flex-col items-center gap-2">
                        {ruleMapping[ModifierType.INVERT] === 'CIRCLE' 
                            ? <Circle className="w-8 h-8 text-amber-400" />
                            : <Star className="w-8 h-8 text-amber-400" />
                        }
                        <span className="text-amber-400 font-bold text-sm">= FLIP</span>
                    </div>
                </div>
            </div>
        </div>
    )
  }

  // Render Buttons Helper
  const renderButton = (color: ColorState) => (
    <button 
        key={color}
        onMouseDown={() => handleInput(color)}
        className={`
        group relative w-32 h-32 rounded-xl border-2 transition-all active:scale-95 flex flex-col items-center justify-center
        ${color === ColorState.RED 
            ? (userAnswer === ColorState.RED ? 'bg-rose-500 border-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.5)] scale-95' : 'bg-slate-900/50 border-rose-900/50 hover:border-rose-500')
            : (userAnswer === ColorState.BLUE ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.5)] scale-95' : 'bg-slate-900/50 border-cyan-900/50 hover:border-cyan-500')
        }
        `}
    >
        <span className={`font-bold text-xl ${
            color === ColorState.RED 
            ? (userAnswer === ColorState.RED ? 'text-white' : 'text-rose-500')
            : (userAnswer === ColorState.BLUE ? 'text-white' : 'text-cyan-500')
        }`}>
            {color}
        </span>
        {/* Helper text changes based on layout for keyboard users */}
        <span className="text-[10px] text-slate-500 mt-2 font-mono uppercase">
            {isButtonsSwapped 
                ? (color === ColorState.RED ? 'KEY: J / →' : 'KEY: D / ←') // Swapped Mapping
                : (color === ColorState.RED ? 'KEY: D / ←' : 'KEY: J / →') // Standard Mapping
            }
        </span>
    </button>
  );

  return (
    <div className={`
        w-full h-screen flex flex-col bg-slate-950 overflow-hidden font-mono relative select-none transition-colors duration-500
        ${isFluxActive ? 'border-[8px] border-purple-500/50 shadow-[inset_0_0_100px_rgba(168,85,247,0.2)]' : ''}
    `}>
      
      {/* Flux Warning Overlay */}
      {isFluxActive && (
          <div className="absolute top-24 left-0 w-full flex justify-center z-0 pointer-events-none">
              <div className="bg-purple-500/20 text-purple-300 px-6 py-2 rounded-full border border-purple-500/50 text-xs font-black tracking-[0.3em] animate-pulse flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  FLUX DETECTED: RULES INVERTED
              </div>
          </div>
      )}

      {/* Header */}
      <div className="relative z-10 w-full p-6 flex justify-between items-center text-slate-500 text-xs uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Protocol: Stream</span>
          <span className="text-white">Chain: {score}</span>
        </div>
        <button onClick={onExit} className="hover:text-white transition-colors">Disconnect</button>
      </div>

      {/* Main Stream Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-12">
        
        {/* Modifier Display */}
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
           <div className={`text-sm tracking-[0.2em] uppercase ${isFluxActive ? 'text-purple-400 font-bold' : 'text-slate-400'}`}>
                {isFluxActive ? 'INVERTED SIGNAL' : 'SIGNAL'}
           </div>
           <div className={`
                p-8 border rounded-2xl shadow-2xl backdrop-blur-sm relative overflow-hidden transition-all duration-300
                ${isFluxActive ? 'bg-purple-900/40 border-purple-500' : 'bg-slate-900/80 border-slate-700'}
           `}>
              {getModifierIcon()}
           </div>
           <div className={`text-2xl font-black tracking-widest ${
             ruleMapping[nextModifier] === 'CIRCLE'
                ? (isFluxActive ? 'text-purple-300' : 'text-emerald-500') 
                : (isFluxActive ? 'text-purple-300' : 'text-amber-500')
           }`}>
             {getModifierName()}
           </div>
        </div>

        {/* Temporal Pressure Bar */}
        <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-75 ease-linear ${
                timeLeft < 30 ? 'bg-rose-500' : 'bg-cyan-500'
            }`}
            style={{ width: `${timeLeft}%` }}
          />
        </div>

        {/* Input Controls - Dynamic Rendering for Swapping */}
        <div className="flex gap-8 mt-8">
           {isButtonsSwapped ? (
               <>
                 {renderButton(ColorState.BLUE)}
                 {renderButton(ColorState.RED)}
               </>
           ) : (
               <>
                 {renderButton(ColorState.RED)}
                 {renderButton(ColorState.BLUE)}
               </>
           )}
        </div>
        
        {/* Swap Indicator */}
        {isButtonsSwapped && (
             <div className="text-xs text-slate-600 font-mono tracking-widest flex items-center gap-2 animate-pulse">
                <Shuffle className="w-3 h-3" /> CONTROLS SWAPPED
             </div>
        )}

      </div>

      {/* Failure Overlay */}
      {gameState === StreamState.FAILURE && (
        <div className="absolute inset-0 z-50 bg-rose-950/90 flex flex-col items-center justify-center animate-in fade-in duration-100">
          <Zap className="w-24 h-24 text-rose-500 mb-6" />
          <h2 className="text-4xl font-black text-white mb-2 tracking-tighter">THREAD LOST</h2>
          <p className="text-rose-200/60 font-mono">Cognitive Chain Broken</p>
        </div>
      )}

    </div>
  );
};

export default StreamProtocol;
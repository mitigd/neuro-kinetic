import React, { useState } from 'react';
import { ViewState, GameResult } from './types';
import SaccadeProtocol from './components/SaccadeProtocol';
import StreamProtocol from './components/StreamProtocol';
import { Activity, Brain, Crosshair, ArrowRight, Trophy, RotateCcw, Home } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('MENU');
  const [lastResult, setLastResult] = useState<GameResult | null>(null);

  const handleGameOver = (result: GameResult) => {
    setLastResult(result);
    setView('RESULTS');
  };

  const handleRetry = () => {
    if (lastResult?.mode === 'SACCADE') {
      setView('SACCADE_GAME');
    } else if (lastResult?.mode === 'STREAM') {
      setView('STREAM_GAME');
    } else {
      setView('MENU');
    }
  };

  const renderContent = () => {
    switch (view) {
      case 'SACCADE_GAME':
        return <SaccadeProtocol onGameOver={handleGameOver} onExit={() => setView('MENU')} />;
      case 'STREAM_GAME':
        return <StreamProtocol onGameOver={handleGameOver} onExit={() => setView('MENU')} />;
      case 'RESULTS':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center animate-in fade-in duration-500 relative z-10">
             <Trophy className="w-20 h-20 text-amber-400 mb-6 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
             <h2 className="text-4xl font-bold mb-2 tracking-tight">PROTOCOL COMPLETE</h2>
             
             <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 mb-8 font-mono tracking-tighter">
               {lastResult?.score}
             </div>
             
             <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl mb-12 max-w-md w-full backdrop-blur-sm">
                {lastResult?.avgReactionTime && (
                  <div className="flex justify-between items-center mb-2 font-mono text-sm text-slate-400">
                    <span>AVG SACCADE:</span>
                    <span className="text-cyan-400">{lastResult.avgReactionTime}ms</span>
                  </div>
                )}
                <div className="flex justify-between items-center font-mono text-sm text-slate-400">
                   <span>DATA:</span>
                   <span className="text-emerald-400">{lastResult?.details}</span>
                </div>
             </div>
             
             <div className="flex gap-6">
                <button 
                  onClick={() => setView('MENU')}
                  className="group flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all font-mono uppercase tracking-widest text-xs border border-slate-700"
                >
                  <Home className="w-4 h-4 group-hover:text-cyan-400 transition-colors" />
                  Hub
                </button>
                <button 
                  onClick={handleRetry}
                  className="group flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all font-mono uppercase tracking-widest text-xs font-bold shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:scale-105"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retry Protocol
                </button>
             </div>
          </div>
        );
      default: // MENU
        return (
          <div className="max-w-6xl mx-auto w-full min-h-screen flex flex-col justify-center p-6 md:p-12 relative z-10">
            {/* Background Texture */}
            <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-[-1]" />

            <header className="mb-16">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-6 h-6 text-cyan-500" />
                <span className="text-cyan-500 font-mono text-xs tracking-[0.3em] uppercase">NeuroKinetic</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-100 mb-4">
                COGNITIVE OPS
              </h1>
              <p className="text-slate-400 max-w-lg text-lg leading-relaxed">
                Adaptive cognitive training based on Relational Frame Theory. 
                Select a protocol to decouple stress response and enhance attentional orienting.
              </p>
            </header>

            <div className="grid md:grid-cols-2 gap-8">
              
              {/* Card 1: Posner */}
              <button 
                onClick={() => setView('SACCADE_GAME')}
                className="group text-left relative overflow-hidden bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 p-8 rounded-2xl transition-all hover:bg-slate-900 hover:shadow-[0_0_40px_rgba(16,185,129,0.1)]"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-emerald-950/30 rounded-lg text-emerald-400 group-hover:text-emerald-300">
                    <Crosshair className="w-8 h-8" />
                  </div>
                  <ArrowRight className="w-6 h-6 text-slate-700 group-hover:text-emerald-500 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                </div>
                <h3 className="text-2xl font-bold text-slate-200 mb-2 group-hover:text-emerald-400 transition-colors">Saccade Protocol</h3>
                <p className="text-slate-500 text-sm mb-6 h-10">The "Sniper Scope". Train rapid visual acquisition and symbolic logic decoding under semantic interference.</p>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                  <span className="px-2 py-1 bg-slate-800 rounded">VARIABLE TRIALS</span>
                  <span className="px-2 py-1 bg-slate-800 rounded">SPEED</span>
                </div>
              </button>

              {/* Card 2: PASAT */}
              <button 
                onClick={() => setView('STREAM_GAME')}
                className="group text-left relative overflow-hidden bg-slate-900/50 border border-slate-800 hover:border-amber-500/50 p-8 rounded-2xl transition-all hover:bg-slate-900 hover:shadow-[0_0_40px_rgba(245,158,11,0.1)]"
              >
                 <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-amber-950/30 rounded-lg text-amber-400 group-hover:text-amber-300">
                    <Activity className="w-8 h-8" />
                  </div>
                  <ArrowRight className="w-6 h-6 text-slate-700 group-hover:text-amber-500 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                </div>
                <h3 className="text-2xl font-bold text-slate-200 mb-2 group-hover:text-amber-400 transition-colors">Stream Protocol</h3>
                <p className="text-slate-500 text-sm mb-6 h-10">The "Endurance Test". A continuous relational stream demanding continuous frame updating and distress tolerance.</p>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                  <span className="px-2 py-1 bg-slate-800 rounded">ENDLESS</span>
                  <span className="px-2 py-1 bg-slate-800 rounded">MEMORY</span>
                </div>
              </button>

            </div>

            <footer className="mt-24 text-slate-700 text-xs font-mono">
              NEUROKINETIC SYSTEM // RFT CORE: ACTIVE
            </footer>
          </div>
        );
    }
  };

  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100 scanline selection:bg-cyan-500/30 overflow-x-hidden">
      {renderContent()}
    </main>
  );
};

export default App;
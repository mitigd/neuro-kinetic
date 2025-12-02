export type ViewState = 'MENU' | 'SACCADE_INTRO' | 'SACCADE_GAME' | 'STREAM_INTRO' | 'STREAM_GAME' | 'RESULTS';

export enum SaccadeState {
  IDLE = 'IDLE',
  FIXATION = 'FIXATION',
  CUE = 'CUE',
  TARGET = 'TARGET',
  FEEDBACK = 'FEEDBACK'
}

export enum StreamState {
  IDLE = 'IDLE',
  READY = 'READY',
  ACTIVE = 'ACTIVE',
  FAILURE = 'FAILURE'
}

export enum ColorState {
  RED = 'RED',
  BLUE = 'BLUE'
}

export enum ModifierType {
  KEEP = 'KEEP',   // Circle
  INVERT = 'INVERT' // Star
}

export interface GameResult {
  mode: 'SACCADE' | 'STREAM';
  score: number;
  avgReactionTime?: number;
  details?: string;
}
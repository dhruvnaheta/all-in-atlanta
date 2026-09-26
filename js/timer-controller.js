import {renderTimerUI} from './refresh.js';
import {getTimerState, getRawTimerState} from './state.js';
import {runCommand} from './commands.js';
import {remainingTime} from './timer.js';
import {levelDur} from './blinds.js';
let displayInterval=null;
export function _startDisplayPoll(){if(!displayInterval)displayInterval=setInterval(renderTimerUI,500);}
export function _stopDisplayPoll(){if(displayInterval)clearInterval(displayInterval);displayInterval=null;}
export async function timerCommand(operation,values={}) {return runCommand('timer',{operation,revision:getRawTimerState().revision || 0,...values});}
export const timerStart=()=>timerCommand('start');
export const timerPause=()=>timerCommand('pause');
export const timerReset=()=>timerCommand('reset');
export const timerJumpTo=index=>timerCommand('jump',{index});
export function timerGetRemaining(){const state=getTimerState();return remainingTime(state,levelDur(state.levelIdx),Date.now());}
export function timerGetProgress(){const state=getTimerState();return Math.max(0,Math.min(1,1-timerGetRemaining()/levelDur(state.levelIdx)));}
export function fmtTime(ms){const seconds=Math.ceil(ms/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
export function syncTimer(){if(getTimerState().running)_startDisplayPoll();else _stopDisplayPoll();renderTimerUI();}

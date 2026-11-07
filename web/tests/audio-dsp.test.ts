import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MicCapture, AudioPlayer } from "../src/voice";

// Small Web Audio fakes exercise routing/processing; not a claim of acoustic quality.
class Node { gain={value:1}; connections:unknown[]=[]; connect(n:unknown){this.connections.push(n);} disconnect(){this.connections=[];} }
class Context {
 currentTime=1; state="running"; destination=new Node(); processor:any;
 gains:Node[]=[]; compressor:any;
 createMediaStreamSource(){return new Node();}
 createChannelMerger(){return new Node();}
 createScriptProcessor(){return this.processor={...new Node(),connect(){},disconnect(){},onaudioprocess:null};}
 createGain(){const n=new Node();this.gains.push(n);return n;}
 createDynamicsCompressor(){return this.compressor=Object.assign(new Node(),Object.fromEntries(["threshold","knee","ratio","attack","release"].map(k=>[k,{value:0}])));}
}

test("native DSP toggles become actual getUserMedia constraints and the track stops",async()=>{
 let constraints:any;let stopped=false;
 Object.defineProperty(globalThis,"navigator",{value:{mediaDevices:{getUserMedia:async(c:any)=>{constraints=c;return {getTracks:()=>[{stop(){stopped=true;}}]};}}},configurable:true});
 const ctx=new Context();
 const mic=new MicCapture(ctx as any,{onFrame(){},noiseSuppression:false,echoCancellation:true,autoGainControl:false,deviceId:"headset"});
 await mic.start();
 assert.deepEqual(constraints.audio,{channelCount:1,sampleRate:{ideal:48000},echoCancellation:true,noiseSuppression:false,autoGainControl:false,deviceId:{exact:"headset"}});
 mic.stop();assert.ok(stopped);
});

test("VAD threshold/hangover, PTT, continuous and typing attenuation run in the local PCM pipeline",async()=>{
 const ctx=new Context();let frames=0;let level=0;
 const mic=new MicCapture(ctx as any,{onFrame(){frames++;},onLevel:v=>level=v,threshold:0.1,hangoverSeconds:0.3});
 await mic.start();
 const process=(v:number)=>ctx.processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(2048).fill(v)},outputBuffer:{getChannelData:()=>new Float32Array(2048)}});
 process(0.05);assert.equal(frames,0);
 process(0.2);assert.ok(frames>0);
 const before=frames;ctx.currentTime=1.1;process(0);assert.ok(frames>before);
 ctx.currentTime=2;const silent=frames;process(0);assert.equal(frames,silent);
 mic.pushToTalk=true;mic.pttPressed=false;process(0.5);assert.equal(frames,silent);
 mic.pttPressed=true;process(0.2);assert.ok(frames>silent);
 mic.pushToTalk=false;mic.continuous=true;mic.typingAttenuation=true;mic.noteTyping();process(0.5);assert.ok(Math.abs(level-0.05)<0.00001);
 mic.stop();
});

test("bundled AEC processing is applied before level detection",async()=>{
 const ctx=new Context();let processed=false;let level=1;
 const aec={free(){},analyze(){},processSize:()=>2048,process(out:Float32Array[]){processed=true;out[0].fill(0);}};
 const mic=new MicCapture(ctx as any,{onFrame(){},onLevel:v=>level=v,aec3:aec,echoCancellation:false});
 await mic.start();ctx.processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(2048).fill(0.8)},outputBuffer:{getChannelData:()=>new Float32Array(2048)}});
 assert.ok(processed);assert.equal(level,0);mic.stop();
});

test("playback gain and automatic leveling toggle actual Web Audio routing",()=>{
 Object.defineProperty(globalThis,"HTMLMediaElement",{value:class {},configurable:true});
 const ctx=new Context();const player=new AudioPlayer(ctx as any);
 player.setVolume(0.4);assert.equal(ctx.gains[0].gain.value,0.4);
 player.setAutoVolume(true);assert.equal(ctx.gains[1].connections[0],ctx.compressor);
 player.setAutoVolume(false);assert.equal(ctx.gains[1].connections[0],ctx.gains[0]);
 assert.equal(ctx.compressor.threshold.value,-30);assert.equal(ctx.compressor.ratio.value,4);
});

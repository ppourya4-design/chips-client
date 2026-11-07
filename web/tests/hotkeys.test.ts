import { strict as assert } from "node:assert";
import { test } from "node:test";
import { captureBinding, matchesBinding, sameBinding, loadBinding, loadShortcuts, SHORTCUTS_KEY } from "../src/hotkeys";
import { BROADCAST_KEY, loadBroadcastPreferences } from "../src/broadcastPreferences";
const stored = new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{value:{getItem:(k:string)=>stored.get(k)??null,setItem:(k:string,v:string)=>stored.set(k,v),removeItem:(k:string)=>stored.delete(k)},configurable:true});
const event = (code:string, mods: Partial<{ ctrlKey:boolean;shiftKey:boolean;altKey:boolean;metaKey:boolean }>={})=>({code,ctrlKey:false,shiftKey:false,altKey:false,metaKey:false,...mods});

test("capture supports chords, exact modifiers and legacy unmodified keys",()=>{
 const chord=captureBinding(event("KeyD",{ctrlKey:true,shiftKey:true}));
 assert.equal(chord.label,"Ctrl + Shift + D");
 assert.ok(matchesBinding(chord,event("KeyD",{ctrlKey:true,shiftKey:true})));
 assert.ok(!matchesBinding(chord,event("KeyD",{ctrlKey:true})));
 assert.ok(!matchesBinding({code:"KeyD",label:"D"},event("KeyD",{ctrlKey:true})));
 assert.ok(sameBinding({code:"F8",label:"legacy"},captureBinding(event("F8"))));
 assert.ok(!sameBinding(chord,captureBinding(event("KeyD"))));
});

test("bare modifiers match press and release, without a stuck modifier dependency",()=>{
 const shift=captureBinding(event("ShiftLeft"));
 assert.ok(matchesBinding(shift,event("ShiftLeft",{shiftKey:true})));
 assert.ok(matchesBinding(shift,event("ShiftLeft")));
 assert.ok(!matchesBinding(shift,event("ShiftRight",{shiftKey:true})));
});

test("every default shortcut can be rebound or explicitly cleared across reloads",()=>{
 stored.clear();
 assert.ok(matchesBinding(loadShortcuts().connect,event("KeyS",{ctrlKey:true})));
 const saved={connect:null,disconnect:captureBinding(event("F10")),preset:captureBinding(event("KeyP",{altKey:true}))};
 localStorage.setItem(SHORTCUTS_KEY,JSON.stringify(saved));
 const loaded=loadShortcuts();
 assert.equal(loaded.connect,null);
 assert.ok(matchesBinding(loaded.disconnect,event("F10")));
 assert.ok(matchesBinding(loaded.preset,event("KeyP",{altKey:true})));
 localStorage.setItem(SHORTCUTS_KEY,"{");
 assert.equal(loadShortcuts().connect?.code,"KeyS");
});

test("clearing PTT stays cleared; old keyboard and mouse PTT saves migrate",()=>{
 stored.clear();
 localStorage.setItem("ptt",JSON.stringify({code:"Mouse3",label:"Mouse 4"}));
 assert.equal(loadBinding("ptt")?.code,"Mouse3");
 assert.equal(loadBinding("ptt",false),null);
 localStorage.removeItem("ptt");assert.equal(loadBinding("ptt"),null);
 localStorage.setItem("ptt",JSON.stringify({code:"F8",label:"F8",ctrl:"yes"}));
 assert.equal(loadBinding("ptt"),null);
});

test("broadcast defaults persist without starting capture; malformed fields are rejected",()=>{
 stored.clear();
 localStorage.setItem(BROADCAST_KEY,JSON.stringify({source:"camera",audio:false,accessibility:3,height:1080,fps:60,videoBitrateKbps:4000,audioBitrateKbps:192,viewerLimit:4,contentHint:"detail"}));
 assert.deepEqual(loadBroadcastPreferences(),{source:"camera",audio:false,accessibility:3,height:1080,fps:60,videoBitrateKbps:4000,audioBitrateKbps:192,viewerLimit:4,contentHint:"detail"});
 localStorage.setItem(BROADCAST_KEY,'{"source":"bad","height":-1,"fps":"60","accessibility":99}');
 const loaded=loadBroadcastPreferences();assert.equal(loaded.source,"display");assert.equal(loaded.height,720);assert.equal(loaded.fps,30);assert.equal(loaded.accessibility,1);
});

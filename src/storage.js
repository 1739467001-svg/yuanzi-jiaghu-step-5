const PREFIX='atom-jianghu-v1:';
export function readStore(key,fallback){try{const raw=localStorage.getItem(PREFIX+key);return raw===null?fallback:JSON.parse(raw);}catch{return fallback;}}
export function writeStore(key,value){try{localStorage.setItem(PREFIX+key,JSON.stringify(value));return true;}catch{return false;}}
export function memoryFor(memories,agentId){return memories.filter(m=>m.agentId===agentId);}

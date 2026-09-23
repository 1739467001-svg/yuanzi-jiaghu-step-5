/**
 * Boundary adapter for a16z-infra/ai-town at 8e05997f2409275669c8344b84a51692e83f3f33.
 * It translates public positions only, never conversation bodies or memories.
 * The local prototype does not establish a Convex connection automatically.
 */
export const UPSTREAM_COMMIT='8e05997f2409275669c8344b84a51692e83f3f33';
export function townToScene(point,{originX=0,originY=0,scale=1}={}){
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||!Number.isFinite(scale)||scale<=0)throw new Error('Invalid world coordinates');
 return {x:(point.x-originX)*scale,y:0,z:(point.y-originY)*scale};
}
export function sceneToTown(point,{originX=0,originY=0,scale=1}={}){
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.z)||!Number.isFinite(scale)||scale<=0)throw new Error('Invalid scene coordinates');
 return {x:point.x/scale+originX,y:point.z/scale+originY};
}
export function publicActorSnapshot(serializedWorld,descriptions=[],transform={}){
 const byId=new Map(descriptions.map(d=>[d.playerId,d]));
 return (serializedWorld?.players||[]).map(p=>({id:p.id,name:byId.get(p.id)?.name||p.id,controller:p.human?'human':'agent',position:townToScene(p.position,transform),angle:Math.atan2(p.facing?.dx??0,p.facing?.dy??1),speed:p.speed||0}));
}

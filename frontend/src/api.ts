import PocketBase from 'pocketbase';
import type {Workspace} from './types';
export const pb=new PocketBase(import.meta.env.VITE_POCKETBASE_URL||window.location.origin);
pb.autoCancellation(false);
export const loadWorkspace=()=>pb.send<Workspace>('/api/daycare/state',{method:'GET'});
export const mutate=(action:string,body:unknown)=>pb.send('/api/daycare/'+action,{method:'POST',body});
export function errorMessage(error:unknown){return error instanceof Error?error.message:'Unable to complete this request.';}

// Registration and the Auth state listener run independently. A temporary
// nickname bridges them even when the browser refuses sessionStorage access.
// No credentials are stored, and the value is cleared when registration ends.
let pendingNickname:string|null=null;
let memoryOverridesStorage=false;
const key='vigia_pending_nickname';
export function getRegistrationNickname():string|null {
 if(memoryOverridesStorage)return pendingNickname;
 try {return sessionStorage.getItem(key) || pendingNickname;} catch {return pendingNickname;}
}
export function setRegistrationNickname(value:string):void {
 pendingNickname=value;
 try {sessionStorage.setItem(key,value);memoryOverridesStorage=false;} catch {memoryOverridesStorage=true;}
}
export function clearRegistrationNickname():void {
 pendingNickname=null;
 try {sessionStorage.removeItem(key);memoryOverridesStorage=false;} catch {memoryOverridesStorage=true;}
}

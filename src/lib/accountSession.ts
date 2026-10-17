export async function finishDeletedAccountSession(deletedUid:string,actions:{currentUid:()=>string|undefined;isCurrent:()=>boolean;stopActivity:()=>void;signOut:()=>Promise<void>;onSignedOut:()=>void}){
 if(!actions.isCurrent()||actions.currentUid()!==deletedUid)return;
 // The account and its history have already been removed by the server.
 actions.stopActivity();
 await actions.signOut();
 if(actions.currentUid()!==undefined)return;
 actions.onSignedOut();
}

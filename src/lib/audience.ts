export const adultAudience=import.meta.env.VITE_AUDIENCE==='18plus';
export const adultAccessVersion='2026-10-13-18plus-v1';

// Some privacy settings deny sessionStorage entirely. Keep only an explicit
// declaration for this page lifetime in that case; a new page asks again.
// This client declaration never replaces the server's eligibility checks.
let pageDeclaration=false;
let declarationIsPageOnly=false;
export function hasAdultAccessDeclaration():boolean {
 // A browser may allow reads while rejecting writes (for example at quota).
 // An explicitly accepted declaration must then remain valid for this page.
 if(declarationIsPageOnly)return pageDeclaration;
 try {
  pageDeclaration=sessionStorage.getItem('vigia_adult_access')===adultAccessVersion;
 } catch { /* Fall back to the declaration made in this page, if any. */ }
 return pageDeclaration;
}
export function acceptAdultAccessDeclaration():void {
 pageDeclaration=true;
 try {sessionStorage.setItem('vigia_adult_access',adultAccessVersion);declarationIsPageOnly=false;}
 catch {declarationIsPageOnly=true;}
}

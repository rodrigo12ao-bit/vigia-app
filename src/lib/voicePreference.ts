// Conversation speech now has one server voice. Older local/Google preferences
// must never select a device synthesizer, including when storage is unavailable.
// Remove only this account's obsolete key; no new preference is persisted.
export function clearLegacyVoicePreference(storage:Pick<Storage,'removeItem'>,uid?:string):void {
  try{storage.removeItem('vigia_voice_preference:'+(uid||'guest'));}catch{/* Best-effort migration; the value is never read. */}
}

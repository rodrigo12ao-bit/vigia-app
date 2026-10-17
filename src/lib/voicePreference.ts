export type VoicePreference='local'|'google';
type PreferenceStorage=Pick<Storage,'getItem'|'setItem'>;
const key=(uid?:string)=>'vigia_voice_preference:'+(uid||'guest');
export function readVoicePreference(storage:PreferenceStorage,uid?:string):VoicePreference {
  try{return storage.getItem(key(uid))==='google'?'google':'local';}catch{return 'local';}
}
export function saveVoicePreference(storage:PreferenceStorage,preference:VoicePreference,uid?:string) {
  storage.setItem(key(uid),preference);
}
export function voiceOutputFor(preference:VoicePreference,hasPortugueseLocalVoice:boolean):'device'|'cloud' {
  return preference==='local'&&hasPortugueseLocalVoice?'device':'cloud';
}

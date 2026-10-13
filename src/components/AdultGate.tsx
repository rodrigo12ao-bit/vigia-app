import {useState,type ReactNode} from 'react';
import {ShieldCheck} from 'lucide-react';
import {adultAudience,adultAccessVersion} from '../lib/audience';
export function AdultGate({children}:{children:ReactNode}){
 const [accepted,setAccepted]=useState(()=>sessionStorage.getItem('vigia_adult_access')===adultAccessVersion),[checked,setChecked]=useState(false),[declined,setDeclined]=useState(false);
 if(!adultAudience||accepted)return <>{children}</>;
 return <main className="welcome-shell"><section className="welcome-card" aria-label="Acesso para adultos"><span className="brand-symbol"><ShieldCheck size={27}/></span><h1>Vigia para adultos</h1><p>Aprenda prevenção, pratique decisões e prepare-se para cuidar da sua comunidade.</p><p><strong>Acesso exclusivo para pessoas de 18 anos ou mais.</strong> A IA pode errar e não substitui serviços de emergência.</p>{declined?<p role="alert">O acesso não está disponível para menores de 18 anos.</p>:<><label className="flex gap-3 text-left items-start py-4"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>Declaro que tenho 18 anos ou mais e vou utilizar minha própria conta.</label><button className="vigia-primary" disabled={!checked} onClick={()=>{sessionStorage.setItem('vigia_adult_access',adultAccessVersion);setAccepted(true);}}>Continuar</button></>}<button className="vigia-secondary" onClick={()=>setDeclined(true)}>Tenho menos de 18 anos</button></section></main>;
}

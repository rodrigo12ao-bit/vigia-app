import {useId} from 'react';
import './brand-entry.css';

// An original vector mark: a protective shield and a clear, open V.
// CSS provides the entrance motion without delaying any interaction.
export function VigiaBrandMark({animated = false, className = ''}: {animated?: boolean; className?: string}) {
  const id = useId().replace(/:/g, '');
  return <span className={`vigia-brand-mark ${animated ? 'vigia-brand-mark-animated' : ''} ${className}`} aria-hidden="true">
    <span className="vigia-brand-mark-float">
      <svg viewBox="0 0 120 132" fill="none" focusable="false" className="vigia-brand-mark-symbol">
        <defs>
          <linearGradient id={`${id}-shield`} x1="22" y1="7" x2="102" y2="121" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A78BFA"/><stop offset=".48" stopColor="#7C3AED"/><stop offset="1" stopColor="#2563EB"/>
          </linearGradient>
          <linearGradient id={`${id}-light`} x1="34" y1="34" x2="82" y2="91" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFF6C0"/><stop offset="1" stopColor="#FACC15"/>
          </linearGradient>
        </defs>
        <path d="M60 5 108 23v39c0 30-18 51-48 65C30 113 12 92 12 62V23L60 5Z" fill={`url(#${id}-shield)`}/>
        <path d="m60 14 39 15v33c0 24-14 42-39 55C35 104 21 86 21 62V29l39-15Z" stroke="white" strokeOpacity=".27" strokeWidth="1.5"/>
        <path d="m33 45 27 47 27-47" stroke={`url(#${id}-light)`} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M60 30v12M54 36h12" stroke="white" strokeWidth="3" strokeLinecap="round"/>
        <path d="m25 27 35-13" stroke="white" strokeOpacity=".48" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    </span>
  </span>;
}

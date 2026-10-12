import React from 'react';
import { Html } from '@react-three/drei';
// Native text keeps the game's labels readable without downloading font data.
export function WorldLabel({children,position,rotation,fontSize=.5,color='white'}:any) {
  return <Html center transform distanceFactor={10} position={position} rotation={rotation} style={{pointerEvents:'none'}}><div style={{color,fontSize:fontSize*40,whiteSpace:'nowrap',fontWeight:700,textShadow:'0 1px 3px #000'}}>{children}</div></Html>;
}

import { createContext } from 'react';
import type { AvatarGender } from '../types';
export const AvatarGenderContext=createContext<AvatarGender>('female');

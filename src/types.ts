export interface DebugInfo {
  lastRecognizedSpeech: string;
  lastSentPrompt: string;
  lastApiResponse: string;
  apiStatus: string;
  modelName: string;
  lastError: string;
  // Optional timing diagnostics (milliseconds since performance.timeOrigin)
  sendTimestamp?: number | null;
  responseTimestamp?: number | null;
  voiceStartTimestamp?: number | null;
  avatarRenderedTimestamp?: number | null;
  // Derived durations in ms
  duration_send_to_response?: number | null;
  duration_response_to_voiceStart?: number | null;
  duration_voiceStart_to_avatarRender?: number | null;
}

export type AvatarState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'explaining'
  | 'asking'
  | 'celebrating'
  | 'serious'
  | 'closing'
  | 'alert';

export type AvatarEmotion = AvatarState;

export type AvatarGender = 'female' | 'male';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  emotion?: AvatarState;
  emergencyTip?: string;
  suggestedFollowUps?: string[];
  challengeOrQuestion?: string;
  interactiveOptions?: string[];
  topicIllustration?: 'enchentes' | 'deslizamentos' | 'tempestades' | 'incendios' | 'mochila' | 'numeros' | 'geral';
  imageUrl?: string;
  hasHighThinking?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  lastMessagePreview?: string;
}

export interface TopicItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'enchentes' | 'deslizamentos' | 'tempestades' | 'incendios' | 'prevencao' | 'numeros';
  iconName: string;
  colorTheme: string;
  badgeBg: string;
  shortSummary: string;
  fullContent: {
    whatIsIt: string;
    whatToDoBefore: string[];
    whatToDoDuring: string[];
    whatNeverToDo: string[];
    adultRule: string;
  };
  funFact: string;
  quizQuestion: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

export interface KitItem {
  id: string;
  name: string;
  category: 'essential' | 'unnecessary';
  icon: string;
  description: string;
  whyNeeded: string;
}

export interface QuizQuestion {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  praiseMessage: string;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  category: 'kit' | 'quiz' | 'chat' | 'general';
}

export interface EmergencyPhone {
  number: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  whenToCall: string;
}

export type GameType =
  | 'hazard_finder'
  | 'path_choice'
  | 'sequence_order'
  | 'backpack_builder'
  | 'interactive_story'
  | 'quiz_challenge'
  | 'true_false'
  | 'emergency_central'
  | 'home_safety';

export interface LevelData {
  id: string;
  title: string;
  type: GameType;
  description: string;
  xpReward: number;
  badgeRewardId?: string;
  badgeRewardTitle?: string;
  content: any;
}

export interface ModuleData {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  colorTheme: string;
  badgeTitle: string;
  levels: LevelData[];
}

export interface UserLevelProgress {
  levelId: string;
  stars: number;
  score: number;
  completed: boolean;
  completedAt?: string;
}

export interface UserJourneyState {
  xp: number;
  userLevel: number;
  completedModules: string[];
  unlockedAccessories: string[];
  equippedAccessory?: string;
  playerAvatarId?: string;
  playerNickname?: string;
  levelProgress: Record<string, UserLevelProgress>;
}

export interface AccessoryItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlockRequirement: string;
  requiredXp: number;
}

// Sala Segura Types
export type UserRole = 'infantil' | 'responsavel' | 'educador';

export type InviteStatus = 'pending_guardian_approval' | 'approved' | 'rejected';

export interface UserProfile {
  uid: string;
  email: string;
  nickname: string;
  avatarId: string;
  role: UserRole;
  guardianUid?: string;
  inviteCode: string;
  blockedUsers?: string[];
  starsScore: number;
  badges: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SalaSeguraInvite {
  reviewerUids?: string[];
  approvals?: string[];
  visibleTo?: string[];
  id: string;
  code: string;
  fromUid: string;
  fromNickname: string;
  fromAvatarId: string;
  targetUid: string;
  targetNickname: string;
  status: InviteStatus;
  guardianUid?: string;
  createdAt: string;
}

export interface SalaSeguraChat {
  id: string;
  participants: string[];
  participantProfiles?: {
    [uid: string]: {
      nickname: string;
      avatarId: string;
      role: UserRole;
    };
  };
  lastMessageText: string;
  lastMessageTimestamp: string;
  unreadCount?: {
    [uid: string]: number;
  };
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SalaSeguraMessage {
  id: string;
  senderUid: string;
  senderNickname: string;
  text: string;
  createdAt: string;
  status: 'sent' | 'read';
  readBy: string[];
}

export interface SalaSeguraReport {
  id: string;
  reporterUid: string;
  reportedUid: string;
  chatId: string;
  messageText: string;
  reason: string;
  status: 'pending' | 'reviewed';
  createdAt: string;
}



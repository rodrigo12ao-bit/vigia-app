import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Sparkles, ArrowRight, BookOpen, CheckCircle2 } from 'lucide-react';
import { LevelData } from '../../types';

interface InteractiveStoryGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const InteractiveStoryGame: React.FC<InteractiveStoryGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const content = level.content;
  const nodes = content.nodes;

  const [currentNodeKey, setCurrentNodeKey] = useState<string>('start');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mistakesCount, setMistakesCount] = useState(0);
  const transition=useRef<ReturnType<typeof setTimeout>|null>(null),transitionLocked=useRef(false);
  const [transitioning,setTransitioning]=useState(false);
  useEffect(()=>()=>{if(transition.current!==null)clearTimeout(transition.current);},[]);

  const currentNode = nodes[currentNodeKey];

  const handleSelectChoice = (choice: any) => {
    if(transitionLocked.current)return;
    setFeedback(choice.feedback);

    if (choice.isCorrect) {
      transitionLocked.current=true;setTransitioning(true);
      if (onSpeak) {
        onSpeak(`Muito bem! ${choice.feedback}`);
      }
      if (choice.nextScenario === 'victory') {
        // Complete story!
        transition.current=setTimeout(() => {
          transition.current=null;
          const stars = mistakesCount === 0 ? 3 : 2;
          onComplete(stars, 80);
        }, 1200);
      } else {
        transition.current=setTimeout(() => {
          transition.current=null;transitionLocked.current=false;setTransitioning(false);
          setCurrentNodeKey(choice.nextScenario);
          setFeedback(null);
        }, 1000);
      }
    } else {
      setMistakesCount((prev) => prev + 1);
      if (onSpeak) {
        onSpeak(`Quase lá! ${choice.feedback}`);
      }
    }
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border-2 border-orange-200 shadow-xl max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-black uppercase text-orange-700 tracking-wider bg-orange-100 px-3 py-1 rounded-full">
            📖 História Interativa
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
            {content.storyTitle || level.title}
          </h3>
        </div>
        <div className="p-2 bg-orange-50 rounded-2xl border border-orange-200">
          <BookOpen className="w-6 h-6 text-orange-600" />
        </div>
      </div>

      {/* Story Narrative Box */}
      <div className="bg-gradient-to-b from-orange-50 via-amber-50 to-white border-2 border-orange-200 p-5 sm:p-6 rounded-3xl mb-6 shadow-sm">
        <p className="text-sm sm:text-base font-bold text-slate-800 leading-relaxed mb-4">
          {currentNode.text}
        </p>

        <div className="pt-3 border-t border-orange-200/80">
          <span className="text-xs font-black uppercase text-orange-800 tracking-wider block mb-1">
            🤔 Qual a sua decisão?
          </span>
          <p className="text-sm font-extrabold text-slate-900">{currentNode.question}</p>
        </div>
      </div>

      {/* Choices List */}
      <div className="space-y-3 mb-6">
        {currentNode.choices.map((choice: any, idx: number) => (
          <button
            key={idx}
            onClick={() => handleSelectChoice(choice)}
            disabled={transitioning}
            className="w-full text-left p-4 rounded-2xl border-2 border-slate-200 hover:border-orange-400 bg-white hover:bg-orange-50/50 font-bold text-xs sm:text-sm text-slate-800 transition-all flex items-start gap-3 shadow-sm hover:scale-[1.01] active:scale-95"
          >
            <span className="w-7 h-7 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
              {idx + 1}
            </span>
            <span className="flex-1 leading-snug">{choice.text}</span>
          </button>
        ))}
      </div>

      {/* Feedback Popup */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-orange-100 border-2 border-orange-300 text-orange-950 rounded-2xl text-xs sm:text-sm font-bold flex items-start gap-2.5 shadow-sm"
          >
            <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <span>{feedback}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

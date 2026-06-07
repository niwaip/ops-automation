import React from 'react';
import { WordDraftSection } from '../../draft/word';
import { WordPublishSection } from '../../publish/word';

interface WordRecognitionFollowupProps {
  draftSectionProps: React.ComponentProps<typeof WordDraftSection>;
  publishSectionProps: React.ComponentProps<typeof WordPublishSection>;
}

export const WordRecognitionFollowup: React.FC<WordRecognitionFollowupProps> = ({
  draftSectionProps,
  publishSectionProps,
}) => {
  return (
    <>
      <div className="word-followup-section">
        <WordDraftSection {...draftSectionProps} />
      </div>
      <WordPublishSection {...publishSectionProps} />
    </>
  );
};

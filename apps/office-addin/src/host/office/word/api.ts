import { WordHighlightAPI } from './word-highlight.api';
import { WordLoopWriteAPI } from './word-loop-write.api';
import { WordReadAPI } from './word-read.api';
import { WordTableWriteAPI } from './word-table-write.api';
import { WordWriteAPI } from './word-write.api';

export const WordAPI = {
  ...WordReadAPI,
  ...WordHighlightAPI,
  ...WordWriteAPI,
  ...WordTableWriteAPI,
  ...WordLoopWriteAPI,
};

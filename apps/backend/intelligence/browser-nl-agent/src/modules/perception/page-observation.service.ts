import { Injectable } from '@nestjs/common';
import type { BrowserObservationSnapshot } from '../../contracts/browser-nl-agent.types';

@Injectable()
export class PageObservationService {
  summarize(snapshot: BrowserObservationSnapshot): string {
    return [snapshot.title, snapshot.url, snapshot.text]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' | ');
  }
}

import type { Request, Response } from 'express';

/** Request completion is normal; only aborted input or an unfinished response close cancels work. */
export function bindProxyCancellation(req: Request, res: Response) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const onClose = () => {
    if (!res.writableEnded) abort();
  };
  req.once?.('aborted', abort);
  res.once?.('close', onClose);
  if (req.aborted || (res.destroyed && !res.writableEnded)) abort();
  return {
    signal: controller.signal,
    dispose: () => {
      req.removeListener?.('aborted', abort);
      res.removeListener?.('close', onClose);
    },
  };
}

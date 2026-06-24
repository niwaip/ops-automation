import { Injectable } from '@nestjs/common';

export type GeneratedSourceFile = {
  path: string;
  content: string;
};

@Injectable()
export class CodeWriterService {
  write(files: GeneratedSourceFile[]): GeneratedSourceFile[] {
    return files.map((file) => ({
      path: file.path,
      content: file.content,
    }));
  }
}

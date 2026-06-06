import { DocumentFileAPI } from '../shared/document-file';

export function utf8ToBase64(str: string): string {
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.error('UTF-8转Base64失败:', e);
    try {
      return btoa(
        encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
          String.fromCharCode(parseInt(p1, 16)),
        ),
      );
    } catch (fallbackError) {
      console.error('备用转换也失败:', fallbackError);
      return '';
    }
  }
}

export async function getDocumentFileViaWordRun(): Promise<string> {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const document = context.document;

      // @ts-ignore - getFileOrNull may not exist in some Office versions
      if (document.getFileOrNull && typeof document.getFileOrNull === 'function') {
        try {
          // @ts-ignore
          const file = document.getFileOrNull(Word.FileType.docx);
          file.load('base64');
          await context.sync();

          if (file.value && file.value.base64) {
            const base64 = file.value.base64;
            console.log('Word.run getFileOrNull成功，base64长度:', base64?.length);

            try {
              const decoded = atob(base64.substring(0, 50));
              if (decoded.substring(0, 2) === 'PK') {
                console.log('Word.run获取到有效的docx文件（PK header验证通过）');
                resolve(base64);
                return;
              }
              console.warn('Word.run获取的数据不是有效docx（无PK header）');
            } catch (error) {
              console.warn('Word.run base64解码验证失败:', error);
            }
          }
        } catch (error) {
          console.warn('Word.run getFileOrNull调用失败:', error);
        }
      }

      const body = document.body;
      body.load('text');
      await context.sync();

      console.log('Word.run返回文本内容，长度:', body.text?.length);
      reject(new Error('Word.run getFileOrNull不支持，需要使用getFileAsync方式'));
    }).catch((error) => {
      console.error('Word.run失败:', error);
      reject(error);
    });
  });
}

export async function getDocumentFileBase64(): Promise<string> {
  return DocumentFileAPI.getCompressedDocumentBase64();
}

export async function getDocumentAsBase64(): Promise<string> {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const body = context.document.body;
      const ooxml = body.getOoxml();
      await context.sync();

      if (ooxml.value && ooxml.value.length > 0) {
        console.log('OOXML获取成功，长度:', ooxml.value.length);
        resolve(utf8ToBase64(ooxml.value));
        return;
      }

      body.load('text');
      await context.sync();
      console.log('纯文本获取成功，长度:', body.text?.length);
      resolve(utf8ToBase64(body.text || ''));
    }).catch((error) => {
      console.error('Word.run获取文档失败:', error);
      reject(error);
    });
  });
}

export async function getFileContentBase64(): Promise<string> {
  return DocumentFileAPI.getFileContentBase64();
}

export async function getDocumentFileBase64WithFallback(
  getDocumentContent: () => Promise<string>,
): Promise<{ base64: string; method: string; isValidDocx: boolean }> {
  try {
    const base64 = await getDocumentFileViaWordRun();
    if (base64 && base64.length > 0) {
      try {
        const decoded = atob(base64.substring(0, 50));
        if (decoded.substring(0, 2) === 'PK') {
          console.log('Word.run getFileOrNull成功获取有效docx文件');
          return { base64, method: 'wordRunGetFile', isValidDocx: true };
        }
      } catch {
        console.warn('Word.run验证失败');
      }
      console.warn('Word.run返回数据无PK header，但仍返回');
      return { base64, method: 'wordRunGetFile', isValidDocx: false };
    }
  } catch (error) {
    console.warn('Word.run getFileOrNull失败或不支持:', error);
  }

  try {
    const base64 = await getFileContentBase64();
    if (base64 && base64.length > 0) {
      try {
        const decoded = atob(base64.substring(0, 50));
        if (decoded.substring(0, 2) === 'PK') {
          console.log('getFileContentAsync成功获取有效docx文件');
          return { base64, method: 'getFileContentAsync', isValidDocx: true };
        }
      } catch {
        console.warn('getFileContentAsync验证失败');
      }
      console.warn('getFileContentAsync返回数据无PK header，但仍返回');
      return { base64, method: 'getFileContentAsync', isValidDocx: false };
    }
  } catch (error) {
    console.warn('getFileContentAsync失败或不支持:', error);
  }

  try {
    const base64 = await getDocumentFileBase64();
    if (base64 && base64.length > 0) {
      try {
        const decoded = atob(base64.substring(0, 50));
        if (decoded.substring(0, 2) === 'PK') {
          console.log('getFileAsync成功获取有效docx文件');
          return { base64, method: 'getFileAsync', isValidDocx: true };
        }
      } catch {
        console.warn('getFileAsync base64验证失败');
      }
      console.warn('getFileAsync返回数据无PK header，但仍返回');
      return { base64, method: 'getFileAsync', isValidDocx: false };
    }
  } catch (error) {
    console.warn('getFileAsync失败:', error);
  }

  try {
    const base64 = await getDocumentAsBase64();
    if (base64 && base64.length > 0) {
      console.log('使用Word.run OOXML方式获取文档（非完整docx）');
      return { base64, method: 'wordRunOoxml', isValidDocx: false };
    }
  } catch (error) {
    console.warn('Word.run OOXML方式也失败:', error);
  }

  const text = await getDocumentContent();
  console.warn('使用纯文本作为fallback');
  return { base64: utf8ToBase64(text), method: 'text', isValidDocx: false };
}

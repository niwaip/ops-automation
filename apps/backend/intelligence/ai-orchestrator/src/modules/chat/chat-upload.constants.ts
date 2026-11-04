export const DEFAULT_CHAT_UPLOAD_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const DEFAULT_CHAT_AUDIO_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const getChatUploadMaxFileSize = (): number => {
  const fromBytes = Number(process.env.CHAT_UPLOAD_MAX_FILE_SIZE_BYTES);
  if (Number.isFinite(fromBytes) && fromBytes > 0) {
    return fromBytes;
  }
  const fromMb = Number(process.env.CHAT_UPLOAD_MAX_FILE_SIZE_MB);
  if (Number.isFinite(fromMb) && fromMb > 0) {
    return fromMb * 1024 * 1024;
  }
  return DEFAULT_CHAT_UPLOAD_MAX_FILE_SIZE;
};

export const getChatAudioMaxFileSize = (): number => {
  const fromBytes = Number(process.env.CHAT_AUDIO_MAX_FILE_SIZE_BYTES);
  if (Number.isFinite(fromBytes) && fromBytes > 0) {
    return fromBytes;
  }
  const fromMb = Number(process.env.CHAT_AUDIO_MAX_FILE_SIZE_MB);
  if (Number.isFinite(fromMb) && fromMb > 0) {
    return fromMb * 1024 * 1024;
  }
  return DEFAULT_CHAT_AUDIO_MAX_FILE_SIZE;
};

export const ALLOWED_CHAT_FILE_EXTENSIONS = new Set<string>([
  // Images & Icons
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.svg',
  '.bmp',
  '.dib',
  '.tiff',
  '.tif',
  '.ico',
  '.avif',
  '.heic',
  '.heif',
  '.emf',
  '.wmf',
  // Audio
  '.mp3',
  '.wav',
  '.webm',
  '.ogg',
  '.m4a',
  // Documents & Data
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.xml',
  '.docx',
  '.xlsx',
  '.pptx',
  '.doc',
  '.xls',
  '.ppt',
  // Code, Scripts, Logs & Configs (DevOps / Tech Assistant)
  '.log',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.yaml',
  '.yml',
  '.conf',
  '.ini',
  '.env',
  '.toml',
  '.properties',
]);

export const ALLOWED_AUDIO_EXTENSIONS = new Set<string>([
  '.mp3',
  '.wav',
  '.webm',
  '.ogg',
  '.m4a',
  '.flac',
  '.aac',
]);

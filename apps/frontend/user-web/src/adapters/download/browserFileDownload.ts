export interface DownloadUrlOptions {
  headers?: HeadersInit;
  fallbackFilename?: string;
}

const resolveFilename = (
  contentDisposition: string | null,
  fallbackFilename: string,
): string => {
  if (!contentDisposition) {
    return fallbackFilename;
  }

  const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;]+)/i);
  if (!filenameMatch?.[1]) {
    return fallbackFilename;
  }

  return decodeURIComponent(filenameMatch[1].trim().replace(/['"]/g, ""));
};

export const downloadFileFromUrl = async (
  url: string,
  options: DownloadUrlOptions = {},
): Promise<string> => {
  if (
    typeof window === "undefined"
    || typeof document === "undefined"
    || typeof window.URL?.createObjectURL !== "function"
  ) {
    throw new Error("当前环境不支持文件下载");
  }

  const response = await fetch(url, {
    headers: options.headers,
  });

  if (!response.ok) {
    throw new Error("文件下载失败");
  }

  const filename = resolveFilename(
    response.headers.get("Content-Disposition"),
    options.fallbackFilename || "download.bin",
  );
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  window.URL.revokeObjectURL(objectUrl);
  document.body.removeChild(link);
  return filename;
};

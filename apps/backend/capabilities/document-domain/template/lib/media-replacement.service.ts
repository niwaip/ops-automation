import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

interface ImageRelationship {
  rId: string;
  target: string;
  type: string;
}

export class MediaReplacementService {
  async processMediaFiles(
    zip: JSZip,
    data: any,
    format: 'docx' | 'xlsx' | 'pptx' | 'html'
  ): Promise<void> {
    if (!data.images && !data.d?.images && !data.screenshots && !data.d?.screenshots) {
      return;
    }

    const imagesData =
      data.images || data.d?.images || data.screenshots || data.d?.screenshots || [];
    if (!Array.isArray(imagesData) || imagesData.length === 0) {
      return;
    }

    const mediaPath =
      format === 'docx'
        ? 'word/media'
        : format === 'xlsx'
          ? 'xl/media'
          : format === 'pptx'
            ? 'ppt/media'
            : null;

    if (!mediaPath) {
      return;
    }

    const relationshipsPath =
      format === 'docx'
        ? 'word/_rels/document.xml.rels'
        : format === 'xlsx'
          ? 'xl/_rels/workbook.xml.rels'
          : format === 'pptx'
            ? 'ppt/_rels/presentation.xml.rels'
            : null;

    const existingMediaFiles = zip.file(
      new RegExp(mediaPath.replace('/', '\\/') + '\\/image\\d+\\.[a-z]+')
    );
    const existingImageCount = existingMediaFiles.length;

    for (let i = 0; i < imagesData.length; i += 1) {
      const imageData = imagesData[i];
      if (!imageData) {
        continue;
      }

      try {
        const imageBuffer = await this.loadImageBuffer(imageData);
        if (!imageBuffer) {
          continue;
        }

        const imageExtension = this.getImageExtension(imageBuffer, imageData);
        const imageContentType = this.getImageContentType(imageExtension);

        if (i < existingMediaFiles.length) {
          const existingFile = existingMediaFiles[i];
          const existingName = existingFile.name;
          const existingExt = path.extname(existingName);

          if (existingExt !== imageExtension) {
            await this.updateImageExtension(
              zip,
              existingName,
              imageExtension,
              imageContentType,
              format
            );
          }

          zip.file(existingName, imageBuffer);
          continue;
        }

        const newImageName = `${mediaPath}/image${existingImageCount + i + 1}${imageExtension}`;
        zip.file(newImageName, imageBuffer);
        await this.addImageRelationship(zip, relationshipsPath, newImageName);
        await this.updateContentTypes(zip, imageExtension, imageContentType);
      } catch (error) {
        console.warn(`Failed to process image ${i}:`, error);
      }
    }
  }

  private async loadImageBuffer(imageData: any): Promise<Buffer | null> {
    try {
      if (imageData.url) {
        const response = await fetch(imageData.url);
        if (!response.ok) {
          console.warn(`Failed to fetch image from URL: ${imageData.url}`);
          return null;
        }
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer);
      }
      if (imageData.base64) {
        return Buffer.from(imageData.base64, 'base64');
      }
      if (imageData.path) {
        return fs.readFileSync(imageData.path);
      }
      if (imageData.buffer) {
        return imageData.buffer;
      }
    } catch (error) {
      console.warn('Error loading image buffer:', error);
    }

    return null;
  }

  private getImageExtension(buffer: Buffer, imageData: any): string {
    if (imageData.extension) {
      return imageData.extension.startsWith('.') ? imageData.extension : `.${imageData.extension}`;
    }
    if (imageData.fileName) {
      const ext = path.extname(imageData.fileName);
      if (ext) {
        return ext;
      }
    }

    if (buffer.length >= 4) {
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return '.png';
      }
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return '.jpg';
      }
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return '.gif';
      }
    }

    return '.png';
  }

  private getImageContentType(extension: string): string {
    const ext = extension.toLowerCase().replace('.', '');
    const types: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      bmp: 'image/bmp',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      webp: 'image/webp',
    };
    return types[ext] || 'image/png';
  }

  private async updateImageExtension(
    zip: JSZip,
    oldFileName: string,
    newExtension: string,
    newContentType: string,
    format: 'docx' | 'xlsx' | 'pptx' | 'html'
  ): Promise<void> {
    const oldExt = path.extname(oldFileName);
    const newFileName = oldFileName.replace(oldExt, newExtension);
    const relsPaths =
      format === 'docx'
        ? [
            'word/_rels/document.xml.rels',
            'word/_rels/header1.xml.rels',
            'word/_rels/footer1.xml.rels',
          ]
        : [];

    for (const relsPath of relsPaths) {
      const relsFile = zip.file(relsPath);
      if (!relsFile) {
        continue;
      }
      const content = await relsFile.async('text');
      const updated = content.replace(
        new RegExp(`Target="${oldFileName.replace(/\//g, '\\/')}"`, 'g'),
        `Target="${newFileName}"`
      );
      zip.file(relsPath, updated);
    }

    await this.updateContentTypes(zip, oldExt, newContentType, true);
  }

  private async addImageRelationship(
    zip: JSZip,
    relationshipsPath: string | null,
    imageTarget: string
  ): Promise<void> {
    if (!relationshipsPath) {
      return;
    }

    const relsFile = zip.file(relationshipsPath);
    if (!relsFile) {
      return;
    }

    const relsContent = await relsFile.async('text');
    const existingIds = this.extractImageRelationshipsFromXml(relsContent, '')
      .map((relationship) => relationship.rId)
      .filter((id) => id.startsWith('rId'));

    const maxId = existingIds.reduce((max, id) => {
      const num = parseInt(id.replace('rId', ''), 10);
      return Math.max(max, num);
    }, 0);

    const newRId = `rId${maxId + 1}`;
    const imageType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
    const newRelationship = `<Relationship Id="${newRId}" Type="${imageType}" Target="${imageTarget}"/>`;
    const updated = relsContent.replace('</Relationships>', `${newRelationship}\n</Relationships>`);
    zip.file(relationshipsPath, updated);
  }

  private extractImageRelationshipsFromXml(
    xmlContent: string,
    mediaPath: string
  ): ImageRelationship[] {
    const relationships: ImageRelationship[] = [];
    const relPattern = /<Relationship\s+Id="([^"]+)"\s+Type="([^"]+)"\s+Target="([^"]+)"[^\/]*\/>/g;
    let match: RegExpExecArray | null;

    while ((match = relPattern.exec(xmlContent)) !== null) {
      const rId = match[1];
      const type = match[2];
      const target = match[3];

      if (type.includes('image') || target.includes('media/image')) {
        relationships.push({
          rId,
          target: target.startsWith(mediaPath) ? target : `${mediaPath}/${target}`,
          type,
        });
      }
    }

    return relationships;
  }

  private async updateContentTypes(
    zip: JSZip,
    extension: string,
    contentType: string,
    isReplacement: boolean = false
  ): Promise<void> {
    const contentTypesPath = '[Content_Types].xml';
    const ctFile = zip.file(contentTypesPath);
    if (!ctFile) {
      return;
    }

    const ctContent = await ctFile.async('text');
    const extPattern = new RegExp(
      `<Default\\s+Extension="${extension.replace('.', '')}"[^\\/]*\\/`
    );
    const exists = extPattern.test(ctContent);

    if (!exists && !isReplacement) {
      const newDefault = `<Default Extension="${extension.replace('.', '')}" ContentType="${contentType}"/>`;
      const updated = ctContent.replace('</Types>', `${newDefault}\n</Types>`);
      zip.file(contentTypesPath, updated);
    }
  }
}

import { AISuggestion } from '../../app/store';
import { PPTAPI } from '../office/powerpoint/api';
import { HostCapabilities } from './capabilities';
import { Anchor, DocumentElement, DocumentIR, DocumentSelection, TemplateSource } from './document-ir';
import { HostAdapter } from './types';

export class PowerPointAdapter implements HostAdapter {
  host = 'ppt' as const;

  async getCapabilities(): Promise<HostCapabilities> {
    return {
      canExtractDocument: true,
      canExtractSelection: false,
      canPreviewSuggestion: false,
      canApplySuggestion: false,
      canExportTemplateSource: true,
      warnings: ['PowerPoint 目前仅接入结构提取，shape 锚点回写仍待完善'],
    };
  }

  async extractDocument(): Promise<DocumentIR> {
    const slides = await PPTAPI.getSlidesContent();
    const elements: DocumentElement[] = [];
    const anchors: Anchor[] = [];

    slides.forEach((slide, slideIndex) => {
      const slideId = `ppt-slide-${slideIndex}`;
      elements.push({
        id: slideId,
        type: 'slide',
        text: slide.shapes.map((shape) => shape.text).filter(Boolean).join('\n'),
        hostData: {
          slideId: slide.index,
        },
      });

      slide.shapes.forEach((shape, shapeIndex) => {
        const anchorId = `ppt-shape-${slideIndex}-${shapeIndex}`;
        elements.push({
          id: `ppt-shape-element-${slideIndex}-${shapeIndex}`,
          type: 'shape',
          text: shape.text,
          anchorIds: [anchorId],
          hostData: {
            slideId: slide.index,
            shapeId: shape.id,
            shapeType: shape.type,
          },
        });

        anchors.push({
          id: anchorId,
          type: 'ppt-shape',
          text: shape.text,
          ref: {
            slideId: slide.index,
            shapeId: shape.id,
            shapeType: shape.type,
          },
        });
      });
    });

    const shapeCount = slides.reduce((total, slide) => total + slide.shapes.length, 0);

    return {
      host: this.host,
      metadata: {},
      elements,
      anchors,
      stats: {
        slideCount: slides.length,
        shapeCount,
      },
    };
  }

  async extractSelection(): Promise<DocumentSelection | null> {
    return null;
  }

  async previewSuggestion(_suggestion: AISuggestion): Promise<void> {
    throw new Error('PowerPoint 预览尚未接入稳定 shape 锚点');
  }

  async applySuggestion(_suggestion: AISuggestion): Promise<void> {
    throw new Error('PowerPoint 回写尚未接入稳定 shape 锚点');
  }

  async exportTemplateSource(): Promise<TemplateSource> {
    const slides = await PPTAPI.getSlidesContent();

    return {
      format: 'pptx',
      content: JSON.stringify(slides),
      mode: 'json',
      isBinaryFile: false,
      warnings: ['当前仍导出为幻灯片 JSON 摘要，尚未接入完整 pptx 文件导出'],
    };
  }
}

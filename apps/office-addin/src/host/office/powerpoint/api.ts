export const PPTAPI = {
  /**
   * 获取所有幻灯片内容
   */
  async getSlidesContent(): Promise<Array<{
    index: string;
    shapes: Array<{ type: string; text: string; id: string }>;
  }>> {
    return new Promise((resolve, reject) => {
      PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;
        slides.load('items');
        await context.sync();

        const slideData = [];
        for (const slide of slides.items) {
          const shapes = slide.shapes;
          shapes.load('items');
          await context.sync();

          const shapeData = shapes.items.map((shape) => {
            shape.load('type,textFrame');
            return shape;
          });
          await context.sync();

          slideData.push({
            index: slide.id,
            shapes: shapeData.map((s) => ({
              type: s.type,
              text: s.textFrame?.textRange?.text || '',
              id: s.id,
            })),
          });
        }
        resolve(slideData);
      }).catch(reject);
    });
  },

  /**
   * 获取整个演示文稿内容摘要
   */
  async getDocumentContent(): Promise<string> {
    const slides = await this.getSlidesContent();
    return JSON.stringify(slides);
  },

  /**
   * 在幻灯片形状中插入标记
   */
  async insertMarkerInShape(slideId: string, shapeId: string, marker: string): Promise<void> {
    return new Promise((resolve, reject) => {
      PowerPoint.run(async (context) => {
        const slide = context.presentation.slides.getItem(slideId);
        const shape = slide.shapes.getItem(shapeId);
        shape.textFrame.textRange.text = marker;
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  /**
   * 创建幻灯片循环标记（复制幻灯片作为模板）
   */
  async setupSlideLoop(slideId: string, arrayPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      PowerPoint.run(async (context) => {
        // PowerPoint 不直接支持循环，需要通过特殊标记实现
        const slide = context.presentation.slides.getItem(slideId);
        const shapes = slide.shapes;
        shapes.load('items');
        await context.sync();

        // 在第一个形状中添加循环注释
        if (shapes.items.length > 0) {
          const firstShape = shapes.items[0];
          firstShape.load('textFrame');
          await context.sync();
          const currentText = firstShape.textFrame.textRange.text;
          firstShape.textFrame.textRange.text = `{{SLIDE_LOOP:${arrayPath}}}${currentText}`;
        }
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },
};

/**
 * 通用 Office API
 */

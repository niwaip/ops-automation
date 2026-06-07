export async function getDocumentContent(): Promise<string> {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const body = context.document.body;
      body.load('text');
      await context.sync();
      resolve(body.text);
    }).catch(reject);
  });
}

export async function getDocumentOoxml(): Promise<string> {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const body = context.document.body;
      const ooxml = body.getOoxml();
      await context.sync();
      console.log('OOXML length:', ooxml.value?.length);
      resolve(ooxml.value);
    }).catch((error) => {
      console.error('获取OOXML失败:', error);
      reject(error);
    });
  });
}

export async function getDocumentStructure(): Promise<{
  paragraphs: Array<{ text: string; index: number }>;
  tables: Array<{ rows: number; cols: number; content: string[][]; index: number }>;
  images: Array<{ index: number; altText: string }>;
}> {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const paragraphs = context.document.body.paragraphs;
      paragraphs.load('text');
      await context.sync();

      const tables = context.document.body.tables;
      tables.load('items');
      await context.sync();

      const tableData: Array<{ rows: number; cols: number; content: string[][]; index: number }> = [];
      for (let i = 0; i < tables.items.length; i += 1) {
        const table = tables.items[i];
        table.load('rowCount,columnCount');
        const rows = table.rows;
        rows.load('items');
        await context.sync();

        const content: string[][] = [];
        for (const row of rows.items) {
          const cells = row.cells;
          cells.load('items');
          await context.sync();
          cells.items.forEach((cell) => {
            cell.body.load('text');
          });
          await context.sync();
          content.push(cells.items.map((cell) => cell.body.text));
        }

        tableData.push({
          rows: table.rowCount,
          cols: content[0]?.length || 0,
          content,
          index: i,
        });
      }

      const images = context.document.body.inlinePictures;
      images.load('items');
      await context.sync();

      resolve({
        paragraphs: paragraphs.items.map((p, idx) => ({
          text: p.text,
          index: idx,
        })),
        tables: tableData,
        images: images.items.map((img, idx) => ({
          index: idx,
          altText: img.altTextTitle || img.altTextDescription || '',
        })),
      });
    }).catch(reject);
  });
}

export async function getContentControls(): Promise<
  Array<{
    id: number;
    title: string;
    tag: string;
    text: string;
    type: string;
    subtype?: string;
    appearance?: string;
    cannotDelete: boolean;
    cannotEdit: boolean;
    parentTableCell?: { rowIndex: number; cellIndex: number } | null;
  }>
> {
  return new Promise((resolve) => {
    Word.run(async (context) => {
      const controls = context.document.contentControls;
      controls.load('items');
      await context.sync();

      for (const control of controls.items) {
        control.load('id,title,tag,text,type,subtype,appearance,cannotDelete,cannotEdit');
        control.parentTableCellOrNullObject.load('isNullObject,rowIndex,cellIndex');
      }
      await context.sync();

      resolve(
        controls.items.map((control) => ({
          id: control.id,
          title: control.title || '',
          tag: control.tag || '',
          text: control.text || '',
          type: String(control.type || ''),
          subtype: control.subtype ? String(control.subtype) : undefined,
          appearance: control.appearance ? String(control.appearance) : undefined,
          cannotDelete: Boolean(control.cannotDelete),
          cannotEdit: Boolean(control.cannotEdit),
          parentTableCell: control.parentTableCellOrNullObject.isNullObject
            ? null
            : {
                rowIndex: control.parentTableCellOrNullObject.rowIndex,
                cellIndex: control.parentTableCellOrNullObject.cellIndex,
              },
        })),
      );
    }).catch((error) => {
      console.warn('getContentControls error:', error);
      resolve([]);
    });
  });
}

export async function getTableCells(): Promise<
  Array<{
    tableIndex: number;
    rowIndex: number;
    cellIndex: number;
    text: string;
  }>
> {
  return new Promise((resolve) => {
    Word.run(async (context) => {
      const tables = context.document.body.tables;
      tables.load('items');
      await context.sync();

      const cellsData: Array<{
        tableIndex: number;
        rowIndex: number;
        cellIndex: number;
        text: string;
      }> = [];

      for (let tableIndex = 0; tableIndex < tables.items.length; tableIndex += 1) {
        const table = tables.items[tableIndex];
        const rows = table.rows;
        rows.load('items');
        await context.sync();

        for (const row of rows.items) {
          const cells = row.cells;
          cells.load('items');
          await context.sync();

          for (const cell of cells.items) {
            cell.load('rowIndex,cellIndex');
            cell.body.load('text');
          }
          await context.sync();

          for (const cell of cells.items) {
            cellsData.push({
              tableIndex,
              rowIndex: cell.rowIndex,
              cellIndex: cell.cellIndex,
              text: cell.body.text || '',
            });
          }
        }
      }

      resolve(cellsData);
    }).catch((error) => {
      console.warn('getTableCells error:', error);
      resolve([]);
    });
  });
}

export async function getParagraphsWithFormat(): Promise<
  Array<{
    text: string;
    index: number;
    format: {
      fontSize?: number;
      isBold?: boolean;
      alignment?: string;
      isTitle?: boolean;
      style?: string;
      styleBuiltIn?: string;
      isListItem?: boolean;
      listLevel?: number;
      listString?: string;
      listId?: number;
    };
  }>
> {
  return new Promise((resolve) => {
    Word.run(async (context) => {
      const paragraphs = context.document.body.paragraphs;
      paragraphs.load('items');
      await context.sync();

      const ranges: Array<{
        paragraph: any;
        range: any;
        listItem: any;
        list: any;
        index: number;
      }> = [];

      for (let i = 0; i < paragraphs.items.length; i += 1) {
        const paragraph = paragraphs.items[i] as any;
        paragraph.load('text,style,styleBuiltIn,isListItem');
        const listItem = paragraph.listItemOrNullObject || paragraph.listItem;
        if (listItem) {
          listItem.load('level,listString');
        }
        const list = paragraph.listOrNullObject || paragraph.list;
        if (list) {
          list.load('id');
        }
        const range = paragraphs.items[i].getRange(Word.RangeLocation.whole);
        range.load('font/size,font/bold,alignment');
        ranges.push({ paragraph, range, listItem, list, index: i });
      }
      await context.sync();

      resolve(
        ranges.map(({ paragraph, range, listItem, list, index }) => {
          const fontSize = range.font.size || 12;
          const isBold = range.font.bold || false;
          const alignment = range.alignment;
          const style = typeof paragraph.style === 'string' ? paragraph.style : '';
          const styleBuiltIn =
            typeof paragraph.styleBuiltIn === 'string' ? paragraph.styleBuiltIn : '';
          const isListItem = Boolean(paragraph.isListItem);
          const listLevel = isListItem && typeof listItem?.level === 'number' ? listItem.level : undefined;
          const listString =
            isListItem && typeof listItem?.listString === 'string' ? listItem.listString : '';
          const listId = isListItem && typeof list?.id === 'number' ? list.id : undefined;

          return {
            text: paragraph.text,
            index,
            format: {
              fontSize,
              isBold,
              alignment:
                alignment === Word.Alignment.left
                  ? 'left'
                  : alignment === Word.Alignment.centered
                    ? 'center'
                    : alignment === Word.Alignment.right
                      ? 'right'
                      : 'justified',
              isTitle: (fontSize > 14 || isBold) && paragraph.text.trim().length < 50,
              style,
              styleBuiltIn,
              isListItem,
              listLevel,
              listString,
              listId,
            },
          };
        }),
      );
    }).catch((error) => {
      console.error('getParagraphsWithFormat error:', error);
      resolve([]);
    });
  });
}

export async function getImagesBase64(): Promise<
  Array<{
    index: number;
    altText: string;
    base64: string;
    width: number;
    height: number;
  }>
> {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const images = context.document.body.inlinePictures;
      images.load('items');
      await context.sync();

      const result: Array<{
        index: number;
        altText: string;
        base64: string;
        width: number;
        height: number;
      }> = [];

      for (let i = 0; i < images.items.length; i += 1) {
        const img = images.items[i];
        img.load('altTextTitle,altTextDescription,width,height');
        const imageBase64 = img.getBase64ImageSrc();
        await context.sync();

        result.push({
          index: i,
          altText: img.altTextTitle || img.altTextDescription || '',
          base64: imageBase64.value || '',
          width: img.width || 0,
          height: img.height || 0,
        });
      }

      resolve(result);
    }).catch(reject);
  });
}

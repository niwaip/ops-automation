import { Logger } from '@nestjs/common';
import { DocumentElement } from '../document-structure.service';

const logger = new Logger('StudioBlankExtractor');

export function calculateContextOverlap(context1: string, context2: string): number {
  if (!context1 || !context2) return 0;

  // 提取核心文本（去掉空白部分）
  const text1 = context1.replace(/[\s＿_]+/g, '').trim();
  const text2 = context2.replace(/[\s＿_]+/g, '').trim();

  if (text1 === text2) return 1;

  // 计算字符重叠率
  const shorter = text1.length < text2.length ? text1 : text2;
  const longer = text1.length >= text2.length ? text1 : text2;

  // 检查较短文本是否是较长文本的子串
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // 计算共同字符数
  let commonChars = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      commonChars++;
    }
  }

  return commonChars / longer.length;
}

/**
 * 根据空白信息推断变量路径
 */
export function inferVariablePath(beforeBlank: string, type: string, templateType: string): string {
  // 使用已有标签映射进行推断
  const labelMappings: Record<string, string> = {
    甲方: 'd.partyA.name',
    甲方地址: 'd.partyA.address',
    甲方签字: 'd.partyA.signature',
    乙方: 'd.partyB.name',
    乙方地址: 'd.partyB.address',
    乙方签字: 'd.partyB.signature',
    地址: 'd.address',
    签字: 'd.signature',
    盖章: 'd.seal',
    年份: 'd.year',
    附件: 'd.attachmentName',
    保密期限: 'd.confidentialityPeriod',
    签订日期: 'd.signDate',
    日期: 'd.date',
  };

  // 直接匹配
  for (const [label, path] of Object.entries(labelMappings)) {
    if (beforeBlank.includes(label) || label.includes(beforeBlank)) {
      return path;
    }
  }

  // 默认路径
  return `d.field${Date.now() % 100}`;
}

/**
 * 从原文中提取指定章节的内容
 */
export function extractSectionContent(fullContent: string, sectionName: string): string {
  // 尝试匹配章节标题
  const sectionPattern = new RegExp(
    `${sectionName.replace(/[：:]/g, '[：:]')}[\\s\\S]*?(?=第[一二三四五六七八九十]+条|第[一二三四五六七八九十]+章|$)`,
    'i'
  );
  const match = fullContent.match(sectionPattern);

  if (match) {
    return match[0].substring(0, Math.min(2000, match[0].length));
  }

  // 如果无法精确匹配，返回文档背景部分
  return fullContent.substring(0, Math.min(2000, fullContent.length));
}
export function mergeUnderlineInfo(
  existingBlanks: Array<{
    text: string;
    context: string;
    beforeBlank: string;
    position: number;
    type: string;
    chapter: string;
    significance: string;
  }>,
  underlineInfo: Array<{
    text: string;
    underlineType: string;
    paragraphText: string;
    paragraphIndex?: number; // 段落索引（用于精确定位）
    position: { start: number; end: number };
  }>,
  documentContent: string,
  templateType: string
): Array<{
  text: string;
  context: string;
  beforeBlank: string;
  position: number;
  type: 'date' | 'blank' | 'underline';
  chapter: string;
  significance: string;
}> {
  // 直接使用 underlineInfo 作为参数来源，不与 existingBlanks 合并
  // 因为 underlineInfo 来自 Word JS API，是最精确的下划线检测结果
  const result: Array<{
    text: string;
    context: string;
    beforeBlank: string;
    position: number;
    type: 'date' | 'blank' | 'underline';
    chapter: string;
    significance: string;
  }> = [];

  const chapterStructure = extractChapterStructure(documentContent);
  logger.debug(`mergeUnderlineInfo: 收到 ${underlineInfo.length} 个下划线位置`);

  for (const underline of underlineInfo) {
    // 检查下划线文本是否包含空白（空格、下划线、制表符等）
    const hasBlank = underline.text.match(/[＿_\s　\t]+/);

    // 如果下划线文本主要是空白，这是需要参数化的位置
    // 纯空格文本 trim() 后为空字符串，长度为0，所以 0 < length * 0.3 是 true
    const isBlankUnderline = underline.text.trim().length < underline.text.length * 0.3;

    // 使用段落文本和精确位置来判断重复（同一段落中位置相近才算重复）
    const isDuplicate = result.some(
      (b) =>
        b.context === underline.paragraphText && Math.abs(b.position - underline.position.start) < 3
    );

    logger.debug(
      `下划线 #${result.length + 1}: "${underline.text.substring(0, 20)}..." (${underline.text.length}字符) - hasBlank:${!!hasBlank}, isBlank:${isBlankUnderline}, duplicate:${isDuplicate}`
    );

    // 所有 underlineInfo 都应该被加入（因为已经通过 font.underline 检查）
    if (!isDuplicate) {
      // 提取下划线前面的文本作为标签
      const paragraphText = underline.paragraphText;
      const beforeUnderline = paragraphText.substring(0, underline.position.start);
      const labelMatch = beforeUnderline.match(/([^\s：:]+)[：:]?\s*$/);
      const label = labelMatch ? labelMatch[1].trim() : '';

      // 获取所在章节
      const chapterInfo = getChapterForPosition(underline.position.start, chapterStructure);

      // 判断意义
      const significance =
        getSignificanceForLabel(label, templateType) || '带下划线的空白位置，用于填写相关内容';

      result.push({
        text: underline.text,
        context: underline.paragraphText.substring(
          Math.max(0, underline.position.start - 15),
          Math.min(underline.paragraphText.length, underline.position.end + 15)
        ),
        beforeBlank: label,
        position: underline.position.start,
        type: 'underline' as const, // 类型：下划线空白（使用 const 断言）
        chapter: chapterInfo,
        significance: significance,
      });
    }
  }

  logger.debug(`mergeUnderlineInfo: 最终返回 ${result.length} 个参数位置`);
  return result;
}
export function extractBlankPatterns(
  content: string,
  templateType: string
): Array<{
  text: string;
  context: string; // 前后文本作为上下文
  beforeBlank: string; // 空白前面的文本（用于精确标签匹配）
  position: number;
  type: 'blank' | 'date' | 'underline';
  chapter: string; // 所在章节信息（如"第一条"、"第二条"）
  significance: string; // 项目意义/用途说明
}> {
  const patterns: Array<{
    text: string;
    context: string;
    beforeBlank: string;
    position: number;
    type: 'blank' | 'date' | 'underline';
    chapter: string;
    significance: string;
  }> = [];

  // 首先提取章节结构，用于后续定位
  const chapterStructure = extractChapterStructure(content);

  // 定义排除列表：不应该作为空白填充的位置
  const excludePatterns = [
    /^第[一二三四五六七八九十百千]+[条章][：:]?\s*$/, // 章节标题（如"第一条："）
    /^\d+[.、：:]\s*$/, // 数字编号（如"1."、"2、"）
    /^[一二三四五六七八九十]+[、：:]\s*$/, // 中文编号
  ];

  let match: RegExpExecArray | null;

  // ===== 核心：只检测下划线+空格 =====

  // 1. 日期格式作为整体（____年__月__日 或 年 月 日）
  // 这是最常见的日期填写位置
  const dateBlankRegex =
    /[＿_]{2,}年[＿_]{2,}月[＿_]{2,}日|[\s　]{2,}年[\s　]{2,}月[\s　]{2,}日|[＿_\s　]{2,}年[＿_\s　]{2,}月[＿_\s　]{2,}日/g;
  while ((match = dateBlankRegex.exec(content)) !== null) {
    const startPos = Math.max(0, match.index - 20);
    const endPos = Math.min(content.length, match.index + match[0].length + 20);
    const beforeBlankStart = Math.max(0, match.index - 30);
    const beforeBlank = content.substring(beforeBlankStart, match.index).trim();

    const chapterInfo = getChapterForPosition(match.index, chapterStructure);
    const significance = '合同签署日期，用于记录合同正式签订的时间';

    patterns.push({
      text: match[0],
      context: content.substring(startPos, endPos),
      beforeBlank: beforeBlank || '签订日期',
      position: match.index,
      type: 'date',
      chapter: chapterInfo,
      significance,
    });
  }

  // 2. 单独的下划线（至少3个）
  // 这是最典型的空白填充标记
  const underlineRegex = /[＿_]{3,}/g;
  while ((match = underlineRegex.exec(content)) !== null) {
    // TypeScript类型断言：在while循环内match不为null
    const m = match;
    const startPos = Math.max(0, m.index - 20);
    const endPos = Math.min(content.length, m.index + m[0].length + 20);
    const beforeBlankStart = Math.max(0, m.index - 30);
    const beforeBlank = content.substring(beforeBlankStart, m.index).trim();

    // 检查是否在排除位置（章节标题等）
    const isExcluded = excludePatterns.some((p) => p.test(beforeBlank));
    if (isExcluded) {
      continue;
    }

    // 检查是否已经被日期格式覆盖
    const isDatePart = patterns.some(
      (p) => Math.abs(p.position - m.index) < 10 && p.type === 'date'
    );
    if (isDatePart) {
      continue;
    }

    const chapterInfo = getChapterForPosition(m.index, chapterStructure);
    const significance =
      getSignificanceForLabel(beforeBlank, templateType) || '带下划线的空白位置，需要填写相关内容';

    patterns.push({
      text: m[0],
      context: content.substring(startPos, endPos),
      beforeBlank,
      position: m.index,
      type: 'underline',
      chapter: chapterInfo,
      significance,
    });
  }

  // 3. 多个空格（至少5个，提高阈值减少误识别）
  // 某些合同使用空格表示空白填充位置
  const spaceRegex = /[ 　]{5,}/g;
  while ((match = spaceRegex.exec(content)) !== null) {
    // TypeScript类型断言：在while循环内match不为null
    const m = match;
    const startPos = Math.max(0, m.index - 20);
    const endPos = Math.min(content.length, m.index + m[0].length + 20);
    const beforeBlankStart = Math.max(0, m.index - 30);
    const beforeBlank = content.substring(beforeBlankStart, m.index).trim();

    // 检查是否在排除位置
    const isExcluded = excludePatterns.some((p) => p.test(beforeBlank));
    if (isExcluded) {
      continue;
    }

    // 检查是否已经被其他模式覆盖
    const isCovered = patterns.some((p) => Math.abs(p.position - m.index) < 10);
    if (isCovered) {
      continue;
    }

    // 检查是否后面有"的"等连接词（可能是地址+名称的组合）
    const afterBlank = content.substring(m.index + m[0].length, m.index + m[0].length + 10);
    if (afterBlank.match(/^(的|公司)/)) {
      // 这是地址类型的空白，保留
      const chapterInfo = getChapterForPosition(m.index, chapterStructure);
      const significance = getSignificanceForLabel(beforeBlank, templateType) || '空白填充位置';

      patterns.push({
        text: m[0],
        context: content.substring(startPos, endPos),
        beforeBlank,
        position: m.index,
        type: 'blank',
        chapter: chapterInfo,
        significance,
      });
    }
  }

  // 按位置排序
  patterns.sort((a, b) => a.position - b.position);

  // 简化的去重逻辑：只基于位置去重
  const uniquePatterns: typeof patterns = [];
  const usedPositions = new Set<number>();

  for (const pattern of patterns) {
    // 检查是否位置过于接近（间隔小于10字符认为是重复）
    const isNearDuplicate =
      usedPositions.has(pattern.position) ||
      Array.from(usedPositions).some((pos) => Math.abs(pos - pattern.position) < 10);

    if (isNearDuplicate) {
      logger.debug(`跳过位置相近的空白: 标签="${pattern.beforeBlank}", 位置=${pattern.position}`);
      continue;
    }

    uniquePatterns.push(pattern);
    usedPositions.add(pattern.position);
  }

  logger.log(`提取空白位置完成，共 ${uniquePatterns.length} 个（只保留下划线+空格）`);
  return uniquePatterns;
}

/**
 * 提取文档章节结构
 * 用于精确定位空白所在位置
 */
export function extractChapterStructure(
  content: string
): Array<{ title: string; startPos: number; endPos: number }> {
  const chapters: Array<{ title: string; startPos: number; endPos: number }> = [];

  // 匹配常见的章节标题格式
  // 第X条、第一条、第二条、第一章、第二章、一、二、1.、2.、1.1等
  const chapterPatterns = [
    // 第X条格式
    /第[一二三四五六七八九十百千]+条[：:\s]*/g,
    // 第X章格式
    /第[一二三四五六七八九十百千]+章[：:\s]*/g,
    // 数字编号格式（如：一、二、三、）
    /^[一二三四五六七八九十]+[、：:\s]+/g,
    // 数字点格式（如：1. 2. 3.）
    /^\d+[.、：:\s]+/g,
    // 数字子章节格式（如：1.1 1.2）
    /^\d+\.\d+[.、：:\s]+/g,
  ];

  // 合并所有匹配结果
  const allMatches: Array<{ title: string; position: number }> = [];

  for (const pattern of chapterPatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      // 获取完整的章节标题行
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineEnd = content.indexOf('\n', match.index);
      const fullLine = content.substring(lineStart, lineEnd > 0 ? lineEnd : content.length).trim();

      if (fullLine.length > 0) {
        allMatches.push({
          title: fullLine.substring(0, Math.min(50, fullLine.length)), // 截取前50字符
          position: lineStart,
        });
      }
    }
  }

  // 按位置排序并设置结束位置
  allMatches.sort((a, b) => a.position - b.position);

  for (let i = 0; i < allMatches.length; i++) {
    const chapter = allMatches[i];
    const nextChapter = allMatches[i + 1];
    chapters.push({
      title: chapter.title,
      startPos: chapter.position,
      endPos: nextChapter ? nextChapter.position : content.length,
    });
  }

  // 如果没有找到章节，添加一个默认的"正文"章节
  if (chapters.length === 0) {
    chapters.push({
      title: '正文',
      startPos: 0,
      endPos: content.length,
    });
  }

  logger.debug(`提取到 ${chapters.length} 个章节结构`);
  return chapters;
}

/**
 * 根据位置获取所在章节
 */
export function getChapterForPosition(
  position: number,
  chapters: Array<{ title: string; startPos: number; endPos: number }>
): string {
  for (const chapter of chapters) {
    if (position >= chapter.startPos && position < chapter.endPos) {
      return chapter.title;
    }
  }
  return '正文';
}

/**
 * 根据标签获取字段意义说明
 */
export function getSignificanceForLabel(label: string, templateType: string): string {
  // 扩展的意义说明映射表，覆盖更多常见字段
  const significanceMap: Record<string, Record<string, string>> = {
    contract: {
      甲方: '合同第一签署方，通常是合同的主要责任方',
      乙方: '合同第二签署方，通常是合同的配合责任方',
      甲方名称: '甲方公司或个人的完整名称',
      乙方名称: '乙方公司或个人的完整名称',
      甲方地址: '甲方注册地址或实际办公地址',
      乙方地址: '乙方注册地址或实际办公地址',
      甲方签字: '甲方签字区域，用于确认合同内容',
      乙方签字: '乙方签字区域，用于确认合同内容',
      甲方盖章: '甲方公章印章位置，用于确认合同效力',
      乙方盖章: '乙方公章印章位置，用于确认合同效力',
      签订日期: '合同签署日期，记录合同正式签订的时间',
      生效日期: '合同开始生效的日期',
      截止日期: '合同有效期终止的日期',
      合同金额: '合同涉及的金额总数',
      合同编号: '合同唯一编号，用于归档和查询',
      法定代表人: '公司法定的代表人姓名',
      联系电话: '用于业务沟通的电话号码',
      地址: '地址信息，用于联系和送达',
      签字: '签字区域，用于确认合同内容',
      盖章: '盖章区域，用于公司公章确认',
      年份: '合同签订年份',
      年: '合同签订年份',
      保密期限: '保密义务的有效期限，如"三年"或"五年"',
      附件: '附件名称或描述，用于列明合同附件内容',
      附件一: '第一个附件的名称或描述',
      附件二: '第二个附件的名称或描述',
      项目名称: '合同涉及的项目名称',
      项目: '合同涉及的项目名称',
      争议: '争议解决方式说明',
      仲裁: '仲裁机构名称或地点',
    },
    report: {
      标题: '报告的标题名称',
      日期: '报告生成日期',
      作者: '报告撰写人',
      摘要: '报告内容摘要',
      结论: '报告结论或建议',
    },
    invoice: {
      金额: '发票金额',
      日期: '发票开具日期',
      编号: '发票编号',
      公司: '公司名称',
      项目: '项目名称',
    },
    certificate: {
      姓名: '证书持有者姓名',
      日期: '证书颁发日期',
      编号: '证书编号',
      有效期: '证书有效期限',
    },
  };

  const templateMap = significanceMap[templateType] || significanceMap['contract'];

  // 尝试直接匹配
  if (templateMap[label]) {
    return templateMap[label];
  }

  // 尝试关键词匹配（更宽松）
  for (const [key, value] of Object.entries(templateMap)) {
    if (label.includes(key) || key.includes(label)) {
      return value;
    }
  }

  // 根据标签关键词生成更有意义的默认描述
  const defaultDescriptions: Record<string, string> = {
    甲方: '甲方相关填写内容',
    乙方: '乙方相关填写内容',
    地址: '地址填写位置',
    名称: '名称填写位置',
    签字: '签字确认区域',
    盖章: '盖章确认区域',
    日期: '日期填写位置',
    年份: '年份填写位置',
    金额: '金额填写位置',
    编号: '编号填写位置',
    附件: '附件相关填写内容',
    保密: '保密条款相关内容',
    期限: '期限时间填写位置',
  };

  // 检查关键词并返回有意义的描述
  for (const [keyword, desc] of Object.entries(defaultDescriptions)) {
    if (label.includes(keyword)) {
      return desc;
    }
  }

  // 最终默认值：根据标签生成描述
  return label.trim() ? `${label.trim()}的填写位置` : '文档中需要填充的字段';
}

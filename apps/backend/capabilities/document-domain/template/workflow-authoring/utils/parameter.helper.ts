import { Logger } from '@nestjs/common';

const logger = new Logger('StudioParameterHelper');

export function generateFallbackSuggestions(
  patterns: Array<{
    text: string;
    context: string;
    beforeBlank?: string;
    position: number;
    type: string;
    chapter?: string;
    significance?: string;
  }>,
  templateType: string,
  startIndex: number = 0
): any[] {
  const suggestions: any[] = [];
  logger.debug(
    `Generating suggestions for ${patterns.length} patterns, templateType: ${templateType}`
  );

  // 更精确的关键词映射 - 根据空白前面的标签来匹配
  // 每个标签映射到具体的变量路径，包含详细的语言说明
  const labelMappings: Record<string, { path: string; confidence: number; description: string }> = {
    // ===== 甲乙双方相关 =====
    // 甲方信息（合同的第一个签署方）
    甲方: {
      path: 'd.partyA.name',
      confidence: 0.9,
      description: '甲方名称，合同的第一个签署方名称',
    },
    甲方名称: { path: 'd.partyA.name', confidence: 0.95, description: '甲方公司或个人名称' },
    甲方地址: { path: 'd.partyA.address', confidence: 0.95, description: '甲方注册地址或办公地址' },
    甲方电话: { path: 'd.partyA.phone', confidence: 0.95, description: '甲方联系电话' },
    甲方联系人: { path: 'd.partyA.contact', confidence: 0.95, description: '甲方联系人姓名' },
    甲方代表: {
      path: 'd.partyA.representative',
      confidence: 0.95,
      description: '甲方法定代表人或授权代表',
    },
    甲方签字: { path: 'd.partyA.signature', confidence: 0.95, description: '甲方签字区域' },
    甲方盖章: { path: 'd.partyA.seal', confidence: 0.9, description: '甲方公章印章位置' },
    甲方身份证: { path: 'd.partyA.idNumber', confidence: 0.95, description: '甲方身份证号码' },
    甲方开户行: { path: 'd.partyA.bank', confidence: 0.95, description: '甲方开户银行名称' },
    甲方账号: { path: 'd.partyA.accountNo', confidence: 0.95, description: '甲方银行账号' },

    // 乙方信息（合同的第二个签署方）
    乙方: {
      path: 'd.partyB.name',
      confidence: 0.9,
      description: '乙方名称，合同的第二个签署方名称',
    },
    乙方名称: { path: 'd.partyB.name', confidence: 0.95, description: '乙方公司或个人名称' },
    乙方地址: { path: 'd.partyB.address', confidence: 0.95, description: '乙方注册地址或办公地址' },
    乙方电话: { path: 'd.partyB.phone', confidence: 0.95, description: '乙方联系电话' },
    乙方联系人: { path: 'd.partyB.contact', confidence: 0.95, description: '乙方联系人姓名' },
    乙方代表: {
      path: 'd.partyB.representative',
      confidence: 0.95,
      description: '乙方法定代表人或授权代表',
    },
    乙方签字: { path: 'd.partyB.signature', confidence: 0.95, description: '乙方签字区域' },
    乙方盖章: { path: 'd.partyB.seal', confidence: 0.9, description: '乙方公章印章位置' },
    乙方身份证: { path: 'd.partyB.idNumber', confidence: 0.95, description: '乙方身份证号码' },
    乙方开户行: { path: 'd.partyB.bank', confidence: 0.95, description: '乙方开户银行名称' },
    乙方账号: { path: 'd.partyB.accountNo', confidence: 0.95, description: '乙方银行账号' },

    // ===== 日期时间相关 =====
    // 合同签署和生效日期
    签订日期: { path: 'd.signDate', confidence: 0.95, description: '合同签署日期' },
    签署日期: { path: 'd.signDate', confidence: 0.95, description: '合同签署日期' },
    签订于: { path: 'd.signDate', confidence: 0.9, description: '合同签订时间点' },
    生效日期: { path: 'd.effectiveDate', confidence: 0.95, description: '合同开始生效的日期' },
    截止日期: { path: 'd.endDate', confidence: 0.95, description: '合同终止日期' },
    有效期: { path: 'd.validPeriod', confidence: 0.9, description: '合同有效期限' },
    日期: { path: 'd.date', confidence: 0.85, description: '通用日期字段' },
    时间: { path: 'd.time', confidence: 0.85, description: '时间字段' },
    年月日: { path: 'd.date', confidence: 0.85, description: '日期格式 年 月 日' },

    // ===== 合同编号相关 =====
    合同编号: { path: 'd.contractNo', confidence: 0.95, description: '合同唯一编号' },
    合同号: { path: 'd.contractNo', confidence: 0.95, description: '合同编号' },
    合同名称: { path: 'd.contractName', confidence: 0.9, description: '合同标题名称' },
    编号: { path: 'd.serialNo', confidence: 0.8, description: '通用编号' },
    文号: { path: 'd.documentNo', confidence: 0.9, description: '文件编号' },

    // ===== 公司信息 =====
    公司: { path: 'd.companyName', confidence: 0.8, description: '公司名称' },
    公司名称: { path: 'd.companyName', confidence: 0.95, description: '公司全称' },
    公司地址: { path: 'd.companyAddress', confidence: 0.95, description: '公司注册地址' },
    法定代表人: {
      path: 'd.legalRepresentative',
      confidence: 0.95,
      description: '公司法定代表人姓名',
    },

    // ===== 地址相关 =====
    地址: { path: 'd.address', confidence: 0.85, description: '地址信息' },
    住所: { path: 'd.address', confidence: 0.9, description: '住所地址' },
    住所地: { path: 'd.address', confidence: 0.9, description: '住所所在地' },

    // ===== 金额相关 =====
    金额: { path: 'd.amount', confidence: 0.85, description: '金额数值' },
    总金额: { path: 'd.totalAmount', confidence: 0.95, description: '合同总金额' },
    合同金额: { path: 'd.contractAmount', confidence: 0.95, description: '合同涉及的金额' },
    付款金额: { path: 'd.paymentAmount', confidence: 0.95, description: '付款金额' },
    单价: { path: 'd.unitPrice', confidence: 0.9, description: '单位价格' },
    总价: { path: 'd.totalPrice', confidence: 0.9, description: '总价金额' },
    定金: { path: 'd.deposit', confidence: 0.9, description: '定金金额' },
    保证金: { path: 'd.securityDeposit', confidence: 0.9, description: '保证金金额' },

    // ===== 项目/产品相关 =====
    项目: { path: 'd.projectName', confidence: 0.85, description: '项目名称' },
    项目名称: { path: 'd.projectName', confidence: 0.95, description: '项目全称' },
    产品: { path: 'd.productName', confidence: 0.85, description: '产品名称' },
    产品名称: { path: 'd.productName', confidence: 0.95, description: '产品全称' },
    商品: { path: 'd.productName', confidence: 0.85, description: '商品名称' },

    // ===== 数量相关 =====
    数量: { path: 'd.quantity', confidence: 0.9, description: '数量' },
    规格: { path: 'd.specification', confidence: 0.85, description: '产品规格' },

    // ===== 签字/盖章相关 =====
    签字: { path: 'd.signature', confidence: 0.85, description: '签字区域' },
    盖章: { path: 'd.seal', confidence: 0.85, description: '盖章区域' },
    签名: { path: 'd.signature', confidence: 0.85, description: '签名' },

    // ===== 联系方式 =====
    电话: { path: 'd.phone', confidence: 0.85, description: '电话号码' },
    联系电话: { path: 'd.phone', confidence: 0.95, description: '联系电话' },
    手机: { path: 'd.mobile', confidence: 0.9, description: '手机号码' },
    邮箱: { path: 'd.email', confidence: 0.85, description: '电子邮箱' },
    传真: { path: 'd.fax', confidence: 0.85, description: '传真号码' },

    // ===== 其他常见字段 =====
    备注: { path: 'd.notes', confidence: 0.8, description: '备注说明' },
    说明: { path: 'd.description', confidence: 0.8, description: '说明内容' },
    附件: { path: 'd.attachments', confidence: 0.8, description: '附件列表' },
    名称: { path: 'd.name', confidence: 0.75, description: '通用名称字段' },
    账号: { path: 'd.accountNo', confidence: 0.9, description: '账号号码' },
    开户行: { path: 'd.bank', confidence: 0.9, description: '开户银行' },
    身份证: { path: 'd.idNumber', confidence: 0.9, description: '身份证号码' },
    税号: { path: 'd.taxNo', confidence: 0.9, description: '纳税人识别号' },
  };

  // 记录已使用的路径和标签，避免重复
  const usedPaths: Set<string> = new Set();
  const usedLabels: Set<string> = new Set();

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    let suggestedPath = `d.field${i + 1}`;
    let confidence = 0.5;

    // 使用 beforeBlank 进行精确标签匹配（如果可用）
    // 提取冒号/等号前面的文字作为标签
    const beforeBlankText = pattern.beforeBlank || pattern.context;
    const labelMatch = beforeBlankText.match(/([^\s：:=]+)[：:=]?$/);
    if (labelMatch) {
      const label = labelMatch[1].trim();
      logger.debug(`Pattern ${i}: beforeBlank="${beforeBlankText}", extracted label="${label}"`);

      // 精确匹配标签
      for (const [mappingLabel, mapping] of Object.entries(labelMappings)) {
        if (
          label === mappingLabel ||
          label.includes(mappingLabel) ||
          mappingLabel.includes(label)
        ) {
          if (!usedPaths.has(mapping.path)) {
            suggestedPath = mapping.path;
            confidence = mapping.confidence;
            logger.debug(
              `Pattern ${i}: matched label "${label}" -> ${suggestedPath} (confidence: ${confidence})`
            );
            break;
          }
        }
      }
    }

    // 如果标签匹配失败，尝试从完整上下文的关键词匹配
    if (suggestedPath === `d.field${i + 1}`) {
      for (const [keyword, mapping] of Object.entries(labelMappings)) {
        if (pattern.context.includes(keyword) && !usedPaths.has(mapping.path)) {
          suggestedPath = mapping.path;
          confidence = mapping.confidence - 0.1;
          logger.debug(`Pattern ${i}: matched keyword "${keyword}" -> ${suggestedPath}`);
          break;
        }
      }
    }

    // 确保路径唯一
    if (suggestedPath !== `d.field${i + 1}` && !usedPaths.has(suggestedPath)) {
      usedPaths.add(suggestedPath);
    } else if (suggestedPath !== `d.field${i + 1}` && usedPaths.has(suggestedPath)) {
      let counter = 1;
      const base = suggestedPath.replace(/\d+$/, '');
      while (usedPaths.has(`${base}${counter}`)) {
        counter++;
      }
      suggestedPath = `${base}${counter}`;
      confidence = 0.6;
      usedPaths.add(suggestedPath);
    } else if (!usedPaths.has(suggestedPath)) {
      usedPaths.add(suggestedPath);
    }

    // 获取匹配到的描述（用于显示项目意义）
    let matchedDescription = '';
    if (suggestedPath !== `d.field${i + 1}`) {
      for (const [mappingLabel, mapping] of Object.entries(labelMappings)) {
        if (suggestedPath === mapping.path) {
          matchedDescription = mapping.description;
          break;
        }
      }
    }

    // 优先使用pattern中的significance，如果没有则使用matchedDescription
    const finalSignificance = pattern.significance || matchedDescription || '文档中需要填充的字段';
    const finalChapter = pattern.chapter || '正文';

    // 生成格式化的显示位置：【前文空白后文】格式
    const beforeText = pattern.beforeBlank || pattern.context?.slice(0, 10) || '';
    const afterText = pattern.context?.slice(-10) || '';
    const displayPosition = `【${beforeText.trim().slice(-8)} _____ ${afterText.trim().slice(0, 8)}】`;

    suggestions.push({
      id: `sugg-${Date.now()}-${startIndex + i}`, // 使用全局索引
      type: 'variable',
      elementPath: displayPosition, // 使用格式化的显示位置
      suggestedName: suggestedPath,
      originalText: pattern.text,
      confidence,
      applied: false,
      context: pattern.context,
      details: {
        chapter: finalChapter, // 章节信息（用于分组显示）
        significance: finalSignificance, // 项目意义说明
        displayPosition, // 格式化的位置显示
        formatter:
          suggestedPath.includes('date') || suggestedPath.includes('Date')
            ? 'formatDate(YYYY-MM-DD)'
            : suggestedPath.includes('amount') || suggestedPath.includes('Price')
              ? 'formatNumber(#,##0.00)'
              : null,
      },
    });
  }

  return suggestions;
}

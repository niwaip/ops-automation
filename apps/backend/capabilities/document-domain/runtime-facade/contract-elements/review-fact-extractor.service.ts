import { Injectable } from '@nestjs/common';
import type { ExtractedLegalFacts } from './review-element.types';

@Injectable()
export class ReviewFactExtractorService {
  /**
   * Extract structured legal facts from clause text and title
   */
  extractClauseFacts(text: string, title: string = ''): ExtractedLegalFacts {
    const combined = `${title} ${text}`.toLowerCase();
    const facts: ExtractedLegalFacts = {};

    // 1. 工期计算口径提取
    if (/交付|工期|周期|开发进度|交货/i.test(combined)) {
      if (/自然日|日历日/i.test(combined)) {
        facts.deliveryDayType = 'calendar_day';
      } else if (/工作日/i.test(combined)) {
        facts.deliveryDayType = 'working_day';
      } else {
        facts.deliveryDayType = 'unspecified';
      }

      const daysMatch = combined.match(/(\d+)\s*(?:个)?(?:工作日|自然日|日历日|天|日)/);
      if (daysMatch) {
        facts.deliveryDays = parseInt(daysMatch[1], 10);
      }
    }

    // 2. 保密期限要素提取
    if (/保密期限|保密义务|存续期|保密有效期/i.test(combined)) {
      facts.isPerpetualDuration = /永久|无期限|一直有效|无论协议终止与否.*均持续有效|永远/i.test(combined);
      facts.isTradeSecretSurvivalDifferentiated = /商业秘密.*存续|技术秘密.*保持|秘密状态/i.test(combined);

      const yearsMatch = combined.match(/(\d+)\s*(?:个)?年/);
      if (yearsMatch) {
        facts.confidentialityYears = parseInt(yearsMatch[1], 10);
      }
    }

    // 3. 违约责任限额与违约金费率要素提取
    if (/责任上限|赔偿上限|限额|赔偿总额|责任限制/i.test(combined)) {
      facts.hasLiabilityCap = true;
      if (/无限责任|不设上限|无任何限制/i.test(combined)) {
        facts.liabilityCapType = 'unlimited';
      } else if (/合同总额|合同价款|协议总价|采购总额/i.test(combined)) {
        facts.liabilityCapType = 'percentage';
        const percentMatch = combined.match(/(\d+(?:\.\d+)?)\s*%/);
        if (percentMatch) {
          facts.capPercentage = parseFloat(percentMatch[1]);
        }
      } else if (/已付.*费用|实际支付.*款项/i.test(combined)) {
        facts.liabilityCapType = 'paid_amount';
      }
    }

    if (/违约金|迟延|延期|滞纳金/i.test(combined)) {
      const dailyMatch =
        combined.match(/(?:每日|每迟延一日|每逾期一日|按日|迟延违约金)[^\d千百万%]{0,6}(\d+(?:\.\d+)?)\s*%/i) ||
        combined.match(/(\d+(?:\.\d+)?)\s*%/i);
      if (dailyMatch) {
        facts.dailyDamagesRate = parseFloat(dailyMatch[1]) / 100;
      } else if (/千分之([一二两三四五六七八九十\d]+)/.test(combined)) {
        const cnNumMap: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
        const m = combined.match(/千分之([一二两三四五六七八九十\d]+)/);
        const val = m ? (cnNumMap[m[1]] || parseFloat(m[1])) : 1;
        facts.dailyDamagesRate = val / 1000;
      } else if (/万分之([一二两三四五六七八九十\d]+)/.test(combined)) {
        const cnNumMap: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
        const m = combined.match(/万分之([一二两三四五六七八九十\d]+)/);
        const val = m ? (cnNumMap[m[1]] || parseFloat(m[1])) : 1;
        facts.dailyDamagesRate = val / 10000;
      }
    }

    // 4. 争议管辖要素提取
    if (/争议解决|管辖|诉讼|仲裁/i.test(combined)) {
      if (/仲裁/i.test(combined)) {
        facts.forumType = 'arbitration';
      } else if (/法院|诉讼/i.test(combined)) {
        facts.forumType = 'court';
      }

      if (/原告所在地|甲方所在地|甲方住所地|原告住所地/i.test(combined)) {
        facts.forumLocation = 'buyer_venue';
      } else if (/被告所在地|乙方所在地|开发方所在地|供货方所在地|被告住所地/i.test(combined)) {
        facts.forumLocation = 'seller_venue';
      } else {
        facts.forumLocation = 'neutral_venue';
      }
    }

    // 5. 源码交付与验收要素提取
    if (/交付|源代码|源码|验收|试运行/i.test(combined)) {
      facts.hasSourceCodeDelivery = /源代码|源码|构建脚本|数据库字典/i.test(combined);
      facts.isDeemedAcceptedEnabled = /视为验收合格|单方确认|默示通过/i.test(combined);

      const trialMatch = combined.match(/试运行.*?(?:不少于)?\s*(\d+)\s*(?:个)?(?:工作日|天|日)/);
      if (trialMatch) {
        facts.trialPeriodDays = parseInt(trialMatch[1], 10);
      }
    }

    // 6. 知识产权归属要素提取
    if (/知识产权|成果归属|著作权/i.test(combined)) {
      if (/独家归.*甲方|全部归.*甲方|所有权自.*交付.*甲方所有/i.test(combined)) {
        facts.ipOwnershipType = 'custom_exclusive';
      } else if (/共有|双方共同所有/i.test(combined)) {
        facts.ipOwnershipType = 'shared';
      } else if (/乙方保留|归开发方所有|属于乙方所有/i.test(combined)) {
        facts.ipOwnershipType = 'supplier_retained';
      } else if (/许可甲方使用|非排他许可/i.test(combined)) {
        facts.ipOwnershipType = 'license_only';
      }

      facts.hasThirdPartyInfringementIndemnity =
        /侵犯第三方|知识产权侵权|不侵犯任何第三方|侵权抗辩|免受损害/i.test(combined);
    }

    // 7. 付款前置条件要素提取
    if (/付款|结算|支付|账期/i.test(combined)) {
      facts.isPaymentTiedToInternalAudit =
        /内部审计|集团审批|以最终审计结果为准|集团资金计划/i.test(combined);

      const payDaysMatch = combined.match(/(?:收到发票|验收合格).*?(\d+)\s*(?:个)?(?:工作日|日|天)/);
      if (payDaysMatch) {
        facts.paymentTermsDays = parseInt(payDaysMatch[1], 10);
      }
    }

    return facts;
  }
}

import { Injectable } from '@nestjs/common';
import type { ContractType } from './contract-review.types';

export interface ContractTypeInfo {
  type: ContractType;
  displayName: string;
  defaultPosition: 'buyer' | 'seller' | 'neutral';
  description: string;
}

@Injectable()
export class ContractTypeClassifierService {
  private readonly typeMetadata: Record<string, ContractTypeInfo> = {
    nda: {
      type: 'nda',
      displayName: '商业保密协议 (NDA)',
      defaultPosition: 'seller',
      description: '针对商业机密保护、保密期限、除外披露及违约责任的专项合规审查',
    },
    software_development: {
      type: 'software_development',
      displayName: '软件定制研发与系统集成合同',
      defaultPosition: 'buyer',
      description: '关注源代码知识产权归属、开源合规、交付工期、验收测试标准及第三方侵权抗辩',
    },
    procurement: {
      type: 'procurement',
      displayName: '企业采购与设备供货合同',
      defaultPosition: 'buyer',
      description: '审查标的交付、质保承诺、账期审批、不可抗力与延期违约金口径',
    },
    employment: {
      type: 'employment',
      displayName: '劳动雇佣与竞业限制协议',
      defaultPosition: 'neutral',
      description: '依照劳动合同法审查试用期、法定解除、经济补偿、竞业限制及保密义务',
    },
    lease: {
      type: 'lease',
      displayName: '房屋与商业不动产租赁合同',
      defaultPosition: 'buyer',
      description: '审查租金递增、押金退还、转租权限、修缮责任与提前解约违约金',
    },
    general: {
      type: 'general',
      displayName: '通用商业合作协议',
      defaultPosition: 'buyer',
      description: '通用合同民事法律审查，涵盖主体资质、管辖权、不可抗力与违约赔偿上限',
    },
  };

  constructor() {
    // Backward-compatibility aliases for legacy keys
    this.typeMetadata.software_dev = this.typeMetadata.software_development;
    this.typeMetadata.labor = this.typeMetadata.employment;
  }

  classify(
    fileName: string = '',
    contentSnippet: string = '',
    explicitType?: string
  ): ContractTypeInfo {
    // 1. Explicit override for specific contract types (generic fallback 'general' does not preempt specific detection)
    if (
      explicitType &&
      explicitType !== 'auto' &&
      explicitType.toLowerCase().trim() !== 'general'
    ) {
      const normalized = explicitType.toLowerCase().trim();
      if (normalized === 'software_dev' || normalized === 'software_development') {
        return this.typeMetadata.software_development;
      }
      if (normalized === 'labor' || normalized === 'employment') {
        return this.typeMetadata.employment;
      }
      if (normalized in this.typeMetadata) {
        return this.typeMetadata[normalized];
      }
      if (
        normalized.includes('nda') ||
        normalized.includes('保密') ||
        normalized.includes('秘密保持') ||
        normalized.includes('守秘義務') ||
        normalized.includes('機密保持')
      ) {
        return this.typeMetadata.nda;
      }
      if (
        normalized.includes('开发') ||
        normalized.includes('软件') ||
        normalized.includes('研发') ||
        normalized.includes('software') ||
        normalized.includes('開発') ||
        normalized.includes('受託') ||
        normalized.includes('システム')
      ) {
        return this.typeMetadata.software_development;
      }
      if (
        normalized.includes('采购') ||
        normalized.includes('买卖') ||
        normalized.includes('供货') ||
        normalized.includes('売買') ||
        normalized.includes('購買') ||
        normalized.includes('調達') ||
        normalized.includes('供給')
      ) {
        return this.typeMetadata.procurement;
      }
      if (
        normalized.includes('劳动') ||
        normalized.includes('用工') ||
        normalized.includes('竞业') ||
        normalized.includes('employ') ||
        normalized.includes('雇用') ||
        normalized.includes('労働') ||
        normalized.includes('就業')
      ) {
        return this.typeMetadata.employment;
      }
      if (
        normalized.includes('租赁') ||
        normalized.includes('租房') ||
        normalized.includes('lease') ||
        normalized.includes('賃貸') ||
        normalized.includes('リース')
      ) {
        return this.typeMetadata.lease;
      }
    }

    const titleAndHeader = `${fileName} ${contentSnippet.slice(0, 300)}`.toLowerCase();
    const combined = `${fileName} ${contentSnippet.slice(0, 1500)}`.toLowerCase();

    // 2. High-priority specific transaction types matching Title / Header / FileName
    if (
      /软件开发|定制开发|定制研发|系统集成|软件定制|技术开发|技术研发|平台开发|代码交付|源代码|开发及联调|运维平台.*研发|ソフトウェア開発|システム開発|開発委託|業務委託|受託開発|システム構築/i.test(
        titleAndHeader
      ) ||
      /软件开发|定制开发|定制研发|系统集成|软件定制|ソフトウェア開発|システム開発|開発委託|業務委託/i.test(fileName)
    ) {
      return this.typeMetadata.software_development;
    }

    if (
      /采购主协议|采购合同|采购协议|买卖合同|订购合同|供货协议|设备采购|売買契約|購買契約|調達契約|供給契約|売買基本契約|購買基本契約|設備売買/i.test(titleAndHeader) ||
      /采购|供货|买卖|売買|購買|調達|供給/i.test(fileName)
    ) {
      return this.typeMetadata.procurement;
    }

    if (
      /劳动合同|聘用协议|员工入职|竞业限制|劳务派遣|雇用契約|労働契約|就業規則|労働者派遣/i.test(titleAndHeader) ||
      /劳动|聘用|竞业|雇用|労働/i.test(fileName)
    ) {
      return this.typeMetadata.employment;
    }

    if (
      /租赁合同|租赁协议|房屋租赁|商铺租赁|厂房租赁|賃貸借契約|リース契約|建物賃貸借|土地賃貸借|事業用建物賃貸借/i.test(titleAndHeader) ||
      /租赁|租房|賃貸借|リース/i.test(fileName)
    ) {
      return this.typeMetadata.lease;
    }

    // 3. Genuine NDA matching title or standalone NDA contract
    if (
      /保密协议|保密承诺书?|保密合同|保密协议书|nondisclosure|non-disclosure|\bnda\b|秘密保持契約|守秘義務契約|機密保持契約|相互秘密保持/i.test(
        titleAndHeader
      ) ||
      /保密协议|保密承诺|保密合同|\bnda\b|秘密保持|守秘義務|機密保持/i.test(fileName)
    ) {
      return this.typeMetadata.nda;
    }

    // 4. Secondary fallback checking broader combined text
    if (
      /软件开发|定制开发|定制研发|系统集成|软件定制|技术开发|技术研发|平台开发|代码交付|源代码|开发及联调|ソフトウェア開発|システム開発|開発委託|業務委託|受託開発/i.test(
        combined
      )
    ) {
      return this.typeMetadata.software_development;
    }

    if (
      /采购主协议|采购合同|采购协议|买卖合同|订购合同|供货协议|设备采购|売買契約|購買契約|調達契約|供給契約|売買基本契約|購買基本契約|設備売買/i.test(
        combined
      )
    ) {
      return this.typeMetadata.procurement;
    }

    if (
      /劳动合同|聘用协议|员工入职|竞业限制|保密及竞业|劳务派遣|雇用契約|労働契約|就業規則|労働者派遣/i.test(
        combined
      )
    ) {
      return this.typeMetadata.employment;
    }

    if (
      /租赁合同|租赁协议|房屋租赁|商铺租赁|厂房租赁|賃貸借契約|リース契約|建物賃貸借|土地賃貸借|事業用建物賃貸借/i.test(
        combined
      )
    ) {
      return this.typeMetadata.lease;
    }

    if (
      /保密协议|保密承诺|保密合同|nondisclosure|non-disclosure|\bnda\b|秘密保持契約|守秘義務契約|機密保持契約|相互秘密保持/i.test(
        combined
      )
    ) {
      return this.typeMetadata.nda;
    }

    // Fallback: General commercial contract
    return this.typeMetadata.general;
  }
}

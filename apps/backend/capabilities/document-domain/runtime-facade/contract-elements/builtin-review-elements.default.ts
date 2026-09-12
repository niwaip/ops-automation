import type { ReviewElementConfig } from './review-element-config.types';

export const BUILTIN_REVIEW_ELEMENTS: ReviewElementConfig[] = [
  // ==========================================
  // 1. 通用商事风控要件 (COMM)
  // ==========================================
  {
    id: 'comm_dispute_unfavorable_forum',
    code: 'COMM-01',
    version: '1.0.0',
    title: '争议司法管辖约定对我方不利',
    category: 'DISPUTE_AND_GOVERNING',
    applicableContractTypes: ['general', 'software_development', 'procurement', 'lease', 'nda'],
    applicablePosition: 'buyer',
    severity: 'HIGH',
    checkType: 'SUBSTANTIVE',
    criteria: {
      factField: 'forumLocation',
      factCondition: { operator: 'equals', targetValue: 'seller_venue' },
      patterns: [
        '(乙方所在地|开发方所在地|供货方所在地|被告所在地|向被告住所地)',
      ],
    },
    positionPolarity: {
      seller_venue: {
        seller: {
          riskLevel: 'LOW',
          summaryTemplate: '约定由我方（乙方/供货方）所在地人民法院管辖，有利于降低异地诉讼维权成本。',
          adviceTemplate: '该管辖约定对我方有利，建议保留。',
        },
        buyer: {
          riskLevel: 'HIGH',
          summaryTemplate: '约定由对方（乙方）所在地人民法院管辖，一旦发生争议我方将面临高昂的异地诉讼维权成本与潜在地方司法保护阻力。',
          adviceTemplate: '建议约定由原告所在地人民法院管辖或中立权威仲裁委员会解决。',
          elementId: 'comm_dispute_unfavorable_forum',
          elementCode: 'COMM-01',
        },
      },
      buyer_venue: {
        buyer: {
          riskLevel: 'LOW',
          summaryTemplate: '约定由我方（甲方/采购方）所在地人民法院管辖，有利于降低维权成本。',
          adviceTemplate: '该管辖约定对我方有利，建议保留。',
        },
        seller: {
          riskLevel: 'HIGH',
          summaryTemplate: '约定由对方（甲方）所在地人民法院管辖，显著增加我方异地应诉与维权成本。',
          adviceTemplate: '建议约定由原告所在地人民法院管辖或选定中立仲裁机构。',
          elementId: 'comm_dispute_unfavorable_forum',
          elementCode: 'COMM-01',
        },
      },
    },
    compareRule: {
      mode: 'polarity_lookup',
      summaryTemplates: {
        favorable: '争议管辖变更为有利于我方的管辖地，降低维权成本。',
        unfavorable: '争议管辖被修改为对方所在地，显著增加我方异地诉讼维权成本。',
      },
    },
    riskSummary: '约定由对方所在地法院管辖，一旦发生争议我方将面临高昂的异地诉讼维权成本与潜在地方司法保护阻力。',
    legalAdvice: '建议约定由“原告所在地（我方住所地）人民法院”管辖，或选择中立权威仲裁委员会解决。',
    recommendedRevision: '由原告所在地有管辖权的人民法院管辖',
  },
  {
    id: 'comm_excessive_damages_scope',
    code: 'COMM-02',
    version: '1.0.0',
    title: '违约赔偿范围包含不确定的间接损失或惩罚性赔偿',
    category: 'LIABILITY_AND_REMEDY',
    applicableContractTypes: ['general', 'software_development', 'procurement', 'nda'],
    applicablePosition: 'both',
    severity: 'HIGH',
    checkType: 'SUBSTANTIVE',
    criteria: {
      patterns: [
        '(惩罚性赔偿|赔偿全部间接损失|全部间接损失|商业机会损失|可得利益损失|预期利润损失)',
      ],
      negationPatterns: [
        '(不包括|不承担|不涵盖|排除|不予赔偿|免除|不负责|不负|明确不包含|不在此限|均不包含)[^\\n。；;]{0,15}(惩罚性赔偿|间接损失|商业机会损失|可得利益|预期利润)',
        '(惩罚性赔偿|间接损失|商业机会损失|可得利益|预期利润)[^\\n。；;]{0,15}(不包括|不承担|不涵盖|排除在外|不予赔偿|免责|双方均不|不予支持)',
      ],
    },
    compareRule: {
      mode: 'damages_scope',
      numericDirection: 'increase_is_risk',
      summaryTemplates: {
        favorable: '修订条款明确排除了间接损失、商业机会损失或惩罚性赔偿，符合锁定直接损失的风控原则。',
        unfavorable: '修订条款新增了承担惩罚性赔偿或全部间接/可得利益损失，扩大合同赔偿敞口。',
      },
      adviceTemplates: {
        favorable: '该排除条款有利于控制合同责任敞口，建议保留。',
        unfavorable: '建议将赔偿责任严格限定为直接实际财产损失。',
      },
    },
    riskSummary: '约定了承担惩罚性或全部间接/可得利益损失赔偿，在轻微违约情形下可能面临远超合同交易价值的巨额索赔敞口。',
    legalAdvice: '建议以因违约直接造成的“直接实际财产损失”为限，明确排除间接损失、利润损失及商誉损失。',
    recommendedRevision: '赔偿因违约行为直接造成的实际财产损失（明确不包含任何间接损失、利润损失或可得利益损失）',
  },
  {
    id: 'comm_unilateral_termination_imbalance',
    code: 'COMM-03',
    version: '1.0.0',
    title: '单方解除权不对等或随意解除',
    category: 'TERMINATION_AND_SURVIVAL',
    applicableContractTypes: ['general', 'software_development', 'procurement'],
    applicablePosition: 'buyer',
    severity: 'MEDIUM',
    checkType: 'SUBSTANTIVE',
    criteria: {
      patterns: [
        '(一方有权随时通知解除|有权随时解除本协议|单方无条件解除)',
      ],
      negationPatterns: [
        '(双方均有权|对方实质违约|相对方实质违约)',
      ],
    },
    riskSummary: '赋予了单方过宽的无因随时解除权，可能导致我方在投入前期商务与技术成本后合同被对方随意解除且得不到有效救济。',
    legalAdvice: '应确保解除权对等，且行使单方解除权必须基于相对方实质违约，并经过合理期限的书面催告。',
    recommendedRevision: '【法务建议对等条款】：任一方行使单方合同解除权必须基于相对方严重违约，且经书面催告后 15 日内仍未纠正。',
  },
  {
    id: 'missing_force_majeure',
    code: 'COMM-04',
    version: '1.0.0',
    title: '缺失不可抗力及责任免除顺延条款',
    category: 'GENERAL_COMMERCIAL',
    applicableContractTypes: ['general', 'software_development', 'procurement'],
    applicablePosition: 'both',
    severity: 'MEDIUM',
    checkType: 'PRESENCE',
    criteria: {
      patterns: [
        '不可抗力|不能预见[、\\s,，及或与]*不能避免[、\\s,，及或与]*不能克服|自然灾害|战争[、\\s,，及或与]*疫情|政府行为导致.*履行不能',
      ],
    },
    compareRule: {
      mode: 'presence_deletion',
      deletionPolarity: {
        both: {
          riskLevel: 'MEDIUM',
          summaryTemplate: '删除了原合同关键的不可抗力免责与顺延条款，遇突发不可抗力时可能丧失免责抗辩依据。',
          adviceTemplate: '建议恢复不可抗力定义、通知程序及履约顺延保护机制。',
        },
      },
    },
    riskSummary: '合同未约定不可抗力定义、通知程序及责任免除机制，遇到无法预见的重大外部事件时可能无法法定免责。',
    legalAdvice: '建议补齐不可抗力条款，明确发生重大意外事件时的 48 小时通知义务与履约延期责任豁免。',
    recommendedRevision: '因地震、台风、水灾、战争、法律法规变更等不能预见、不能避免并不能克服的不可抗力事件，导致一方不能履行全部或部分义务的，免除受影响方的相应违约责任，履约期限相应顺延。受影响方应在事件发生后 48 小时内书面通知相对方并提供证明。',
  },
  {
    id: 'missing_dispute_resolution',
    code: 'COMM-05',
    version: '1.0.0',
    title: '缺失明确的争议解决与管辖条款',
    category: 'DISPUTE_AND_GOVERNING',
    applicableContractTypes: ['general', 'software_development', 'procurement', 'lease', 'nda'],
    applicablePosition: 'both',
    severity: 'HIGH',
    checkType: 'PRESENCE',
    criteria: {
      patterns: [
        '争议解决|管辖法院|仲裁委员会|提起诉讼|原告所在地.*法院|协商不成.*起诉',
      ],
    },
    compareRule: {
      mode: 'presence_deletion',
      deletionPolarity: {
        both: {
          riskLevel: 'HIGH',
          summaryTemplate: '删除了原合同关键的争议管辖与司法救济条款，可能导致涉诉时管辖法院不确定。',
          adviceTemplate: '建议保留明确的争议解决地及管辖法院条款。',
        },
      },
    },
    riskSummary: '合同未载明争议解决条款，涉诉时管辖法院难以迅速确定，容易产生管辖异议纠纷并增加异地诉讼成本。',
    legalAdvice: '建议明确适用中华人民共和国法律，并约定由原告住所地人民法院管辖或选定确定仲裁机构。',
    recommendedRevision: '本协议的订立、效力、解释及争议解决均适用中华人民共和国法律。因本协议引起的任何争议，双方应友好协商；协商不成的，任何一方均有权向原告所在地有管辖权的人民法院提起诉讼。',
  },

  // ==========================================
  // 2. 商业保密协议专属要件 (NDA)
  // ==========================================
  {
    id: 'nda_perpetual_duration',
    code: 'NDA-01',
    version: '1.0.0',
    title: '保密期限永久且未区分一般信息与商业秘密',
    category: 'CONFIDENTIALITY',
    applicableContractTypes: ['nda', 'general'],
    applicablePosition: 'both',
    severity: 'HIGH',
    checkType: 'SUBSTANTIVE',
    criteria: {
      factField: 'isPerpetualDuration',
      factCondition: { operator: 'isTrue' },
      patterns: [
        '(永久|无期限|一直有效|无论协议终止与否.*均持续有效|永远)',
      ],
      negationPatterns: [
        '(商业秘密.*存续|除商业秘密外|技术秘密.*秘密状态)',
      ],
    },
    compareRule: {
      mode: 'custom',
      summaryTemplates: {
        unfavorable: '保密期限被修改为永久有效且未区分商业秘密，产生长期无限期保密合规风险。',
      },
      adviceTemplates: {
        unfavorable: '建议将一般商业信息限定为 2~3 年，仅商业秘密存续期有效。',
      },
    },
    riskSummary: '对全部一般商业信息要求无期限/永久承担保密义务，剥夺了普通信息生命周期结束后的合理使用权，形成无限期法律风险敞口。',
    legalAdvice: '建议落实双轨区分：一般商业信息限制为合理期限（2~3 年）；仅依法成立的商业秘密在存续期内持续受保护。',
    recommendedRevision: '自披露之日起算，有效期为 3 年；依法属于商业秘密的信息在其合法保持秘密状态期间持续有效',
  },
  {
    id: 'nda_overbroad_scope',
    code: 'NDA-02',
    version: '1.0.0',
    title: '保密信息定义过于宽泛且未约定明确标记程序',
    category: 'CONFIDENTIALITY',
    applicableContractTypes: ['nda'],
    applicablePosition: 'both',
    severity: 'MEDIUM',
    checkType: 'SUBSTANTIVE',
    criteria: {
      patterns: [
        '(任何信息|一切信息|所有接触的信息)',
      ],
      negationPatterns: [
        '(书面标记|标明.*机密|邮件确认|口头.*确认)',
      ],
    },
    riskSummary: '保密信息缺乏客观的书面标记或口头书面确认程序，极易导致日常工作沟通信息被随意归为机密并主张泄密侵权。',
    legalAdvice: '建议增加程序限制：书面材料应标注“保密”字样；口头信息须在披露后 10 个工作日内以书面形式补充确认。',
    recommendedRevision: '【建议补充增设】：以书面或电子形式提供的保密信息应标明“保密”或“机密”；以口头方式披露的，应在披露后 10 个工作日内向接收方出具书面确认备忘录。',
  },
  {
    id: 'nda_strict_duty_of_care',
    code: 'NDA-03',
    version: '1.0.0',
    title: '过严或不切实际的绝对化注意义务',
    category: 'CONFIDENTIALITY',
    applicableContractTypes: ['nda'],
    applicablePosition: 'both',
    severity: 'MEDIUM',
    checkType: 'SUBSTANTIVE',
    criteria: {
      patterns: [
        '(最高标准|绝对安全|杜绝一切泄密|采取一切可能措施|承担无过错)',
      ],
    },
    riskSummary: '约定了“绝对安全”或“最高标准”等绝对结果义务，实质上将不可归责于接收方的黑客攻击或第三方极端风险全部转嫁。',
    legalAdvice: '建议修正为不低于保护自身同等重要机密的商业合理注意标准（且不低于合理的商业安全措施）。',
    recommendedRevision: '采取不低于保护自身同等重要商业秘密的谨慎与合理注意措施（且在任何情况下不低于合理的商业安全标准）',
  },
  {
    id: 'missing_nda_exceptions',
    code: 'NDA-04',
    version: '1.0.0',
    title: '缺失法定披露与保密除外情形 (严重风控漏洞)',
    category: 'CONFIDENTIALITY',
    applicableContractTypes: ['nda'],
    applicablePosition: 'both',
    severity: 'HIGH',
    checkType: 'PRESENCE',
    thresholds: {
      minRequiredSubItemsCount: 5,
    },
    criteria: {
      requiredSubItems: [
        '(公众(周知|所知|知悉)|进入公知|(已经?|被)公开|非(因)?[^\\n。；;]{0,15}过错[^\\n。；;]{0,25}(知悉|公开|透露)|他方公开|公知)',
        '((披露|透露|签署)前[^\\n。；;]{0,35}(已知|知悉|掌握|占有|获知|拥有)|已为接收方[^\\n。；;]{0,35}(知悉|拥有|掌握|获知)|(签署|披露|透露)前已合法(占有|获知|知悉|拥有)|已经?拥有)',
        '(第三方[^\\n。；;]{0,25}(合法|正当)?[^\\n。；;]{0,25}(取得|获得|提供|披露|获取)|从无保密义务的第三方|从第三方.*获得)',
        '(独立(开发|研发|研制|设计)|独立形成|未(使用|参考)[^\\n。；;]{0,20}保密信息)',
        '(法律[、\\s,，及或与]*法规|司法机关|法院[、\\s,，及或与]*(判决|裁定)|政府(监管|部门|处理程序)|监管机构|命令依法|强制披露|依法律程序披露|强制要求|传票)',
      ],
    },
    compareRule: {
      mode: 'presence_deletion',
      deletionPolarity: {
        both: {
          riskLevel: 'HIGH',
          summaryTemplate: '删除了保密协议关键的法定除外披露情形条款，构成严重合规风控漏洞。',
          adviceTemplate: '必须恢复公知、已知、独立开发及依法强制披露等法定除外情形。',
        },
      },
    },
    riskSummary: '保密协议缺少除外情形约定，意味着即使信息已成为公众周知或司法机关强制调取，我方依然承担保密违约责任，极其危险。',
    legalAdvice: '必须明确五大除外情形：(1)已公开 (2)已掌握 (3)第三方合法取得 (4)独立研发 (5)法律/监管命令强制披露。',
    recommendedRevision: '保密信息不包括以下情形：(1) 在披露前已为接收方合法知悉的信息；(2) 非因接收方过错而已为公众合法知悉的信息；(3) 接收方从对其不负保密义务的第三方合法获得的信息；(4) 接收方未使用披露方保密信息而独立开发形成的信息；(5) 依据法律法规、司法判决或监管部门命令依法强制披露的信息。',
  },
  {
    id: 'missing_nda_return_destroy',
    code: 'NDA-05',
    version: '1.0.0',
    title: '缺失保密介质返还/销毁机制或缺乏自动备份留存例外',
    category: 'CONFIDENTIALITY',
    applicableContractTypes: ['nda'],
    applicablePosition: 'both',
    severity: 'MEDIUM',
    checkType: 'PRESENCE',
    criteria: {
      patterns: [
        '返还|销毁|交回|销毁证明|清除保密数据|删除副本',
      ],
    },
    riskSummary: '协议终止后未约定保密文档及载体的处理程序，或要求绝对物理清除导致违反企业常规数据灾备与法规审计归档合规要求。',
    legalAdvice: '建议明确协议终止后 10 日内返还或销毁，并增加常规自动化电子灾备数据的豁免留存条款。',
    recommendedRevision: '合作终止或披露方书面要求后 10 个工作日内，接收方应返还或安全销毁保密材料。因系统常规自动数据备份机制产生的无法即时删除的电子副本，可继续留存并不再用于日常业务，在留存期内继续受本协议保密义务约束。',
  },
  {
    id: 'nda_excessive_liquidated_damages',
    code: 'NDA-06',
    version: '1.0.0',
    title: '巨额或无过错惩罚性定额违约金',
    category: 'LIABILITY_AND_REMEDY',
    applicableContractTypes: ['nda'],
    applicablePosition: 'seller',
    severity: 'HIGH',
    checkType: 'SUBSTANTIVE',
    criteria: {
      patterns: [
        '违约金.*([0-9]{3,}|[一二两三四五六七八九十百千]+万)|惩罚性赔偿',
      ],
    },
    riskSummary: '约定了与实际潜在损害完全不成比例的巨额固定违约金，在轻微技术性违约时将面临严峻的索赔威胁。',
    legalAdvice: '建议以披露方因违约行为实际遭受的“直接实际经济损失”为限，删除惩罚性高额固定违约金。',
    recommendedRevision: '赔偿因违约泄密行为直接给披露方造成的实际可证明的直接经济损失',
  },

  // ==========================================
  // 3. 软件定制研发与系统集成专属要件 (SOFT)
  // ==========================================
  {
    id: 'missing_source_code_delivery',
    code: 'SOFT-01',
    version: '1.0.0',
    title: '缺失源代码、构建脚本及完整技术文档交付约定',
    category: 'DELIVERY_AND_ACCEPTANCE',
    applicableContractTypes: ['software_development'],
    applicablePosition: 'buyer',
    severity: 'HIGH',
    checkType: 'PRESENCE',
    criteria: {
      affirmativePatterns: [
        '(源代码|源码)[^\\n。；;]{0,15}交付',
        '交付[^\\n。；;]{0,15}(源代码|源码)',
        '提供完整的?(源代码|源码)',
        '交付物[^\\n。；;]{0,20}(源代码|源码|构建脚本)',
        '源代码及完整技术文档',
        '未经混淆的代码',
      ],
      negationPatterns: [
        '(不交付|未提供|不提供|无需交付|无须交付|免于交付|拒绝交付|不予提供|不包含|不包括|不含)[^\\n。；;]{0,12}(源代码|源码|开发文档|构建脚本|数据库字典)',
        '(源代码|源码|构建脚本|技术文档)[^\\n。；;]{0,12}(不交付|不予交付|不包含在内|归乙方独家保留不提供|不转交)',
        '交付物?[仅只]包含?(目标码|安装包|编译后程序|二进制文件|可执行文件)[^\\n。；;]{0,10}(不包含?|不含?|除外)',
      ],
    },
    compareRule: {
      mode: 'presence_deletion',
      deletionPolarity: {
        seller: {
          riskLevel: 'LOW',
          summaryTemplate: '删除了向买方交付源代码及构建脚本的义务，有助于保护我方底层软件资产与商业秘密。',
          adviceTemplate: '删除源码交付对我方（开发方）有利，建议保留。',
        },
        buyer: {
          riskLevel: 'HIGH',
          summaryTemplate: '删除了交付成果物包含源代码与构建脚本的约定，存在严重技术锁定风险。',
          adviceTemplate: '必须恢复完整的源代码、开发文档与构建脚本交付条款。',
        },
      },
    },
    riskSummary: '未明确约定必须交付源代码、数据库字典及技术文档，系统上线后我方将无法自主运维与二次开发，面临严重技术供应商锁定风险。',
    legalAdvice: '必须明确交付成果物不仅包括编译安装包，还必须包括完整的、未经混淆的源代码、数据库字典及部署手册。',
    recommendedRevision: '乙方交付的系统成果不仅包括编译运行程序，还必须包括完整的、未经混淆的源代码、数据库字典、API 接口文档、架构设计说明及构建部署手册。缺少上述任何一项的，视为未完成交付。',
  },
  {
    id: 'soft_ip_ownership_retained',
    code: 'SOFT-02',
    version: '1.0.0',
    title: '定制研发知识产权归属含糊或被供应商保留所有权',
    category: 'INTELLECTUAL_PROPERTY',
    applicableContractTypes: ['software_development'],
    applicablePosition: 'buyer',
    severity: 'HIGH',
    checkType: 'SUBSTANTIVE',
    criteria: {
      factField: 'ipOwnershipType',
      patterns: [
        '(乙方保留|共有|归开发方所有|属于乙方所有|许可甲方使用)',
      ],
      negationPatterns: [
        '(乙方既有通用框架|开源组件)',
      ],
    },
    positionPolarity: {
      supplier_retained: {
        seller: {
          riskLevel: 'LOW',
          summaryTemplate: '定制开发成果由独家转让修改为我方（开发方）保留所有权或普通许可，强化了核心技术资产控制。',
          adviceTemplate: '保留源码知识产权对我方有利，建议保留。',
        },
        buyer: {
          riskLevel: 'HIGH',
          summaryTemplate: '定制开发成果知识产权由独家所有被变更为供应商保留或非排他许可，严重侵蚀核心资产权益。',
          adviceTemplate: '必须明确定制开发成果及源代码独家归我方所有。',
          elementId: 'soft_ip_ownership_retained',
          elementCode: 'SOFT-02',
        },
      },
      license_only: {
        seller: {
          riskLevel: 'LOW',
          summaryTemplate: '定制开发成果授予许可使用，所有权仍归我方所有。',
          adviceTemplate: '该项权属保留对我方有利。',
        },
        buyer: {
          riskLevel: 'HIGH',
          summaryTemplate: '定制开发成果仅授予许可使用，我方未获得所有权，存在严重资产控制风险。',
          adviceTemplate: '应坚持要求取得排他所有权。',
          elementId: 'soft_ip_ownership_retained',
          elementCode: 'SOFT-02',
        },
      },
    },
    compareRule: {
      mode: 'polarity_lookup',
    },
    riskSummary: '我方出资定制研发的软件成果，知识产权未完全归我方独家所有，或仅授予非排他许可，严重侵害我方核心系统资产控制权。',
    legalAdvice: '必须明确约定：本协议项下定制开发形成的全部代码、成果及知识产权自交付之日起独家归我方（甲方）所有。',
    recommendedRevision: '【法务权属锁定条款】：除乙方在合作前已独立拥有的通用基础框架保留原权利并授予我方永久免费排他使用权外，本协议项下全部定制开发形成的代码、文档、技术成果及知识产权自产生之日起均独家归甲方所有。',
  },
  {
    id: 'soft_calendar_day_trap',
    code: 'SOFT-03',
    version: '1.0.0',
    title: '工期计算口径被变更为自然日/日历日陷阱',
    category: 'DELIVERY_AND_ACCEPTANCE',
    applicableContractTypes: ['software_development'],
    applicablePosition: 'both',
    severity: 'HIGH',
    checkType: 'SUBSTANTIVE',
    thresholds: {
      /** 工期换算系数：自然日换算为工作日的比例（可配置覆盖，如未配置则返回不确定） */
      calendarToWorkDayRatio: 0.7142857,
      /** 允许的工期缩水容忍比例（20%） */
      durationReductionToleranceRatio: 0.2,
    },
    criteria: {
      factField: 'deliveryDayType',
      factCondition: { operator: 'equals', targetValue: 'calendar_day' },
      patterns: [
        '(\\d+)\\s*个?(自然日|日历日)|(自然日|日历日)',
      ],
    },
    compareRule: {
      mode: 'numeric_direction',
      numericDirection: 'decrease_is_risk',
      summaryTemplates: {
        favorable: '交付工期有所宽限，履约时间更为充裕。',
        unfavorable: '交付工期被大幅压缩，严重加重延期违约风险。',
        uncertain: '工期计算口径在工作日与自然日之间发生变动，由于未配置工作日换算比例，无法确定实际工期是否缩水，需人工核实。',
      },
      adviceTemplates: {
        favorable: '工期放宽有利于降低延期风险。',
        unfavorable: '建议评估实际研发进度与资源安排，避免承诺难以达成的紧迫周期，或增设节假日对等顺延条款。',
        uncertain: '建议在配置中心明确工作日与自然日的折算比例或人工复核排期。',
      },
    },
    riskSummary: '工期按日历日/自然日计算剥夺了法定节假日与周末研发时间，大幅压缩实际项目开发周期，将显著增加延期违约风险。',
    legalAdvice: '建议坚持采用“工作日”口径计算，或增加因甲方确认延迟、需求变更引起的工期对等顺延条款。',
    recommendedRevision: '工作日（遇法定节假日自动顺延）',
  },
  {
    id: 'soft_strict_acceptance_deemed_pass',
    code: 'SOFT-04',
    version: '1.0.0',
    title: '验收通过条件设置严苛或单方免除试运行门槛（默示签收陷阱）',
    category: 'DELIVERY_AND_ACCEPTANCE',
    applicableContractTypes: ['software_development'],
    applicablePosition: 'buyer',
    severity: 'MEDIUM',
    checkType: 'SUBSTANTIVE',
    criteria: {
      factField: 'isDeemedAcceptedEnabled',
      factCondition: { operator: 'isTrue' },
      patterns: [
        '(视为验收合格|单方确认通过|无任何异议即视为合格|默示通过)',
      ],
    },
    riskSummary: '验收条件中约定默示通过或未约定充分的真实业务场景试运行周期，容易在系统存在隐性缺陷或高并发漏洞时被迫签收。',
    legalAdvice: '必须保留充分的联调与真实业务场景试运行周期（不少于 15 个工作日），并以双方书面盖章签署的《最终验收合格报告》为准。',
    recommendedRevision: '【法务试运行保护条款】：系统正式上线前必须经过不少于 15 个工作日的真实业务试运行期；只有在试运行无重大缺陷且双方书面签署《最终验收合格报告》后方视为验收通过。',
  },
  {
    id: 'missing_thirdparty_infringement_indemnity',
    code: 'SOFT-05',
    version: '1.0.0',
    title: '缺失第三方知识产权侵权兜底免责与抗辩赔偿条款',
    category: 'INTELLECTUAL_PROPERTY',
    applicableContractTypes: ['software_development'],
    applicablePosition: 'buyer',
    severity: 'HIGH',
    checkType: 'PRESENCE',
    criteria: {
      patterns: [
        '侵犯第三方知识产权|侵犯任何第三方.*著作权|不侵权担保|侵权抗辩|免受第三方索赔|赔偿甲方因此遭受的全部经济损失',
      ],
    },
    compareRule: {
      mode: 'presence_deletion',
      deletionPolarity: {
        seller: {
          riskLevel: 'LOW',
          summaryTemplate: '删除了供货方承担第三方知识产权侵权连带抗辩与无限赔偿的义务，减轻了我方连带责任。',
          adviceTemplate: '该删除减轻了卖方连带侵权风险，建议保留。',
        },
        buyer: {
          riskLevel: 'HIGH',
          summaryTemplate: '删除了第三方知识产权侵权兜底免责与抗辩赔偿条款，丧失免责保护。',
          adviceTemplate: '建议恢复供应商知识产权不侵权担保及抗辩条款。',
        },
      },
    },
    riskSummary: '开发方未就交付系统做出不侵权保证与抗辩兜底，若开发方使用了违规侵权代码或闭源盗版组件，我方将面临第三方高额侵权索赔。',
    legalAdvice: '必须要求开发方做出不侵权担保，并在发生侵权索赔时自担费用应诉，赔偿我方全部直接损失、律师费与诉讼费。',
    recommendedRevision: '乙方保证交付的软件成果不侵犯任何第三方的专利权、著作权、商标权或商业秘密。如发生第三方侵权索赔或诉讼，乙方应自担费用积极应诉并承担甲方因此遭受的全部经济损失与合理维权支出（包括赔偿金、诉讼费、公证费及律师费）。',
  },
  {
    id: 'soft_payment_tied_to_internal_audit',
    code: 'SOFT-06',
    version: '1.0.0',
    title: '付款账期前置内部审计审批导致不合理拖延',
    category: 'PAYMENT_AND_SETTLEMENT',
    applicableContractTypes: ['software_development', 'procurement'],
    applicablePosition: 'seller',
    severity: 'HIGH',
    checkType: 'SUBSTANTIVE',
    criteria: {
      factField: 'isPaymentTiedToInternalAudit',
      factCondition: { operator: 'isTrue' },
      patterns: [
        '(经[^\n。；;]{0,10}内部审计[^\n。；;]{0,20}支付|以[^\n。；;]{0,10}审计[^\n。；;]{0,10}为准|完成财政审计后|集团资金计划)',
      ],
    },
    positionPolarity: {
      internal_audit_tied: {
        seller: {
          riskLevel: 'HIGH',
          summaryTemplate: '付款账期新增了内部审计或集团审批前置条件，回款时间失控且增加垫资坏账风险。',
          adviceTemplate: '建议防范以内部审计或非客观条件拖延付款的风险，明确验收合格后固定天数付款。',
          elementId: 'soft_payment_tied_to_internal_audit',
          elementCode: 'SOFT-06',
        },
        buyer: {
          riskLevel: 'LOW',
          summaryTemplate: '付款结算约定了我方内部审计前置流程，符合买方资金内控审批规范。',
          adviceTemplate: '该内控流程对我方（付款方）有利。',
        },
      },
    },
    compareRule: {
      mode: 'polarity_lookup',
    },
    riskSummary: '将付款义务与对方内部非公开、周期不可控的内部审计挂钩，使回款时间完全处于失控状态，存在垫资与拖欠坏账风险。',
    legalAdvice: '建议明确固定的付款时限（如验收合格并收到合规发票后 30 日内付款），删除单方内部审计前置条件。',
    recommendedRevision: '在系统验收合格并收到乙方开具的等额合规增值税发票后 30 日内完成支付',
  },

  // ==========================================
  // 4. 企业采购与供货专属要件 (PROC)
  // ==========================================
  {
    id: 'proc_missing_quality_warranty',
    code: 'PROC-01',
    version: '1.0.0',
    title: '缺失质保期限与售后维修响应机制',
    category: 'DELIVERY_AND_ACCEPTANCE',
    applicableContractTypes: ['procurement'],
    applicablePosition: 'buyer',
    severity: 'HIGH',
    checkType: 'PRESENCE',
    criteria: {
      patterns: [
        '质保期|保修期|质量保证期|免费维修|售后服务',
      ],
    },
    riskSummary: '采购合同未明确质保期限与售后故障响应标准，设备或物资出现质量瑕疵时难以要求供货方承担免费修复或退换责任。',
    legalAdvice: '建议补齐不少于 12 个月的质保期条款，并约定故障发生后 24 小时内上门或响应。',
    recommendedRevision: '供货方对所供标的物提供不少于 12 个月的免费质保期，自最终验收合格之日起算。质保期内发生质量故障的，供货方应在接到通知后 24 小时内响应并免费负责维修或退换。',
  },
];

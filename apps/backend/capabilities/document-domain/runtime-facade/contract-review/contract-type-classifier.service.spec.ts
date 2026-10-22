import { ContractTypeClassifierService } from './contract-type-classifier.service';

describe('ContractTypeClassifierService', () => {
  let service: ContractTypeClassifierService;

  beforeEach(() => {
    service = new ContractTypeClassifierService();
  });

  describe('Japanese contract classification', () => {
    it('correctly classifies Japanese procurement contracts', () => {
      const res = service.classify('CT01-ja.txt', '設備売買契約書\n第1条 目的物及び代金...');
      expect(res.type).toBe('procurement');
    });

    it('correctly classifies Japanese NDA contracts', () => {
      const res = service.classify('CT03-ja.pdf', '相互秘密保持契約書\n第1条 秘密情報の定義...');
      expect(res.type).toBe('nda');
    });

    it('correctly classifies Japanese software development contracts', () => {
      const res = service.classify('CT05-ja.docx', 'ソフトウェア開発委託契約書\n第1条 委託業務...');
      expect(res.type).toBe('software_development');
    });

    it('correctly classifies Japanese commercial lease contracts', () => {
      const res = service.classify('CT06-ja.txt', '事業用建物賃貸借契約書\n第1条 賃貸物件...');
      expect(res.type).toBe('lease');
    });

    it('classifies Japanese contract types when explicitType is provided', () => {
      expect(service.classify('doc.txt', '', '秘密保持').type).toBe('nda');
      expect(service.classify('doc.txt', '', '売買').type).toBe('procurement');
      expect(service.classify('doc.txt', '', '開発委託').type).toBe('software_development');
      expect(service.classify('doc.txt', '', '賃貸借').type).toBe('lease');
      expect(service.classify('doc.txt', '', '雇用').type).toBe('employment');
    });
  });

  describe('Chinese and bilingual contract classification', () => {
    it('classifies Chinese procurement contracts', () => {
      const res = service.classify('CT01-zh.docx', '设备采购合同\n第1条 标的及价款...');
      expect(res.type).toBe('procurement');
    });

    it('classifies bilingual procurement contracts', () => {
      const res = service.classify('CT01-zh-ja.pdf', '设备采购合同 設備売買契約書\n第1条 标的及价款...');
      expect(res.type).toBe('procurement');
    });

    it('does not let explicitType "general" preempt specific contract detection', () => {
      // Even if "general" is passed as default/placeholder, specific titles must still be identified
      expect(
        service.classify('CT01-ja.docx', '設備売買契約書\n第1条 目的物及び代金...', 'general').type
      ).toBe('procurement');
      expect(
        service.classify('CT03-ja.pdf', '相互秘密保持契約書\n第1条 秘密情報の定義...', 'general').type
      ).toBe('nda');
      expect(
        service.classify('CT05-ja.docx', 'ソフトウェア開発委託契約書\n第1条 委託業務...', 'general').type
      ).toBe('software_development');
      expect(
        service.classify('CT06-ja.txt', '事業用建物賃貸借契約書\n第1条 賃貸物件...', 'general').type
      ).toBe('lease');
      // Truly general document still returns general
      expect(
        service.classify('合作框架协议.docx', '双方建立长期战略合作关系，在多领域开展友好协商...', 'general').type
      ).toBe('general');
    });
  });
});

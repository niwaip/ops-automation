class BrowserCommandSearchService {
  resolveResultIndex(value) {
    const indexMap = { 一: 1, 二: 2, 三: 3, first: 1, second: 2 };
    const num = parseInt(value, 10);
    if (!isNaN(num)) return num;
    const lower = value.toLowerCase().trim();
    for (const [k, v] of Object.entries(indexMap)) {
      if (lower.startsWith(k)) return v;
    }
    return null;
  }

  parseEarlyClickTableRow(input) {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) return null;

    const VERBS = '(?:.*?(?:点击|单击|选择|打开|进入|进入到|进|入|访问|查看|click|open))?';
    const TABLE_SCOPE = '(.*?(?:一览表|一览|查询结果|检索结果|列表|结果列表|表格|数据表|表))(?:里(?:面)?(?:的)?|中(?:的)?|的)?';
    const ORDINAL = '(?:第)?([一二三四五六七八九十\\d]+)';
    const NOUNS = '(?:个|条|项)?\\s*(?:记录|结果|数据|行|条目)?(?:的(?:链接|标题|详情|详细)?)?';

    const scopedPattern = new RegExp(`^${VERBS}\\s*${TABLE_SCOPE}\\s*${ORDINAL}\\s*${NOUNS}.*$`, 'i');
    console.log("scopedPattern:", scopedPattern);
    const scopedMatch = normalizedInput.match(scopedPattern);

    if (scopedMatch && scopedMatch[1] && scopedMatch[2]) {
      const scopeName = scopedMatch[1].trim();
      const rowIndex = this.resolveResultIndex(scopedMatch[2]);
      if (rowIndex > 0) {
        return { success: true, scope: scopeName, rowIndex };
      }
    }
    return null;
  }
}

const srv = new BrowserCommandSearchService();
console.log(srv.parseEarlyClickTableRow("进入收件箱 一览的第一条记录"));
console.log(srv.parseEarlyClickTableRow("进入收件箱一览表的第一条记录"));

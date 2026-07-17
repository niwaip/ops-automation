const VERBS = '(?:点击|选择|打开|进入|访问|查看|click|open)';
const TABLE_SCOPE = '(?:.*?(?:一览表|查询结果|检索结果|列表|结果列表))(?:里(?:面)?(?:的)?|中(?:的)?|的)?';
const ORDINAL = '(?:第)?([一二三四五六七八九十\\d]+)';
const NOUNS = '(?:个|条|项)?\\s*(?:记录|结果|数据|行|条目)?(?:的(?:链接|标题|详情|详细)?)?';

const scopedPattern = new RegExp(`^${VERBS}\\s*${TABLE_SCOPE}\\s*${ORDINAL}\\s*${NOUNS}.*$`, 'i');
console.log("点击收件箱一览表的第一条记录（QD202508-0049-01）以进入其详细页面".match(scopedPattern));

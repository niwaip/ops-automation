"""Small task-specific search portfolios, independent of network adapters."""
import re

from .retrieval_policy import DEPLOYMENT_RE, is_technical_query


def build_search_queries(clean: str, max_queries: int = 3) -> list[str]:
    subject = re.sub(
        r'(联网|上网|全网|搜索|查一下|查看|关于|最新的?|近期的?|最近的?|当前的?|实时的?|'
        r'新闻|动态|资讯|情况|信息|都有什么|有哪些|有什么|是什么|'
        r'如何部署|怎么部署|如何安装|怎么安装|如何搭建|怎么搭建|'
        r'latest|recent|news|updates?|information)', ' ', clean, flags=re.I)
    subject = re.sub(r'[，,。；;：:？?]+', ' ', subject)
    subject = re.sub(r'\s+', ' ', subject).strip(' 的') or clean
    deployment = bool(DEPLOYMENT_RE.search(clean))
    queries = [clean]
    if deployment:
        queries = [f'{subject} 官方文档 产品 对比' if re.search(r'有哪些|有什么|对比|选型', clean)
                   else clean,
                   f'{subject} official documentation installation deployment quickstart',
                   f'{subject} 官方 部署 配置 验证 Docker Kubernetes Helm']
    elif re.search(r'插件|扩展|plugin|extension|生态|marketplace|registry', clean, re.I):
        queries += [f'{subject} plugins extensions registry GitHub',
                    f'{subject} official documentation GitHub releases']
    elif re.search(r'版本|发布|更新|release|changelog|升级', clean, re.I):
        queries += [f'{subject} releases changelog GitHub', f'{subject} official documentation GitHub releases']
    elif re.search(r'热点|热搜|榜单|排行|趋势|trending|ranking|热门', clean, re.I):
        queries += [f'{subject} 实时热点 热门榜单', f'{subject} 热门动态 讨论']
    elif is_technical_query(clean):
        queries += [f'{subject} official documentation', f'{subject} 官方文档 产品 对比']
    elif re.search(r'最新|新闻|动态|近期|latest|recent|news', clean, re.I):
        queries += [f'{subject} latest updates', f'{subject} latest news']
    else:
        queries += [f'{subject} 权威资料', f'{subject} 官方说明']
    unique = []
    for query in queries:
        query = re.sub(r'\s+', ' ', query).strip()
        if query.casefold() not in {q.casefold() for q in unique}:
            unique.append(query)
        if len(unique) >= max(1, max_queries):
            break
    return unique

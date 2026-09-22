#!/usr/bin/env python3
"""
DeepSeek Harness Plugin: High-Accuracy Weather & Forecast
Certified Administrator Plugin for Personal Sandbox
"""
import sys
import json
import urllib.request
import urllib.parse
import re

CITY_PINYIN = {
    "北京": "Beijing", "上海": "Shanghai", "广州": "Guangzhou", "深圳": "Shenzhen",
    "杭州": "Hangzhou", "南京": "Nanjing", "苏州": "Suzhou", "成都": "Chengdu",
    "武汉": "Wuhan", "重庆": "Chongqing", "西安": "Xi_an", "天津": "Tianjin",
    "长沙": "Changsha", "郑州": "Zhengzhou", "济南": "Jinan", "青岛": "Qingdao",
    "沈阳": "Shenyang", "大连": "Dalian", "哈尔滨": "Harbin", "长春": "Changchun",
    "福州": "Fuzhou", "厦门": "Xiamen", "合肥": "Hefei", "南昌": "Nanchang",
    "昆明": "Kunming", "贵阳": "Guiyang", "南宁": "Nanning", "海口": "Haikou",
    "三亚": "Sanya", "石家庄": "Shijiazhuang", "太原": "Taiyuan", "呼和浩特": "Hohhot",
    "兰州": "Lanzhou", "西宁": "Xining", "银川": "Yinchuan", "乌鲁木齐": "Urumqi",
    "拉萨": "Lhasa", "香港": "Hong_Kong", "澳门": "Macau", "台北": "Taipei"
}

def query_weather(city_input: str) -> str:
    target = "Shanghai"
    found_city = "上海"
    for k, v in CITY_PINYIN.items():
        if k in city_input:
            target = v
            found_city = k
            break

    try:
        url = f"https://wttr.in/{target}?format=j1"
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            weather = data.get("weather", [])
            current = data.get("current_condition", [{}])[0]
            curr_desc = current.get("weatherDesc", [{}])[0].get("value", "多云")
            lines = [f"【{found_city} 实时气象与多日预报 ({target})】:"]
            lines.append(
                f"- 当前实时: 气温 {current.get('temp_C')}°C (体感 {current.get('FeelsLikeC')}°C), "
                f"湿度 {current.get('humidity')}%, 风速 {current.get('windspeedKmph')}km/h, 天气状况: {curr_desc}"
            )
            for i, w in enumerate(weather[:3]):
                label = "今天" if i == 0 else ("明天" if i == 1 else "后天")
                hourly = w.get("hourly", [])
                noon_desc = hourly[4].get("weatherDesc", [{}])[0].get("value", "多云") if len(hourly) > 4 else "晴间多云"
                rain_chance = max([int(h.get("chanceofrain", "0")) for h in hourly]) if hourly else 0
                lines.append(
                    f"- {label} ({w.get('date')}): 最低 {w.get('mintempC')}°C ~ 最高 {w.get('maxtempC')}°C, "
                    f"白天天气: {noon_desc}, 降水概率: {rain_chance}%"
                )
            return "\n".join(lines)
    except Exception as e:
        return f"查询 {found_city} 气象数据失败: {e}"

if __name__ == "__main__":
    city_param = "上海"
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        try:
            parsed = json.loads(arg)
            if isinstance(parsed, dict):
                city_param = parsed.get("city") or parsed.get("location") or parsed.get("query") or "上海"
            else:
                city_param = str(parsed)
        except Exception:
            city_param = " ".join(sys.argv[1:])
    print(query_weather(city_param))

export const FIXED_FILE_READ_ACTIVITY_FN = 'fileRead';
export const FIXED_FILE_WRITE_ACTIVITY_FN = 'fileWrite';
export const FIXED_WEBHOOK_NOTIFY_ACTIVITY_FN = 'webhookNotify';
export const FIXED_EMAIL_SEND_ACTIVITY_FN = 'emailSend';
export const FIXED_IM_NOTIFY_ACTIVITY_FN = 'imNotify';
export const FIXED_CSV_PARSE_ACTIVITY_FN = 'csvParse';
export const FIXED_JSON_TRANSFORM_ACTIVITY_FN = 'jsonTransform';
export const FIXED_TEMPLATE_RENDER_ACTIVITY_FN = 'templateRender';
export const FIXED_DATABASE_QUERY_ACTIVITY_FN = 'databaseQuery';
export const FIXED_SHELL_COMMAND_ACTIVITY_FN = 'shellCommand';
export const FIXED_WAIT_DELAY_ACTIVITY_FN = 'waitDelay';
export const FIXED_CONDITION_CHECK_ACTIVITY_FN = 'conditionCheck';

export const FIXED_FILE_READ_ACTIVITY_CODE = `import json
import os
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="fileRead")
async def fileRead(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行文件读取任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    protocol = str(input_data.get("protocol") or "local").strip().lower()
    path = str(input_data.get("path") or "").strip()
    encoding = str(input_data.get("encoding") or "utf-8").strip().lower()
    return_mode = str(input_data.get("returnMode") or "text").strip().lower()
    max_size_kb = float(input_data.get("maxSizeKb") or 10240)

    if not path:
        raise ApplicationError("path 是必需的参数", non_retryable=True)

    content = None
    size = 0

    if protocol == "local":
        if not os.path.exists(path):
            raise ApplicationError(f"文件不存在: {path}", non_retryable=True)
        size = os.path.getsize(path)
        if size > max_size_kb * 1024:
            raise ApplicationError(f"文件大小 ({size} bytes) 超过最大限制 ({max_size_kb} KB)", non_retryable=True)

        if return_mode == "base64":
            import base64
            with open(path, "rb") as f:
                content = base64.b64encode(f.read()).decode("utf-8")
        else:
            with open(path, "r", encoding=encoding, errors="replace") as f:
                if return_mode == "lines":
                    content = f.read().splitlines()
                elif return_mode == "json":
                    content = json.load(f)
                else:
                    content = f.read()
    elif protocol in ("s3", "oss", "minio"):
        bucket = str(input_data.get("bucket") or "").strip()
        if not bucket:
            raise ApplicationError("bucket 是必需的参数", non_retryable=True)
        try:
            import boto3
        except ImportError:
            raise ApplicationError(f"Protocol '{protocol}' requires 'boto3' library", non_retryable=True)

        endpoint_url = (
            input_data.get("endpointUrl")
            or os.getenv("S3_ENDPOINT_URL")
            or (os.getenv("OSS_ENDPOINT_URL") if protocol == "oss" else None)
        )
        client_kwargs = {}
        if endpoint_url:
            client_kwargs["endpoint_url"] = str(endpoint_url).strip()
        region = (
            input_data.get("region")
            or os.getenv("AWS_REGION")
            or (os.getenv("OSS_REGION") if protocol == "oss" else None)
        )
        if region:
            client_kwargs["region_name"] = str(region).strip()
        access_key = (
            input_data.get("accessKeyId")
            or os.getenv("AWS_ACCESS_KEY_ID")
            or (os.getenv("OSS_ACCESS_KEY_ID") if protocol == "oss" else None)
        )
        secret_key = (
            input_data.get("secretAccessKey")
            or os.getenv("AWS_SECRET_ACCESS_KEY")
            or (os.getenv("OSS_ACCESS_KEY_SECRET") if protocol == "oss" else None)
        )
        if access_key and secret_key:
            client_kwargs["aws_access_key_id"] = str(access_key).strip()
            client_kwargs["aws_secret_access_key"] = str(secret_key).strip()

        s3_client = boto3.client("s3", **client_kwargs)
        try:
            response = s3_client.get_object(Bucket=bucket, Key=path)
            size = response.get("ContentLength", 0)
            if size > max_size_kb * 1024:
                raise ApplicationError(f"对象存储文件大小 ({size} bytes) 超过最大限制 ({max_size_kb} KB)", non_retryable=True)
            raw_bytes = response["Body"].read()
            if return_mode == "base64":
                import base64
                content = base64.b64encode(raw_bytes).decode("utf-8")
            else:
                text_content = raw_bytes.decode(encoding, errors="replace")
                if return_mode == "lines":
                    content = text_content.splitlines()
                elif return_mode == "json":
                    content = json.loads(text_content)
                else:
                    content = text_content
        except Exception as exc:
            raise ApplicationError(f"读取对象存储文件失败: {str(exc)}", non_retryable=False)
    else:
        raise ApplicationError(f"不支持的协议: {protocol}", non_retryable=True)

    return {
        "status": "success",
        "protocol": protocol,
        "path": path,
        "size": size,
        "encoding": encoding,
        "returnMode": return_mode,
        "content": content
    }
`;

export const FIXED_FILE_WRITE_ACTIVITY_CODE = `import json
import os
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="fileWrite")
async def fileWrite(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行文件写入任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    protocol = str(input_data.get("protocol") or "local").strip().lower()
    path = str(input_data.get("path") or "").strip()
    content_source = str(input_data.get("contentSource") or "input").strip()
    content_key = str(input_data.get("contentKey") or "content").strip()
    write_mode = str(input_data.get("writeMode") or "text").strip().lower()
    encoding = str(input_data.get("encoding") or "utf-8").strip().lower()
    overwrite = bool(input_data.get("overwrite") if input_data.get("overwrite") is not None else True)
    mkdir = bool(input_data.get("mkdir") if input_data.get("mkdir") is not None else True)

    if not path:
        raise ApplicationError("path 是必需的参数", non_retryable=True)

    raw_content = input_data.get("content")
    if content_source == "previousStep" or raw_content is None:
        raw_content = input_data.get(content_key)

    if raw_content is None:
        raw_content = ""

    if write_mode == "json":
        if isinstance(raw_content, str):
            try:
                json.loads(raw_content)
                bytes_content = raw_content.encode(encoding)
            except ValueError:
                bytes_content = json.dumps(raw_content, ensure_ascii=False).encode(encoding)
        else:
            bytes_content = json.dumps(raw_content, ensure_ascii=False).encode(encoding)
    elif write_mode == "base64decode":
        import base64
        if isinstance(raw_content, str):
            bytes_content = base64.b64decode(raw_content)
        else:
            raise ApplicationError("base64decode 模式下 content 必须是字符串", non_retryable=True)
    else:
        if isinstance(raw_content, (dict, list)):
            bytes_content = json.dumps(raw_content, ensure_ascii=False).encode(encoding)
        else:
            bytes_content = str(raw_content).encode(encoding)

    size_written = len(bytes_content)
    overwritten = False

    if protocol == "local":
        if os.path.exists(path):
            if not overwrite:
                raise ApplicationError(f"文件已存在且不允许覆盖: {path}", non_retryable=True)
            overwritten = True
        if mkdir:
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "wb") as f:
            f.write(bytes_content)
    elif protocol in ("s3", "oss", "minio"):
        bucket = str(input_data.get("bucket") or "").strip()
        if not bucket:
            raise ApplicationError("bucket 是必需的参数", non_retryable=True)
        try:
            import boto3
        except ImportError:
            raise ApplicationError(f"Protocol '{protocol}' requires 'boto3' library", non_retryable=True)

        endpoint_url = (
            input_data.get("endpointUrl")
            or os.getenv("S3_ENDPOINT_URL")
            or (os.getenv("OSS_ENDPOINT_URL") if protocol == "oss" else None)
        )
        client_kwargs = {}
        if endpoint_url:
            client_kwargs["endpoint_url"] = str(endpoint_url).strip()
        region = (
            input_data.get("region")
            or os.getenv("AWS_REGION")
            or (os.getenv("OSS_REGION") if protocol == "oss" else None)
        )
        if region:
            client_kwargs["region_name"] = str(region).strip()
        access_key = (
            input_data.get("accessKeyId")
            or os.getenv("AWS_ACCESS_KEY_ID")
            or (os.getenv("OSS_ACCESS_KEY_ID") if protocol == "oss" else None)
        )
        secret_key = (
            input_data.get("secretAccessKey")
            or os.getenv("AWS_SECRET_ACCESS_KEY")
            or (os.getenv("OSS_ACCESS_KEY_SECRET") if protocol == "oss" else None)
        )
        if access_key and secret_key:
            client_kwargs["aws_access_key_id"] = str(access_key).strip()
            client_kwargs["aws_secret_access_key"] = str(secret_key).strip()

        s3_client = boto3.client("s3", **client_kwargs)
        try:
            if not overwrite:
                try:
                    s3_client.head_object(Bucket=bucket, Key=path)
                    raise ApplicationError(f"对象存储文件已存在且不允许覆盖: {path}", non_retryable=True)
                except s3_client.exceptions.ClientError as e:
                    if e.response["Error"]["Code"] != "404":
                        raise
            s3_client.put_object(Bucket=bucket, Key=path, Body=bytes_content)
        except Exception as exc:
            raise ApplicationError(f"写入对象存储失败: {str(exc)}", non_retryable=False)
    else:
        raise ApplicationError(f"不支持的协议: {protocol}", non_retryable=True)

    return {
        "status": "success",
        "path": path,
        "sizeWritten": size_written,
        "overwritten": overwritten
    }
`;

export const FIXED_WEBHOOK_NOTIFY_ACTIVITY_CODE = `import json
import requests
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="webhookNotify")
async def webhookNotify(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 Webhook 推送任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    url = str(input_data.get("url") or "").strip()
    method = str(input_data.get("method") or "POST").strip().upper()
    headers = input_data.get("headers") or {}
    payload = input_data.get("payloadTemplate") or {}
    success_codes = input_data.get("successCodes") or [200, 201, 202, 204]
    timeout = float(input_data.get("timeoutSeconds") or 15)

    if not url:
        raise ApplicationError("url 是必需的参数", non_retryable=True)

    try:
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=payload if isinstance(payload, dict) else None,
            data=payload if not isinstance(payload, dict) else None,
            timeout=timeout
        )
        activity.heartbeat("webhook_sent")

        status_code = response.status_code
        if status_code not in success_codes:
            raise ApplicationError(f"Webhook 推送返回错误状态码: {status_code}, 响应: {response.text[:200]}", non_retryable=False)

        return {
            "status": "success",
            "statusCode": status_code,
            "response": response.text[:2000]
        }
    except requests.RequestException as exc:
        raise ApplicationError(f"Webhook 推送请求失败: {str(exc)}", non_retryable=False)
`;

export const FIXED_EMAIL_SEND_ACTIVITY_CODE = `import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="emailSend")
async def emailSend(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行邮件发送任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    provider = str(input_data.get("provider") or "smtp").strip().lower()
    to_list = input_data.get("to") or []
    cc_list = input_data.get("cc") or []
    bcc_list = input_data.get("bcc") or []
    subject = str(input_data.get("subject") or "").strip()
    body_type = str(input_data.get("bodyType") or "html").strip().lower()
    body_template = str(input_data.get("bodyTemplate") or "").strip()

    if not to_list:
        raise ApplicationError("to (收件人) 是必需的参数", non_retryable=True)
    if not subject:
        raise ApplicationError("subject (主题) 是必需的参数", non_retryable=True)

    if isinstance(to_list, str):
        to_list = [to_list]
    if isinstance(cc_list, str):
        cc_list = [cc_list]
    if isinstance(bcc_list, str):
        bcc_list = [bcc_list]

    if provider == "smtp":
        smtp_host = os.getenv(str(input_data.get("smtpHostEnvKey") or "SMTP_HOST"))
        smtp_port = os.getenv(str(input_data.get("smtpPortEnvKey") or "SMTP_PORT"))
        smtp_user = os.getenv(str(input_data.get("smtpUserEnvKey") or "SMTP_USER"))
        smtp_password = os.getenv(str(input_data.get("smtpPasswordEnvKey") or "SMTP_PASSWORD"))
        smtp_tls = bool(input_data.get("smtpTls") if input_data.get("smtpTls") is not None else True)

        if not smtp_host or not smtp_user or not smtp_password:
            raise ApplicationError("SMTP 配置环境变量缺失", non_retryable=True)

        from_name = str(input_data.get("fromName") or "").strip()
        from_address = str(input_data.get("fromAddress") or smtp_user).strip()
        from_header = f"{from_name} <{from_address}>" if from_name else from_address

        msg = MIMEMultipart()
        msg["From"] = from_header
        msg["To"] = ", ".join(to_list)
        if cc_list:
            msg["Cc"] = ", ".join(cc_list)
        msg["Subject"] = subject

        msg.attach(MIMEText(body_template, body_type))

        attach_from_prev = bool(input_data.get("attachFromPreviousStep"))
        if attach_from_prev:
            attach_path = str(input_data.get("attachmentKey") or "")
            if attach_path and os.path.exists(attach_path):
                filename = str(input_data.get("attachmentFilename") or os.path.basename(attach_path))
                with open(attach_path, "rb") as f:
                    part = MIMEApplication(f.read(), Name=filename)
                part['Content-Disposition'] = f'attachment; filename="{filename}"'
                msg.attach(part)

        try:
            port = int(smtp_port) if smtp_port else (587 if smtp_tls else 25)
            server = smtplib.SMTP(smtp_host, port, timeout=30)
            if smtp_tls:
                server.starttls()
            server.login(smtp_user, smtp_password)
            all_recipients = to_list + cc_list + bcc_list
            server.sendmail(from_address, all_recipients, msg.as_string())
            server.quit()
        except Exception as exc:
            raise ApplicationError(f"SMTP 发送邮件失败: {str(exc)}", non_retryable=False)
    else:
        raise ApplicationError(f"不支持的邮件提供商: {provider}", non_retryable=True)

    return {
        "status": "success",
        "to": to_list,
        "subject": subject
    }
`;

export const FIXED_IM_NOTIFY_ACTIVITY_CODE = `import os
import requests
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="imNotify")
async def imNotify(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 IM 通知推送任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    platform = str(input_data.get("platform") or "feishu").strip().lower()
    webhook_url = str(input_data.get("webhookUrl") or "").strip()
    webhook_env_key = str(input_data.get("webhookUrlEnvKey") or "").strip()
    if webhook_env_key:
        webhook_url = os.getenv(webhook_env_key) or webhook_url

    if not webhook_url:
        raise ApplicationError("未配置可用的 Webhook URL", non_retryable=True)

    msg_type = str(input_data.get("msgType") or "text").strip().lower()
    title = str(input_data.get("title") or "").strip()
    content = str(input_data.get("contentTemplate") or "").strip()

    payload = {}
    if platform == "feishu":
        if msg_type == "markdown":
            payload = {
                "msg_type": "post",
                "content": {
                    "post": {
                        "zh_cn": {
                            "title": title or "通知",
                            "content": [[{"tag": "text", "text": content}]]
                        }
                    }
                }
            }
        elif msg_type == "card":
            payload = {
                "msg_type": "interactive",
                "card": {
                    "header": {
                        "title": {"tag": "plain_text", "content": title or "通知"},
                        "template": str(input_data.get("cardColor") or "green")
                    },
                    "elements": [{"tag": "markdown", "content": content}]
                }
            }
        else:
            payload = {
                "msg_type": "text",
                "content": {"text": content}
            }
    elif platform == "dingtalk":
        if msg_type in ("markdown", "card"):
            payload = {
                "msgtype": "markdown",
                "markdown": {"title": title or "通知", "text": content}
            }
        else:
            payload = {
                "msgtype": "text",
                "text": {"content": content}
            }
    elif platform == "wecom":
        if msg_type in ("markdown", "card"):
            payload = {
                "msgtype": "markdown",
                "markdown": {"content": content}
            }
        else:
            payload = {
                "msgtype": "text",
                "text": {"content": content}
            }
    else:
        raise ApplicationError(f"不支持的 IM 平台: {platform}", non_retryable=True)

    try:
        response = requests.post(webhook_url, json=payload, timeout=15)
        response.raise_for_status()
        return {
            "status": "success",
            "platform": platform,
            "response": response.text[:200]
        }
    except Exception as exc:
        raise ApplicationError(f"IM 通知发送失败: {str(exc)}", non_retryable=False)
`;

export const FIXED_CSV_PARSE_ACTIVITY_CODE = `import csv
import io
import json
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="csvParse")
async def csvParse(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 CSV 解析任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    content_source = str(input_data.get("contentSource") or "input").strip()
    content_key = str(input_data.get("contentKey") or "content").strip()

    raw_content = input_data.get("content")
    if content_source == "previousStep" or raw_content is None:
        raw_content = input_data.get(content_key)

    if not raw_content:
        return {
            "status": "success",
            "rowCount": 0,
            "columnCount": 0,
            "headers": [],
            "rows": []
        }

    delimiter = str(input_data.get("delimiter") or ",")
    has_header = bool(input_data.get("hasHeader") if input_data.get("hasHeader") is not None else True)
    max_rows = int(input_data.get("maxRows") or 10000)
    column_types = input_data.get("columnTypes") or {}

    csv_file = io.StringIO(str(raw_content))
    reader = csv.reader(csv_file, delimiter=delimiter)

    rows = []
    headers = []

    if has_header:
        try:
            headers = next(reader)
        except StopIteration:
            pass

    row_count = 0
    column_count = len(headers)

    for row_data in reader:
        row_count += 1
        if row_count > max_rows:
            activity.logger.warning(f"行数超过最大限制: {max_rows}，已截断")
            break

        if not headers:
            headers = [f"col_{i}" for i in range(len(row_data))]
            column_count = len(headers)

        row_dict = {}
        for i, val in enumerate(row_data):
            if i >= len(headers):
                break
            col_name = headers[i]
            col_type = column_types.get(col_name, "string")

            try:
                if col_type == "number":
                    val = float(val) if "." in val else int(val)
                elif col_type == "boolean":
                    val = val.lower() in ("true", "1", "yes")
            except Exception:
                pass
            row_dict[col_name] = val

        rows.append(row_dict)
        if row_count % 1000 == 0:
            activity.heartbeat(f"parsed_{row_count}_rows")

    return {
        "status": "success",
        "rowCount": row_count,
        "columnCount": column_count,
        "headers": headers,
        "rows": rows
    }
`;

export const FIXED_JSON_TRANSFORM_ACTIVITY_CODE = `import json
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="jsonTransform")
async def jsonTransform(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 JSON 转换任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    content_source = str(input_data.get("contentSource") or "input").strip()
    content_key = str(input_data.get("contentKey") or "data").strip()

    raw_content = input_data.get("content")
    if content_source == "previousStep" or raw_content is None:
        raw_content = input_data.get(content_key)

    if raw_content is None:
        raise ApplicationError("未找到输入数据", non_retryable=True)

    if isinstance(raw_content, str):
        try:
            data = json.loads(raw_content)
        except Exception:
            data = raw_content
    else:
        data = raw_content

    field_mappings = input_data.get("fieldMappings") or {}
    output_mode = str(input_data.get("outputMode") or "object").strip().lower()
    default_values = input_data.get("defaultValues") or {}
    drop_null = bool(input_data.get("dropNullFields"))

    def _resolve_json_path(obj: Any, path: str) -> Any:
        raw_path = str(path or "").strip()
        if raw_path in ("$", "$result", "$data", "$body", "result", "data", "body", ""):
            return obj
        if raw_path.startswith("$."):
            raw_path = raw_path[2:]
        elif raw_path.startswith("$"):
            raw_path = raw_path[1:]
        parts = [p for p in raw_path.split(".") if p]
        curr = obj
        for part in parts:
            clean_part = part.lstrip("$")
            if isinstance(curr, dict):
                if part in curr:
                    curr = curr[part]
                elif clean_part in curr:
                    curr = curr[clean_part]
                elif clean_part in ("result", "data", "body") and not any(k in curr for k in ("result", "data", "body")):
                    pass
                else:
                    return None
            elif isinstance(curr, list):
                if clean_part.endswith("]") and "[" in clean_part:
                    idx_str = clean_part[clean_part.find("[")+1:clean_part.find("]")]
                    prefix = clean_part[:clean_part.find("[")]
                    if prefix and isinstance(curr, dict):
                        curr = curr.get(prefix)
                    if isinstance(curr, list):
                        if idx_str == "*":
                            return curr
                        elif idx_str.isdigit():
                            idx = int(idx_str)
                            curr = curr[idx] if 0 <= idx < len(curr) else None
                elif clean_part.isdigit():
                    idx = int(clean_part)
                    curr = curr[idx] if 0 <= idx < len(curr) else None
                else:
                    return None
            else:
                return None
        return curr

    result = {}
    if output_mode == "value":
        first_path = list(field_mappings.values())[0] if field_mappings else "$."
        result = _resolve_json_path(data, first_path)
    else:
        for out_key, path in field_mappings.items():
            val = None
            if isinstance(path, str) and path.startswith("$"):
                val = _resolve_json_path(data, path)
            else:
                val = path

            if val is None:
                val = default_values.get(out_key)

            if val is not None or not drop_null:
                result[out_key] = val

    return {
        "status": "success",
        "result": result
    }
`;

export const FIXED_TEMPLATE_RENDER_ACTIVITY_CODE = `import json
import re
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="templateRender")
async def templateRender(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行模板渲染任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    engine = str(input_data.get("engine") or "jinja2").strip().lower()
    template_str = str(input_data.get("template") or "").strip()
    output_mode = str(input_data.get("outputMode") or "text").strip().lower()
    render_data = input_data.get("data") or {}

    if engine == "jinja2":
        try:
            from jinja2 import Template
            t = Template(template_str)
            rendered = t.render(**render_data)
        except ImportError:
            activity.logger.warning("jinja2 package not found, falling back to simple regex renderer")
            def repl(m):
                k = m.group(1).strip()
                return str(render_data.get(k, ""))
            rendered = re.sub(r"\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}", repl, template_str)
    else:
        def repl(m):
            k = m.group(1).strip()
            return str(render_data.get(k, ""))
        rendered = re.sub(r"\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}", repl, template_str)

    if output_mode == "json":
        try:
            rendered = json.loads(rendered)
        except Exception:
            pass

    return {
        "status": "success",
        "result": rendered
    }
`;

export const FIXED_DATABASE_QUERY_ACTIVITY_CODE = `import json
import os
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="databaseQuery")
async def databaseQuery(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行数据库查询任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    db_type = str(input_data.get("dbType") or "postgresql").strip().lower()
    conn_env_key = str(input_data.get("connectionEnvKey") or "DB_CONNECTION_URL").strip()
    conn_url = os.getenv(conn_env_key)
    sql = str(input_data.get("sql") or "").strip()
    params = input_data.get("params") or {}
    max_rows = int(input_data.get("maxRows") or 1000)
    return_mode = str(input_data.get("returnMode") or "rows").strip().lower()

    if not conn_url:
        raise ApplicationError(f"未配置数据库连接环境变量: {conn_env_key}", non_retryable=True)
    if not sql:
        raise ApplicationError("sql 是必需的参数", non_retryable=True)

    sql_upper = sql.upper().strip()
    if not sql_upper.startswith("SELECT") and not sql_upper.startswith("WITH"):
        raise ApplicationError("只允许执行 SELECT 或 WITH 只读查询", non_retryable=True)

    rows = []
    try:
        if db_type == "postgresql":
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor
            except ImportError:
                raise ApplicationError("PostgreSQL 查询需要 'psycopg2' 库", non_retryable=True)

            conn = psycopg2.connect(conn_url)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(sql, params)
            rows = cur.fetchmany(max_rows)
            cur.close()
            conn.close()
        elif db_type == "mysql":
            try:
                import pymysql
                from pymysql.cursors import DictCursor
                from urllib.parse import urlparse, unquote
            except ImportError:
                raise ApplicationError("MySQL 查询需要 'pymysql' 库", non_retryable=True)

            parsed = urlparse(conn_url)
            conn = pymysql.connect(
                host=parsed.hostname or "localhost",
                port=parsed.port or 3306,
                user=unquote(parsed.username or "") if parsed.username else None,
                password=unquote(parsed.password or "") if parsed.password else None,
                database=parsed.path.lstrip("/") if parsed.path else None,
                cursorclass=DictCursor,
                charset="utf8mb4",
                connect_timeout=10,
            )
            cur = conn.cursor()
            cur.execute(sql, params)
            rows = cur.fetchmany(max_rows)
            cur.close()
            conn.close()
        elif db_type == "sqlite":
            import sqlite3
            db_path = conn_url.replace("sqlite://", "")
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchmany(max_rows)]
            cur.close()
            conn.close()
        else:
            raise ApplicationError(f"不支持的数据库类型: {db_type}", non_retryable=True)
    except Exception as exc:
        raise ApplicationError(f"数据库查询执行失败: {str(exc)}", non_retryable=False)

    result = rows
    if return_mode == "first":
        result = rows[0] if rows else {}
    elif return_mode == "value":
        result = list(rows[0].values())[0] if rows and rows[0] else None
    elif return_mode == "count":
        result = len(rows)

    return {
        "status": "success",
        "rowCount": len(rows),
        "result": result
    }
`;

export const FIXED_SHELL_COMMAND_ACTIVITY_CODE = `import json
import os
import subprocess
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="shellCommand")
async def shellCommand(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 Shell 命令任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    command = str(input_data.get("command") or "").strip()
    working_dir = str(input_data.get("workingDir") or "/tmp").strip()
    allowed_prefixes = input_data.get("allowedPrefixes") or [
        "python3", "python", "node", "ffmpeg", "convert",
        "pandoc", "libreoffice", "pdftotext", "unzip", "zip",
        "tar", "gzip", "gunzip", "wkhtmltopdf", "echo", "cat"
    ]
    env_overrides = input_data.get("envOverrides") or {}
    timeout = float(input_data.get("timeoutSeconds") or 60)
    capture_stderr = bool(input_data.get("captureStderr") if input_data.get("captureStderr") is not None else True)
    return_mode = str(input_data.get("returnMode") or "text").strip().lower()
    max_output_kb = float(input_data.get("maxOutputKb") or 1024)

    if not command:
        raise ApplicationError("command 是必需的参数", non_retryable=True)

    cmd_parts = command.split()
    if not cmd_parts:
        raise ApplicationError("非法的 Shell 命令", non_retryable=True)
    base_cmd = os.path.basename(cmd_parts[0])
    if base_cmd not in allowed_prefixes and cmd_parts[0] not in allowed_prefixes:
        raise ApplicationError(f"命令前缀 '{cmd_parts[0]}' 不在安全白名单内", non_retryable=True)

    env = os.environ.copy()
    env.update(env_overrides)

    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=working_dir,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE if capture_stderr else subprocess.DEVNULL,
            timeout=timeout
        )
        activity.heartbeat("shell_command_executed")

        stdout_str = proc.stdout.decode("utf-8", errors="replace")
        stderr_str = proc.stderr.decode("utf-8", errors="replace") if capture_stderr else ""

        if len(stdout_str) > max_output_kb * 1024:
            stdout_str = stdout_str[:int(max_output_kb * 1024)] + "\\n[Output Truncated]"

        if proc.returncode != 0:
            raise ApplicationError(f"Shell 命令执行失败，退出码: {proc.returncode}, 错误信息: {stderr_str}", non_retryable=False)

        result = stdout_str
        if return_mode == "json":
            try:
                result = json.loads(stdout_str)
            except Exception:
                pass
        elif return_mode == "lines":
            result = stdout_str.splitlines()

        return {
            "status": "success",
            "exitCode": proc.returncode,
            "result": result,
            "stderr": stderr_str
        }
    except subprocess.TimeoutExpired:
        raise ApplicationError(f"Shell 命令执行超时 ({timeout} 秒)", non_retryable=False)
    except Exception as exc:
        raise ApplicationError(f"Shell 命令执行失败: {str(exc)}", non_retryable=False)
`;

export const FIXED_WAIT_DELAY_ACTIVITY_CODE = `import re
import time
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="waitDelay")
async def waitDelay(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行延迟等待任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    duration = str(input_data.get("duration") or "").strip()
    duration_seconds = float(input_data.get("durationSeconds") or 60)

    if duration:
        match = re.match(r"^(\\d+)\\s*([smhd])$", duration, re.IGNORECASE)
        if match:
            val = int(match.group(1))
            unit = match.group(2).lower()
            if unit == "m":
                duration_seconds = val * 60
            elif unit == "h":
                duration_seconds = val * 3600
            elif unit == "d":
                duration_seconds = val * 86400
            else:
                duration_seconds = val

    time.sleep(duration_seconds)
    return {
        "status": "success",
        "durationSeconds": duration_seconds
    }
`;

export const FIXED_CONDITION_CHECK_ACTIVITY_CODE = `import json
import requests
import time
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="conditionCheck")
async def conditionCheck(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行条件轮询检查任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    url = str(input_data.get("url") or "").strip()
    method = str(input_data.get("method") or "GET").strip().upper()
    headers = input_data.get("headers") or {}
    success_cond = str(input_data.get("successCondition") or "").strip()
    failure_cond = str(input_data.get("failureCondition") or "").strip()
    interval = float(input_data.get("intervalSeconds") or 10)
    max_attempts = int(input_data.get("maxAttempts") or 60)
    result_path = str(input_data.get("resultPath") or "").strip()

    if not url:
        raise ApplicationError("url 是必需的参数", non_retryable=True)
    if not success_cond:
        raise ApplicationError("successCondition 是必需的参数", non_retryable=True)

    def _eval_cond(json_data: Any, cond_expr: str) -> bool:
        if not cond_expr:
            return False
        import re
        expr = cond_expr
        paths = re.findall(r"\\$\\.[a-zA-Z0-9_\\.]+", expr)
        for path in paths:
            parts = path[2:].split(".")
            val = json_data
            for part in parts:
                if isinstance(val, dict):
                    val = val.get(part)
                else:
                    val = None
                    break
            expr = expr.replace(path, repr(val))
        try:
            return bool(eval(expr, {"__builtins__": None}, {}))
        except Exception:
            return False

    for attempt in range(1, max_attempts + 1):
        activity.logger.info(f"轮询接口第 {attempt}/{max_attempts} 次尝试")
        try:
            response = requests.request(method=method, url=url, headers=headers, timeout=10)
            response.raise_for_status()
            try:
                json_data = response.json()
            except Exception:
                json_data = {}

            if failure_cond and _eval_cond(json_data, failure_cond):
                raise ApplicationError(f"条件轮询命中失败条件: {failure_cond}", non_retryable=True)

            if _eval_cond(json_data, success_cond):
                res = json_data
                if result_path and result_path.startswith("$."):
                    parts = result_path[2:].split(".")
                    for part in parts:
                        if isinstance(res, dict):
                            res = res.get(part)
                        else:
                            res = None
                            break
                return {
                    "status": "success",
                    "attempts": attempt,
                    "result": res
                }
        except requests.RequestException as exc:
            activity.logger.warning(f"轮询请求异常: {str(exc)}")

        activity.heartbeat(f"polling_attempt_{attempt}")
        time.sleep(interval)

    raise ApplicationError(f"条件轮询超时，已达到最大尝试次数: {max_attempts}", non_retryable=False)
`;

## runtime-file_tools.py.snapshot

SHA256: dc82622cb49762b4439af24e20781f852cdeb164913f73c710446cda5f11be1e

与审计时本地源码逐字节一致。

```text
493: 
494: def inspect_image(
495:     image_path: str,
496:     prompt: str = "",
497:     max_chars: int = 15000,
498:     deadline: Optional[float] = None,
499:     model_name: Optional[str] = None,
500:     max_tokens: Optional[int] = None,
501:     telemetry: Optional[Any] = None,
502:     purpose: str = "image_inspection"
503: ) -> str:
504:     """
505:     Inspects, analyzes, and extracts visual information/OCR text from an image file
506:     or scanned PDF located in /workspace or /knowledge via multimodal vision model proxy.
507:     """
508:     assert_not_timed_out(deadline, "image vision inspection")
509:     p, err = resolve_sandboxed_path(image_path, for_write=False, for_outbound=False)
510:     if err:
```

```text
521:     if suffix == ".pdf":
522:         try:
523:             # 1. 优先使用 pdf2image 高清光栅化整页（获取完整文字、图章与版面）
524:             try:
525:                 import pdf2image
526:                 import io
527:                 imgs = pdf2image.convert_from_path(str(p), dpi=150, first_page=1, last_page=3)
528:                 if imgs:
529:                     buf = io.BytesIO()
530:                     imgs[0].save(buf, format="JPEG", quality=85)
531:                     image_bytes = buf.getvalue()
532:                     mime = "image/jpeg"
533:             except Exception:
534:                 pass
535: 
536:             # 2. 备选方案：通过 pypdf 提取嵌入的独立位图对象
537:             if not image_bytes:
538:                 import pypdf
539:                 reader = pypdf.PdfReader(str(p))
540:                 for page in reader.pages:
541:                     if getattr(page, "images", None) and len(page.images) > 0:
542:                         sorted_imgs = sorted(page.images, key=lambda img: len(img.data), reverse=True)
543:                         best_img = sorted_imgs[0]
544:                         image_bytes = best_img.data
545:                         img_ext = Path(best_img.name).suffix.lower()
546:                         mime = mime_map.get(img_ext, "image/jpeg")
547:                         break
548: 
549:             if not image_bytes:
550:                 txt_fallback = read_workspace_file(str(p), max_chars=max_chars, deadline=deadline, model_name=model_name)
```

```text
570: 
571:     to_vision = check_deadline(deadline, default_timeout=120.0)
572:     call_id = uuid.uuid4().hex
573:     started = time.monotonic()
574:     usage = {}
575:     response_model = model_name or os.environ.get('DSH_MODEL') or 'default'
576:     if telemetry:
577:         telemetry.checkpoint('model_started', {'call_id': call_id, 'purpose': purpose, 'model': model_name or 'default'})
578:     try:
579:         b64_str = base64.b64encode(image_bytes).decode("ascii")
580: 
581:         analysis_prompt = prompt.strip() if prompt and prompt.strip() else (
582:             "请详细分析并解读这张图片/扫描件的内容，识别并提取图中的所有关键文字（OCR）、表格数据、条款与主体信息，给出清晰准确的中文说明。"
583:         )
584: 
585:         api_endpoint = f"{DEFAULT_PROXY_URL.rstrip('/')}/chat/completions"
586:         from .runtime_policy import RuntimePolicy
587:         pol = RuntimePolicy.from_env()
588:         target_model = model_name or os.environ.get("DSH_MODEL") or "default"
589:         payload = {
590:             "model": target_model,
591:             "messages": [
592:                 {
593:                     "role": "user",
594:                     "content": [
595:                         {"type": "text", "text": analysis_prompt},
```

```text
660:         if isinstance(getattr(ue, "reason", None), socket.timeout) or "timed out" in str(ue).lower():
661:             if deadline is not None and time.monotonic() >= deadline:
662:                 raise TimeoutError("Task total execution deadline exceeded during image vision inspection")
663:         assert_not_timed_out(deadline, "image vision inspection")
664:         return f"【系统提示】附件 ({p.name}) 图像分析网络请求失败，无法解析: {ue}"
665:     except Exception as e:
666:         assert_not_timed_out(deadline, "image vision inspection")
667:         if "cannot identify image" in str(e).lower():
668:             return f"【图片格式异常或损坏】附件 ({p.name}) 二进制流无法被视觉模型识别解析: {e}"
669:         return f"【系统提示】附件 ({p.name}) 视觉分析异常: {e}"
670: 
```

## runtime-tools.py.snapshot

SHA256: d70e361328c5d856f31f7d0c516e1c3e122c3c863709365782ba0d78ca3dd0b0

与审计时本地源码逐字节一致。

```text
611:     elif name_clean in ["vision_inspect", "inspect_image", "image_inspect", "read_image", "ocr", "view_image", "analyze_image"]:
612:         fpath = (
613:             params.get("file_path") or
614:             params.get("image_path") or
615:             params.get("path") or
616:             params.get("file") or
617:             params.get("filename") or
618:             (str(list(params.values())[0]) if params else "")
619:         )
620:         prompt = params.get("prompt") or params.get("instruction") or params.get("query") or ""
621:         current_model = os.environ.get("DSH_MODEL") or None
622:         res = inspect_image(str(fpath), prompt, deadline=deadline, model_name=current_model)
623: 
```

## runtime-runner.py.snapshot

SHA256: 377ceb7155cd81bf5719897a4d31fa4a99a846699ef9917ec823d6095ff49375

与审计时本地源码逐字节一致。

```text
350:                 pass
351:             if fpath.suffix.lower() in IMAGE_EXTENSIONS:
352:                 # 图片附件不做模型预处理，仅做毫秒级本地完整性/加密预检，通过后直接挂载至多模态消息交由主模型处理
353:                 img_part, img_diag_err = prepare_multimodal_image_attachment(str(fpath))
354:                 from .tool_result import ToolResult
355:                 if img_diag_err:
356:                     clipped = ContextBudget.clip_attachment(img_diag_err, policy.max_attachment_chars)
357:                     file_context += f"\n\n[Attached File Content - {fname}]:\n{clipped}"
358:                     failed_attachment_diagnostics[fname] = img_diag_err.strip()
359:                     attachment_diagnostic_evidence.append(
360:                         ToolResult.error(
361:                             "attachment_unreadable",
362:                             img_diag_err.strip(),
363:                             provenance={"file_path": str(fpath), "file_name": fname}
364:                         )
365:                     )
366:                 elif img_part:
367:                     multimodal_image_parts.append(img_part)
368:                     multimodal_image_names.append(fname)
369:                     file_context += (
370:                         f"\n\n[Attached Image - {fname}]:\n"
371:                         f"【图片附件 ({fname}) 已作为多模态视觉输入直接挂载至当前消息，请直接观察图片内容回答用户问题，无需再调用 vision_inspect 或 read_file 工具】"
372:                     )
373:                     attachment_diagnostic_evidence.append(
374:                         ToolResult.success(
375:                             data={"tool": "multimodal_image_input", "file_name": fname, "evidence_id": f"img:{fname}"},
376:                             text=f"Multimodal image attached: {fname}",
377:                             provenance={"tool": "multimodal_image_input", "file_path": str(fpath), "file_name": fname}
378:                         )
379:                     )
380:                 continue
```

```text
390:                 extracted = comparison_context or read_workspace_file(
391:                     fname, deadline=task_deadline, model_name=model_name, prompt=prompt)
392:             if extracted and not extracted.startswith("文件未找到"):
393:                 clipped = ContextBudget.clip_attachment(extracted, policy.max_attachment_chars)
394:                 file_context += f"\n\n[Attached File Content - {fname}]:\n{clipped}"
395:                 if any(k in extracted for k in (
396:                     "【文件受企业安全加密保护无法解析】",
397:                     "【图片文件损坏或格式无效无法解析】",
398:                     "【图片格式异常或损坏】",
399:                 )):
400:                     failed_attachment_diagnostics[fname] = extracted.strip()
401:                     from .tool_result import ToolResult
402:                     attachment_diagnostic_evidence.append(
403:                         ToolResult.error(
404:                             "attachment_unreadable",
405:                             extracted.strip(),
```

"""
Context budgeting and text truncation utilities for DeepSeek Harness (dsh).
Safely manages token and character allocations across history, files, and tool outputs.
"""

import json
from typing import List, Dict, Any, Tuple


class ContextBudget:
    """Manages context clipping and sliding-window budgeting."""

    @staticmethod
    def clip_text(text: str, max_chars: int, suffix: str = "\n...[内容已截断]") -> str:
        """Clips text to max_chars and appends suffix if truncated."""
        if not text:
            return ""
        text_str = str(text)
        if len(text_str) <= max_chars:
            return text_str
        return text_str[:max_chars] + suffix

    @classmethod
    def clip_attachment(cls, content: str, max_chars: int = 3500) -> str:
        """Clips file attachment text."""
        return cls.clip_text(content, max_chars, suffix="\n...[文件过长已截断]")

    @classmethod
    def clip_skill(cls, skill_content: str, max_chars: int = 1500) -> str:
        """Clips injected skill guidance text."""
        return cls.clip_text(skill_content, max_chars, suffix="\n...[技能规范已截断]")

    @classmethod
    def clip_tool_result(cls, result: str, max_chars: int = 3000) -> str:
        """Clips execution result of tools to prevent context blowup."""
        suffix = f"\n...[工具输出超过 {max_chars} 字符，已自动截断以保障模型效率]"
        return cls.clip_text(result, max_chars, suffix=suffix)

    @classmethod
    def budget_history(
        cls,
        existing_history: List[Dict[str, Any]],
        max_total_chars: int = 4000,
        max_item_chars: int = 1000
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Applies a reverse sliding window over conversation history.
        Preserves most recent interactions up to max_total_chars.
        Guarantees contiguous history turns and atomic pairing of assistant tool_calls with tool responses.
        Returns: (budgeted_history_list_in_chronological_order, dropped_count)
        """
        # 1. 将历史记录按逻辑轮次打包成原子块（例如单个普通消息，或含有 tool_calls 的 assistant + 后续 tool 响应组）
        blocks: List[List[Dict[str, Any]]] = []
        i = 0
        n = len(existing_history)
        while i < n:
            msg = existing_history[i]
            if not isinstance(msg, dict):
                i += 1
                continue
            role = msg.get("role")
            if role not in ["user", "assistant", "tool"]:
                i += 1
                continue

            if role == "assistant" and msg.get("tool_calls"):
                block = [msg]
                i += 1
                while i < n and isinstance(existing_history[i], dict) and existing_history[i].get("role") == "tool":
                    block.append(existing_history[i])
                    i += 1
                blocks.append(block)
            else:
                blocks.append([msg])
                i += 1

        budgeted_history: List[Dict[str, Any]] = []
        used_chars = 0
        dropped_count = 0

        # 2. 逆向遍历原子块（由最新到最旧），一旦超出预算立即 break，杜绝非连续跳跃保留
        for block_idx in range(len(blocks) - 1, -1, -1):
            block = blocks[block_idx]
            prepared_items = []
            block_chars = 0

            for h in block:
                role = h.get("role")
                content = h.get("content") or ""
                content_str = str(content)
                if len(content_str) > max_item_chars:
                    content_str = content_str[:max_item_chars] + "...[内容已截断]"
                block_chars += len(content_str)

                item: Dict[str, Any] = {"role": role, "content": content_str}
                if role == "tool" and h.get("tool_call_id"):
                    item["tool_call_id"] = h["tool_call_id"]
                if role == "assistant" and h.get("tool_calls"):
                    item["tool_calls"] = h["tool_calls"]
                    block_chars += len(json.dumps(h["tool_calls"], ensure_ascii=False))
                prepared_items.append(item)

            if used_chars + block_chars > max_total_chars:
                for old_idx in range(block_idx, -1, -1):
                    dropped_count += len(blocks[old_idx])
                break

            used_chars += block_chars
            budgeted_history = prepared_items + budgeted_history

        return budgeted_history, dropped_count

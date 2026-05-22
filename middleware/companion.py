#!/usr/bin/env python3
"""AI 伴侣中间层。

把三样东西串起来：
  1. 本地规则引擎 —— 不调任何 API，纯本地生成"思维链"，指导这一轮怎么回应。
  2. OB 记忆 MCP   —— 通过 MCP 协议拉取记忆桶（pulse/dream 等）。
  3. Claude API    —— 第三方中转站，把人格 + 记忆 + 思维链 + 对话发给模型。

人格从本地 YAML 加载。纯标准库 + PyYAML，Termux 和电脑终端都能跑。
"""

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import urllib.error
import urllib.request

try:
    import yaml
except ImportError:
    sys.stderr.write(
        "缺少 PyYAML，请先安装：pip install pyyaml\n"
        "(Termux: pkg install python && pip install pyyaml)\n"
    )
    sys.exit(1)


# --------------------------------------------------------------------------- #
# 配置与人格加载
# --------------------------------------------------------------------------- #

def load_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def deep_get(d, dotted, default=None):
    cur = d
    for key in dotted.split("."):
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


class Persona:
    """人格模板，从 YAML 加载。"""

    def __init__(self, data):
        self.name = data.get("name", "助手")
        self.description = data.get("description", "")
        self.system_prompt = data.get("system_prompt", "")
        self.speaking_style = data.get("speaking_style", []) or []
        self.principles = data.get("principles", []) or []
        # cues: 给规则引擎用的关键词 -> 思考提示
        self.cues = data.get("cues", {}) or {}

    @classmethod
    def load(cls, path):
        return cls(load_yaml(path))

    def build_system_text(self):
        parts = []
        if self.system_prompt:
            parts.append(self.system_prompt.format(name=self.name).strip())
        else:
            head = f"你是{self.name}。"
            if self.description:
                head += self.description
            parts.append(head)
        if self.speaking_style:
            parts.append("说话风格：\n" + "\n".join(f"- {s}" for s in self.speaking_style))
        if self.principles:
            parts.append("行事原则：\n" + "\n".join(f"- {p}" for p in self.principles))
        return "\n\n".join(parts)


# --------------------------------------------------------------------------- #
# 本地规则引擎：生成思维链（不调 API）
# --------------------------------------------------------------------------- #

# 内置默认线索；人格 YAML 里的 cues 会与之合并/覆盖。
DEFAULT_CUES = {
    "emotional": {
        "keywords": ["难过", "累", "压力", "焦虑", "开心", "想你", "孤独", "哭", "烦", "委屈"],
        "thought": "用户带着情绪，先共情、接住情绪，再回应内容。",
    },
    "recall": {
        "keywords": ["还记得", "上次", "之前", "记得吗", "我说过", "那天"],
        "thought": "用户在唤起过往，优先在记忆桶里检索相关内容，引用具体细节。",
    },
    "task": {
        "keywords": ["帮我", "怎么", "如何", "写", "做", "搞定", "教我", "能不能"],
        "thought": "这是任务请求，给出清晰、可执行的步骤或答案。",
    },
    "question": {
        "keywords": ["吗", "?", "？", "为什么", "什么", "哪", "谁", "多少"],
        "thought": "用户在提问，先正面回答，再补充必要背景。",
    },
}


def extract_keywords(text):
    """粗粒度分词：英文/数字词 + 中文二元组，用于做记忆相关性匹配。"""
    toks = re.findall(r"[A-Za-z0-9_]{2,}", text.lower())
    for seg in re.findall(r"[一-鿿]+", text):
        if len(seg) >= 2:
            toks.extend(seg[i:i + 2] for i in range(len(seg) - 1))
        else:
            toks.append(seg)
    seen, out = set(), []
    for t in toks:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


class RuleEngine:
    def __init__(self, persona, max_thoughts=6):
        self.max_thoughts = max_thoughts
        # 合并默认线索与人格自定义线索
        self.cues = dict(DEFAULT_CUES)
        for name, cue in (persona.cues or {}).items():
            merged = dict(self.cues.get(name, {}))
            merged.update(cue or {})
            self.cues[name] = merged
        self.persona = persona

    def relevant_memory(self, user_input, memory_text, max_lines=5):
        """从记忆文本里挑出与本轮输入关键词重叠最多的几行。"""
        if not memory_text:
            return []
        kws = set(extract_keywords(user_input))
        scored = []
        for line in memory_text.splitlines():
            line = line.strip()
            if not line:
                continue
            hits = sum(1 for k in kws if k in line)
            if hits:
                scored.append((hits, line))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [line for _, line in scored[:max_lines]]

    def think(self, user_input, memory_text=""):
        """返回 (思维链文本, 命中的线索名列表)。"""
        thoughts = []
        fired = []

        thoughts.append(f"意图识别：用户说「{user_input.strip()[:60]}」。")

        for name, cue in self.cues.items():
            kws = cue.get("keywords", []) or []
            if any(k in user_input for k in kws):
                fired.append(name)
                hint = cue.get("thought")
                if hint:
                    thoughts.append(f"[{name}] {hint}")

        if not fired:
            thoughts.append("没有明显情绪/任务信号，按日常聊天自然回应。")

        rel = self.relevant_memory(user_input, memory_text)
        if rel:
            thoughts.append("相关记忆：")
            thoughts.extend(f"  · {r}" for r in rel)
        elif memory_text:
            thoughts.append("记忆里没有明显相关条目，不要硬凑、不要编造记忆。")

        thoughts.append(f"风格校准：用{self.persona.name}的语气和原则来组织这段回应。")

        # 限制条数（保留首尾，截中间），避免思维链过长
        if len(thoughts) > self.max_thoughts:
            keep_head = self.max_thoughts - 1
            thoughts = thoughts[:keep_head] + [thoughts[-1]]

        chain = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(thoughts))
        return chain, fired


# --------------------------------------------------------------------------- #
# MCP 客户端：拉取 OB 记忆（支持 stdio 与 http 两种传输）
# --------------------------------------------------------------------------- #

class MCPError(Exception):
    pass


class StdioMCPClient:
    """通过子进程 + 换行分隔 JSON-RPC 与本地 MCP server 通信。"""

    def __init__(self, command, args=None, env=None):
        full_env = dict(os.environ)
        full_env.update(env or {})
        self.proc = subprocess.Popen(
            [command, *(args or [])],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            env=full_env,
            text=True,
            bufsize=1,
        )
        self._id = 0
        self._lock = threading.Lock()
        self._initialize()

    def _next_id(self):
        self._id += 1
        return self._id

    def _send(self, obj):
        self.proc.stdin.write(json.dumps(obj, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()

    def _read_response(self, want_id):
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise MCPError("MCP server 关闭了连接")
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue  # 跳过非 JSON 的日志行
            if msg.get("id") == want_id:
                return msg

    def _request(self, method, params=None):
        with self._lock:
            rid = self._next_id()
            self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})
            resp = self._read_response(rid)
        if "error" in resp:
            raise MCPError(f"{method} 失败：{resp['error']}")
        return resp.get("result", {})

    def _notify(self, method, params=None):
        with self._lock:
            self._send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    def _initialize(self):
        self._request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "companion-middleware", "version": "1.0"},
        })
        self._notify("notifications/initialized")

    def call_tool(self, name, arguments=None):
        return self._request("tools/call", {"name": name, "arguments": arguments or {}})

    def close(self):
        try:
            self.proc.stdin.close()
            self.proc.terminate()
        except Exception:
            pass


class HttpMCPClient:
    """通过 HTTP(JSON-RPC, 兼容 Streamable HTTP / SSE 响应) 与远程 MCP server 通信。"""

    def __init__(self, url, headers=None):
        self.url = url
        self.headers = dict(headers or {})
        self._id = 0
        self.session_id = None
        self._initialize()

    def _next_id(self):
        self._id += 1
        return self._id

    def _post(self, payload, expect_response=True):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        headers.update(self.headers)
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        req = urllib.request.Request(self.url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                sid = resp.headers.get("Mcp-Session-Id")
                if sid:
                    self.session_id = sid
                body = resp.read().decode("utf-8")
                ctype = resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            raise MCPError(f"MCP HTTP {e.code}: {e.read().decode('utf-8', 'ignore')}")
        except urllib.error.URLError as e:
            raise MCPError(f"连接 MCP 失败：{e.reason}")
        if not expect_response:
            return None
        return self._parse(body, ctype)

    @staticmethod
    def _parse(body, ctype):
        if "text/event-stream" in ctype:
            for raw in body.splitlines():
                if raw.startswith("data:"):
                    chunk = raw[len("data:"):].strip()
                    if chunk and chunk != "[DONE]":
                        try:
                            return json.loads(chunk)
                        except json.JSONDecodeError:
                            continue
            raise MCPError("无法从 SSE 响应中解析出 JSON-RPC")
        return json.loads(body)

    def _request(self, method, params=None):
        resp = self._post({
            "jsonrpc": "2.0", "id": self._next_id(),
            "method": method, "params": params or {},
        })
        if resp and "error" in resp:
            raise MCPError(f"{method} 失败：{resp['error']}")
        return (resp or {}).get("result", {})

    def _initialize(self):
        self._request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "companion-middleware", "version": "1.0"},
        })
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
                   expect_response=False)

    def call_tool(self, name, arguments=None):
        return self._request("tools/call", {"name": name, "arguments": arguments or {}})

    def close(self):
        pass


def make_mcp_client(mem_cfg):
    transport = (mem_cfg.get("transport") or "stdio").lower()
    if transport == "stdio":
        cmd = mem_cfg.get("command")
        if not cmd:
            raise MCPError("memory.transport=stdio 需要配置 memory.command")
        return StdioMCPClient(cmd, mem_cfg.get("args"), mem_cfg.get("env"))
    if transport == "http":
        url = mem_cfg.get("url")
        if not url:
            raise MCPError("memory.transport=http 需要配置 memory.url")
        return HttpMCPClient(url, mem_cfg.get("headers"))
    raise MCPError(f"不支持的 memory.transport：{transport}")


def extract_tool_text(result):
    """从 MCP tools/call 结果里抽出文本内容。"""
    parts = []
    for item in (result.get("content") or []):
        if isinstance(item, dict) and item.get("type") == "text":
            parts.append(item.get("text", ""))
    if not parts and result:
        parts.append(json.dumps(result, ensure_ascii=False))
    return "\n".join(p for p in parts if p)


def pull_memory(client, mem_cfg):
    """按配置依次调用记忆工具（如 pulse / dream），拼成一段记忆文本。"""
    blocks = []
    for spec in (mem_cfg.get("pull") or []):
        tool = spec.get("tool")
        if not tool:
            continue
        try:
            result = client.call_tool(tool, spec.get("args") or {})
            text = extract_tool_text(result)
            if text:
                blocks.append(f"# 来自 {tool}\n{text}")
        except MCPError as e:
            blocks.append(f"# {tool} 调用失败：{e}")
    memory = "\n\n".join(blocks)
    max_chars = int(mem_cfg.get("max_chars", 4000))
    if len(memory) > max_chars:
        memory = memory[:max_chars] + "\n…(记忆已截断)"
    return memory


# --------------------------------------------------------------------------- #
# Claude API 客户端（第三方中转站，支持 anthropic / openai 两种风格）
# --------------------------------------------------------------------------- #

class ClaudeClient:
    def __init__(self, cfg):
        self.base_url = (cfg.get("base_url") or "").rstrip("/")
        self.endpoint = cfg.get("endpoint")  # 可选：直接给完整 URL
        self.api_key = cfg.get("api_key") or os.environ.get("CLAUDE_API_KEY", "")
        self.model = cfg.get("model", "claude-opus-4-7")
        self.style = (cfg.get("api_style") or "anthropic").lower()
        self.anthropic_version = cfg.get("anthropic_version", "2023-06-01")
        self.max_tokens = int(cfg.get("max_tokens", 1024))
        self.temperature = float(cfg.get("temperature", 0.8))
        self.timeout = int(cfg.get("timeout", 60))
        if not self.api_key:
            raise ValueError("未配置 Claude api_key（也可用环境变量 CLAUDE_API_KEY）")

    def _url(self, default_path):
        if self.endpoint:
            return self.endpoint
        base = self.base_url
        if base.endswith("/v1"):
            return base + default_path
        if base.endswith(default_path):
            return base
        return base + "/v1" + default_path

    def chat(self, system_text, messages):
        if self.style == "openai":
            return self._chat_openai(system_text, messages)
        return self._chat_anthropic(system_text, messages)

    def _post(self, url, headers, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "ignore")
            raise RuntimeError(f"Claude API HTTP {e.code}: {detail}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"连接 Claude API 失败：{e.reason}")

    def _chat_anthropic(self, system_text, messages):
        url = self._url("/messages")
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": self.anthropic_version,
        }
        payload = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "system": system_text,
            "messages": messages,
        }
        resp = self._post(url, headers, payload)
        parts = [b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text"]
        return "".join(parts).strip()

    def _chat_openai(self, system_text, messages):
        url = self._url("/chat/completions")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        full = [{"role": "system", "content": system_text}] + messages
        payload = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "messages": full,
        }
        resp = self._post(url, headers, payload)
        return resp["choices"][0]["message"]["content"].strip()


# --------------------------------------------------------------------------- #
# 编排
# --------------------------------------------------------------------------- #

class Companion:
    def __init__(self, config, show_thinking=True):
        self.config = config
        self.show_thinking = show_thinking

        persona_path = deep_get(config, "persona.file", "personas/default.yaml")
        if not os.path.isabs(persona_path):
            persona_path = os.path.join(_BASE_DIR, persona_path)
        self.persona = Persona.load(persona_path)

        self.rules = RuleEngine(self.persona, deep_get(config, "rules.max_thoughts", 6))
        self.claude = ClaudeClient(config.get("claude", {}))

        self.mem_cfg = config.get("memory", {}) or {}
        self.mcp = None
        if self.mem_cfg.get("enabled"):
            try:
                self.mcp = make_mcp_client(self.mem_cfg)
            except MCPError as e:
                sys.stderr.write(f"[警告] 记忆 MCP 初始化失败，将不带记忆运行：{e}\n")

        self.history = []  # [{role, content}]
        self.history_turns = int(deep_get(config, "cli.history_turns", 10))

    def respond(self, user_input):
        memory_text = ""
        if self.mcp:
            try:
                memory_text = pull_memory(self.mcp, self.mem_cfg)
            except MCPError as e:
                sys.stderr.write(f"[警告] 拉取记忆失败：{e}\n")

        chain, _ = self.rules.think(user_input, memory_text)

        system_text = self._build_system(memory_text, chain)
        self.history.append({"role": "user", "content": user_input})
        messages = self.history[-2 * self.history_turns:]

        reply = self.claude.chat(system_text, messages)
        self.history.append({"role": "assistant", "content": reply})
        return reply, chain

    def _build_system(self, memory_text, chain):
        parts = [self.persona.build_system_text()]
        if memory_text:
            parts.append(
                "下面是你的长期记忆（来自记忆系统，按需引用，不要照搬、不要编造未出现的内容）：\n"
                + memory_text
            )
        parts.append(
            "下面是本地规则引擎为这一轮生成的思维链，供你参考来组织回应，"
            "请不要把它原样输出给用户：\n" + chain
        )
        return "\n\n---\n\n".join(parts)

    def close(self):
        if self.mcp:
            self.mcp.close()


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def resolve_config_path(path):
    if path:
        return path
    for cand in ("config.yaml", "config.example.yaml"):
        full = os.path.join(_BASE_DIR, cand)
        if os.path.exists(full):
            return full
    return os.path.join(_BASE_DIR, "config.yaml")


def main(argv=None):
    parser = argparse.ArgumentParser(description="AI 伴侣中间层（规则引擎 + OB记忆MCP + Claude API）")
    parser.add_argument("-c", "--config", help="配置文件路径（默认 config.yaml）")
    parser.add_argument("-m", "--message", help="单次提问模式：发一条消息拿一次回复就退出")
    parser.add_argument("--persona", help="覆盖人格 YAML 路径")
    parser.add_argument("--no-memory", action="store_true", help="本次运行不连记忆 MCP")
    parser.add_argument("--show-thinking", dest="show_thinking", action="store_true", default=None,
                        help="打印本地生成的思维链")
    parser.add_argument("--quiet", dest="show_thinking", action="store_false",
                        help="不打印思维链")
    args = parser.parse_args(argv)

    config_path = resolve_config_path(args.config)
    if not os.path.exists(config_path):
        sys.stderr.write(f"找不到配置文件：{config_path}\n请复制 config.example.yaml 为 config.yaml 并填好。\n")
        return 1
    config = load_yaml(config_path)

    if args.persona:
        config.setdefault("persona", {})["file"] = args.persona
    if args.no_memory:
        config.setdefault("memory", {})["enabled"] = False

    show_thinking = args.show_thinking
    if show_thinking is None:
        show_thinking = bool(deep_get(config, "cli.show_thinking", True))

    try:
        bot = Companion(config, show_thinking=show_thinking)
    except (ValueError, MCPError) as e:
        sys.stderr.write(f"初始化失败：{e}\n")
        return 1

    def handle(text):
        try:
            reply, chain = bot.respond(text)
        except RuntimeError as e:
            sys.stderr.write(f"\n[出错] {e}\n")
            return
        if show_thinking:
            print("\n\033[2m--- 思维链（本地生成）---\n" + chain + "\n------\033[0m")
        print(f"\n{bot.persona.name}：{reply}\n")

    try:
        if args.message:
            handle(args.message)
        else:
            print(f"已加载人格：{bot.persona.name}。输入消息开始聊天，Ctrl-C 或输入 /exit 退出。")
            while True:
                try:
                    text = input("你：").strip()
                except (EOFError, KeyboardInterrupt):
                    print()
                    break
                if not text:
                    continue
                if text in ("/exit", "/quit"):
                    break
                handle(text)
    finally:
        bot.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

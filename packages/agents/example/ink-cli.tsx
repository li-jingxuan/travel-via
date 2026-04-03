import React, { useState, useEffect, useCallback, useRef } from "react"
import { Box, Text, useInput, useApp, useStdin, render } from "ink"
import Spinner from "ink-spinner"

type MessageRole = "user" | "assistant"

interface Message {
  id: number
  role: MessageRole
  content: string
  timestamp: Date
}

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? ""
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat"

function App() {
  const { exit } = useApp()
  const { isRawModeSupported } = useStdin()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      content:
        "👋 你好！我是 TravelVia 智能旅行规划助手（基于 DeepSeek）。\n\n你可以告诉我你的旅行需求，例如：\n• \"我想去新疆自驾游，15天，6月份出发\"\n• \"帮我规划一个云南7天自由行\"\n• \"带父母去日本关西10天\"\n\n输入 /quit 或按 Ctrl+C 退出。",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<string>("")
  const msgIdRef = useRef(1)

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return

      const userMsg: Message = {
        id: msgIdRef.current++,
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput("")
      setIsLoading(true)

      try {
        if (!DEEPSEEK_API_KEY) {
          await mockReply(text)
        } else {
          await callDeepSeek([...messages, userMsg])
        }
      } catch (error) {
        const errorMsg: Message = {
          id: msgIdRef.current++,
          role: "assistant",
          content: `❌ 请求失败: ${error instanceof Error ? error.message : String(error)}\n\n请检查 DEEPSEEK_API_KEY 环境变量是否设置正确。`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMsg])
      } finally {
        setIsLoading(false)
      }
    },
    [messages, isLoading]
  )

  async function mockReply(userText: string) {
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200))
    const reply: Message = {
      id: msgIdRef.current++,
      role: "assistant",
      content: `[Mock Mode - 未配置 DEEPSEEK_API_KEY]\n\n收到你的消息: "${userText}"\n\n这是一个模拟回复。要接入真实的 DeepSeek 对话，请设置环境变量：\n\n  export DEEPSEEK_API_KEY="your-api-key"\n\n然后重新运行此命令。`,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, reply])
  }

  async function callDeepSeek(history: Message[]) {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.7,
        max_tokens: 2048,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      throw new Error(
        `HTTP ${response.status}: ${errBody?.error?.message ?? response.statusText}`
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content ?? "（空回复）"

    const reply: Message = {
      id: msgIdRef.current++,
      role: "assistant",
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, reply])
  }

  useInput((inputChar, key) => {
    if ((key.ctrl && inputChar === "c") || input.toLowerCase() === "/quit") {
      exit()
      return
    }

    if (isLoading) return

    if (key.return) {
      const text = inputRef.current
      if (text.trim()) {
        void sendMessage(text)
      }
      return
    }

    if (key.backspace || key.delete) {
      const next = inputRef.current.slice(0, -1)
      inputRef.current = next
      setInput(next)
      return
    }

    if (inputChar && inputChar.length === 1 && inputChar >= " ") {
      const next = inputRef.current + inputChar
      inputRef.current = next
      setInput(next)
    }
  })

  useEffect(() => {
    inputRef.current = input
  }, [input])

  if (!isRawModeSupported) {
    return (
      <Box>
        <Text color="red">
          错误: 此终端不支持原始模式（raw mode）。请在支持 ANSI 的终端中运行。
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 40}>
      <Box
        borderStyle="double"
        borderColor="cyan"
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold color="cyan">
          {" "}
          🧭 TravelVia AI — DeepSeek 智能旅行助手{" "}
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" paddingX={1} paddingTop={1}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <Box marginTop={1}>
            <Text color="gray">
              <Spinner type="dots" /> 思考中...
            </Text>
          </Box>
        )}
      </Box>

      <Box
        borderTop
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        paddingTop={0}
      >
        <Box>
          <Text color="green">{">"} </Text>
          <Text>{input}</Text>
          <Text color="gray">▎</Text>
        </Box>
        <Box>
          <Text dimColor>
            按 Enter 发送 · Backspace 删除 · Ctrl+C 退出
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  const label = isUser ? "你" : "AI"
  const color = isUser ? "blue" : "green"
  const lines = message.content.split("\n")

  return (
    <Box marginBottom={1} flexDirection="column">
      <Box>
        <Text bold color={color}>
          {label}
        </Text>
        <Text dimColor> ({formatTime(message.timestamp)})</Text>
      </Box>
      <Box marginLeft={1}>
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    </Box>
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

render(<App />)

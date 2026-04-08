import React, { useState, useEffect, useCallback, useRef } from "react"
import { Box, Text, useInput, useApp, useStdin, render, useStdout } from "ink"
import Spinner from "ink-spinner"
import { travelPlannerGraph } from "../src/index.js"
import { HumanMessage } from "@langchain/core/messages"

type MessageRole = "user" | "assistant"

interface Message {
  id: number
  role: MessageRole
  content: string
  timestamp: Date
}

// const DEBUG = process.env.TRAVELVIA_DEBUG !== "0"

type GraphResult = Awaited<ReturnType<typeof travelPlannerGraph.invoke>>

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function debugLog(stage: string, payload?: unknown) {
  // if (!DEBUG) return
  const ts = new Date().toISOString()
  const suffix = payload === undefined ? "" : ` ${safeStringify(payload)}`
  process.stderr.write(`[travelvia][${ts}] ${stage}${suffix}\n`)
}

function extractNeedUserInput(errors: string[]): {
  raw: string
  missingFields: string[]
} | null {
  const raw = errors.find((err) => err.startsWith("NEED_USER_INPUT:"))
  if (!raw) return null

  const matched = raw.match(/destination|departurePoint/g) ?? []
  const missingFields = Array.from(new Set(matched))
  return { raw, missingFields }
}

function toFriendlyField(field: string): string {
  if (field === "destination") return "目的地（destination）"
  if (field === "departurePoint") return "出发地（departurePoint）"
  return field
}

function App() {
  const { exit } = useApp()
  const { isRawModeSupported } = useStdin()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      content:
        "👋 你好！我是 TravelVia 智能旅行规划助手",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const {write} = useStdout();

  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<string>("")

  const sendMessage = useCallback(async (text: string) => {
    setMessages(prev => {
      return [...prev, {
        id: prev.length,
        role: "user",
        content: text,
        timestamp: new Date(),
      }]
    })
    const res = await travelPlannerGraph.invoke({ messages: [new HumanMessage(text)] })

    // console.log("Graph Result:", res)
    debugLog("GraphResult", res)
  }, [])

  useInput((inputChar, key) => {
    if ((key.ctrl && inputChar === "c") || input.toLowerCase() === "/quit") {
      exit()
      return
    }

    if (isLoading) return

    if (key.return) {
      const text = inputRef.current?.trim()
      if (text) {
        // debugLog("sendMessage", text)
        sendMessage(text)
        setInput("")

        debugLog("sendMessage", text)
      }
      return
    }

    if (key.backspace || key.delete) {
      const next = inputRef.current.slice(0, -1)
      inputRef.current = next
      setInput(next)
      return
    }

    if (inputChar && inputChar >= " ") {
      const next = inputRef.current + inputChar
      inputRef.current = next
      setInput(next)
    }
  })

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
            按 Enter 发送 · /reset 重置上下文 · Ctrl+C 退出
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

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp, useStdin, render } from "ink";
import Spinner from "ink-spinner";
import { travelPlannerGraph } from "../src/index.js";
function App() {
    const { exit } = useApp();
    const { isRawModeSupported } = useStdin();
    const [messages, setMessages] = useState([
        {
            id: 0,
            role: "assistant",
            content: "👋 你好！我是 TravelVia 智能旅行规划助手（基于 DeepSeek）。\n\n你可以告诉我你的旅行需求，例如：\n• \"我想去新疆自驾游，15天，6月份出发\"\n• \"帮我规划一个云南7天自由行\"\n• \"带父母去日本关西10天\"\n\n输入 /quit 或按 Ctrl+C 退出。",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef("");
    const msgIdRef = useRef(1);
    const sendMessage = useCallback(async (text) => {
        if (!text.trim() || isLoading)
            return;
        const userMsg = {
            id: msgIdRef.current++,
            role: "user",
            content: text.trim(),
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);
        try {
            await callTravelPlannerGraph(text);
        }
        catch (error) {
            const errorMsg = {
                id: msgIdRef.current++,
                role: "assistant",
                content: `❌ 请求失败: ${error instanceof Error ? error.message : String(error)}\n\n请检查模型环境变量配置（如 OPENAI_API_KEY / DEEPSEEK_BASE_URL）。`,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMsg]);
        }
        finally {
            setIsLoading(false);
        }
    }, [messages, isLoading]);
    async function callTravelPlannerGraph(userText) {
        const result = await travelPlannerGraph.invoke({ userInput: userText });
        const content = formatGraphResult(result);
        const reply = {
            id: msgIdRef.current++,
            role: "assistant",
            content,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, reply]);
    }
    function formatGraphResult(result) {
        if (!result.finalPlan) {
            const errors = result.errors.length
                ? result.errors.map((err) => `- ${err}`).join("\n")
                : "- 未返回具体错误";
            return `⚠️ 规划未生成可用结果。\n\n错误信息:\n${errors}`;
        }
        const errorSection = result.errors.length > 0
            ? `\n\n校验/执行日志:\n${result.errors.map((err) => `- ${err}`).join("\n")}`
            : "";
        return `✅ 已生成行程方案：\n\n${JSON.stringify(result.finalPlan, null, 2)}${errorSection}`;
    }
    useInput((inputChar, key) => {
        if ((key.ctrl && inputChar === "c") || input.toLowerCase() === "/quit") {
            exit();
            return;
        }
        if (isLoading)
            return;
        if (key.return) {
            const text = inputRef.current;
            if (text.trim()) {
                void sendMessage(text);
            }
            return;
        }
        if (key.backspace || key.delete) {
            const next = inputRef.current.slice(0, -1);
            inputRef.current = next;
            setInput(next);
            return;
        }
        if (inputChar && inputChar >= " ") {
            const next = inputRef.current + inputChar;
            inputRef.current = next;
            setInput(next);
        }
    });
    useEffect(() => {
        inputRef.current = input;
    }, [input]);
    if (!isRawModeSupported) {
        return (_jsx(Box, { children: _jsx(Text, { color: "red", children: "\u9519\u8BEF: \u6B64\u7EC8\u7AEF\u4E0D\u652F\u6301\u539F\u59CB\u6A21\u5F0F\uFF08raw mode\uFF09\u3002\u8BF7\u5728\u652F\u6301 ANSI \u7684\u7EC8\u7AEF\u4E2D\u8FD0\u884C\u3002" }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", height: process.stdout.rows ?? 40, children: [_jsx(Box, { borderStyle: "double", borderColor: "cyan", paddingLeft: 1, paddingRight: 1, children: _jsxs(Text, { bold: true, color: "cyan", children: [" ", "\uD83E\uDDED TravelVia AI \u2014 DeepSeek \u667A\u80FD\u65C5\u884C\u52A9\u624B", " "] }) }), _jsxs(Box, { flexGrow: 1, flexDirection: "column", paddingX: 1, paddingTop: 1, children: [messages.map((msg) => (_jsx(MessageBubble, { message: msg }, msg.id))), isLoading && (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: "gray", children: [_jsx(Spinner, { type: "dots" }), " \u601D\u8003\u4E2D..."] }) }))] }), _jsxs(Box, { borderTop: true, borderStyle: "round", borderColor: "gray", paddingX: 1, paddingTop: 0, children: [_jsxs(Box, { children: [_jsxs(Text, { color: "green", children: [">", " "] }), _jsx(Text, { children: input }), _jsx(Text, { color: "gray", children: "\u258E" })] }), _jsx(Box, { children: _jsx(Text, { dimColor: true, children: "\u6309 Enter \u53D1\u9001 \u00B7 Backspace \u5220\u9664 \u00B7 Ctrl+C \u9000\u51FA" }) })] })] }));
}
function MessageBubble({ message }) {
    const isUser = message.role === "user";
    const label = isUser ? "你" : "AI";
    const color = isUser ? "blue" : "green";
    const lines = message.content.split("\n");
    return (_jsxs(Box, { marginBottom: 1, flexDirection: "column", children: [_jsxs(Box, { children: [_jsx(Text, { bold: true, color: color, children: label }), _jsxs(Text, { dimColor: true, children: [" (", formatTime(message.timestamp), ")"] })] }), _jsx(Box, { marginLeft: 1, children: lines.map((line, i) => (_jsx(Text, { children: line }, i))) })] }));
}
function formatTime(date) {
    return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
    });
}
render(_jsx(App, {}));

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp, useStdin, render, useStdout } from "ink";
import Spinner from "ink-spinner";
import { travelPlannerGraph } from "../src/index.js";
import { HumanMessage } from "@langchain/core/messages";
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function debugLog(stage, payload) {
    // if (!DEBUG) return
    const ts = new Date().toISOString();
    const suffix = payload === undefined ? "" : ` ${safeStringify(payload)}`;
    process.stderr.write(`[travelvia][${ts}] ${stage}${suffix}\n`);
}
function extractNeedUserInput(errors) {
    const raw = errors.find((err) => err.startsWith("NEED_USER_INPUT:"));
    if (!raw)
        return null;
    const matched = raw.match(/destination|departurePoint/g) ?? [];
    const missingFields = Array.from(new Set(matched));
    return { raw, missingFields };
}
function toFriendlyField(field) {
    if (field === "destination")
        return "目的地（destination）";
    if (field === "departurePoint")
        return "出发地（departurePoint）";
    return field;
}
function App() {
    const { exit } = useApp();
    const { isRawModeSupported } = useStdin();
    const [messages, setMessages] = useState([
        {
            id: 0,
            role: "assistant",
            content: "👋 你好！我是 TravelVia 智能旅行规划助手",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState("");
    const { write } = useStdout();
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef("");
    const sendMessage = useCallback(async (text) => {
        setMessages(prev => {
            return [...prev, {
                    id: prev.length,
                    role: "user",
                    content: text,
                    timestamp: new Date(),
                }];
        });
        const res = await travelPlannerGraph.invoke({ messages: [new HumanMessage(text)] });
        // console.log("Graph Result:", res)
        debugLog("GraphResult", res);
    }, []);
    useInput((inputChar, key) => {
        if ((key.ctrl && inputChar === "c") || input.toLowerCase() === "/quit") {
            exit();
            return;
        }
        if (isLoading)
            return;
        if (key.return) {
            const text = inputRef.current?.trim();
            if (text) {
                // debugLog("sendMessage", text)
                sendMessage(text);
                setInput("");
                debugLog("sendMessage", text);
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
    if (!isRawModeSupported) {
        return (_jsx(Box, { children: _jsx(Text, { color: "red", children: "\u9519\u8BEF: \u6B64\u7EC8\u7AEF\u4E0D\u652F\u6301\u539F\u59CB\u6A21\u5F0F\uFF08raw mode\uFF09\u3002\u8BF7\u5728\u652F\u6301 ANSI \u7684\u7EC8\u7AEF\u4E2D\u8FD0\u884C\u3002" }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", height: process.stdout.rows ?? 40, children: [_jsx(Box, { borderStyle: "double", borderColor: "cyan", paddingLeft: 1, paddingRight: 1, children: _jsxs(Text, { bold: true, color: "cyan", children: [" ", "\uD83E\uDDED TravelVia AI \u2014 DeepSeek \u667A\u80FD\u65C5\u884C\u52A9\u624B", " "] }) }), _jsxs(Box, { flexGrow: 1, flexDirection: "column", paddingX: 1, paddingTop: 1, children: [messages.map((msg) => (_jsx(MessageBubble, { message: msg }, msg.id))), isLoading && (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: "gray", children: [_jsx(Spinner, { type: "dots" }), " \u601D\u8003\u4E2D..."] }) }))] }), _jsxs(Box, { borderTop: true, borderStyle: "round", borderColor: "gray", paddingX: 1, paddingTop: 0, children: [_jsxs(Box, { children: [_jsxs(Text, { color: "green", children: [">", " "] }), _jsx(Text, { children: input }), _jsx(Text, { color: "gray", children: "\u258E" })] }), _jsx(Box, { children: _jsx(Text, { dimColor: true, children: "\u6309 Enter \u53D1\u9001 \u00B7 /reset \u91CD\u7F6E\u4E0A\u4E0B\u6587 \u00B7 Ctrl+C \u9000\u51FA" }) })] })] }));
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

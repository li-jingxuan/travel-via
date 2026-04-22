"use client";

import ReactMarkdown from "react-markdown";

interface MarkdownTextProps {
  content: string;
}

export function MarkdownText({ content }: MarkdownTextProps) {
  return <ReactMarkdown>{content}</ReactMarkdown>
}

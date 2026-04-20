export interface ParsedSseEvent<T = unknown> {
  id?: string;
  event: string;
  data: T;
}

// 解析单帧 SSE 文本。
// 约定：
// 1. 一帧由多行组成（id/event/data/comment 等）
// 2. data 允许多行，最终按换行拼接
// 3. data 优先尝试 JSON 反序列化，失败则保留原始字符串
export function parseSseFrame(frame: string): ParsedSseEvent | null {
  const lines = frame.split("\n");
  let id: string | undefined;
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;

    if (line.startsWith("id:")) {
      id = line.slice(3).trim();
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;
  const rawData = dataLines.join("\n");

  try {
    return { id, event, data: JSON.parse(rawData) };
  } catch {
    return { id, event, data: rawData };
  }
}

// 将流式文本缓冲区按 SSE 帧边界拆分，返回完整帧与剩余 buffer。
// 为什么需要 rest：
// - reader.read() 拿到的 chunk 可能在任意位置截断
// - 最后一帧经常是不完整的，必须保留到下次 chunk 再拼接
export function extractSseFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let working = buffer;

  let frameBoundary = working.indexOf("\n\n");
  while (frameBoundary >= 0) {
    const frame = working.slice(0, frameBoundary).trim();
    working = working.slice(frameBoundary + 2);

    if (frame) {
      frames.push(frame);
    }

    frameBoundary = working.indexOf("\n\n");
  }

  return {
    frames,
    rest: working,
  };
}

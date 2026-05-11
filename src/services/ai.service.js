// src/services/ai.service.js
const Anthropic = require("@anthropic-ai/sdk");
const config    = require("../config");
const logger    = require("../utils/logger");
const { AI_MODES } = require("../constants");

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search" };

/**
 * Stream a chat response using Server-Sent Events (SSE)
 * Handles multi-turn tool use loop internally.
 */
async function streamChatSSE(res, { messages, mode, systemOverride, webSearch, plan }) {
  const isPro    = plan === "PRO" || plan === "ENTERPRISE";
  const modeData = AI_MODES[mode] || AI_MODES.general;
  const system   = systemOverride || modeData.system;
  const maxTokens = isPro ? config.plans.pro.maxTokens : config.plans.free.maxTokens;
  const tools    = webSearch && isPro ? [WEB_SEARCH_TOOL] : undefined;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let currentMessages = messages;
  let fullText = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    for (let loopCount = 0; loopCount < 6; loopCount++) {
      const stream = await anthropic.messages.stream({
        model: config.anthropic.model,
        max_tokens: maxTokens,
        system,
        ...(tools ? { tools } : {}),
        messages: currentMessages,
      });

      let blockType = "text";
      let currentToolUseId = null;
      let isToolUse = false;
      const responseContent = [];
      let currentTextBlock = null;
      let currentToolBlock = null;

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "text") {
            blockType = "text";
            currentTextBlock = { type: "text", text: "" };
            responseContent.push(currentTextBlock);
          } else if (event.content_block.type === "tool_use") {
            blockType = "tool_use";
            isToolUse = true;
            currentToolUseId = event.content_block.id;
            currentToolBlock = { type: "tool_use", id: event.content_block.id, name: event.content_block.name, input: {} };
            responseContent.push(currentToolBlock);
            sendEvent("tool_start", { name: event.content_block.name });
          }
        }

        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta" && blockType === "text") {
            const chunk = event.delta.text;
            fullText += chunk;
            if (currentTextBlock) currentTextBlock.text += chunk;
            sendEvent("chunk", { text: chunk });
          }
          if (event.delta.type === "input_json_delta" && blockType === "tool_use" && currentToolBlock) {
            currentToolBlock.inputStr = (currentToolBlock.inputStr || "") + event.delta.partial_json;
          }
        }

        if (event.type === "message_delta") {
          totalOutputTokens += event.usage?.output_tokens || 0;
        }
        if (event.type === "message_start") {
          totalInputTokens += event.message?.usage?.input_tokens || 0;
        }

        if (event.type === "message_stop") break;
      }

      // Finalise tool blocks
      responseContent.forEach(block => {
        if (block.type === "tool_use" && block.inputStr) {
          try { block.input = JSON.parse(block.inputStr); } catch {}
          delete block.inputStr;
        }
      });

      if (isToolUse) {
        // Continue with tool results
        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: responseContent },
          {
            role: "user",
            content: responseContent
              .filter(b => b.type === "tool_use")
              .map(b => ({ type: "tool_result", tool_use_id: b.id, content: "" })),
          },
        ];
        isToolUse = false;
        sendEvent("tool_end", {});
        continue;
      }

      // Final response
      sendEvent("done", {
        fullText,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      });
      res.end();
      return { fullText, tokens: totalInputTokens + totalOutputTokens };
    }

    sendEvent("error", { message: "Max tool iterations reached." });
    res.end();
  } catch (err) {
    logger.error({ err }, "AI stream error");
    sendEvent("error", { message: err.message || "AI error. Please try again." });
    res.end();
  }
  return { fullText, tokens: totalInputTokens + totalOutputTokens };
}

/**
 * Non-streaming completion for support AI assistant
 */
async function complete({ messages, system, maxTokens = 500 }) {
  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: maxTokens,
    system,
    messages,
  });
  return response.content.filter(b => b.type === "text").map(b => b.text).join("") || "";
}

/**
 * Check if AI API is reachable
 */
async function healthCheck() {
  try {
    await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 5,
      messages: [{ role: "user", content: "hi" }],
    });
    return { status: "ok" };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

module.exports = { streamChatSSE, complete, healthCheck };

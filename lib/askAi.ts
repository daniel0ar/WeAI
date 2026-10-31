import Anthropic from "@anthropic-ai/sdk";
import type { Beacon } from "@/app/_components/Radar";
import skill from "@/SKILL.md";
import { robotTitle } from "./robots";
import { describe, robotKey } from "./weaiUuid";

// Safety Q&A about the robots detected around the user, answered by Claude.
// The key and model are baked into the app at build time from .env.local (see README).
// The key ends up inside the APK: fine for an internal build, never for a public one.
const API_KEY = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || "claude-haiku-5-5";

// SKILL.md is the AI's role and the robot spec; the notes below explain the JSON each question carries.
const SYSTEM = `${skill}

# About the data you receive
Each question comes with the list of robots detected so far in this conversation, as JSON, and photos of the robot models when the user saved one.
- "distance" is a rough estimate from Bluetooth signal strength. It can be off by several meters, and there is no information about direction.
- "detectedNow": false means the robot was detected earlier in this conversation but not at the moment of this question. Its distance is the last one measured.
- "Unknown robot" means no name is saved on this phone for that brand and model; its other fields are still valid. A beacon with no fields has no robot data at all.

# How to answer
- Base the answer on this data. Say clearly when the data is not enough, and never invent specs, names or behaviour.
- Lead with what matters for the user's safety (which robots, how close, what risk) and give concrete advice.
- It is read on a phone. Plain text only, no Markdown (no asterisks, no # headings, no tables); simple "- " lists are fine.`;

let client: Anthropic | null = null;
function getClient() {
  if (!API_KEY) throw new Error("No API key in this build. Put NEXT_PUBLIC_ANTHROPIC_API_KEY in .env.local and rebuild (see README).");
  // Runs in the phone's WebView, so the SDK has to be allowed to call the API from a browser.
  client ??= new Anthropic({ apiKey: API_KEY, dangerouslyAllowBrowser: true });
  return client;
}

// One robot as the AI sees it, kept for the whole conversation.
export interface SeenRobot {
  beacon: Beacon;
  detectedNow: boolean;
}

// Everything a conversation remembers between questions. A new one starts every time the panel opens.
export interface Conversation {
  history: Anthropic.MessageParam[];
  seen: Map<string, SeenRobot>; // by beacon key: every robot detected at any question so far
  photosSent: Set<string>; // brand_model keys whose photo is already in the history
}

export const newConversation = (): Conversation => ({ history: [], seen: new Map(), photosSent: new Set() });

function robotJson({ beacon: b, detectedNow }: SeenRobot) {
  const distance = `~${b.distance.toFixed(1)} m`;
  if (!b.meta) return { name: "Unknown beacon", uuid: b.uuid, note: "No robot data: the beacon is not configured with the WeAI format.", distance, detectedNow };
  return {
    robotNo: b.meta.robotNo,
    name: b.robot ? robotTitle(b.robot) : "Unknown robot",
    brand: b.meta.brand,
    model: b.meta.model,
    ...Object.fromEntries(describe(b.meta)),
    distance,
    detectedNow,
  };
}

// The next user message: the robots seen so far, photos not yet sent, then the question.
// `detected` is what the phone detects right now; it is merged into the conversation's robots.
// Returns the photo keys it attaches, to mark as sent once the answer arrives.
export function buildQuestion(conv: Conversation, detected: { key: string; beacon: Beacon }[], question: string) {
  for (const r of conv.seen.values()) r.detectedNow = false;
  for (const { key, beacon } of detected) conv.seen.set(key, { beacon, detectedNow: true });

  const robots = [...conv.seen.values()].sort((a, b) => a.beacon.distance - b.beacon.distance);
  const content: Anthropic.ContentBlockParam[] = [];
  const photoKeys = new Set<string>();
  for (const { beacon: b } of robots) {
    if (!b.meta || !b.robot?.photo) continue;
    const key = robotKey(b.meta);
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(b.robot.photo);
    if (conv.photosSent.has(key) || photoKeys.has(key) || !match) continue;
    photoKeys.add(key);
    content.push({ type: "text", text: `Photo of ${robotTitle(b.robot)} (brand ${b.meta.brand}, model ${b.meta.model}):` });
    content.push({ type: "image", source: { type: "base64", media_type: match[1] as "image/jpeg", data: match[2] } });
  }
  content.push({
    type: "text",
    text:
      robots.length > 0
        ? `Robots detected in this conversation, nearest first:\n${JSON.stringify(robots.map(robotJson), null, 1)}`
        : "No robots are detected right now.",
  });
  content.push({ type: "text", text: `Question: ${question}` });
  return { message: { role: "user", content } as Anthropic.MessageParam, photoKeys };
}

// Sends the conversation and streams the answer: `onText` gets the full text so far.
// Resolves with the answer's text; throws on errors and when aborted.
export function streamAnswer(conv: Conversation, onText: (text: string) => void) {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" }, // quick answers; chat does well at low effort
    cache_control: { type: "ephemeral" }, // follow-ups reuse the earlier turns from the cache
    system: SYSTEM,
    messages: conv.history,
  });
  stream.on("text", (_delta, snapshot) => onText(snapshot));
  const done = stream.finalMessage().then((message) => {
    if (message.stop_reason === "refusal") throw new Error("The AI declined to answer this question.");
    // The whole content (thinking included) goes back into the history, as the API expects.
    conv.history.push({ role: "assistant", content: message.content });
    return message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  });
  return { done, abort: () => stream.abort() };
}

export function errorMessage(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check NEXT_PUBLIC_ANTHROPIC_API_KEY and rebuild.";
  if (e instanceof Anthropic.RateLimitError) return "Too many requests. Wait a moment and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the AI. Check the internet connection (a VPN may be needed).";
  if (e instanceof Anthropic.APIError) return `AI error${e.status ? ` ${e.status}` : ""}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

const OpenAI = require("openai");
require("dotenv").config();
const logger = require("../utils/logger");

// Lazy provider initialization: the module loads even when no key is present so
// the deterministic/Gemini paths can still serve a degraded experience. Calls
// that need OpenAI throw a clear "not configured" error which the callers'
// fallback chains convert into Gemini/deterministic behavior.
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4o";

// Safe ceiling for assembled final streamed text. Provider token limits are the
// primary cap; this is a defensive guard so a runaway model never produces an
// unbounded chat response. When hit, the stream stops and completes with
// finishReason "max_tokens", persisting exactly the displayed content.
const MAX_STREAMED_TEXT_CHARS = parseInt(process.env.MAX_CHAT_RESPONSE_CHARS, 10) || 4000;

let googleGenAI = null;
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash";
if (process.env.GEMINI_API_KEY) {
  try {
    const { GoogleGenAI } = require("@google/genai");
    googleGenAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } catch (e) {
    logger.warn({ err: { message: e.message } }, "Gemini SDK not available for chat fallback");
  }
}

const callChat = async (messages, options = {}) => {
  if (!openai) {
    throw new Error("OpenAI không được cấu hình — thiếu OPENAI_API_KEY");
  }
  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 800,
    messages,
  });

  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI trả về phản hồi rỗng");
  }
  return content;
};

const parseJsonFromText = (responseText) => {
  let cleanedResponse = responseText;
  if (responseText.includes("```json")) {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) cleanedResponse = jsonMatch[1].trim();
  } else if (responseText.includes("```")) {
    const codeMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch) cleanedResponse = codeMatch[1].trim();
  }
  return JSON.parse(cleanedResponse);
};

const isOpenAIUnavailableError = (error) => {
  if (!error) return false;
  if (error.status === 429) return true;
  if (error.status === 401) return true;
  if (error.status === 408 || error.code === "ETIMEDOUT") return true;
  if (["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN"].includes(error.code)) return true;
  if (error.type === "insufficient_quota" || error.type === "rate_limit_error") return true;
  const msg = (error.message || "").toLowerCase();
  if (
    msg.includes("insufficient_quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("api key") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("eai_again")
  )
    return true;
  return false;
};

const callGeminiChat = async (systemPrompt, chatHistory, userMessage) => {
  if (!googleGenAI) {
    throw new Error("Gemini SDK not initialized — GEMINI_API_KEY missing");
  }

  const contents = [];
  if (Array.isArray(chatHistory)) {
    for (const msg of chatHistory) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }
  contents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  const response = await googleGenAI.models.generateContent({
    model: GEMINI_CHAT_MODEL,
    systemInstruction: systemPrompt,
    contents: contents,
    config: {
      temperature: 0.7,
      maxOutputTokens: 600,
    },
  });

  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini trả về phản hồi rỗng");
  }
  return text.trim();
};

const buildDeterministicResponse = (productContext, userMessage) => {
  if (!Array.isArray(productContext) || productContext.length === 0) {
    return "Cảm ơn bạn đã quan tâm! Hiện tại tôi chưa tìm thấy sản phẩm phù hợp với yêu cầu của bạn. Bạn có thể thử tìm kiếm với từ khóa khác hoặc liên hệ hotline 1900xxxx để được hỗ trợ trực tiếp ạ.";
  }

  let response = "Dạ, cảm ơn bạn đã quan tâm! Tôi xin gợi ý một số sản phẩm phù hợp với yêu cầu của bạn:\n\n";

  productContext.slice(0, 5).forEach((product, index) => {
    response += `${index + 1}. ${product.name} (${product.brand})\n`;
    response += `   - Giá: ${new Intl.NumberFormat("vi-VN").format(product.price)} VND\n`;
    response += `   - Mô tả: ${product.description}\n`;
    if (product.inStock > 0) {
      response += `   - Tình trạng: Còn hàng\n`;
    }
    response += "\n";
  });

  response += "Bạn muốn tìm hiểu thêm thông tin chi tiết về sản phẩm nào không ạ? Tôi sẵn sàng tư vấn thêm cho bạn!";

  return response;
};

/**
 * Shared text normalizer for the deterministic pre-classifiers: lowercase,
 * strip emoji, collapse whitespace, drop trailing punctuation.
 */
const normalizePhrase = (str) => {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:\-–—"''‘’“”]+$/, "")
    .trim();
};

/**
 * Deterministic complaint pre-classifier.
 * Recognizes OBVIOUS complaint language deterministically so the complaint
 * flow never depends on a live LLM provider. Deliberately narrow: it must NOT
 * swallow normal product questions ("điện thoại nào bị lỗi" is a query, not a
 * complaint). Returns a complaint intent result, or null to defer elsewhere.
 */
const preclassifyComplaint = (userQuery) => {
  const normalized = normalizePhrase(userQuery);
  if (!normalized) return null;

  const COMPLAINT_RESULT = {
    intent: "complaint",
    clarified_query: null,
    direct_response: null,
    preclassified: "complaint",
  };

  // -- Explicit complaint verbs (unambiguous) -----------------------------
  if (
    /khiếu\s*nại/.test(normalized) ||
    /phàn\s*nàn/.test(normalized) ||
    /phản\s*ánh/.test(normalized) ||
    /góp\s*ý\s*phàn\s*nàn/.test(normalized)
  ) {
    return COMPLAINT_RESULT;
  }

  // -- Delivery problems (unambiguous) -------------------------------------
  if (
    /(giao\s*sai|giao\s*thiếu|giao\s*nhầm|giao\s*trễ)/.test(normalized) ||
    /(chưa\s*(nhận|thấy|nhận\s*được)\s*(hàng|đơn|gói)|không\s*(nhận|thấy|nhận\s*được)\s*(hàng|đơn|gói)|hàng\s*chưa\s*(về|tới|đến)|chưa\s*có\s*hàng)/.test(normalized) ||
    /(mất\s*hàng|bị\s*mất\s*đơn|mất\s*đơn\s*hàng|thất\s*lạc|hàng\s*(bị\s*)?mất)/.test(normalized) ||
    // delayed delivery — guarded so shipping-time questions stay product queries
    ((/(giao\s*hàng\s*(chậm|trễ)|hàng\s*(giao\s*)?(chậm|trễ))/i.test(normalized)) &&
      !/(bao\s*lâu|khi\s*nào|mấy\s*ngày|bao\s*nhiêu|phí\s*giao|chậm\s*không|chậm\s*thì)/.test(normalized)) ||
    // damaged goods received — e.g. "hàng giao bị vỡ"
    ((/(hàng|đồ|gói|sản\s*phẩm|điện\s*thoại|máy)[^]*?(giao|nhận|về)[^]*?(bị\s*)?(vỡ|hỏng|hư|lỗi|nứt|móp|trầy|dập)/.test(normalized)) &&
      !/(nào|gì)/.test(normalized)) ||
    // courier damaged the goods — e.g. "shipper làm hỏng hàng"
    /(shipper|người\s*giao|nhân\s*viên\s*giao)\s+(làm|để|làm\s*cho)\s+(hỏng|vỡ|lỗi|hư|mất|trầy)/.test(normalized)
  ) {
    return COMPLAINT_RESULT;
  }

  // -- Wrong / mismatched item ----------------------------------------------
  if (
    /(hàng|sản\s*phẩm|điện\s*thoại|máy|đơn\s*hàng|món)\s+(không\s*đúng|không\s*giống|không\s*như\s*mô\s*tả|sai\s*màu|sai\s*loại|sai\s*hãng|sai\s*dung\s*lượng)/.test(normalized) &&
    !/(nào|gì)/.test(normalized)
  ) {
    return COMPLAINT_RESULT;
  }

  // -- First-person ownership + defect/problem -----------------------------
  if (
    (/(tôi|mình|em|tớ|tui)\s+(đã|vừa|mới|có)?\s*(mua|nhận|nhận\s*được|đặt)\s+\S*\s*(hàng|sản\s*phẩm|điện\s*thoại|máy|đồ|món)/.test(normalized) ||
      /(hàng|sản\s*phẩm|điện\s*thoại|máy|món)\s+(tôi\s+mua|mình\s+mua|em\s+mua|tôi\s+đặt|mình\s+đặt|tôi\s+nhận)/.test(normalized)) &&
    /(bị\s*(lỗi|hỏng|hư|vỡ|trầy|nứt|móp|chạy\s*không|không\s*(lên\s*nguồn|hoạt\s*động|chạy|dùng\s*được))|lỗi\s*rồi|hỏng\s*rồi|hư\s*rồi)/.test(normalized) &&
    !/(nào|gì)/.test(normalized)
  ) {
    return COMPLAINT_RESULT;
  }

  // -- Defective item reported on its own (short, assertive, not a question) --
  if (
    /^(hàng|sản\s*phẩm|điện\s*thoại|máy|đồ|món)\s+(bị\s*)?(lỗi|hỏng|hư|vỡ|trầy|nứt|móp)/.test(normalized) &&
    normalized.length <= 60 &&
    !/(nào|gì|không\s+\d|giá)/.test(normalized)
  ) {
    return COMPLAINT_RESULT;
  }

  // -- Service quality complaint -------------------------------------------
  if (
    /(dịch\s*vụ|nhân\s*viên|shop|cửa\s*hàng|shipper)\s+(không\s*tốt|quá\s*tệ|rất\s*tệ|kém|không\s*chu\s*đáo|không\s*chuyên\s*nghiệp|vô\s*lý|không\s*niềm\s*nở)/.test(normalized)
  ) {
    return COMPLAINT_RESULT;
  }

  return null;
};

/**
 * Deterministic detector for an OBVIOUS continuation of an ALREADY-REPORTED
 * complaint: the user adds another defect/detail — "Sản phẩm còn bị sọc màn
 * hình nữa", "Máy còn bị nóng bất thường", "Camera cũng không hoạt động",
 * "Tôi còn phát hiện màn hình bị nhấp nháy". It is CONTEXT-AWARE by design:
 * the caller only consults it when an active (open/in_progress) complaint
 * already exists for the owned conversation. Deliberately narrow and
 * question-safe — question-like messages (giá bao nhiêu, khi nào, "… không"?)
 * return null so an active complaint never hijacks unrelated product/shipping
 * questions. Returns a result object when a continuation is obvious, else null.
 */
const preclassifyComplaintContinuation = (userQuery) => {
  const normalized = normalizePhrase(userQuery);
  if (!normalized) return null;

  // Question guard: price/when/wh-phrases and a trailing "… không?" are never
  // treated as continuations, even when a complaint is active.
  if (
    /(nào|gì|bao\s*nhiêu|bao\s*lâu|khi\s*nào|mấy\s*(ngày|giờ)|giá|phí\s*giao|thế\s*nào|tại\s*sao)/.test(normalized) ||
    /\s+không(\s*(ạ|à|nhé|vậy))?$/.test(normalized)
  ) {
    return null;
  }

  const hasDefect = /(sọc|nóng|chai|nhấp\s*nháy|lỗi|hỏng|hư|vỡ|trầy|nứt|móp|dập|rò\s*rỉ|kêu|giật|lag|loạn\s*màu|ám\s*khói|mất\s*(sóng|tín\s*hiệu|tiếng|nguồn)|tự\s*(tắt|khởi\s*động)|tắt\s*nguồn|không\s*(hoạt\s*động|chạy|lên|bật|bấm|sạc|nhận|đọc|kết\s*nối))/.test(normalized);

  const isContinuation =
    // "… còn bị <defect> …" / "vẫn bị" / "cũng bị" — e.g. "Sản phẩm còn bị sọc màn hình nữa"
    (/(còn|vẫn|cũng)\s*bị\s*\S+/.test(normalized) && hasDefect) ||
    // "còn/vẫn/cũng không <verb>" — e.g. "Camera cũng không hoạt động"
    /(còn|vẫn|cũng)\s+không\s*(hoạt\s*động|chạy|lên|bật|bấm|sạc|nhận|đọc|kết\s*nối)/.test(normalized) ||
    // "còn/vẫn <thấy|phát hiện>" or "phát hiện thêm" — e.g. "Tôi còn phát hiện màn hình bị nhấp nháy"
    /((còn|vẫn)\s+(thấy|phát\s*hiện)|phát\s*hiện\s+thêm)/.test(normalized);

  return isContinuation
    ? { intent: "complaint_continuation", clarified_query: null, direct_response: null, preclassified: "complaint_continuation" }
    : null;
};

/**
 * Deterministic pre-classifier for known small-talk patterns.
 * Returns null if no pattern matches (defer to AI classifier).
 */
const preclassifyIntent = (userQuery) => {
  if (!userQuery || typeof userQuery !== "string") return null;

  // Complaint detection runs FIRST so an obvious complaint never falls through
  // to the small-talk sets or a provider call.
  const complaintResult = preclassifyComplaint(userQuery);
  if (complaintResult) {
    logger.debug("[Pre-classifier] Matched as complaint");
    return complaintResult;
  }

  const normalize = normalizePhrase;

  const normalized = normalize(userQuery);
  if (!normalized) return null;

  // ---- exact-phrase sets ----
  const greetings = new Set([
    "xin chào", "chào bạn", "chào", "chào bạn ơi",
    "chào buổi sáng", "chào buổi chiều", "chào buổi tối",
    "chào bạn buổi sáng", "chào bạn buổi chiều", "chào bạn buổi tối",
    "xin chào bạn", "xin chào các bạn", "xin chào bạn ơi",
    "chào mọi người", "chào bạn nha", "xin chào bạn nha",
    "chào bạn nhé", "xin chào bạn nhé", "hello mọi người",
    "chào mọi người ơi", "chào cả nhà", "chào bạn hiền",
    "chào bạn thân", "chào bạn nhé hello",
    "hello", "hi", "hey", "helo", "hí", "hii", "heyy", "hiii",
    "hello bạn", "hi bạn", "hey bạn", "helo bạn", "hí bạn",
    "hế lô", "hế lô bạn", "alo", "alo bạn", "alo bạn ơi",
    "xin chào tất cả", "chào tất cả mọi người",
  ]);

  const howAreYou = new Set([
    "bạn khỏe không", "bạn có khỏe không", "bạn thế nào", "bạn ổn không",
    "bạn sao rồi", "bạn ổn chứ", "khỏe không bạn", "thế nào bạn",
    "bạn thế nào rồi", "dạo này thế nào", "có khỏe không bạn",
    "công việc thế nào", "bạn sao rồi dạo này", "dạo này bạn thế nào",
    "bạn có khỏe không ạ", "bạn thế nào rồi ạ",
  ]);

  const thanks = new Set([
    "cảm ơn", "cảm ơn bạn", "cảm ơn nhiều", "cảm ơn bạn nhiều",
    "cảm ơn bạn rất nhiều", "cảm ơn nhé", "cảm ơn bạn nhé",
    "cảm ơn ạ", "cảm ơn bạn ạ",
    "cám ơn", "cám ơn bạn", "cám ơn nhiều", "cám ơn bạn nhiều",
    "cám ơn bạn rất nhiều", "cám ơn nhé", "cám ơn bạn nhé",
    "cám ơn ạ", "cám ơn bạn ạ",
    "thanks", "thank you", "thank you very much", "thanks bạn",
    "thank bạn", "thanks bạn nhiều", "thank you bạn",
    "dạ cảm ơn", "dạ cảm ơn bạn", "dạ cám ơn", "dạ cám ơn bạn",
    "ok", "okay", "okê", "oke", "okie", "oki", "okiii",
    "ok bạn", "okay bạn", "okê bạn", "oke bạn",
    "ok bạn nhé", "okay bạn nha", "okie bạn", "oki bạn",
    "vâng", "dạ", "vâng ạ", "dạ vâng", "dạ ạ", "vâng ạ",
    "dạ vâng ạ", "rồi ạ", "hiểu rồi", "hiểu rồi ạ",
    "understood", "got it", "dạ ok", "dạ okay", "dạ oke",
    "vâng ok", "vâng ạ ok", "dạ hiểu rồi", "cảm ơn bạn nhé ạ",
    "cảm ơn bạn rất nhiều ạ", "cảm ơn ạ",
    "cảm ơn bạn đã hỗ trợ", "cảm ơn bạn đã giúp đỡ",
  ]);

  const goodbye = new Set([
    "tạm biệt", "tạm biệt bạn", "tạm biệt nhé", "tạm biệt bạn nhé",
    "tạm biệt nha", "tạm biệt bạn nha", "tạm biệt ạ",
    "bye", "bye bye", "goodbye", "good bye",
    "bye bạn", "bye bye bạn", "goodbye bạn",
    "chào tạm biệt", "chào nhé", "chào bạn nhé tạm biệt",
    "hẹn gặp lại", "hẹn gặp lại bạn", "hẹn gặp lại nhé",
    "hẹn gặp lại nha", "hẹn gặp lại bạn nha", "hẹn gặp lại bạn nhé",
    "gặp lại sau", "gặp lại sau nhé", "gặp lại sau bạn",
    "chào tạm biệt nhé", "tạm biệt chào bạn",
  ]);

  const identity = new Set([
    "bạn là ai", "bạn tên gì", "bạn tên là gì", "bạn là ai vậy",
    "bạn là ai thế", "bạn tên gì thế", "ai vậy bạn",
    "bạn làm được gì", "bạn có thể làm gì", "chức năng của bạn là gì",
    "bạn làm gì", "bạn có những chức năng gì",
    "cho mình hỏi bạn là ai", "bạn là ai ạ", "bạn tên gì ạ",
    "bạn tên là gì ạ", "bạn là ai vậy ạ", "bạn có thể giúp gì",
    "bạn giúp được gì", "bạn biết làm những gì",
    "giới thiệu về bạn đi", "hãy giới thiệu về bạn",
  ]);

  const acknowledgment = new Set([
    "ừ", "ừm", "uhm", "uh", "à", "à ra vậy", "ra vậy", "ra vậy ạ",
    "vậy ạ", "ra thế", "ra thế ạ", "hiểu rồi ạ", "mình hiểu rồi",
    "tôi hiểu rồi", "à mình hiểu rồi", "ok hiểu rồi",
    "vâng hiểu rồi ạ", "dạ hiểu ạ", "vâng ạ", "dạ ok ạ",
    "rõ rồi", "rõ rồi ạ", "được rồi", "được rồi ạ",
    "cảm ơn mình hiểu rồi",
  ]);

  const praise = new Set([
    "bạn giỏi quá", "bạn tốt quá", "bạn thật tuyệt",
    "bạn tuyệt vời", "bạn thông minh quá", "bạn giỏi thật",
    "giỏi quá", "tuyệt vời", "tuyệt", "hay quá", "hay lắm",
    "cảm ơn bạn giỏi quá", "cảm ơn bạn tốt quá",
    "bạn dễ thương quá", "bạn dthw quá", "bạn cute quá",
    "bạn thân thiện quá", "bạn nhiệt tình quá",
  ]);

  const matchSet = (set, response) => {
    if (set.has(normalized)) return response;
    return null;
  };

  const greetingResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Xin chào! Mình là trợ lý AI của Dienthoaigiakho. Mình có thể giúp bạn tìm kiếm và tư vấn các dòng điện thoại theo hãng, giá cả, cấu hình và nhiều tiêu chí khác. Bạn cần mình hỗ trợ gì không?",
  };

  const howAreYouResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Mình cảm ơn bạn! Mình vẫn ổn và sẵn sàng hỗ trợ bạn. Bạn cần mình tư vấn về sản phẩm nào không ạ?",
  };

  const thanksResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Rất vui được hỗ trợ bạn! Nếu cần thêm thông tin về các sản phẩm điện thoại, bạn cứ hỏi mình nhé. Chúc bạn một ngày tốt lành!",
  };

  const goodbyeResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Cảm ơn bạn đã quan tâm và sử dụng dịch vụ của Dienthoaigiakho! Chúc bạn một ngày tốt lành và hẹn gặp lại bạn khi cần hỗ trợ nhé!",
  };

  const identityResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Mình là trợ lý AI của Dienthoaigiakho, chuyên hỗ trợ tìm kiếm và tư vấn điện thoại. Mình có thể giúp bạn tìm điện thoại theo hãng (iPhone, Samsung, OPPO,...), theo mức giá, theo nhu cầu (pin trâu, camera đẹp, chơi game,...) hoặc so sánh các dòng máy. Bạn muốn tìm hiểu về sản phẩm nào không?",
  };

  const acknowledgmentResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Nếu bạn cần thêm thông tin gì, đừng ngần ngại hỏi mình nhé! Mình luôn sẵn sàng hỗ trợ bạn.",
  };

  const praiseResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Cảm ơn bạn rất nhiều! Mình rất vui khi được hỗ trợ bạn. Nếu có thắc mắc gì thêm về sản phẩm, bạn cứ hỏi mình nhé!",
  };

  const checks = [
    [greetings, greetingResponse],
    [howAreYou, howAreYouResponse],
    [thanks, thanksResponse],
    [goodbye, goodbyeResponse],
    [identity, identityResponse],
    [acknowledgment, acknowledgmentResponse],
    [praise, praiseResponse],
  ];

  for (const [set, response] of checks) {
    const result = matchSet(set, response);
    if (result) {
      logger.debug('[Pre-classifier] Matched as small_talk');
      return result;
    }
  }

  return null;
};

const INTENT_SYSTEM_PROMPT =
  "Bạn là Quỳnh Như nhân viên CSKH của Dienthoaigiakho. Trả về JSON với intent (product_query|small_talk|complaint), clarified_query, direct_response. Nói tiếng Việt tự nhiên, thân thiện. Chỉ chào ở đầu cuộc trò chuyện.";

/**
 * Phân loại ý định và xử lý phản hồi thông minh
 * Trả về object với intent classification và response tương ứng
 *
 * Layered resilience:
 *   1. Deterministic pre-classifier (small talk + obvious complaints) — no LLM.
 *   2. OpenAI classification for ambiguous messages.
 *   3. Gemini classification when OpenAI is unavailable.
 *   4. Safe deterministic default (product_query) when both providers fail.
 * A provider failure ALWAYS degrades to a safe answer: an unclassified
 * message is treated as a product query, never invented as a complaint.
 */
const classifyIntentAndRespond = async (chatHistory, userQuery) => {
  try {
    if (!userQuery || typeof userQuery !== "string") {
      throw new Error("User query không hợp lệ");
    }

    // --- Deterministic pre-classifier (no LLM call) ---
    const preResult = preclassifyIntent(userQuery);
    if (preResult) {
      logger.debug("[classifyIntentAndRespond] Using pre-classifier result, skipping LLM");
      return preResult;
    }

    const safeHistory = Array.isArray(chatHistory) ? chatHistory : [];
    const messages = [
      {
        role: "system",
        content: INTENT_SYSTEM_PROMPT,
      },
      ...safeHistory.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
      {
        role: "user",
        content: `Hãy phân loại tin nhắn mới: ${userQuery}. Chỉ trả JSON.`,
      },
    ];

    const parseIntent = (responseText) => {
      const parsedResponse = parseJsonFromText(responseText);
      if (
        !parsedResponse.intent ||
        !["product_query", "small_talk", "complaint"].includes(parsedResponse.intent)
      ) {
        throw new Error("Invalid intent classification");
      }
      return parsedResponse;
    };

    const classifyWithProvider = async (provider) => {
      const responseText =
        provider === "gemini"
          ? await callGeminiChat(INTENT_SYSTEM_PROMPT, safeHistory, `Hãy phân loại tin nhắn mới: ${userQuery}. Chỉ trả JSON.`)
          : await callChat(messages, { maxTokens: 300, temperature: 0.3 });
      return parseIntent(responseText);
    };

    // OpenAI primary, Gemini fallback, deterministic default last.
    try {
      return await classifyWithProvider("openai");
    } catch (openAIError) {
      logger.warn({ err: { message: openAIError.message } }, "Intent classification: OpenAI failed, falling back to Gemini");
      try {
        return await classifyWithProvider("gemini");
      } catch (geminiError) {
        logger.warn({ err: { message: geminiError.message } }, "Intent classification: Gemini failed, using deterministic default");
        return {
          intent: "product_query",
          clarified_query: userQuery,
          direct_response: null,
        };
      }
    }
  } catch {
    return {
      intent: "product_query",
      clarified_query: userQuery,
      direct_response: null,
    };
  }
};

const generateResponse = async (prompt) => {
  try {
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt không hợp lệ");
    }

    const messages = [
      {
        role: "system",
        content: "Bạn là trợ lý thân thiện, trả lời ngắn gọn bằng tiếng Việt.",
      },
      { role: "user", content: prompt },
    ];

    return await callChat(messages, { maxTokens: 400, temperature: 0.7 });
  } catch (error) {
    logger.error({ err: { message: error.message } }, "generateResponse error");
    return "Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.";
  }
};

const generateChatResponse = async (chatHistory, userMessage, productContext = []) => {
  try {
    const systemPrompt = createSystemPrompt(productContext, chatHistory);
    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(chatHistory)
        ? chatHistory.map((msg) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          }))
        : []),
      { role: "user", content: userMessage },
    ];

    logger.info("Chat provider: OpenAI");
    try {
      const text = await callChat(messages, { maxTokens: 600, temperature: 0.7 });
      return { text, provider: "OpenAI" };
    } catch (openAIError) {
      if (isOpenAIUnavailableError(openAIError)) {
        logger.warn({ err: { message: openAIError.message } }, "OpenAI failed, switching to Gemini");
      } else {
        logger.warn({ err: { message: openAIError.message } }, "OpenAI error, attempting Gemini fallback");
      }

      logger.info("Chat provider: Gemini");
      try {
        const text = await callGeminiChat(systemPrompt, chatHistory, userMessage);
        return { text, provider: "Gemini" };
      } catch (geminiError) {
        logger.warn({ err: { message: geminiError.message } }, "Gemini failed, using deterministic fallback");

        const text = buildDeterministicResponse(productContext, userMessage);
        return { text, provider: "deterministic" };
      }
    }
  } catch (error) {
    logger.error({ err: { message: error.message } }, "generateChatResponse error");
    const text = buildDeterministicResponse(productContext, userMessage);
    return { text, provider: "deterministic" };
  }
};

const createSystemPrompt = (productContext = [], chatHistory = []) => {
  const contextText =
    Array.isArray(productContext) && productContext.length > 0
      ? productContext
          .map(
            (product, index) => `
SẢN PHẨM ${index + 1}:
- ID: ${product._id}
- Tên: ${product.name}
- Hãng: ${product.brand}
- Giá: ${new Intl.NumberFormat("vi-VN").format(product.price)} VND
- Mô tả: ${product.description}
- Tồn kho: ${product.inStock} sản phẩm
${product.specs ? `- Thông số: ${JSON.stringify(product.specs, null, 2)}` : ""}`
          )
          .join("\n")
      : "HIỆN TẠI KHÔNG CÓ SẢN PHẨM LIÊN QUAN TRONG KHO.";

  const historyText =
    Array.isArray(chatHistory) && chatHistory.length > 0
      ? chatHistory
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n")
      : "";

  return `Bạn là Quỳnh Như nhân viên tư vấn bán hàng tại Dienthoaigiakho.
1. TƯ VẤN NHIỆT TÌNH, thân thiện, tự nhiên.
2. CHỈ dùng dữ liệu sản phẩm, không bịa.
3. Luôn nêu tên sản phẩm, hãng, giá, tồn kho; chỉ đưa thông số khi được hỏi.
4. Nếu thiếu dữ liệu thì thừa nhận và gợi ý thay thế.
${contextText ? `DANH SÁCH SẢN PHẨM:\n${contextText}` : ""}
${historyText ? `LỊCH SỬ CHAT GẦN ĐÂY:\n${historyText}` : ""}
Không cần chào lại nếu đã chào trước đó. Trả lời bằng tiếng Việt thân thiện.`;
};

const { STREAM_CANCELLED, cancelledError, throwIfCancelled } = require("./chatCancellation");
// Longhand alias kept for readability inside the provider wrappers.
const throwIfAborted = throwIfCancelled;

/**
 * Streams a chat completion from OpenAI-compatible providers.
 * Emits text deltas via onDelta; resolves with { text, finishReason }.
 * Never throws on partial progress — callers can distinguish success/error
 * via whether any delta was emitted.
 */
const streamOpenAICompatible = async ({ messages, signal, onDelta, maxTokens = 600, temperature = 0.7 }) => {
  if (!openai) {
    throw new Error("OpenAI không được cấu hình — thiếu OPENAI_API_KEY");
  }
  throwIfAborted(signal);
  const stream = await openai.chat.completions.create({
    model: MODEL_NAME,
    temperature,
    max_tokens: maxTokens,
    messages,
    stream: true,
    ...(signal ? { signal } : {}),
  });

  let text = "";
  let finishReason = "stop";

  for await (const chunk of stream) {
    throwIfAborted(signal);
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      text += delta;
      if (onDelta) onDelta(delta);
    }
    if (chunk?.choices?.[0]?.finish_reason) {
      finishReason = chunk.choices[0].finish_reason;
    }
  }

  return { text, finishReason };
};

/**
 * Streams a chat completion from Google Gemini (via @google/genai).
 * Mirrors streamOpenAICompatible's contract so both can be used
 * interchangeably by the orchestrator.
 */
const streamGeminiChat = async ({ systemPrompt, chatHistory, userMessage, signal, onDelta, maxOutputTokens = 600, temperature = 0.7 }) => {
  if (!googleGenAI) {
    throw new Error("Gemini SDK not initialized — GEMINI_API_KEY missing");
  }

  const contents = [];
  if (Array.isArray(chatHistory)) {
    for (const msg of chatHistory) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }
  contents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  throwIfAborted(signal);
  const stream = await googleGenAI.models.generateContentStream({
    model: GEMINI_CHAT_MODEL,
    systemInstruction: systemPrompt,
    contents,
    config: {
      temperature,
      maxOutputTokens,
    },
  });

  let text = "";
  for await (const chunk of stream) {
    throwIfAborted(signal);
    const deltaText = chunk?.text;
    const delta =
      typeof deltaText === "string" ? deltaText : (chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "");
    if (typeof delta === "string" && delta.length > 0) {
      text += delta;
      if (onDelta) onDelta(delta);
    }
  }

  return { text, finishReason: "stop" };
};

/**
 * Orchestrator: streams a chat response with the same provider fallback chain
 * and safety limits as generateChatResponse, but emits deltas progressively.
 * Resolution shape: { fullResponse, provider, finishReason }.
 * On a mid-stream provider error after partial output, throws the error with
 * error.partialContent set to whatever was emitted so far.
 */
const generateChatResponseStream = async ({ userMessage, chatHistory = [], productContext = [], signal, onDelta }) => {
  const systemPrompt = createSystemPrompt(productContext, chatHistory);
  const messages = [
    ...(Array.isArray(chatHistory) ? chatHistory.map((msg) => ({ role: msg.role, content: msg.content })) : []),
    { role: "user", content: userMessage },
  ];

  let assembled = "";
  let emittedAny = false;
  let ceilingHit = false;

  const guardedEmit = (delta) => {
    if (ceilingHit) return;
    const remaining = MAX_STREAMED_TEXT_CHARS - assembled.length;
    if (delta.length > remaining) {
      if (remaining > 0) {
        const part = delta.slice(0, remaining);
        assembled += part;
        emittedAny = true;
        if (onDelta) onDelta(part);
      }
      ceilingHit = true;
      return;
    }
    assembled += delta;
    emittedAny = true;
    if (onDelta) onDelta(delta);
  };

  const finalizeReason = (reason) => (ceilingHit ? "max_tokens" : reason || "stop");

  const partialError = (error) => {
    if (emittedAny && assembled.length > 0) {
      error.partialContent = assembled;
    }
    return error;
  };

  try {
    // OpenAI-first, with Gemini fallback (mirrors generateChatResponse).
    try {
      const { text, finishReason } = await streamOpenAICompatible({ messages, signal, onDelta: guardedEmit });
      return { fullResponse: assembled || text, provider: "openai", finishReason: finalizeReason(finishReason), streamed: true };
    } catch (openAIError) {
      if (emittedAny) throw partialError(openAIError);
      logger.warn({ err: { message: openAIError.message } }, "Chat stream provider: OpenAI failed, falling back to Gemini");
    }

    throwIfAborted(signal);

    try {
      const { text, finishReason } = await streamGeminiChat({
        systemPrompt,
        chatHistory,
        userMessage,
        signal,
        onDelta: guardedEmit,
      });
      return { fullResponse: assembled || text, provider: "gemini", finishReason: finalizeReason(finishReason), streamed: true };
    } catch (geminiError) {
      if (emittedAny) throw partialError(geminiError);
      logger.warn({ err: { message: geminiError.message } }, "Chat stream provider: Gemini failed, using deterministic fallback");
    }

    throwIfAborted(signal);

    // Deterministic is an intentionally BUFFERED fallback: it does not stream
    // deltas. The caller emits a single compatibility aiResponse for it.
    const text = buildDeterministicResponse(productContext, userMessage);
    return { fullResponse: text, provider: "deterministic", finishReason: "stop", streamed: false };
  } catch (error) {
    // Whatever the SDK threw, an aborted signal is always surfaced as the same
    // STREAM_CANCELLED error so callers can distinguish user cancellation from a
    // genuine provider failure.
    throwIfCancelled(signal);
    throw partialError(error);
  }
};

/**
 * Validates and sanitizes the LLM complaint payload (contact, priority, tags).
 * Throws on a structurally invalid payload so callers can fall back.
 */
const normalizeComplaintData = (parsedResponse) => {
  if (
    !parsedResponse ||
    typeof parsedResponse.responseText !== "string" ||
    typeof parsedResponse.isComplete !== "boolean" ||
    !parsedResponse.complaintData
  ) {
    throw new Error("Invalid complaint response structure");
  }

  if (!parsedResponse.complaintData.customerContact) {
    parsedResponse.complaintData.customerContact = {};
  }

  if (parsedResponse.complaintData.customerContact.email) {
    const email = parsedResponse.complaintData.customerContact.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    parsedResponse.complaintData.customerContact.email = emailRegex.test(email)
      ? email
      : null;
  }

  if (parsedResponse.complaintData.customerContact.phone) {
    let phone = parsedResponse.complaintData.customerContact.phone.replace(/[\s\-\.]/g, "");
    const phoneRegex = /^(0|\+84)[0-9]{9,10}$/;
    parsedResponse.complaintData.customerContact.phone = phoneRegex.test(phone)
      ? phone
      : null;
  }

  if (
    !parsedResponse.complaintData.priority ||
    !["low", "medium", "high", "urgent"].includes(parsedResponse.complaintData.priority)
  ) {
    parsedResponse.complaintData.priority = "medium";
  }

  if (!Array.isArray(parsedResponse.complaintData.tags)) {
    parsedResponse.complaintData.tags = [];
  }

  return parsedResponse;
};

const COMPLAINT_SYSTEM_PROMPT = "Bạn là agent xử lý khiếu nại chuyên nghiệp, trả JSON.";

const buildComplaintFallback = (userMessage, tag = "system_error") => ({
  responseText:
    "Em rất xin lỗi vì sự bất tiện này. Anh/chị có thể mô tả thêm về vấn đề và cho em xin email hoặc số điện thoại để em chuyển bộ phận chuyên trách hỗ trợ ngay được không ạ?",
  isComplete: false,
  complaintData: {
    detailedDescription: userMessage,
    customerContact: {
      email: null,
      phone: null,
    },
    priority: "medium",
    tags: [tag],
  },
  nextAction: "Yêu cầu thông tin liên lạc từ khách hàng",
});

/**
 * Specialized complaint handling agent
 * Handles multi-turn conversation and extracts contact information
 *
 * Layered resilience: OpenAI primary, Gemini fallback, deterministic fallback.
 * The caller (chatController) owns confirmation and persistence — this function
 * never decides whether a complaint record is created.
 */
const generateComplaintResponse = async (chatHistory, userMessage) => {
  try {
    if (!userMessage || typeof userMessage !== "string") {
      throw new Error("User message không hợp lệ");
    }

    const safeHistory = Array.isArray(chatHistory) ? chatHistory : [];
    const historyText =
      safeHistory.length > 0
        ? safeHistory.map((msg) => `${msg.role}: ${msg.content}`).join("\n")
        : "";

    const complaintPrompt = `Bạn là Quỳnh Như, chuyên viên xử lý khiếu nại của DienThoaiGiaKho.
1. Luôn đồng cảm và xin lỗi vì bất tiện.
2. Thu thập email/SĐT, tự phát hiện nếu có trong tin nhắn.
3. isComplete = true chỉ khi đã có ít nhất một thông tin liên lạc.
4. priority: urgent (lỗi nghiêm trọng), high (lỗi sản phẩm), medium (dịch vụ), low (thắc mắc).
Chỉ trả JSON.
${historyText ? `LỊCH SỬ CHAT:\n${historyText}` : ""}
TIN NHẮN MỚI: ${userMessage}
Trả về JSON với:
{
  "responseText": "...",
  "isComplete": true/false,
  "complaintData": {
    "detailedDescription": "...",
    "customerContact": { "email": "...", "phone": "..." },
    "priority": "low|medium|high|urgent",
    "tags": ["..."]
  }
}`;

    const attempt = async (provider) => {
      const responseText =
        provider === "gemini"
          ? await callGeminiChat(COMPLAINT_SYSTEM_PROMPT, safeHistory, complaintPrompt)
          : await callChat(
              [
                { role: "system", content: COMPLAINT_SYSTEM_PROMPT },
                { role: "user", content: complaintPrompt },
              ],
              { maxTokens: 500, temperature: 0.4 }
            );
      return normalizeComplaintData(parseJsonFromText(responseText));
    };

    try {
      return await attempt("openai");
    } catch (openAIError) {
      logger.warn({ err: { message: openAIError.message } }, "Complaint agent: OpenAI failed, falling back to Gemini");
      try {
        return await attempt("gemini");
      } catch (geminiError) {
        logger.warn({ err: { message: geminiError.message } }, "Complaint agent: Gemini failed, using deterministic fallback");
        return buildComplaintFallback(userMessage);
      }
    }
  } catch (error) {
    logger.error({ err: { message: error.message } }, "Error in generateComplaintResponse");
    return buildComplaintFallback(userMessage);
  }
};

const testGeminiConnection = async () => {
  try {
    logger.info("Testing OpenAI chat connection...");
    const testResponse = await generateResponse(
      "Chào bạn, tôi đang test kết nối API. Vui lòng trả lời ngắn gọn."
    );
    if (testResponse && !testResponse.includes("sự cố kỹ thuật")) {
      logger.info("OpenAI chat connection successful");
      return true;
    }
    throw new Error("Test response không hợp lệ");
  } catch (error) {
    logger.error({ err: { message: error.message } }, "OpenAI chat connection failed");
    return false;
  }
};

module.exports = {
  classifyIntentAndRespond,
  preclassifyIntent,
  preclassifyComplaint,
  preclassifyComplaintContinuation,
  generateResponse,
  generateChatResponse,
  generateChatResponseStream,
  streamOpenAICompatible,
  streamGeminiChat,
  createSystemPrompt,
  generateComplaintResponse,
  testGeminiConnection,
  STREAM_CANCELLED,
};



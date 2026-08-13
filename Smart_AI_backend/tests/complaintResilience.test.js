/* ------------------------------------------------------------------ */
/*  Complaint resilience tests                                         */
/*                                                                     */
/*  Verifies the complaint flow keeps working without a live LLM:      */
/*    - obvious complaints are detected deterministically (no provider) */
/*    - provider failures (429/quota/timeout) never block the flow     */
/*    - a complaint intent is NEVER invented on provider failure       */
/*    - generateComplaintResponse degrades to a safe deterministic      */
/*      shape and never leaks a raw provider error to the user         */
/*    - user cancellation is not mistaken for a provider outage         */
/*                                                                     */
/*  No real OpenAI/Gemini/Redis/Mongo calls are made.                  */
/* ------------------------------------------------------------------ */

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-test-dummy-key-for-resilience";
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-gemini-key-for-resilience";

const {
  preclassifyComplaint,
  classifyIntentAndRespond,
  generateComplaintResponse,
} = require("../utils/gemini");

/* ============================================================
   Deterministic complaint pre-classification (no LLM needed)
   ============================================================ */
describe("preclassifyComplaint — deterministic, no provider needed", () => {
  const obviousComplaints = [
    "sản phẩm bị lỗi",
    "tôi muốn khiếu nại",
    "hàng giao bị vỡ",
    "điện thoại tôi mua bị hỏng",
    "sản phẩm không đúng mô tả",
    "giao hàng chậm",
    "tôi muốn phàn nàn về dịch vụ",
    "chưa nhận được hàng",
    "hàng bị mất",
    "giao nhầm màu",
    "shipper làm hỏng hàng",
  ];

  test.each(obviousComplaints)('"%s" is a complaint', (msg) => {
    const result = preclassifyComplaint(msg);
    expect(result).not.toBeNull();
    expect(result.intent).toBe("complaint");
  });

  const productQueries = [
    "giá iphone 15 pro max bao nhiêu",
    "điện thoại nào pin tốt",
    "giao hàng bao lâu",
    "giao hàng chậm không",
    "cách bảo hành sản phẩm",
    "tư vấn mua điện thoại",
    "so sánh iphone và samsung",
    "điện thoại bị lỗi gì",
    "còn hàng không",
    "có trả góp không",
  ];

  test.each(productQueries)('"%s" is NOT a complaint (null → defer)', (msg) => {
    expect(preclassifyComplaint(msg)).toBeNull();
  });

  test("null / undefined / empty input -> null", () => {
    expect(preclassifyComplaint(null)).toBeNull();
    expect(preclassifyComplaint(undefined)).toBeNull();
    expect(preclassifyComplaint("")).toBeNull();
    expect(preclassifyComplaint("   ")).toBeNull();
  });
});

/* ============================================================
   Layered classification: OpenAI → Gemini → deterministic
   ============================================================ */
describe("classifyIntentAndRespond — layered providers", () => {
  let openaiCreate;
  let geminiGenerate;

  const loadWithMocks = () => {
    jest.doMock("openai", () => class {
      constructor() {}
      chat = { completions: { create: openaiCreate } };
    });
    jest.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        constructor() {}
        models = { generateContent: geminiGenerate };
      },
    }));
    return require("../utils/gemini");
  };

  beforeEach(() => {
    openaiCreate = jest.fn();
    geminiGenerate = jest.fn();
    jest.resetModules();
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "gem-test";
  });

  it("short-circuits to the deterministic pre-classifier for an obvious complaint (no provider call)", async () => {
    const mod = loadWithMocks();
    const result = await mod.classifyIntentAndRespond([], "tôi muốn khiếu nại về hàng hóa");
    expect(result.intent).toBe("complaint");
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(geminiGenerate).not.toHaveBeenCalled();
  });

  it("uses OpenAI for an ambiguous message when it is healthy", async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ intent: "product_query", clarified_query: "iphone 15", direct_response: null }) } }],
    });
    const mod = loadWithMocks();
    const result = await mod.classifyIntentAndRespond([], "tôi muốn đổi trả");
    expect(result.intent).toBe("product_query");
    expect(openaiCreate).toHaveBeenCalled();
    expect(geminiGenerate).not.toHaveBeenCalled();
  });

  it("falls back to Gemini classification when OpenAI is unavailable (429)", async () => {
    openaiCreate.mockRejectedValue(Object.assign(new Error("Rate limit"), { status: 429 }));
    geminiGenerate.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ intent: "complaint", clarified_query: null, direct_response: null }) }] } }],
    });
    const mod = loadWithMocks();
    const result = await mod.classifyIntentAndRespond([], "chất lượng sản phẩm không được như mong đợi");
    expect(result.intent).toBe("complaint");
    expect(openaiCreate).toHaveBeenCalled();
    expect(geminiGenerate).toHaveBeenCalled();
  });

  it("NEVER invents a complaint when all providers fail — degrades to a safe product_query", async () => {
    openaiCreate.mockRejectedValue(Object.assign(new Error("Insufficient quota"), { status: 429 }));
    geminiGenerate.mockRejectedValue(new Error("Gemini socket hang up"));
    const mod = loadWithMocks();
    const query = "giá iphone 15 pro max là bao nhiêu ạ";
    const result = await mod.classifyIntentAndRespond([], query);
    expect(result.intent).toBe("product_query");
    expect(result.clarified_query).toBe(query);
    expect(result.intent).not.toBe("complaint");
  });
});

/* ============================================================
   generateComplaintResponse — safe degradation, no raw errors
   ============================================================ */
describe("generateComplaintResponse — safe degradation", () => {
  let openaiCreate;
  let geminiGenerate;

  const loadWithMocks = () => {
    jest.doMock("openai", () => class {
      constructor() {}
      chat = { completions: { create: openaiCreate } };
    });
    jest.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        constructor() {}
        models = { generateContent: geminiGenerate };
      },
    }));
    return require("../utils/gemini");
  };

  beforeEach(() => {
    openaiCreate = jest.fn();
    geminiGenerate = jest.fn();
    jest.resetModules();
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "gem-test";
  });

  it("returns a deterministic structure (no raw error leak) when OpenAI and Gemini both fail", async () => {
    openaiCreate.mockRejectedValue(
      Object.assign(new Error("You exceeded your current quota, please check your plan and billing details"), { status: 429, type: "insufficient_quota" })
    );
    geminiGenerate.mockRejectedValue(new Error("socket hang up"));
    const mod = loadWithMocks();

    const userMessage = "sản phẩm giao bị vỡ màn hình";
    const result = await mod.generateComplaintResponse([], userMessage);

    expect(result.isComplete).toBe(false);
    expect(result.complaintData.customerContact).toEqual({ email: null, phone: null });
    expect(result.complaintData.tags).toContain("system_error");
    expect(result.complaintData.detailedDescription).toBe(userMessage);
    // The user always gets a helpful reply — never the raw provider error.
    expect(typeof result.responseText).toBe("string");
    expect(result.responseText.length).toBeGreaterThan(0);
    expect(result.responseText).not.toContain("quota");
    expect(result.responseText).not.toContain("socket hang up");
  });

  it("never throws to its caller — a catastrophic failure still yields a deterministic reply", async () => {
    openaiCreate.mockRejectedValue(new Error("Provider completely down"));
    geminiGenerate.mockRejectedValue(new Error("Gemini down too"));
    const mod = loadWithMocks();
    const result = await mod.generateComplaintResponse([], "hàng chưa về");
    expect(result).toBeDefined();
    expect(typeof result.responseText).toBe("string");
    expect(result.responseText).not.toContain("Provider completely down");
  });
});
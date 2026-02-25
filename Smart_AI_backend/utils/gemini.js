const OpenAI = require("openai");
require("dotenv").config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY không được định nghĩa trong file .env");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4o";

const callChat = async (messages, options = {}) => {
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

/**
 * Phân loại ý định và xử lý phản hồi thông minh
 * Trả về object với intent classification và response tương ứng
 */
const classifyIntentAndRespond = async (chatHistory, userQuery) => {
  try {
    if (!userQuery || typeof userQuery !== "string") {
      throw new Error("User query không hợp lệ");
    }

    const safeHistory = Array.isArray(chatHistory) ? chatHistory : [];
    const messages = [
      {
        role: "system",
        content:
          "Bạn là Quỳnh Như nhân viên CSKH của Dienthoaigiakho. Trả về JSON với intent (product_query|small_talk|complaint), clarified_query, direct_response. Nói tiếng Việt tự nhiên, thân thiện. Chỉ chào ở đầu cuộc trò chuyện.",
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

    const responseText = await callChat(messages, { maxTokens: 300, temperature: 0.3 });

    try {
      const parsedResponse = parseJsonFromText(responseText);
      if (
        !parsedResponse.intent ||
        !["product_query", "small_talk", "complaint"].includes(parsedResponse.intent)
      ) {
        throw new Error("Invalid intent classification");
      }
      return parsedResponse;
    } catch {
      return {
        intent: "product_query",
        clarified_query: userQuery,
        direct_response: null,
      };
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
    console.error("generateResponse error:", error.message);
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

    const responseText = await callChat(messages, { maxTokens: 600, temperature: 0.7 });
    return responseText;
  } catch (error) {
    console.error("generateChatResponse error:", error.message);
    return "Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau ít phút.";
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

/**
 * Specialized complaint handling agent
 * Handles multi-turn conversation and extracts contact information
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

    const responseText = await callChat(
      [
        { role: "system", content: "Bạn là agent xử lý khiếu nại chuyên nghiệp, trả JSON." },
        { role: "user", content: complaintPrompt },
      ],
      { maxTokens: 500, temperature: 0.4 }
    );

    try {
      const parsedResponse = parseJsonFromText(responseText);

      if (
        !parsedResponse.responseText ||
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
    } catch (parseError) {
      console.error("Error parsing complaint response:", parseError.message);

      return {
        responseText:
          "Em rất xin lỗi về sự bất tiện này. Em đã ghi nhận khiếu nại và sẽ chuyển bộ phận chuyên trách. Anh/chị có thể cung cấp email hoặc số điện thoại để em liên hệ ạ?",
        isComplete: false,
        complaintData: {
          detailedDescription: userMessage,
          customerContact: {
            email: null,
            phone: null,
          },
          priority: "medium",
          tags: ["general"],
        },
        nextAction: "Yêu cầu thông tin liên lạc từ khách hàng",
      };
    }
  } catch (error) {
    console.error("Error in generateComplaintResponse:", error.message);

    return {
      responseText:
        "Em rất xin lỗi, hiện tại hệ thống đang gặp sự cố kỹ thuật. Anh/chị có thể liên hệ hotline để được hỗ trợ trực tiếp không ạ?",
      isComplete: false,
      complaintData: {
        detailedDescription: userMessage,
        customerContact: {
          email: null,
          phone: null,
        },
        priority: "medium",
        tags: ["system_error"],
      },
      nextAction: "Hướng dẫn khách hàng liên hệ hotline",
    };
  }
};

const testGeminiConnection = async () => {
  try {
    console.log("Testing OpenAI chat connection...");
    const testResponse = await generateResponse(
      "Chào bạn, tôi đang test kết nối API. Vui lòng trả lời ngắn gọn."
    );
    if (testResponse && !testResponse.includes("sự cố kỹ thuật")) {
      console.log("OpenAI chat connection thành công");
      return true;
    }
    throw new Error("Test response không hợp lệ");
  } catch (error) {
    console.error("OpenAI chat connection failed:", error.message);
    return false;
  }
};

module.exports = {
  classifyIntentAndRespond,
  generateResponse,
  generateChatResponse,
  createSystemPrompt,
  generateComplaintResponse,
  testGeminiConnection,
};



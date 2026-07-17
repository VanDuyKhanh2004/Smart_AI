process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-test-dummy-key-for-classifier";
const { preclassifyIntent } = require("../utils/gemini");

const classify = (msg) => preclassifyIntent(msg);

/* --------------- helpers --------------- */
const expectSmallTalk = (msg) => {
  const result = classify(msg);
  expect(result).not.toBeNull();
  expect(result.intent).toBe("small_talk");
  expect(result.clarified_query).toBeNull();
  expect(typeof result.direct_response).toBe("string");
  expect(result.direct_response.length).toBeGreaterThan(0);
};

const expectNotSmallTalk = (msg) => {
  const result = classify(msg);
  expect(result).toBeNull();
};

/* ============================================================
   Pure small-talk phrases — should be caught by pre-classifier
   ============================================================ */
describe("preclassifyIntent — exact-match small talk", () => {
  const greetings = [
    "xin chào",
    "chào bạn",
    "chào",
    "chào bạn ơi",
    "chào buổi sáng",
    "chào buổi chiều",
    "chào buổi tối",
    "chào bạn buổi sáng",
    "chào mọi người",
    "hello",
    "hi",
    "hey",
    "helo",
    "hí",
    "hii",
    "hello bạn",
    "hi bạn",
    "hế lô",
    "alo",
    "xin chào các bạn",
  ];

  test.each(greetings)('"%s" is small_talk', expectSmallTalk);
});

describe("greetings with punctuation / emoji", () => {
  test.each([
    "xin chào!",
    "chào bạn!",
    "hello!",
    "hi!",
    "xin chào 👋",
    "chào bạn 😊",
    "hello 👋😊",
    "chào buổi sáng!",
    "chào bạn ơi!",
  ])('"%s" is small_talk', expectSmallTalk);
});

describe("case-insensitive greetings", () => {
  test.each([
    "XIN CHÀO",
    "Xin Chào",
    "HELLO",
    "Hello",
  ])('"%s" is small_talk', expectSmallTalk);
});

describe("how-are-you phrases", () => {
  test.each([
    "bạn khỏe không",
    "bạn có khỏe không",
    "bạn thế nào",
    "bạn ổn không",
    "bạn sao rồi",
    "bạn ổn chứ",
    "khỏe không bạn",
    "thế nào bạn",
    "dạo này thế nào",
    "công việc thế nào",
  ])('"%s" is small_talk', expectSmallTalk);
});

describe("thanks / acknowledgment", () => {
  test.each([
    "cảm ơn",
    "cảm ơn bạn",
    "cảm ơn nhiều",
    "cảm ơn bạn nhiều",
    "cảm ơn bạn rất nhiều",
    "cám ơn",
    "cám ơn bạn",
    "thanks",
    "thank you",
    "thank you very much",
    "dạ cảm ơn",
    "dạ cảm ơn bạn",
    "ok",
    "okay",
    "okê",
    "oke",
    "ok bạn",
    "vâng",
    "dạ",
    "dạ vâng",
    "rồi ạ",
    "hiểu rồi",
    "understood",
    "got it",
    "cảm ơn bạn đã hỗ trợ",
  ])('"%s" is small_talk', expectSmallTalk);
});

describe("goodbye phrases", () => {
  test.each([
    "tạm biệt",
    "tạm biệt bạn",
    "tạm biệt nhé",
    "bye",
    "bye bye",
    "goodbye",
    "chào tạm biệt",
    "chào nhé",
    "hẹn gặp lại",
    "hẹn gặp lại bạn",
    "gặp lại sau",
    "tạm biệt bạn nha",
    "bye bạn",
  ])('"%s" is small_talk', expectSmallTalk);
});

describe("identity questions", () => {
  test.each([
    "bạn là ai",
    "bạn tên gì",
    "bạn tên là gì",
    "bạn là ai vậy",
    "bạn làm được gì",
    "bạn có thể làm gì",
    "chức năng của bạn là gì",
    "bạn có thể giúp gì",
    "giới thiệu về bạn đi",
  ])('"%s" is small_talk', expectSmallTalk);
});

describe("acknowledgment / fillers", () => {
  test.each([
    "ừ",
    "ừm",
    "vậy ạ",
    "ra vậy",
    "à ra vậy",
    "rõ rồi",
    "được rồi",
    "mình hiểu rồi",
  ])('"%s" is small_talk', expectSmallTalk);
});

describe("praise", () => {
  test.each([
    "bạn giỏi quá",
    "bạn tốt quá",
    "bạn thật tuyệt",
    "bạn tuyệt vời",
    "giỏi quá",
    "tuyệt vời",
    "cảm ơn bạn giỏi quá",
  ])('"%s" is small_talk', expectSmallTalk);
});

/* ============================================================
   Mixed messages — should NOT be caught (defer to AI)
   ============================================================ */
describe("mixed greeting + product query — NOT small talk", () => {
  test.each([
    "xin chào tư vấn iphone",
    "chào bạn cho mình hỏi iphone 15 pro max giá bao nhiêu",
    "hello mình muốn mua samsung",
    "chào bạn ơi tư vấn giúp mình điện thoại",
    "hi bán cho mình oppo",
    "xin chào cửa hàng còn iphone không",
    "alo cho hỏi giá iphone",
    "chào bạn mình cần tìm điện thoại pin trâu",
  ])('"%s" returns null (pass to AI)', expectNotSmallTalk);
});

describe("pure product queries — NOT small talk", () => {
  test.each([
    "mua iphone 15",
    "tìm samsung galaxy s24",
    "giá oppo reno",
    "điện thoại nào pin tốt",
    "so sánh iphone và samsung",
    "cửa hàng ở đâu",
    "tư vấn mua điện thoại",
    "thông số kỹ thuật iphone 16 pro max",
    "cách bảo hành sản phẩm",
    "thanh toán như thế nào",
    "giao hàng bao lâu",
    "có trả góp không",
    "giảm giá gì không",
    "cho mình xem iphone 15 đi",
    "note 20 ultra giá",
    "còn hàng không",
    "cho mình hỏi về sản phẩm",
    "laptop nào chơi game tốt",
    "iphone 14 và 15 khác gì nhau",
  ])('"%s" returns null (pass to AI)', expectNotSmallTalk);
});

describe("complaint-like messages — NOT small talk", () => {
  test.each([
    "sản phẩm bị lỗi",
    "tôi muốn khiếu nại",
    "hàng giao bị vỡ",
    "điện thoại tôi mua bị hỏng",
    "tôi muốn đổi trả",
    "tôi muốn khiếu nại về dịch vụ",
    "sản phẩm không đúng mô tả",
    "giao hàng chậm",
  ])('"%s" returns null (pass to AI)', expectNotSmallTalk);
});

/* ============================================================
   Edge cases
   ============================================================ */
describe("edge cases — returns null", () => {
  test("null input", () => {
    expect(classify(null)).toBeNull();
  });

  test("undefined input", () => {
    expect(classify(undefined)).toBeNull();
  });

  test("empty string", () => {
    expect(classify("")).toBeNull();
  });

  test("whitespace only", () => {
    expect(classify("   ")).toBeNull();
  });

  test("very long product query", () => {
    const long = "tôi muốn mua một chiếc điện thoại iphone 15 pro max màu tím dung lượng 256gb . ".repeat(10);
    expect(classify(long)).toBeNull();
  });
});

/* ============================================================
   Non-Vietnamese small talk
   ============================================================ */
describe("English small talk", () => {
  test.each([
    "hello",
    "hi",
    "hey",
    "thanks",
    "thank you",
    "goodbye",
    "bye",
    "bye bye",
    "hello",
    "ok",
    "okay",
  ])('"%s" is small_talk', expectSmallTalk);
});

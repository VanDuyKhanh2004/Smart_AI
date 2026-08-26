process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-test-dummy-key-for-classifier";
const { preclassifyIntent, preclassifyFollowUpReference } = require("../utils/gemini");

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

const expectComplaint = (msg) => {
  const result = classify(msg);
  expect(result).not.toBeNull();
  expect(result.intent).toBe("complaint");
  expect(result.clarified_query).toBeNull();
  expect(result.direct_response).toBeNull();
};

const expectStoreQuery = (msg) => {
  const result = classify(msg);
  expect(result).not.toBeNull();
  expect(result.intent).toBe("store_query");
  expect(result.clarified_query).toBeNull();
  expect(result.direct_response).toBeNull();
  expect(result.preclassified).toBe("store_query");
};

const expectPromotionQuery = (msg) => {
  const result = classify(msg);
  expect(result).not.toBeNull();
  expect(result.intent).toBe("promotion_query");
  expect(result.clarified_query).toBeNull();
  expect(result.direct_response).toBeNull();
  expect(result.preclassified).toBe("promotion_query");
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
    "tư vấn mua điện thoại",
    "thông số kỹ thuật iphone 16 pro max",
    "cách bảo hành sản phẩm",
    "thanh toán như thế nào",
    "giao hàng bao lâu",
    "có trả góp không",
    "cho mình xem iphone 15 đi",
    "note 20 ultra giá",
    "còn hàng không",
    "cho mình hỏi về sản phẩm",
    "laptop nào chơi game tốt",
    "iphone 14 và 15 khác gì nhau",
  ])('"%s" returns null (pass to AI)', expectNotSmallTalk);
});

/* ============================================================
   Store queries — deterministic store_query intent
   ============================================================ */
describe("unambiguous store queries — deterministic store_query intent", () => {
  test.each([
    "cửa hàng ở đâu",
    "xin chào cửa hàng còn iphone không",
    "cửa hàng mở cửa lúc mấy giờ",
    "cửa hàng có ở hà nội không",
  ])('"%s" is store_query', expectStoreQuery);
});

/* ============================================================
   Promotion queries — deterministic promotion_query intent
   ============================================================ */
describe("unambiguous promotion queries — deterministic promotion_query intent", () => {
  test.each([
    "giảm giá gì không",
    "có mã giảm giá không",
    "khuyến mãi hiện tại",
    "có chương trình khuyến mãi nào",
    "khuyến mãi tháng này",
  ])('"%s" is promotion_query', expectPromotionQuery);
});

describe("unambiguous complaints — deterministic complaint intent", () => {
  test.each([
    "sản phẩm bị lỗi",
    "tôi muốn khiếu nại",
    "hàng giao bị vỡ",
    "điện thoại tôi mua bị hỏng",
    "tôi muốn khiếu nại về dịch vụ",
    "sản phẩm không đúng mô tả",
    "giao hàng chậm",
  ])('"%s" is complaint', expectComplaint);
});

describe("complaint-adjacent ambiguous messages — defer to AI", () => {
  test.each([
    "tôi muốn đổi trả",
    "hàng có được đổi trả không",
    "giao hàng chậm không",
    "điện thoại bị lỗi gì",
    "tư vấn sản phẩm bị lỗi",
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

/* ============================================================
   preclassifyFollowUpReference
   ============================================================ */
describe("preclassifyFollowUpReference", () => {
  describe("product positional references", () => {
    test.each([
      ["cái đầu tiên", 1],
      ["sản phẩm đầu tiên", 1],
      ["điện thoại đầu tiên", 1],
      ["máy đầu tiên", 1],
      ["phone đầu tiên", 1],
    ])('"%s" → product position %d', (msg, expectedPos) => {
      const result = preclassifyFollowUpReference(msg);
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("product");
      expect(result.position).toBe(expectedPos);
    });

    test.each([
      ["máy thứ hai", 2],
      ["sản phẩm thứ ba", 3],
      ["cái thứ 2", 2],
      ["máy thứ 4", 4],
    ])('"%s" → product position %d', (msg, expectedPos) => {
      const result = preclassifyFollowUpReference(msg);
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("product");
      expect(result.position).toBe(expectedPos);
    });

    test("máy tiếp theo → product position null", () => {
      const result = preclassifyFollowUpReference("máy tiếp theo");
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("product");
    });
  });

  describe("promotion references", () => {
    test.each([
      ["mã đầu tiên", 1],
      ["mã giảm giá đầu tiên", 1],
      ["mã khuyến mãi đầu tiên", 1],
    ])('"%s" → promotion position %d', (msg, expectedPos) => {
      const result = preclassifyFollowUpReference(msg);
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("promotion");
      expect(result.position).toBe(expectedPos);
    });

    test.each([
      ["mã đó", null],
      ["mã giảm giá đó", null],
    ])('"%s" → promotion position null', (msg) => {
      const result = preclassifyFollowUpReference(msg);
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("promotion");
      expect(result.position).toBeNull();
    });
  });

  describe("store references", () => {
    test.each([
      ["cửa hàng đầu tiên", 1],
      ["shop đầu tiên", 1],
      ["store đầu tiên", 1],
    ])('"%s" → store position %d', (msg, expectedPos) => {
      const result = preclassifyFollowUpReference(msg);
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("store");
      expect(result.position).toBe(expectedPos);
    });

    test.each([
      ["cửa hàng đó", null],
      ["shop đó", null],
    ])('"%s" → store position null', (msg) => {
      const result = preclassifyFollowUpReference(msg);
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("store");
      expect(result.position).toBeNull();
    });
  });

  describe("appointment references", () => {
    test.each([
      ["lịch hẹn đầu tiên", 1],
      ["cuộc hẹn đầu tiên", 1],
    ])('"%s" → appointment position %d', (msg, expectedPos) => {
      const result = preclassifyFollowUpReference(msg);
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("appointment");
      expect(result.position).toBe(expectedPos);
    });

    test.each([
      ["lịch hẹn đó", null],
      ["cuộc hẹn đó", null],
    ])('"%s" → appointment position null', (msg) => {
      const result = preclassifyFollowUpReference(msg);
      expect(result).not.toBeNull();
      expect(result.entityType).toBe("appointment");
      expect(result.position).toBeNull();
    });
  });

  describe("non-follow-up queries", () => {
    test.each([
      "mua iphone 15",
      "tìm samsung dưới 15 triệu",
      "bạn là ai",
      "cảm ơn",
      "xin chào",
      "giá bao nhiêu",
      "",
      null,
    ])('"%s" → null', (msg) => {
      expect(preclassifyFollowUpReference(msg)).toBeNull();
    });
  });
});

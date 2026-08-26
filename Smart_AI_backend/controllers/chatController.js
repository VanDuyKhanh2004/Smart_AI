const crypto = require("crypto");
const Conversation = require("../models/Conversation");
const Complaint = require("../models/Complaint");
const Appointment = require("../models/Appointment");
const Store = require("../models/Store");
const Promotion = require("../models/Promotion");
const logger = require("../utils/logger");
const productSearchService = require("../services/productSearchService");
const {
  classifyIntentAndRespond,
  generateChatResponse,
  generateChatResponseStream,
  generateComplaintResponse,
  preclassifyComplaintContinuation,
  preclassifyAppointment,
  preclassifyPersonalInfo,
} = require("../utils/gemini");
const complaintService = require("../services/complaintService");
const complaintFlowService = require("../services/complaintFlowService");

const { createChatStreamBatching } = require("../services/chatStreamBatching");
const chatActiveStreams = require("../services/chatActiveStreams");
const { throwIfCancelled, maybeTestDelay } = require("../utils/chatCancellation");
const { parseProductConstraints } = require("../utils/productConstraintParser");
const { matchesProductConstraints } = require("../utils/productValidator");
const { rankProducts } = require("../utils/productRanking");
const { classifyQuery, resolveFollowUpQuery, createContextFromParsed, sanitizeConversationContext, buildEntityLabels } = require("../utils/conversationContext");
const contextService = require("../services/contextService");
const { resolveProductSpec } = require("../utils/productSpecResolver");

/**
 * Best-effort extraction of an email/phone from a chat message. Used to enrich
 * a pending complaint confirmation — never a gate on persistence.
 */
const extractContactFromMessage = (message) => {
  const result = { email: null, phone: null };
  if (!message || typeof message !== "string") return result;

  const emailMatch = message.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (emailMatch) result.email = emailMatch[0].toLowerCase();

  const phoneMatch = message.match(/(0|\+84)[\s.-]?[\d][\d\s.-]{8,11}/);
  if (phoneMatch) {
    const phone = phoneMatch[0].replace(/[\s.\-()]/g, "");
    if (/^(0|\+84)\d{9,10}$/.test(phone)) result.phone = phone;
  }

  return result;
};

/**
 * Build user context from socket.data.user (server-trusted identity).
 * Returns a plain object with safe profile fields, or null if no user.
 */
const buildUserContext = (socket) => {
  const user = socket && socket.data && socket.data.user;
  if (!user || !user.id) return null;
  const ctx = {};
  if (user.name) ctx.name = user.name;
  if (user.email) ctx.email = user.email;
  if (user.phone) ctx.phone = user.phone;
  return Object.keys(ctx).length > 0 ? ctx : null;
};

/**
 * Build appointment context for the authenticated user.
 * Queries only by the server-trusted userId; never by a client-supplied value.
 * Returns an array of appointment summaries for active (pending/confirmed)
 * appointments, sorted by date ascending (nearest first).
 */
const buildAppointmentContext = async (userId) => {
  if (!userId) return [];
  const now = new Date();
  try {
    const appointments = await Appointment.find({
      user: userId,
      status: { $in: ["pending", "confirmed"] },
      date: { $gte: now },
    })
      .populate("store", "name address phone")
      .sort({ date: 1, "timeSlot.start": 1 })
      .limit(10);

    return appointments.map((apt) => {
      const aptObj = apt.toObject ? apt.toObject() : { ...apt };
      const result = {};
      if (aptObj.store) {
        if (aptObj.store.name) result.storeName = aptObj.store.name;
        if (aptObj.store.address) {
          result.storeAddress = aptObj.store.address.fullAddress || aptObj.store.address;
        }
        if (aptObj.store.phone) result.storePhone = aptObj.store.phone;
      }
      if (aptObj.date) {
        result.date = aptObj.date.toLocaleDateString("vi-VN", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
          timeZone: "Asia/Ho_Chi_Minh",
        });
      }
      if (aptObj.timeSlot) {
        result.timeSlot = `${aptObj.timeSlot.start} - ${aptObj.timeSlot.end}`;
      }
      if (aptObj.purpose) {
        const purposeMap = { consultation: "Tư vấn", warranty: "Bảo hành", purchase: "Mua hàng", other: "Khác" };
        result.purpose = purposeMap[aptObj.purpose] || aptObj.purpose;
      }
      if (aptObj.status) {
        const statusMap = { pending: "Chờ xác nhận", confirmed: "Đã xác nhận", cancelled: "Đã hủy", completed: "Đã hoàn thành" };
        result.status = statusMap[aptObj.status] || aptObj.status;
      }
      if (aptObj.notes) result.notes = aptObj.notes;
      return result;
    });
  } catch (err) {
    logger.warn({ err: { message: err.message }, userId }, "Failed to fetch appointment context");
    return [];
  }
};

/**
 * Deterministically format a list of appointment summaries into a Vietnamese
 * response string. Used for simple factual appointment queries where
 * deterministic output is preferred over LLM generation.
 */
const formatAppointmentResponse = (appointments) => {
  if (!appointments || appointments.length === 0) {
    return "Hiện tại bạn chưa có lịch hẹn nào sắp tới. Bạn có muốn đặt lịch hẹn không?";
  }

  const lines = [`Bạn có ${appointments.length} lịch hẹn sắp tới:`];
  appointments.forEach((apt, i) => {
    const parts = [];
    if (apt.date) parts.push(apt.date);
    if (apt.timeSlot) parts.push(apt.timeSlot);
    if (apt.storeName) parts.push(`tại ${apt.storeName}`);
    if (apt.purpose) parts.push(`(${apt.purpose})`);
    if (apt.status) parts.push(`- ${apt.status}`);
    lines.push(`${i + 1}. ${parts.join(" ")}`);
  });

  return lines.join("\n");
};

/**
 * Build store context for the chatbot.
 * Queries only active stores and returns safe user-facing fields.
 * Follows the same pattern as buildAppointmentContext.
 */
const buildStoreContext = async () => {
  try {
    const stores = await Store.find({ isActive: true }).sort({ name: 1 }).limit(10);
    return stores.map((store) => {
      const obj = store.toObject ? store.toObject() : { ...store };
      const result = {};
      if (obj.name) result.name = obj.name;
      if (obj.address) {
        result.address = obj.address.fullAddress || obj.address;
      }
      if (obj.phone) result.phone = obj.phone;
      if (obj.businessHours) {
        const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
        const parts = [];
        days.forEach((day, i) => {
          const bh = obj.businessHours[day];
          if (bh && !bh.isClosed && bh.open && bh.close) {
            parts.push(`${dayNames[i]}: ${bh.open}-${bh.close}`);
          }
        });
        if (parts.length > 0) result.businessHours = parts.join(", ");
      }
      if (obj.description) result.description = obj.description;
      return result;
    });
  } catch (err) {
    logger.warn({ err: { message: err.message } }, "Failed to fetch store context");
    return [];
  }
};

/**
 * Build promotion context for the chatbot.
 * Queries only currently valid promotions (isActive, within date range, usage remaining).
 * Returns safe user-facing fields with remainingUses virtual.
 */
const buildPromotionContext = async () => {
  const now = new Date();
  try {
    const promotions = await Promotion.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    }).sort({ createdAt: -1 }).limit(20);

    return promotions.map((promo) => {
      const obj = promo.toObject ? promo.toObject() : { ...promo };
      const result = {};
      if (obj.code) result.code = obj.code;
      if (obj.description) result.description = obj.description;
      if (obj.discountType) result.discountType = obj.discountType;
      if (obj.discountValue != null) result.discountValue = obj.discountValue;
      if (obj.maxDiscountAmount != null) result.maxDiscountAmount = obj.maxDiscountAmount;
      if (obj.minOrderValue != null) result.minOrderValue = obj.minOrderValue;
      if (obj.startDate) {
        result.startDate = new Date(obj.startDate).toLocaleDateString("vi-VN", {
          day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
        });
      }
      if (obj.endDate) {
        result.endDate = new Date(obj.endDate).toLocaleDateString("vi-VN", {
          day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
        });
      }
      if (obj.usageLimit != null && obj.usedCount != null) {
        result.remainingUses = Math.max(0, obj.usageLimit - obj.usedCount);
      }
      return result;
    });
  } catch (err) {
    logger.warn({ err: { message: err.message } }, "Failed to fetch promotion context");
    return [];
  }
};

/**
 * Deterministically format a list of store summaries into a Vietnamese
 * response string. Used for simple factual store queries.
 */
const formatStoreResponse = (stores) => {
  if (!stores || stores.length === 0) {
    return "Hiện chưa có cửa hàng nào đang hoạt động.";
  }

  const lines = [`Có ${stores.length} cửa hàng đang hoạt động:`];
  stores.forEach((store, i) => {
    const parts = [];
    if (store.name) parts.push(store.name);
    if (store.address) parts.push(`Địa chỉ: ${store.address}`);
    if (store.phone) parts.push(`Điện thoại: ${store.phone}`);
    if (store.businessHours) parts.push(`Giờ mở cửa: ${store.businessHours}`);
    if (store.description) parts.push(`Mô tả: ${store.description}`);
    lines.push(`${i + 1}. ${parts.join("\n   ")}`);
  });

  return lines.join("\n");
};

/**
 * Deterministically format a list of promotion summaries into a Vietnamese
 * response string. Used for simple factual promotion queries.
 */
const formatPromotionResponse = (promotions) => {
  if (!promotions || promotions.length === 0) {
    return "Hiện chưa có mã khuyến mãi nào đang hoạt động.";
  }

  const lines = [`Hiện có ${promotions.length} mã khuyến mãi:`];
  promotions.forEach((promo, i) => {
    const parts = [];
    if (promo.code) parts.push(`${promo.code}`);
    if (promo.description) parts.push(`   ${promo.description}`);
    if (promo.discountType === "percentage") {
      let discountLine = `   Giảm ${promo.discountValue}%`;
      if (promo.maxDiscountAmount) {
        discountLine += ` (tối đa ${promo.maxDiscountAmount.toLocaleString("vi-VN")}đ)`;
      }
      parts.push(discountLine);
    } else if (promo.discountType === "fixed") {
      parts.push(`   Giảm ${promo.discountValue.toLocaleString("vi-VN")}đ`);
    }
    if (promo.minOrderValue) {
      parts.push(`   Đơn tối thiểu: ${promo.minOrderValue.toLocaleString("vi-VN")}đ`);
    }
    if (promo.startDate && promo.endDate) {
      parts.push(`   Hiệu lực: ${promo.startDate} - ${promo.endDate}`);
    }
    if (promo.remainingUses != null) {
      parts.push(`   Còn ${promo.remainingUses} lượt sử dụng`);
    }
    lines.push(`${i + 1}. ${parts.join("\n")}`);
  });

  return lines.join("\n");
};

/**
 * Deterministically format a personal-info response based on the user's
 * socket.data.user fields and the query intent. No LLM involved.
 * Returns a Vietnamese response string.
 */
const formatPersonalInfoResponse = (user, query) => {
  const q = (query || "").toLowerCase().trim();

  // Name query
  if (/tên/.test(q)) {
    return user.name
      ? `Tên của bạn là ${user.name} ạ.`
      : "Hiện tại bạn chưa cập nhật tên trong hệ thống ạ.";
  }

  // Email query
  if (/email/.test(q)) {
    return user.email
      ? `Email của bạn là ${user.email} ạ.`
      : "Hiện tại bạn chưa cập nhật email trong hệ thống ạ.";
  }

  // Phone query
  if (/số?\s*điện\s*thoại|sđt|sdt|phone/.test(q)) {
    return user.phone
      ? `Số điện thoại của bạn là ${user.phone} ạ.`
      : "Hiện tại bạn chưa cập nhật số điện thoại trong hệ thống ạ.";
  }

  // Generic "about me" / "thông tin của tôi" — list all available fields
  const parts = [];
  if (user.name) parts.push(`- Tên: ${user.name}`);
  if (user.email) parts.push(`- Email: ${user.email}`);
  if (user.phone) parts.push(`- Số điện thoại: ${user.phone}`);

  if (parts.length === 0) {
    return "Bạn chưa cập nhật thông tin cá nhân nào trong hệ thống ạ. Bạn có thể cập nhật trong mục Quản lý tài khoản.";
  }
  return `Thông tin cá nhân của bạn:\n${parts.join("\n")}`;
};

class ChatController {
  /**
   * Builds the aiResponse payload shared by every branch. The same object is
   * emitted to the client and cached for duplicate-id replay.
   */
  buildAiPayload(sessionId, clientMessageId, message, metadata, generationId = null) {
    const payload = {
      sessionId,
      clientMessageId,
      message,
      timestamp: new Date().toISOString(),
    };
    if (generationId && generationId !== clientMessageId) {
      payload.generationId = generationId;
    }
    if (metadata && typeof metadata === "object") {
      payload.metadata = metadata;
    }
    return payload;
  }

  /**
   * Phase 1: Session Management
   * Quản lý phiên trò chuyện và lưu tin nhắn
   */
  async manageSession(sessionId, userId, userMessage, metadata = {}, clientMessageId = null) {
    try {
      logger.info({ sessionId }, 'Phase 1: Managing session');

      // A conversation is looked up by the ownership pair { sessionId, userId }.
      // A client-supplied sessionId alone can never resolve a conversation that
      // belongs to another user. On a foreign/legacy sessionId the lookup simply
      // misses and a fresh owned conversation is created for the current user.
      let conversation = await Conversation.findOne({ sessionId, userId });

      if (!conversation) {
        logger.info({ sessionId }, 'Creating new conversation for session');
        conversation = new Conversation({
          sessionId,
          userId,
          messages: [],
        });
      }

      // Defensive fallback: never append a duplicate user message for an id that
      // is already persisted in this owned conversation.
      const alreadyStored =
        clientMessageId &&
        conversation.messages.some(
          (m) => m.role === "user" && m.clientMessageId === clientMessageId
        );

      // Thêm tin nhắn của user
      const userMessageObj = {
        role: "user",
        content: userMessage.trim(),
        timestamp: new Date(),
        metadata: {
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
        },
      };
      if (clientMessageId) {
        userMessageObj.clientMessageId = clientMessageId;
      }

      if (!alreadyStored) {
        conversation.messages.push(userMessageObj);
        await conversation.save();
      }

      // Lấy lịch sử chat gần đây (4-6 tin nhắn cuối)
      const recentMessages = conversation.messages.slice(-6);

      logger.info(
        { sessionId, messageCount: recentMessages.length },
        'Phase 1 completed'
      );

      return {
        conversation,
        chatHistory: recentMessages,
      };
    } catch (error) {
      logger.error({ err: error }, 'Phase 1 error');
      throw new Error(`Session management failed: ${error.message}`);
    }
  }

  /**
   * Phase 2: Intent Classification & Query Processing
   * Phân loại ý định và xử lý thông minh (RAG optimization)
   */
  async classifyAndProcessIntent(chatHistory, userQuery, signal) {
    try {
      void signal; // cancellation is asserted by the processMessage checkpoint
      const intentResult = await classifyIntentAndRespond(
        chatHistory,
        userQuery
      );
      logger.info({ intentResult }, 'Intent classification result');


      if (intentResult.intent === "small_talk") {
        return {
          intent: "small_talk",
          directResponse: intentResult.direct_response,
          clarifiedQuery: null,
          complaintSummary: null,
        };
      } else if (intentResult.intent === "appointment") {
        return {
          intent: "appointment",
          directResponse: null,
          clarifiedQuery: null,
        };
      } else if (intentResult.intent === "complaint") {
        return {
          intent: "complaint",
          directResponse: null,
          clarifiedQuery: null,
        };
      } else if (intentResult.intent === "store_query") {
        return {
          intent: "store_query",
          directResponse: null,
          clarifiedQuery: null,
        };
      } else if (intentResult.intent === "promotion_query") {
        return {
          intent: "promotion_query",
          directResponse: null,
          clarifiedQuery: null,
        };
      } else if (intentResult.intent === "personal_info") {
        return {
          intent: "personal_info",
          directResponse: null,
          clarifiedQuery: null,
        };
      } else {
        return {
          intent: "product_query",
          directResponse: null,
          clarifiedQuery: intentResult.clarified_query,
        };
      }
    } catch (error) {
      return {
        intent: "product_query",
        directResponse: null,
        clarifiedQuery: userQuery,
      };
    }
  }

  /**
   * Phase 3: Vector Search
   * Tìm kiếm sản phẩm liên quan bằng vector similarity
   */
  async searchRelevantProducts(clarifiedQuery, limit = 5, mergedFilters = null, mergedPreferences = null, signal = null) {
    throwIfCancelled(signal);
    const { cleanedQuery, filters: parsedFilters, preferences: parsedPreferences } = parseProductConstraints(clarifiedQuery);
    const searchQuery = cleanedQuery || clarifiedQuery;

    // Use merged filters/preferences when provided (from conversation context),
    // otherwise use the parsed values from this query.
    const effectiveFilters = mergedFilters || parsedFilters;
    const effectivePreferences = mergedPreferences || parsedPreferences;

    // When soft preferences are present, fetch a larger candidate pool so
    // ranking has enough variety to reorder meaningfully.
    const anyPref = effectivePreferences && (effectivePreferences.camera || effectivePreferences.battery || effectivePreferences.performance || effectivePreferences.compact);
    const searchLimit = anyPref ? Math.min(Math.max(limit * 3, limit), 20) : limit;
    const result = await productSearchService.search(searchQuery, searchLimit, effectiveFilters);

    // Final validation gate — applies constraints that are hard to express in MongoDB
    // e.g. RAM/storage/color which require string parsing.
    if (effectiveFilters) {
      result.products = result.products.filter(p => matchesProductConstraints(p, effectiveFilters));
    }

    // Rank by soft preferences (deterministic, explainable).
    // Returns all filtered products reordered; the caller or search
    // service handles the final limit.
    const { ranked } = rankProducts(result.products, effectivePreferences);

    return ranked;
  }

  /**
   * Phase 4: Response Generation (streaming)
   * Tạo phản hồi bằng Gemini/OpenAI, truyền từng phần gửi về client qua các
   * sự kiện `aiResponseStart`, `aiResponseChunk*`, `aiResponseComplete`.
   *
   * Live provider success (OpenAI/Gemini) uses start/chunk/complete and NEVER
   * emits `aiResponse`. `aiResponse` is reserved for buffered/deterministic
   * fallback branches and (at the socket boundary) completed duplicate replays.
   */
  async generateResponse(
    socket,
    sessionId,
    chatHistory,
    userQuery,
    relatedProducts,
    clientMessageId,
    signal,
    generationId = null,
    userContext = null,
    appointmentContext = null,
    entityLabels = null
  ) {
    let batching = null;
    let startEmitted = false;
    // Registry (and streaming) identity: the generation attempt. For an ordinary
    // send / retry this defaults to clientMessageId (backward compatible). For
    // regenerate a fresh generationId is passed so Stop + streaming correlate to
    // the attempt while the persisted turn keeps the logical clientMessageId.
    const attemptId = generationId || clientMessageId;
    // Emit generationId on streaming events only when it differs from the
    // logical id (regenerate); ordinary sends keep the exact legacy payload.
    const emitGeneration = generationId && generationId !== clientMessageId;

    // Trusted identity for the completion/tombstone registry key; the abort
    // path is keyed at the socket boundary and must never use a client value.
    const userId = socket && socket.data && socket.data.user
      ? socket.data.user.id
      : null;
    try {
      const validatedProducts = Array.isArray(relatedProducts)
        ? relatedProducts
        : [];
      const validatedHistory = Array.isArray(chatHistory) ? chatHistory : [];

      // Streaming is used when the module provides it. Tests that mock
      // `../utils/gemini` without the streaming export fall back to the classic
      // single-shot path so their assertions (payload shape, failure handling)
      // remain valid.
      const streamFn = typeof generateChatResponseStream === 'function'
        ? generateChatResponseStream
        : null;

      // Exactly-once, emitted before the first streamed chunk, after the
      // socket boundary's `messageProcessing started`.
      const ensureStart = () => {
        if (startEmitted) return;
        const start = {
          sessionId,
          clientMessageId,
          timestamp: new Date().toISOString(),
        };
        if (emitGeneration) start.generationId = attemptId;
        socket.emit("aiResponseStart", start);
        startEmitted = true;
      };

      // Chunk index counting starts at 0 and increments by exactly 1 per chunk
      // (the batching helper's own monotonic index).

      try {
        batching = createChatStreamBatching({
          onChunk: (text, chunkIndex) => {
            ensureStart();
            // text is a DELTA chunk; never an accumulator.
            const chunk = {
              sessionId,
              clientMessageId,
              chunk: text,
              chunkIndex,
              timestamp: new Date().toISOString(),
            };
            if (emitGeneration) chunk.generationId = attemptId;
            socket.emit("aiResponseChunk", chunk);
          },
        });
      } catch (_err) {
        // A batching-setup failure must not fail an otherwise-valid response;
        // the buffered fallback below still emits the compatibility aiResponse.
      }

      let text;
      let provider = "deterministic";
      let finishReason = "stop";
      let streamed = false;
      let totalChunks = 0;

      if (streamFn && batching) {
        // The ONE AbortController for this request was created at the socket
        // boundary (after auth/validation/dedup-claim, before messageProcessing
        // 'started' and before any pipeline work) and is threaded here as
        // `signal`. generateResponse never creates or registers its own
        // controller: there is exactly one registration per accepted request,
        // owned by the socket boundary, and `stopGeneration` aborts exactly it.
        throwIfCancelled(signal);

        try {
          const streamResult = await streamFn({
            userMessage: userQuery,
            chatHistory: validatedHistory,
            productContext: validatedProducts,
            signal,
            onDelta: (delta) => batching.push(delta),
            userContext,
            appointmentContext,
            entityLabels,
          });

          // Guard the rare race where the abort lands exactly as the provider
          // resolves: the user asked to stop, so never emit a completion.
          throwIfCancelled(signal);

          batching.flush(); // flush any residual buffered text before completion
          totalChunks = batching.chunkCount();
          batching.dispose();
          batching = null;

          text = streamResult.fullResponse;
          provider = streamResult.provider;
          finishReason = streamResult.finishReason;
          streamed = streamResult.streamed === true;

          // Finished normally (live or buffered fallback): drop the active entry
          // so a late stopGeneration acks 'already_completed' not 'not_found'.
          if (userId) {
            chatActiveStreams.markCompleted({ userId, sessionId, clientMessageId, generationId: attemptId });
          }
        } catch (_streamErr) {
          // Cancelled or failed: the entry was already removed by abort() on a
          // user cancel; remove defensively on any other failure too. Re-throw
          // so the socket handler emits the single terminal signal.
          if (userId) {
            chatActiveStreams.remove({ userId, sessionId, clientMessageId, generationId: attemptId });
          }
          throw _streamErr;
        }
      } else {
        const res = await generateChatResponse(validatedHistory, userQuery, validatedProducts, userContext, appointmentContext, entityLabels);
        text = res.text;
        provider = res.provider;
        if (batching) { batching.dispose(); batching = null; }
      }

      // Compatibility payload used by the dedup store for future completed
      // replay — shaped exactly like an `aiResponse`.
      const payload = this.buildAiPayload(sessionId, clientMessageId, text, {
        provider,
        finishReason,
        streamed,
      });

      // Checkpoint before emitting any completion event: a cancelled generation
      // never emits aiResponseComplete nor aiResponse.
      throwIfCancelled(signal);

      if (streamed) {
        // LIVE success: terminal event is aiResponseComplete, never aiResponse.
        const completeEvent = {
          sessionId,
          clientMessageId,
          content: text,
          finishReason,
          totalChunks,
          timestamp: new Date().toISOString(),
          metadata: { provider, streamed: true },
        };
        if (emitGeneration) completeEvent.generationId = attemptId;
        socket.emit("aiResponseComplete", completeEvent);
      } else {
        // Buffered/deterministic fallback branch — one compatibility aiResponse.
        const compat = { ...payload };
        if (emitGeneration) compat.generationId = attemptId;
        socket.emit("aiResponse", compat);
      }

      return {
        fullResponse: text,
        modelUsed: provider,
        relatedProducts: validatedProducts.map((p) => ({
          id: p._id,
          name: p.name,
          score: p.score,
        })),
        aiPayload: payload,
      };
    } catch (error) {
      try { batching && batching.dispose(); } catch (_e) { /* ignore */ }
      // Single terminal error is emitted by the socket boundary (socketHandler)
      // so one failed generation yields exactly one correlated error event —
      // not a GENERATION_ERROR here plus a PROCESSING_ERROR there.
      throw error;
    }
  }

  /**
   * Handle Small Talk - Xử lý trò chuyện phiếm (early return optimization)
   */
  async handleSmallTalk(socket, sessionId, directResponse, clientMessageId, generationId = null) {
    try {
      const payload = this.buildAiPayload(sessionId, clientMessageId, directResponse, {
        responseType: "small_talk",
        skipRAG: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      return {
        fullResponse: directResponse,
        responseType: "small_talk",
        relatedProducts: [],
        aiPayload: payload,
      };
    } catch (error) {
      const fallbackResponse = "Xin chào! Tôi có thể giúp gì cho bạn hôm nay?";

      const payload = this.buildAiPayload(sessionId, clientMessageId, fallbackResponse, {
        responseType: "small_talk",
        skipRAG: true,
        fallback: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      return {
        fullResponse: fallbackResponse,
        responseType: "small_talk",
        relatedProducts: [],
        aiPayload: payload,
      };
    }
  }

  /**
   * Handle Personal Info - Tra loai thong tin ca nhan cua nguoi dung.
   *
   * Hoan toan deterministic: socket.data.user la nguon du lieu duy nhat.
   * Khong goi LLM, khong tim kiem san pham, khong dung Redis.
   */
  async handlePersonalInfo(socket, sessionId, userId, userQuery, clientMessageId, generationId = null, signal = null) {
    try {
      throwIfCancelled(signal);
      logger.info({ sessionId }, 'Handling personal info query');

      const user = socket && socket.data && socket.data.user;

      if (!user || !user.id) {
        const text = "Bạn cần đăng nhập để tôi có thể xem thông tin cá nhân ạ.";
        const payload = this.buildAiPayload(sessionId, clientMessageId, text, {
          responseType: "personal_info",
          skipRAG: true,
          needsLogin: true,
        }, generationId);
        socket.emit("aiResponse", payload);
        return {
          fullResponse: text,
          responseType: "personal_info",
          relatedProducts: [],
          aiPayload: payload,
        };
      }

      const responseText = formatPersonalInfoResponse(user, userQuery);

      const payload = this.buildAiPayload(sessionId, clientMessageId, responseText, {
        responseType: "personal_info",
        skipRAG: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      return {
        fullResponse: responseText,
        responseType: "personal_info",
        relatedProducts: [],
        aiPayload: payload,
      };
    } catch (error) {
      logger.error({ err: error }, 'Personal info handling error');
      const fallbackResponse = "Em xin lỗi, hiện tại em không thể truy xuất thông tin cá nhân. Bạn vui lòng thử lại sau ạ.";

      const payload = this.buildAiPayload(sessionId, clientMessageId, fallbackResponse, {
        responseType: "personal_info",
        skipRAG: true,
        fallback: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      return {
        fullResponse: fallbackResponse,
        responseType: "personal_info",
        relatedProducts: [],
        aiPayload: payload,
      };
    }
  }

  /**
   * Handle Appointment intent - Query user's appointments.
   *
   * For simple factual queries (do I have an appointment, what's my nearest
   * appointment), a deterministic response is preferred. For ambiguous
   * follow-ups that require natural language reasoning, the LLM is used with
   * appointment context injected into the system prompt.
   */
  async handleAppointment(socket, sessionId, userId, chatHistory, userQuery, clientMessageId, generationId = null, signal = null) {
    try {
      throwIfCancelled(signal);
      logger.info({ sessionId }, 'Handling appointment query');

      const appointments = await buildAppointmentContext(userId);
      throwIfCancelled(signal);

      const responseText = formatAppointmentResponse(appointments);

      const payload = this.buildAiPayload(sessionId, clientMessageId, responseText, {
        responseType: "appointment",
        skipRAG: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      // Save appointment entity labels to context for follow-up reference resolution
      try {
        const contextService = require("../services/contextService");
        const previousContext = await contextService.loadContext(userId, sessionId);
        const lastAppointmentResults = Array.isArray(appointments)
          ? appointments.slice(0, 5).map(a => ({
              storeName: a.storeName,
              date: a.date,
              timeSlot: a.timeSlot,
              status: a.status,
            }))
          : [];
        const newContext = previousContext ? { ...previousContext } : {};
        newContext.lastAppointmentResults = lastAppointmentResults;
        await contextService.saveContext(userId, sessionId, sanitizeConversationContext(newContext));
      } catch (_ctxErr) {
        // context save failure must not fail the chat response
      }

      return {
        fullResponse: responseText,
        responseType: "appointment",
        relatedProducts: [],
        appointmentData: appointments,
        aiPayload: payload,
      };
    } catch (error) {
      logger.error({ err: error }, 'Appointment handling error');
      const fallbackResponse = "Em xin lỗi, hiện tại em không thể truy xuất thông tin lịch hẹn. Bạn vui lòng thử lại sau hoặc kiểm tra lịch hẹn trong mục Quản lý lịch hẹn trên hệ thống.";

      const payload = this.buildAiPayload(sessionId, clientMessageId, fallbackResponse, {
        responseType: "appointment",
        skipRAG: true,
        fallback: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      return {
        fullResponse: fallbackResponse,
        responseType: "appointment",
        relatedProducts: [],
        aiPayload: payload,
      };
    }
  }

  /**
   * Handle Store query - Query store information.
   * Deterministic response following the same pattern as handleAppointment.
   */
  async handleStoreQuery(socket, sessionId, userId, chatHistory, userQuery, clientMessageId, generationId = null, signal = null) {
    try {
      throwIfCancelled(signal);
      logger.info({ sessionId }, 'Handling store query');

      const stores = await buildStoreContext();
      throwIfCancelled(signal);

      const responseText = formatStoreResponse(stores);

      const payload = this.buildAiPayload(sessionId, clientMessageId, responseText, {
        responseType: "store_query",
        skipRAG: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      // Save store entity labels to context for follow-up reference resolution
      try {
        const contextService = require("../services/contextService");
        const previousContext = await contextService.loadContext(userId, sessionId);
        const lastStoreResults = Array.isArray(stores)
          ? stores.slice(0, 5).map(s => ({
              name: s.name,
              fullAddress: s.address || '',
              phone: s.phone,
            }))
          : [];
        const newContext = previousContext ? { ...previousContext } : {};
        newContext.lastStoreResults = lastStoreResults;
        await contextService.saveContext(userId, sessionId, sanitizeConversationContext(newContext));
      } catch (_ctxErr) {
        // context save failure must not fail the chat response
      }

      return {
        fullResponse: responseText,
        responseType: "store_query",
        relatedProducts: [],
        storeData: stores,
        aiPayload: payload,
      };
    } catch (error) {
      logger.error({ err: error }, 'Store query handling error');
      const fallbackResponse = "Em xin lỗi, hiện tại em không thể truy xuất thông tin cửa hàng. Bạn vui lòng thử lại sau hoặc liên hệ hotline 1900xxxx để được hỗ trợ ạ.";

      const payload = this.buildAiPayload(sessionId, clientMessageId, fallbackResponse, {
        responseType: "store_query",
        skipRAG: true,
        fallback: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      return {
        fullResponse: fallbackResponse,
        responseType: "store_query",
        relatedProducts: [],
        aiPayload: payload,
      };
    }
  }

  /**
   * Handle Promotion query - Query promotion information.
   * Deterministic response following the same pattern as handleAppointment.
   */
  async handlePromotionQuery(socket, sessionId, userId, chatHistory, userQuery, clientMessageId, generationId = null, signal = null) {
    try {
      throwIfCancelled(signal);
      logger.info({ sessionId }, 'Handling promotion query');

      const promotions = await buildPromotionContext();
      throwIfCancelled(signal);

      const responseText = formatPromotionResponse(promotions);

      const payload = this.buildAiPayload(sessionId, clientMessageId, responseText, {
        responseType: "promotion_query",
        skipRAG: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      // Save promotion entity labels to context for follow-up reference resolution
      try {
        const contextService = require("../services/contextService");
        const previousContext = await contextService.loadContext(userId, sessionId);
        const lastPromotionResults = Array.isArray(promotions)
          ? promotions.slice(0, 5).map(p => ({
              code: p.code,
              description: p.description,
              discountType: p.discountType,
              discountValue: p.discountValue,
              endDate: p.endDate,
            }))
          : [];
        const newContext = previousContext ? { ...previousContext } : {};
        newContext.lastPromotionResults = lastPromotionResults;
        await contextService.saveContext(userId, sessionId, sanitizeConversationContext(newContext));
      } catch (_ctxErr) {
        // context save failure must not fail the chat response
      }

      return {
        fullResponse: responseText,
        responseType: "promotion_query",
        relatedProducts: [],
        promotionData: promotions,
        aiPayload: payload,
      };
    } catch (error) {
      logger.error({ err: error }, 'Promotion query handling error');
      const fallbackResponse = "Em xin lỗi, hiện tại em không thể truy xuất thông tin khuyến mãi. Bạn vui lòng thử lại sau hoặc kiểm tra trên hệ thống ạ.";

      const payload = this.buildAiPayload(sessionId, clientMessageId, fallbackResponse, {
        responseType: "promotion_query",
        skipRAG: true,
        fallback: true,
      }, generationId);
      socket.emit("aiResponse", payload);

      return {
        fullResponse: fallbackResponse,
        responseType: "promotion_query",
        relatedProducts: [],
        aiPayload: payload,
      };
    }
  }

  /**
   * Handle Complaint - Xử lý khiếu nại khách hàng
   *
   * Complaint handling is resilient and confirmation-gated:
   *   - Detection may be deterministic (obvious complaint phrases) or AI
   *     (ambiguous messages), with a safe deterministic default when all
   *     providers are unavailable. A complaint is NEVER invented on failure.
   *   - Persistence NEVER happens on detection alone: the first complaint turn
   *     only sets a pending confirmation; a Complaint record is created only
   *     after the user explicitly confirms (see handleComplaintConfirmation).
   *   - An already-existing open/in_progress complaint is an already-confirmed
   *     workflow and is updated on later turns as before.
   *   - Persistence goes through complaintService (never inline `new
   *     Complaint().save()`), so schema validation and required fields hold.
   */
  async handleComplaint(socket, sessionId, userId, chatHistory, userMessage, clientMessageId, generationId = null, signal = null) {
    try {
      throwIfCancelled(signal);
      logger.info({ sessionId }, 'Handling complaint for session');

      // Lấy thông tin conversation bằng cặp ownership { sessionId, userId } để
      // đảm bảo không truy cập conversation của người dùng khác.
      const conversation = await Conversation.findOne({ sessionId, userId });
      if (!conversation) {
        throw new Error("Conversation not found for session");
      }
      throwIfCancelled(signal);

      // Kiểm tra xem đã có complaint cho conversation (thuộc sở hữu người dùng này) chưa
      let existingComplaint = await Complaint.findOne({
        conversationId: conversation._id,
        status: { $in: ['open', 'in_progress'] }
      }).sort({ createdAt: -1 });

      logger.info({ sessionId, found: !!existingComplaint }, 'Existing complaint found');
      throwIfCancelled(signal);

      // Awaiting confirmation: this turn is the user's decision (or a continued
      // description). Route WITHOUT re-classifying intent.
      const pending = await complaintFlowService.getPending(userId, sessionId);
      if (pending) {
        const decision = complaintFlowService.classifyComplaintConfirmation(userMessage);
        if (decision === 'confirmed' || decision === 'declined') {
          return this.handleComplaintConfirmation(
            socket, sessionId, userId, conversation, pending, decision,
            chatHistory, userMessage, clientMessageId, generationId, signal
          );
        }
        return this.handleComplaintContinuation(
          socket, sessionId, userId, conversation, pending,
          chatHistory, userMessage, clientMessageId, generationId, signal
        );
      }

      // Already-confirmed workflow: an open complaint exists for this owned
      // conversation, so this turn keeps enriching it. No new confirmation is
      // needed — the record was confirmed when it was created.
      if (existingComplaint) {
        const complaintResponse = await generateComplaintResponse(chatHistory, userMessage);
        throwIfCancelled(signal);

        try {
          await complaintService.updateExistingComplaint(existingComplaint, complaintResponse.complaintData);
        } catch (updateErr) {
          logger.error({ err: updateErr, sessionId }, 'Error updating existing complaint');
        }

        const complaintPayload = this.buildAiPayload(
          sessionId,
          clientMessageId,
          complaintResponse.responseText,
          {
            responseType: "complaint",
            isComplete: complaintResponse.isComplete,
            priority: complaintResponse.complaintData.priority,
          },
          generationId
        );
        socket.emit("aiResponse", complaintPayload);

        return {
          fullResponse: complaintResponse.responseText,
          responseType: "complaint",
          isComplete: complaintResponse.isComplete,
          complaintId: existingComplaint._id,
          priority: complaintResponse.complaintData.priority,
          relatedProducts: [],
          aiPayload: complaintPayload,
        };
      }

      // First complaint detection: empathetic response + explicit confirmation.
      // NO Complaint record is created here — persistence is deferred until the
      // user confirms (independent of LLM availability).
      const complaintResponse = await generateComplaintResponse(chatHistory, userMessage);
      throwIfCancelled(signal);

      const complaintData = complaintResponse.complaintData || {};
      await complaintFlowService.setPending(userId, sessionId, {
        conversationId: conversation._id,
        detailedDescription: complaintData.detailedDescription || userMessage,
        customerContact: complaintData.customerContact || { email: null, phone: null },
        priority: complaintData.priority || "medium",
        tags: complaintData.tags || ["general"],
        attempts: 1,
      });

      const text = `${complaintResponse.responseText}\n\n` +
        "Bạn xác nhận muốn gửi khiếu nại này cho bộ phận chăm sóc khách hàng của Dienthoaigiakho không ạ? " +
        "Anh/chị chỉ cần trả lời Có (hoặc để lại email/SĐT) để em ghi nhận nhé.";

      const complaintPayload = this.buildAiPayload(
        sessionId,
        clientMessageId,
        text,
        {
          responseType: "complaint",
          isComplete: false,
          priority: complaintData.priority || "medium",
          needsConfirmation: true,
        },
        generationId
      );
      socket.emit("aiResponse", complaintPayload);

      return {
        fullResponse: text,
        responseType: "complaint",
        isComplete: false,
        complaintId: null,
        priority: complaintData.priority || "medium",
        relatedProducts: [],
        aiPayload: complaintPayload,
      };

    } catch (error) {
      logger.error({ err: error }, 'Error in handleComplaint');

      // Deterministic fallback: never expose a provider/raw error, and keep the
      // complaint conversation alive so the user can still be helped.
      const fallbackResponse = "Em rất xin lỗi vì sự bất tiện này. Anh/chị có thể mô tả vấn đề và để lại email hoặc số điện thoại để bộ phận CSKH liên hệ hỗ trợ không ạ?";

      const fallbackPayload = this.buildAiPayload(
        sessionId,
        clientMessageId,
        fallbackResponse,
        {
          responseType: "complaint",
          error: true,
          fallback: true,
        },
        generationId
      );
      socket.emit("aiResponse", fallbackPayload);

      return {
        fullResponse: fallbackResponse,
        responseType: "complaint",
        isComplete: false,
        complaintId: null,
        priority: "medium",
        relatedProducts: [],
        aiPayload: fallbackPayload,
      };
    }
  }

  /**
   * Deterministic continuation of an ALREADY-CONFIRMED complaint. Appends the
   * new defect/detail to the existing record — the original narrative is
   * preserved, never overwritten — advances contact/status if any contact info
   * appears, and acknowledges in Vietnamese. No LLM is involved, so a
   * continuation always works even when OpenAI/Gemini are unavailable. Never
   * creates a second complaint record.
   */
  async handleExistingComplaintContinuation(socket, sessionId, existingComplaint, userMessage, clientMessageId, generationId = null, signal = null) {
    try {
      throwIfCancelled(signal);
      logger.info({ sessionId, complaintId: existingComplaint._id }, 'Continuing existing complaint');

      const mergedDescription = complaintService.mergeComplaintDescription(
        existingComplaint.detailedDescription,
        userMessage
      );
      const contact = extractContactFromMessage(userMessage);

      try {
        await complaintService.updateExistingComplaint(existingComplaint, {
          detailedDescription: mergedDescription,
          customerContact: contact,
        });
      } catch (updateErr) {
        logger.error({ err: updateErr, sessionId }, 'Error updating existing complaint continuation');
      }

      const text =
        "Dạ, em đã ghi nhận thêm thông tin mới và cập nhật vào khiếu nại hiện tại của anh/chị. " +
        "Em sẽ chuyển toàn bộ nội dung đến bộ phận chuyên trách để xử lý nhanh nhất có thể ạ.";

      const complaintPayload = this.buildAiPayload(
        sessionId,
        clientMessageId,
        text,
        {
          responseType: "complaint",
          isComplete: false,
          complaintId: existingComplaint._id,
          priority: existingComplaint.priority || "medium",
        },
        generationId
      );
      socket.emit("aiResponse", complaintPayload);

      return {
        fullResponse: text,
        responseType: "complaint",
        isComplete: false,
        complaintId: existingComplaint._id,
        priority: existingComplaint.priority || "medium",
        relatedProducts: [],
        aiPayload: complaintPayload,
      };
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Error in handleExistingComplaintContinuation');
      const fallbackResponse = "Em rất xin lỗi, hiện tại hệ thống đang bận. Anh/chị có thể thử lại sau nhé ạ?";
      const fallbackPayload = this.buildAiPayload(
        sessionId, clientMessageId, fallbackResponse,
        { responseType: "complaint", error: true, fallback: true, complaintId: existingComplaint._id },
        generationId
      );
      socket.emit("aiResponse", fallbackPayload);
      return {
        fullResponse: fallbackResponse,
        responseType: "complaint",
        isComplete: false,
        complaintId: existingComplaint._id,
        priority: existingComplaint.priority || "medium",
        relatedProducts: [],
        aiPayload: fallbackPayload,
      };
    }
  }

  /**
   * Complaint confirmation decision turn. On 'confirmed' the complaint is
   * PERSISTED via complaintService (never because an LLM said so — only because
   * the user explicitly agreed, optionally providing contact info). On
   * 'declined' the pending state is cleared and nothing is persisted.
   */
  async handleComplaintConfirmation(socket, sessionId, userId, conversation, pending, decision, chatHistory, userMessage, clientMessageId, generationId = null, signal = null) {
    try {
      throwIfCancelled(signal);

      // Merge any contact info mentioned in the confirmation reply.
      const contact = { ...(pending.customerContact || {}) };
      const msgContact = extractContactFromMessage(userMessage);
      if (msgContact.email) contact.email = msgContact.email;
      if (msgContact.phone) contact.phone = msgContact.phone;

      let complaintRecord = null;
      let text;
      let isComplete = false;

      if (decision === 'confirmed') {
        try {
          complaintRecord = await complaintService.createComplaint({
            sessionId,
            conversationId: conversation._id,
            complaintSummary: `Khiếu nại từ session ${sessionId}`,
            detailedDescription: pending.detailedDescription || userMessage,
            customerContact: contact,
            priority: pending.priority || "medium",
            tags: pending.tags || ["general"],
          });
          text = "Dạ, em đã ghi nhận khiếu nại của anh/chị và chuyển đến bộ phận chuyên trách. " +
            "Bộ phận CSKH sẽ liên hệ với anh/chị trong thời gian sớm nhất ạ.";
          isComplete = true;
        } catch (saveErr) {
          logger.error({ err: saveErr, sessionId }, 'Error persisting confirmed complaint');
          // Keep the pending state so a retry confirmation can succeed later.
          text = "Em rất xin lỗi, hiện tại hệ thống chưa thể ghi nhận khiếu nại. " +
            "Anh/chị có thể thử lại ngay bây giờ (trả lời Có) hoặc để lại email/SĐT để bộ phận CSKH chủ động liên hệ không ạ?";
        }
      } else {
        text = "Dạ vâng, em đã hủy yêu cầu khiếu nại này. " +
          "Nếu cần hỗ trợ thêm, anh/chị cứ nhắn cho em nhé.";
      }

      if (decision === 'declined' || complaintRecord) {
        await complaintFlowService.clearPending(userId, sessionId);
      }

      throwIfCancelled(signal);

      const payload = this.buildAiPayload(
        sessionId,
        clientMessageId,
        text,
        {
          responseType: "complaint",
          confirmed: decision === 'confirmed',
          declined: decision === 'declined',
          complaintId: complaintRecord ? complaintRecord._id : null,
          priority: pending.priority || "medium",
        },
        generationId
      );
      socket.emit("aiResponse", payload);

      return {
        fullResponse: text,
        responseType: "complaint",
        isComplete,
        complaintId: complaintRecord ? complaintRecord._id : null,
        priority: pending.priority || "medium",
        relatedProducts: [],
        aiPayload: payload,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error in handleComplaintConfirmation');
      const fallbackResponse = "Em rất xin lỗi, hiện tại hệ thống đang bận. Anh/chị có thể thử lại sau nhé ạ?";
      const fallbackPayload = this.buildAiPayload(
        sessionId, clientMessageId, fallbackResponse,
        { responseType: "complaint", confirmed: false, fallback: true }, generationId
      );
      socket.emit("aiResponse", fallbackPayload);
      return {
        fullResponse: fallbackResponse,
        responseType: "complaint",
        isComplete: false,
        complaintId: null,
        priority: "medium",
        relatedProducts: [],
        aiPayload: fallbackPayload,
      };
    }
  }

  /**
   * Ambiguous reply while a complaint confirmation is pending (e.g. the user
   * adds more detail instead of a clear yes/no). The pending state is kept and
   * enriched; the assistant re-asks for confirmation. Nothing is persisted.
   */
  async handleComplaintContinuation(socket, sessionId, userId, conversation, pending, chatHistory, userMessage, clientMessageId, generationId = null, signal = null) {
    try {
      throwIfCancelled(signal);
      const complaintResponse = await generateComplaintResponse(chatHistory, userMessage);
      throwIfCancelled(signal);

      const complaintData = complaintResponse.complaintData || {};
      const contact = { ...(pending.customerContact || {}) };
      if (complaintData.customerContact && complaintData.customerContact.email) contact.email = complaintData.customerContact.email;
      if (complaintData.customerContact && complaintData.customerContact.phone) contact.phone = complaintData.customerContact.phone;
      const msgContact = extractContactFromMessage(userMessage);
      if (msgContact.email) contact.email = msgContact.email;
      if (msgContact.phone) contact.phone = msgContact.phone;

      const merged = {
        conversationId: pending.conversationId || conversation._id,
        detailedDescription: complaintData.detailedDescription || pending.detailedDescription || userMessage,
        customerContact: contact,
        priority: complaintData.priority || pending.priority || "medium",
        tags: Array.isArray(complaintData.tags) && complaintData.tags.length > 0 ? complaintData.tags : (pending.tags || ["general"]),
        attempts: (pending.attempts || 1) + 1,
      };
      await complaintFlowService.setPending(userId, sessionId, merged);

      const text = `${complaintResponse.responseText}\n\n` +
        "Anh/chị xác nhận muốn gửi khiếu nại này chứ ạ? (Trả lời Có hoặc để lại email/SĐT để em ghi nhận nhé)";

      const payload = this.buildAiPayload(
        sessionId,
        clientMessageId,
        text,
        {
          responseType: "complaint",
          isComplete: false,
          priority: merged.priority,
          needsConfirmation: true,
        },
        generationId
      );
      socket.emit("aiResponse", payload);

      return {
        fullResponse: text,
        responseType: "complaint",
        isComplete: false,
        complaintId: null,
        priority: merged.priority,
        relatedProducts: [],
        aiPayload: payload,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error in handleComplaintContinuation');
      throw error;
    }
  }

  /**
   * Lưu phản hồi của AI vào database
   */
  async saveAIResponse(sessionId, userId, aiResponse, metadata = {}) {
    try {
      const conversation = await Conversation.findOne({ sessionId, userId });

      if (conversation) {
        const clientMessageId = metadata.clientMessageId || null;

        // Defensive guard: if an assistant reply for this clientMessageId is
        // already persisted in this owned conversation, do not append again.
        const alreadyStored =
          clientMessageId &&
          conversation.messages.some(
            (m) => m.role === "assistant" && m.clientMessageId === clientMessageId
          );

        const aiMessageObj = {
          role: "assistant",
          content: aiResponse,
          timestamp: new Date(),
          metadata: {
            modelUsed: process.env.OPENAI_MODEL || "gpt-4o",
            processingTime: metadata.processingTime,
            retrievedProducts: metadata.retrievedProducts || [],
            responseType: metadata.responseType || "product_query",
            skipRAG: metadata.skipRAG || false,
          },
        };
        if (clientMessageId) {
          aiMessageObj.clientMessageId = clientMessageId;
        }
        // Stamp the generation attempt identity (defaults to the logical id for
        // ordinary send/retry). Additive and backward compatible.
        if (metadata.generationId) {
          aiMessageObj.generationId = metadata.generationId;
        } else if (clientMessageId) {
          aiMessageObj.generationId = clientMessageId;
        }

        if (!alreadyStored) {
          conversation.messages.push(aiMessageObj);
          await conversation.save();
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error saving AI response');
    }
  }

  async processMessage(socket, data, signal) {
    const startTime = Date.now();
    const { sessionId, message, clientMessageId } = data;

    // Trusted identity comes exclusively from socket.data.user (set by the
    // socket auth middleware). Never from the client payload.
    const userId = socket && socket.data && socket.data.user && socket.data.user.id;
    if (!userId) {
      throw new Error("Missing authenticated user");
    }

    // Checkpoint: no pipeline work begins once the user has already stopped.
    throwIfCancelled(signal);

    const metadata = {
      userAgent: socket.handshake.headers["user-agent"],
      ipAddress: socket.handshake.address,
    };

    const { conversation, chatHistory } = await this.manageSession(
      sessionId,
      userId,
      message,
      metadata,
      clientMessageId
    );

    // For an ordinary send the generation identity defaults to the logical
    // clientMessageId (backward compatible): one logical turn == one attempt.
    const generationId = clientMessageId;

    const responseResult = await this.renderResponse({
      socket,
      sessionId,
      userId,
      chatHistory,
      userQuery: message,
      clientMessageId,
      generationId,
      signal,
      persistContext: true,
    });

    const processingTime = Date.now() - startTime;
    // Checkpoint before assistant persistence: a cancelled generation is never
    // persisted as an assistant reply (the user message may remain).
    throwIfCancelled(signal);
    await this.saveAIResponse(sessionId, userId, responseResult.fullResponse, {
      processingTime,
      retrievedProducts: responseResult.relatedProducts || [],
      responseType: responseResult.responseType || "product_query",
      skipRAG: responseResult.responseType === "small_talk",
      modelUsed: responseResult.modelUsed || process.env.OPENAI_MODEL || "gpt-4o",
      clientMessageId,
      generationId,
    });

    return {
      success: true,
      processingTime,
      responseType: responseResult.responseType || "product_query",
      ragSkipped: responseResult.responseType === "small_talk",
      ...responseResult,
    };
  }

  /**
   * Shared generation pipeline used by sendMessage, Retry and Regenerate.
   * Runs intent classification and the small-talk / complaint / product-query
   * branches, emitting streaming (aiResponseStart/Chunk/Complete) or buffered
   * (aiResponse) events. Does NOT touch conversation persistence — callers own
   * that (append for send/retry, atomic replace for regenerate).
   *
   * `persistContext` is the smallest Retry/Regenerate context guard: only an
   * ordinary new turn advances the Redis conversation context (turnCount). A
   * retried or regenerated logical turn must NOT advance logical context a
   * second time, so those callers pass persistContext: false. The generation
   * itself still re-runs intent/RAG/provider (correctness over stale reuse).
   */
  async renderResponse({ socket, sessionId, userId, chatHistory, userQuery, clientMessageId, generationId, signal, persistContext = true }) {
    throwIfCancelled(signal);

    // Complaint confirmation intercept: when a complaint is awaiting explicit
    // user confirmation for this owned conversation, a clear yes/no reply is a
    // DECISION, never a new intent. Affirmative short replies ("có", "vâng")
    // would otherwise be classified as small_talk and the complaint would never
    // be persisted. Ambiguous replies fall through to normal intent processing.
    const pendingComplaint = await complaintFlowService.getPending(userId, sessionId);
    if (pendingComplaint) {
      const decision = complaintFlowService.classifyComplaintConfirmation(userQuery);
      if (decision === 'confirmed' || decision === 'declined') {
        const conversation = await Conversation.findOne({ sessionId, userId });
        if (conversation) {
          const responseResult = await this.handleComplaintConfirmation(
            socket, sessionId, userId, conversation, pendingComplaint, decision,
            chatHistory, userQuery, clientMessageId, generationId, signal
          );
          if (responseResult) return responseResult;
        }
      }
      // ambiguous → fall through; if it is/becomes a complaint turn,
      // handleComplaint re-asks while keeping the pending state.
    }

    // Complaint continuation intercept: once a complaint has been confirmed and
    // persists as an open/in_progress record for this owned conversation, an
    // OBVIOUS additional defect/detail is a continuation of that complaint —
    // never a fresh product query. Detection is deterministic (no LLM needed);
    // question-like messages fall through unchanged so an active complaint can
    // never hijack unrelated product/shipping questions.
    const continuationResult = preclassifyComplaintContinuation(userQuery);
    if (continuationResult) {
      const conversation = await Conversation.findOne({ sessionId, userId });
      if (conversation) {
        const existingComplaint = await Complaint.findOne({
          conversationId: conversation._id,
          status: { $in: ['open', 'in_progress'] }
        }).sort({ createdAt: -1 });
        throwIfCancelled(signal);
        if (existingComplaint) {
          const responseResult = await this.handleExistingComplaintContinuation(
            socket,
            sessionId,
            existingComplaint,
            userQuery,
            clientMessageId,
            generationId,
            signal
          );
          if (responseResult) return responseResult;
        }
      }
    }

    const intentResult = await this.classifyAndProcessIntent(
      chatHistory,
      userQuery,
      signal
    );
    logger.info({ intentResult }, 'Intent result');
    // Checkpoint: after intent classification, before any RAG work.
    throwIfCancelled(signal);
    let responseResult;

    // Deterministic spec-resolution intercept: factual product-spec questions
    // are answered directly from stored data without calling an LLM. When the
    // resolver cannot confidently resolve the query, it returns null and we
    // fall through to the existing recommendation/RAG pipeline unchanged.
    if (intentResult.intent === "product_query") {
      try {
        const specResult = await resolveProductSpec(userQuery);
        if (specResult) {
          logger.info({ specType: specResult.type }, '[SpecResolver] Deterministic answer returned');
          responseResult = {
            fullResponse: specResult.answer,
            provider: "deterministic",
            responseType: "spec_answer",
            relatedProducts: [],
          };
          // Emit streaming-compatible events for the spec answer
          const start = {
            sessionId,
            clientMessageId,
            timestamp: new Date().toISOString(),
          };
          if (generationId && generationId !== clientMessageId) start.generationId = generationId;
          socket.emit("aiResponseStart", start);
          socket.emit("aiResponseChunk", {
            sessionId,
            clientMessageId,
            chunk: specResult.answer,
            chunkIndex: 0,
            timestamp: new Date().toISOString(),
            ...(generationId && generationId !== clientMessageId ? { generationId } : {}),
          });
          socket.emit("aiResponseComplete", {
            sessionId,
            clientMessageId,
            content: specResult.answer,
            timestamp: new Date().toISOString(),
            ...(generationId && generationId !== clientMessageId ? { generationId } : {}),
          });
        }
      } catch (specError) {
        logger.warn({ err: { message: specError.message } }, '[SpecResolver] Resolution failed, falling through');
      }
    }

    if (responseResult) {
      // Spec resolver returned a deterministic answer — skip the RAG pipeline.
    } else if (intentResult.intent === "small_talk") {
      responseResult = await this.handleSmallTalk(
        socket,
        sessionId,
        intentResult.directResponse,
        clientMessageId,
        generationId
      );
    } else if (intentResult.intent === "appointment") {
      responseResult = await this.handleAppointment(
        socket,
        sessionId,
        userId,
        chatHistory,
        userQuery,
        clientMessageId,
        generationId,
        signal
      );
    } else if (intentResult.intent === "complaint") {
      responseResult = await this.handleComplaint(
        socket,
        sessionId,
        userId,
        chatHistory,
        userQuery,
        clientMessageId,
        generationId,
        signal
      );
    } else if (intentResult.intent === "store_query") {
      responseResult = await this.handleStoreQuery(
        socket,
        sessionId,
        userId,
        chatHistory,
        userQuery,
        clientMessageId,
        generationId,
        signal
      );
    } else if (intentResult.intent === "promotion_query") {
      responseResult = await this.handlePromotionQuery(
        socket,
        sessionId,
        userId,
        chatHistory,
        userQuery,
        clientMessageId,
        generationId,
        signal
      );
    } else if (intentResult.intent === "personal_info") {
      responseResult = await this.handlePersonalInfo(
        socket,
        sessionId,
        userId,
        userQuery,
        clientMessageId,
        generationId,
        signal
      );
    } else {
      // ================================================================
      // Phase A: Load and merge conversation context
      // ================================================================
      const clarifiedQuery = intentResult.clarifiedQuery;
      const parsed = parseProductConstraints(clarifiedQuery);
      const queryType = classifyQuery(clarifiedQuery, parsed);
      // Checkpoint: before context load.
      throwIfCancelled(signal);
      const previousContext = await contextService.loadContext(userId, sessionId);
      let mergedFilters = parsed.filters;
      let mergedPreferences = parsed.preferences;
      let contextReset = false;

      if (queryType.action === 'reset') {
        await contextService.deleteContext(userId, sessionId);
        contextReset = true;
      } else if (queryType.action === 'follow_up' && previousContext) {
        const { mergedParsed } = resolveFollowUpQuery(parsed, previousContext);
        mergedFilters = mergedParsed.filters;
        mergedPreferences = mergedParsed.preferences;
      }
      // independent: use parsed values as-is (no merge)

      // Checkpoint: after context, before RAG search.
      throwIfCancelled(signal);

      // ================================================================
      // Phase B: Search, filter, rank
      // ================================================================
      const relatedProducts = await this.searchRelevantProducts(
        clarifiedQuery,
        5,
        mergedFilters,
        mergedPreferences,
        signal
      );

      // Checkpoint: after RAG search, before response generation.
      throwIfCancelled(signal);

      // ================================================================
      // Phase C: Generate response (Gemini/OpenAI or deterministic fallback)
      // ================================================================
      // Dev/test-only hook (CHAT_STREAM_TEST_DELAY_MS): holds the phase briefly
      // so a manual local run can verify Stop across the whole processing
      // window. Cancellation aborts the sleep and surfaces STREAM_CANCELLED.
      if (typeof maybeTestDelay === 'function') {
        await maybeTestDelay(signal);
      }
      throwIfCancelled(signal);
      const userContext = buildUserContext(socket);
      const appointmentContext = await buildAppointmentContext(userId);

      // Build entity labels from previous context for follow-up reference resolution
      const entityLabels = previousContext ? buildEntityLabels(previousContext) : null;

      responseResult = await this.generateResponse(
        socket,
        sessionId,
        chatHistory,
        userQuery,
        relatedProducts,
        clientMessageId,
        signal,
        generationId,
        userContext,
        appointmentContext,
        entityLabels
      );

      // ================================================================
      // Phase D: Save normalized context only on valid response, and only for
      // a genuinely NEW logical turn (persistContext === true). Retry/Regenerate
      // must not double-advance the logical context.
      // A valid response has a non-empty fullResponse string.
      // Save preserves merged filters even for no-result searches so the
      // user can relax constraints in a follow-up.
      //
      // If response generation failed completely (threw, returned null,
      // undefined, or empty string), context is NOT saved — the previous
      // stored context remains unchanged.
      //
      // Save failure must not fail the chat response.
      // ================================================================
      if (persistContext && responseResult && typeof responseResult.fullResponse === 'string' && responseResult.fullResponse.trim().length > 0) {
        try {
          const productIds = Array.isArray(responseResult.relatedProducts)
            ? responseResult.relatedProducts.map(p => p.id).filter(Boolean).slice(0, 5)
            : relatedProducts.map(p => p._id).filter(Boolean).slice(0, 5);

          // Build lastProducts entity labels for follow-up reference resolution
          const lastProducts = Array.isArray(relatedProducts)
            ? relatedProducts.slice(0, 5).map((p, i) => ({
                id: p._id,
                name: p.name,
                brand: p.brand,
                price: p.price,
                position: i + 1,
              }))
            : [];

          const newContext = createContextFromParsed(
            { cleanedQuery: clarifiedQuery, filters: mergedFilters, preferences: mergedPreferences },
            productIds
          );
          newContext.lastProducts = lastProducts;
          if (previousContext && !contextReset) {
            newContext.turnCount = (previousContext.turnCount || 0) + 1;
          }
          await contextService.saveContext(userId, sessionId, sanitizeConversationContext(newContext));
        } catch (_ctxErr) {
          // context save failure must not fail the chat response
        }
      }
    }

    return responseResult;
  }

  /**
   * Verify a Retry target without running any pipeline. Ownership is checked by
   * { userId, sessionId }; a miss returns the generic 'not_found' (never reveals
   * whether another user owns a matching id).
   *
   * Returns { status } where status is 'ready', 'not_found' (conversation or
   * user turn missing) or 'already_completed' (an assistant reply exists — that
   * is Regenerate territory, never a Retry).
   */
  async verifyRetryTarget(sessionId, userId, clientMessageId) {
    const conversation = await Conversation.findOne({ sessionId, userId });
    if (!conversation) return { status: 'not_found' };

    const userMessage = conversation.getUserMessageByClientMessageId(clientMessageId);
    if (!userMessage) return { status: 'not_found' };

    const assistantMessage = conversation.getAssistantMessageByClientMessageId(clientMessageId);
    if (assistantMessage) return { status: 'already_completed' };

    return { status: 'ready' };
  }

  /**
   * Verify a Regenerate target before calling any pipeline.
   * Returns { status } where status is 'ready', 'not_found' (conversation or
   * user turn missing) or 'not_completed' (no completed assistant reply).
   */
  async verifyRegenerateTarget(sessionId, userId, clientMessageId) {
    const conversation = await Conversation.findOne({ sessionId, userId });
    if (!conversation) return { status: 'not_found' };

    const userMessage = conversation.getUserMessageByClientMessageId(clientMessageId);
    if (!userMessage) return { status: 'not_found' };

    const assistantMessage = conversation.getAssistantMessageByClientMessageId(clientMessageId);
    if (!assistantMessage) return { status: 'not_completed' };

    return { status: 'ready' };
  }

  /**
   * Retry a logical turn whose user message is persisted but whose assistant
   * reply was never persisted (cancelled or failed generation).
   *
   * Returns one of:
   *   { status: 'not_found' }        — conversation or user turn missing
   *   { status: 'already_completed' }— an assistant reply already exists (that
   *                                    is Regenerate territory, never treated as
   *                                    a Retry)
   *   { status: 'accepted', result } — assistant reply persisted once
   *
   * The user message is NEVER re-appended. The generation identity reuses the
   * logical clientMessageId (its previous dedup claim was released on
   * cancel/error, so a legit Retry can reprocess).
   */
  async retryMessage(socket, sessionId, userId, clientMessageId, signal) {
    const startTime = Date.now();
    const conversation = await Conversation.findOne({ sessionId, userId });

    if (!conversation) return { status: 'not_found' };

    const userMessage = conversation.getUserMessageByClientMessageId(clientMessageId);
    if (!userMessage) return { status: 'not_found' };

    // Retry is only valid when no assistant reply was ever persisted for this
    // logical turn. A completed turn must go through Regenerate.
    const assistantMessage = conversation.getAssistantMessageByClientMessageId(clientMessageId);
    if (assistantMessage) return { status: 'already_completed' };

    const chatHistory = conversation.messages.slice(-6);
    const generationId = clientMessageId; // retry reuses the logical identity

    const responseResult = await this.renderResponse({
      socket,
      sessionId,
      userId,
      chatHistory,
      userQuery: userMessage.content,
      clientMessageId,
      generationId,
      signal,
      persistContext: false, // do NOT advance logical context a second time
    });

    const processingTime = Date.now() - startTime;
    throwIfCancelled(signal);
    await this.saveAIResponse(sessionId, userId, responseResult.fullResponse, {
      processingTime,
      retrievedProducts: responseResult.relatedProducts || [],
      responseType: responseResult.responseType || "product_query",
      skipRAG: responseResult.responseType === "small_talk",
      modelUsed: responseResult.modelUsed || process.env.OPENAI_MODEL || "gpt-4o",
      clientMessageId,
      generationId,
    });

    return {
      status: 'accepted',
      result: {
        success: true,
        processingTime,
        responseType: responseResult.responseType || "product_query",
        ragSkipped: responseResult.responseType === "small_talk",
        ...responseResult,
      },
    };
  }

  /**
   * Regenerate a completed logical turn. The logical clientMessageId stays
   * stable; a FRESH generationId identifies this attempt. After a successful
   * generation the existing assistant row is REPLACED atomically (generate-then-
   * replace): the old response stays intact until the new one actually succeeds,
   * and a failed/cancelled regenerate never deletes or partially overwrites it.
   *
   * Returns one of:
   *   { status: 'not_found' }     — conversation or user turn missing
   *   { status: 'not_completed' } — no completed assistant reply to replace
   *   { status: 'accepted', result, generationId }
   */
  async regenerateMessage(socket, sessionId, userId, clientMessageId, generationId, signal) {
    const startTime = Date.now();
    const conversation = await Conversation.findOne({ sessionId, userId });

    if (!conversation) return { status: 'not_found' };

    const userMessage = conversation.getUserMessageByClientMessageId(clientMessageId);
    if (!userMessage) return { status: 'not_found' };

    const assistantMessage = conversation.getAssistantMessageByClientMessageId(clientMessageId);
    if (!assistantMessage) return { status: 'not_completed' };

    const chatHistory = conversation.messages.slice(-6);

    const responseResult = await this.renderResponse({
      socket,
      sessionId,
      userId,
      chatHistory,
      userQuery: userMessage.content,
      clientMessageId,
      generationId,
      signal,
      persistContext: false, // replace, do not treat as a brand-new turn
    });

    const processingTime = Date.now() - startTime;
    throwIfCancelled(signal);

    await this.replaceAIResponse(sessionId, userId, clientMessageId, responseResult.fullResponse, generationId, {
      processingTime,
      retrievedProducts: responseResult.relatedProducts || [],
      responseType: responseResult.responseType || "product_query",
      skipRAG: responseResult.responseType === "small_talk",
      modelUsed: responseResult.modelUsed || process.env.OPENAI_MODEL || "gpt-4o",
    });

    return {
      status: 'accepted',
      generationId,
      result: {
        success: true,
        processingTime,
        responseType: responseResult.responseType || "product_query",
        ragSkipped: responseResult.responseType === "small_talk",
        ...responseResult,
      },
    };
  }

  /**
   * Atomically replace the assistant reply of an existing logical turn. Loads
   * the owned conversation, finds the assistant message with the given logical
   * clientMessageId, and overwrites content/timestamp/metadata/generationId in
   * place. Never appends a second assistant row and never deletes the old row
   * before the new generation has succeeded. If the conversation is gone the
   * operation is a safe no-op (never throws to the caller).
   */
  async replaceAIResponse(sessionId, userId, clientMessageId, aiResponse, generationId, metadata = {}) {
    try {
      const conversation = await Conversation.findOne({ sessionId, userId });
      if (!conversation) return false;

      const index = conversation.messages.findIndex(
        (m) => m.role === "assistant" && m.clientMessageId === clientMessageId
      );
      if (index === -1) return false;

      conversation.messages[index].content = aiResponse;
      conversation.messages[index].timestamp = new Date();
      conversation.messages[index].generationId = generationId;
      if (!conversation.messages[index].metadata) {
        conversation.messages[index].metadata = {};
      }
      conversation.messages[index].metadata.modelUsed = metadata.modelUsed || process.env.OPENAI_MODEL || "gpt-4o";
      if (typeof metadata.processingTime === 'number') {
        conversation.messages[index].metadata.processingTime = metadata.processingTime;
      }
      if (Array.isArray(metadata.retrievedProducts)) {
        conversation.messages[index].metadata.retrievedProducts = metadata.retrievedProducts;
      }
      if (metadata.responseType) {
        conversation.messages[index].metadata.responseType = metadata.responseType;
      }
      if (metadata.skipRAG) {
        conversation.messages[index].metadata.skipRAG = metadata.skipRAG;
      }

      await conversation.save();
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Error replacing AI response');
      return false;
    }
  }
}

module.exports = new ChatController();

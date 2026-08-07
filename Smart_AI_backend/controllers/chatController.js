const crypto = require("crypto");
const Conversation = require("../models/Conversation");
const Complaint = require("../models/Complaint");
const logger = require("../utils/logger");
const productSearchService = require("../services/productSearchService");
const {
  classifyIntentAndRespond,
  generateChatResponse,
  generateChatResponseStream,
  generateComplaintResponse,
} = require("../utils/gemini");

const { createChatStreamBatching } = require("../services/chatStreamBatching");
const chatActiveStreams = require("../services/chatActiveStreams");
const { throwIfCancelled, maybeTestDelay } = require("../utils/chatCancellation");
const { parseProductConstraints } = require("../utils/productConstraintParser");
const { matchesProductConstraints } = require("../utils/productValidator");
const { rankProducts } = require("../utils/productRanking");
const { classifyQuery, resolveFollowUpQuery, createContextFromParsed, sanitizeConversationContext } = require("../utils/conversationContext");
const contextService = require("../services/contextService");

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
      } else if (intentResult.intent === "complaint") {
        return {
          intent: "complaint",
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
    generationId = null
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
        const res = await generateChatResponse(validatedHistory, userQuery, validatedProducts);
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
   * Handle Complaint - Xử lý khiếu nại khách hàng
   * Sử dụng specialized complaint agent và multi-turn conversation
   */
  async handleComplaint(socket, sessionId, userId, chatHistory, userMessage, clientMessageId, generationId = null) {
    try {
      logger.info({ sessionId }, 'Handling complaint for session');

      // Lấy thông tin conversation bằng cặp ownership { sessionId, userId } để
      // đảm bảo không truy cập conversation của người dùng khác.
      const conversation = await Conversation.findOne({ sessionId, userId });
      if (!conversation) {
        throw new Error("Conversation not found for session");
      }

      // Kiểm tra xem đã có complaint cho conversation (thuộc sở hữu người dùng này) chưa
      let existingComplaint = await Complaint.findOne({
        conversationId: conversation._id,
        status: { $in: ['open', 'in_progress'] }
      }).sort({ createdAt: -1 });

      logger.info({ sessionId, found: !!existingComplaint }, 'Existing complaint found');

      // Gọi specialized complaint agent
      const complaintResponse = await generateComplaintResponse(
        chatHistory,
        userMessage
      );

      logger.info(
        { sessionId, isComplete: complaintResponse.isComplete },
        'Complaint response generated'
      );

      // Emit response to user
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

      // Cập nhật hoặc tạo mới complaint record
      let complaintRecord;
      
      if (existingComplaint) {
        // Cập nhật complaint hiện tại
        if (complaintResponse.complaintData.detailedDescription) {
          existingComplaint.detailedDescription = complaintResponse.complaintData.detailedDescription;
        }

        // Cập nhật contact information nếu có
        if (complaintResponse.complaintData.customerContact.email) {
          existingComplaint.customerContact.email = complaintResponse.complaintData.customerContact.email;
        }
        if (complaintResponse.complaintData.customerContact.phone) {
          existingComplaint.customerContact.phone = complaintResponse.complaintData.customerContact.phone;
        }

        // Cập nhật priority và tags
        existingComplaint.priority = complaintResponse.complaintData.priority;
        existingComplaint.tags = [...new Set([
          ...existingComplaint.tags,
          ...complaintResponse.complaintData.tags
        ])];

        // Chuyển sang in_progress nếu isComplete = true
        if (complaintResponse.isComplete && existingComplaint.status === 'open') {
          existingComplaint.status = 'in_progress';
        }

        complaintRecord = await existingComplaint.save();
      } else if (complaintResponse.isComplete) {
        // Tạo complaint record mới chỉ khi isComplete = true
        complaintRecord = new Complaint({
          sessionId: sessionId,
          conversationId: conversation._id,
          complaintSummary: `Khiếu nại từ session ${sessionId}`,
          detailedDescription: complaintResponse.complaintData.detailedDescription,
          customerContact: complaintResponse.complaintData.customerContact,
          status: 'in_progress', // Đặt thành in_progress ngay khi có đủ thông tin
          priority: complaintResponse.complaintData.priority,
          tags: complaintResponse.complaintData.tags
        });

        complaintRecord = await complaintRecord.save();
        logger.info(
          { sessionId, complaintId: complaintRecord._id },
          'New complaint record created'
        );
      }

      return {
        fullResponse: complaintResponse.responseText,
        responseType: "complaint",
        isComplete: complaintResponse.isComplete,
        complaintId: complaintRecord ? complaintRecord._id : null,
        priority: complaintResponse.complaintData.priority,
        relatedProducts: [], // No product search for complaints
        aiPayload: complaintPayload,
      };

    } catch (error) {
      logger.error({ err: error }, 'Error in handleComplaint');

      // Fallback response
      const fallbackResponse = "Em rất xin lỗi về sự bất tiện này. Hiện tại hệ thống đang gặp sự cố. Anh/chị có thể liên hệ hotline 1900xxxx để được hỗ trợ trực tiếp không ạ?";

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

    const intentResult = await this.classifyAndProcessIntent(
      chatHistory,
      userQuery,
      signal
    );
    logger.info({ intentResult }, 'Intent result');
    // Checkpoint: after intent classification, before any RAG work.
    throwIfCancelled(signal);
    let responseResult;

    if (intentResult.intent === "small_talk") {
      responseResult = await this.handleSmallTalk(
        socket,
        sessionId,
        intentResult.directResponse,
        clientMessageId,
        generationId
      );
    } else if (intentResult.intent === "complaint") {
      responseResult = await this.handleComplaint(
        socket,
        sessionId,
        userId,
        chatHistory,
        userQuery,
        clientMessageId,
        generationId
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
      responseResult = await this.generateResponse(
        socket,
        sessionId,
        chatHistory,
        userQuery,
        relatedProducts,
        clientMessageId,
        signal,
        generationId
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

          const newContext = createContextFromParsed(
            { cleanedQuery: clarifiedQuery, filters: mergedFilters, preferences: mergedPreferences },
            productIds
          );
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

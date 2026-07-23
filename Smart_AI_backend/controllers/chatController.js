const Conversation = require("../models/Conversation");
const Complaint = require("../models/Complaint");
const productSearchService = require("../services/productSearchService");
const {
  classifyIntentAndRespond,
  generateChatResponse,
  generateComplaintResponse,
} = require("../utils/gemini");
const { parseProductConstraints } = require("../utils/productConstraintParser");
const { matchesProductConstraints } = require("../utils/productValidator");
const { rankProducts } = require("../utils/productRanking");
const { classifyQuery, resolveFollowUpQuery, createContextFromParsed, sanitizeConversationContext } = require("../utils/conversationContext");
const contextService = require("../services/contextService");

class ChatController {
  /**
   * Phase 1: Session Management
   * Quản lý phiên trò chuyện và lưu tin nhắn
   */
  async manageSession(sessionId, userMessage, metadata = {}) {
    try {
      console.log(`Phase 1: Managing session ${sessionId}`);

      // Tìm hoặc tạo conversation
      let conversation = await Conversation.findOne({ sessionId });

      if (!conversation) {
        console.log(`Creating new conversation for session ${sessionId}`);
        conversation = new Conversation({
          sessionId,
          messages: [],
        });
      }

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

      conversation.messages.push(userMessageObj);
      await conversation.save();

      // Lấy lịch sử chat gần đây (4-6 tin nhắn cuối)
      const recentMessages = conversation.messages.slice(-6);

      console.log(
        `Phase 1 completed: ${recentMessages.length} messages in context`
      );

      return {
        conversation,
        chatHistory: recentMessages,
      };
    } catch (error) {
      console.error("Phase 1 error:", error.message);
      throw new Error(`Session management failed: ${error.message}`);
    }
  }

  /**
   * Phase 2: Intent Classification & Query Processing
   * Phân loại ý định và xử lý thông minh (RAG optimization)
   */
  async classifyAndProcessIntent(chatHistory, userQuery) {
    try {
      const intentResult = await classifyIntentAndRespond(
        chatHistory,
        userQuery
      );
      console.log("intentResult2", intentResult);


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
  async searchRelevantProducts(clarifiedQuery, limit = 5, mergedFilters = null, mergedPreferences = null) {
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
   * Phase 4: Response Generation
   * Tạo phản hồi bằng Gemini và trả về toàn bộ response một lần
   */
  async generateResponse(
    socket,
    sessionId,
    chatHistory,
    userQuery,
    relatedProducts
  ) {
    try {
      const validatedProducts = Array.isArray(relatedProducts)
        ? relatedProducts
        : [];
      const validatedHistory = Array.isArray(chatHistory) ? chatHistory : [];

      const { text, provider } = await generateChatResponse(
        validatedHistory,
        userQuery,
        validatedProducts
      );

      socket.emit("aiResponse", {
        sessionId,
        message: text,
        timestamp: new Date().toISOString(),
      });

      return {
        fullResponse: text,
        modelUsed: provider,
        relatedProducts: validatedProducts.map((p) => ({
          id: p._id,
          name: p.name,
          score: p.score,
        })),
      };
    } catch (error) {
      socket.emit("error", {
        type: "GENERATION_ERROR",
        message: "Không thể tạo phản hồi. Vui lòng thử lại.",
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Handle Small Talk - Xử lý trò chuyện phiếm (early return optimization)
   */
  async handleSmallTalk(socket, sessionId, directResponse) {
    try {
      socket.emit("aiResponse", {
        sessionId,
        message: directResponse,
        timestamp: new Date().toISOString(),
        metadata: {
          responseType: "small_talk",
          skipRAG: true,
        },
      });

      return {
        fullResponse: directResponse,
        responseType: "small_talk",
        relatedProducts: [],
      };
    } catch (error) {
      const fallbackResponse = "Xin chào! Tôi có thể giúp gì cho bạn hôm nay?";

      socket.emit("aiResponse", {
        sessionId,
        message: fallbackResponse,
        timestamp: new Date().toISOString(),
        metadata: {
          responseType: "small_talk",
          skipRAG: true,
          fallback: true,
        },
      });

      return {
        fullResponse: fallbackResponse,
        responseType: "small_talk",
        relatedProducts: [],
      };
    }
  }

  /**
   * Handle Complaint - Xử lý khiếu nại khách hàng
   * Sử dụng specialized complaint agent và multi-turn conversation
   */
  async handleComplaint(socket, sessionId, chatHistory, userMessage) {
    try {
      console.log(`Handling complaint for session ${sessionId}`);

      // Kiểm tra xem đã có complaint cho session này chưa
      let existingComplaint = await Complaint.findOne({ 
        sessionId: sessionId,
        status: { $in: ['open', 'in_progress'] }
      }).sort({ createdAt: -1 });

      console.log(`Existing complaint found: ${!!existingComplaint}`);

      // Lấy thông tin conversation để có conversationId
      const conversation = await Conversation.findOne({ sessionId });
      if (!conversation) {
        throw new Error("Conversation not found for session");
      }

      // Gọi specialized complaint agent
      const complaintResponse = await generateComplaintResponse(
        chatHistory,
        userMessage
      );

      console.log(`Complaint response generated, isComplete: ${complaintResponse.isComplete}`);

      // Emit response to user
      socket.emit("aiResponse", {
        sessionId,
        message: complaintResponse.responseText,
        timestamp: new Date().toISOString(),
        metadata: {
          responseType: "complaint",
          isComplete: complaintResponse.isComplete,
          priority: complaintResponse.complaintData.priority,
        },
      });

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
        console.log(`New complaint record created with ID: ${complaintRecord._id}`);
      }

      return {
        fullResponse: complaintResponse.responseText,
        responseType: "complaint",
        isComplete: complaintResponse.isComplete,
        complaintId: complaintRecord ? complaintRecord._id : null,
        priority: complaintResponse.complaintData.priority,
        relatedProducts: [], // No product search for complaints
      };

    } catch (error) {
      console.error("Error in handleComplaint:", error.message);

      // Fallback response
      const fallbackResponse = "Em rất xin lỗi về sự bất tiện này. Hiện tại hệ thống đang gặp sự cố. Anh/chị có thể liên hệ hotline 1900xxxx để được hỗ trợ trực tiếp không ạ?";

      socket.emit("aiResponse", {
        sessionId,
        message: fallbackResponse,
        timestamp: new Date().toISOString(),
        metadata: {
          responseType: "complaint",
          error: true,
          fallback: true,
        },
      });

      return {
        fullResponse: fallbackResponse,
        responseType: "complaint",
        isComplete: false,
        complaintId: null,
        priority: "medium",
        relatedProducts: [],
      };
    }
  }

  /**
   * Lưu phản hồi của AI vào database
   */
  async saveAIResponse(sessionId, aiResponse, metadata = {}) {
    try {
      const conversation = await Conversation.findOne({ sessionId });

      if (conversation) {
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

        conversation.messages.push(aiMessageObj);
        await conversation.save();

      }
    } catch (error) {
      console.error("Error saving AI response:", error.message);
    }
  }

  async processMessage(socket, data) {
    const startTime = Date.now();
    const { sessionId, message } = data;

    try {
      const metadata = {
        userAgent: socket.handshake.headers["user-agent"],
        ipAddress: socket.handshake.address,
      };

      const { conversation, chatHistory } = await this.manageSession(
        sessionId,
        message,
        metadata
      );

      const intentResult = await this.classifyAndProcessIntent(
        chatHistory,
        message
      );
      console.log("intentResult", intentResult);
      let responseResult;

      if (intentResult.intent === "small_talk") {
        responseResult = await this.handleSmallTalk(
          socket,
          sessionId,
          intentResult.directResponse
        );
      } else if (intentResult.intent === "complaint") {
        responseResult = await this.handleComplaint(
          socket,
          sessionId,
          chatHistory,
          message
        );
      } else {
        // ================================================================
        // Phase A: Load and merge conversation context
        // ================================================================
        const clarifiedQuery = intentResult.clarifiedQuery;
        const parsed = parseProductConstraints(clarifiedQuery);
        const queryType = classifyQuery(clarifiedQuery, parsed);
        const previousContext = await contextService.loadContext(sessionId);
        let mergedFilters = parsed.filters;
        let mergedPreferences = parsed.preferences;
        let contextReset = false;

        if (queryType.action === 'reset') {
          await contextService.deleteContext(sessionId);
          contextReset = true;
        } else if (queryType.action === 'follow_up' && previousContext) {
          const { mergedParsed } = resolveFollowUpQuery(parsed, previousContext);
          mergedFilters = mergedParsed.filters;
          mergedPreferences = mergedParsed.preferences;
        }
        // independent: use parsed values as-is (no merge)

        // ================================================================
        // Phase B: Search, filter, rank
        // ================================================================
        const relatedProducts = await this.searchRelevantProducts(
          clarifiedQuery,
          5,
          mergedFilters,
          mergedPreferences
        );

        // ================================================================
        // Phase C: Generate response (Gemini/OpenAI or deterministic fallback)
        // ================================================================
        responseResult = await this.generateResponse(
          socket,
          sessionId,
          chatHistory,
          message,
          relatedProducts
        );

        // ================================================================
        // Phase D: Save normalized context only on valid response.
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
        if (responseResult && typeof responseResult.fullResponse === 'string' && responseResult.fullResponse.trim().length > 0) {
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
            await contextService.saveContext(sessionId, sanitizeConversationContext(newContext));
          } catch (_ctxErr) {
            // context save failure must not fail the chat response
          }
        }
      }

      const processingTime = Date.now() - startTime;
      await this.saveAIResponse(sessionId, responseResult.fullResponse, {
        processingTime,
        retrievedProducts: responseResult.relatedProducts || [],
        responseType: responseResult.responseType || "product_query",
        skipRAG: responseResult.responseType === "small_talk",
        modelUsed: responseResult.modelUsed || process.env.OPENAI_MODEL || "gpt-4o",
      });

      return {
        success: true,
        processingTime,
        responseType: responseResult.responseType || "product_query",
        ragSkipped: responseResult.responseType === "small_talk",
        ...responseResult,
      };
    } catch (error) {
      console.error("Error:", error.message);
      throw error;
    }
  }
}

module.exports = new ChatController();

const Conversation = require("../models/Conversation");
const Product = require("../models/Product");
const Complaint = require("../models/Complaint");
const { generateEmbedding } = require("../utils/openai");
const {
  classifyIntentAndRespond,
  generateChatResponse,
  generateComplaintResponse,
} = require("../utils/gemini");

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
  async searchRelevantProducts(clarifiedQuery, limit = 5) {
    try {
      const queryVector = await generateEmbedding(clarifiedQuery);

      let relatedProducts = await Product.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding_vector",
            queryVector: queryVector,
            numCandidates: 100,
            limit: limit,
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            brand: 1,
            price: 1,
            specs: 1,
            description: 1,
            inStock: 1,
            colors: 1,
            isActive: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
        {
          $match: {
            isActive: true,
          },
        },
      ]);
      if (relatedProducts.length === 0) {
        relatedProducts = await Product.find({
          $text: { $search: clarifiedQuery },
          isActive: true,
        })
          .select("name brand price specs description inStock colors")
          .limit(limit)
          .lean();
      }

      if (relatedProducts.length === 0) {
        relatedProducts = await Product.find({
          isActive: true,
          inStock: { $gt: 0 },
        })
          .sort({ createdAt: -1 })
          .select("name brand price specs description inStock colors")
          .limit(limit)
          .lean();
      }

      console.log("relatedProducts", relatedProducts);
      return relatedProducts;
    } catch (error) {
      try {
        const fallbackProducts = await Product.find({
          $text: { $search: clarifiedQuery },
          isActive: true,
        })
          .select("name brand price specs description inStock colors")
          .limit(limit)
          .lean();
        if (fallbackProducts.length > 0) {
          return fallbackProducts;
        }

        return await Product.find({
          isActive: true,
          inStock: { $gt: 0 },
        })
          .sort({ createdAt: -1 })
          .select("name brand price specs description inStock colors")
          .limit(limit)
          .lean();
      } catch (fallbackError) {
        return [];
      }
    }
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

      const fullResponse = await generateChatResponse(
        validatedHistory,
        userQuery,
        validatedProducts
      );

      socket.emit("aiResponse", {
        sessionId,
        message: fullResponse,
        timestamp: new Date().toISOString(),
      });

      return {
        fullResponse,
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
        const relatedProducts = await this.searchRelevantProducts(
          intentResult.clarifiedQuery
        );

        responseResult = await this.generateResponse(
          socket,
          sessionId,
          chatHistory,
          message,
          relatedProducts
        );
      }

      const processingTime = Date.now() - startTime;
      await this.saveAIResponse(sessionId, responseResult.fullResponse, {
        processingTime,
        retrievedProducts: responseResult.relatedProducts || [],
        responseType: responseResult.responseType || "product_query",
        skipRAG: responseResult.responseType === "small_talk",
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

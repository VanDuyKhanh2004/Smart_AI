const mongoose = require('mongoose');
const Question = require('../models/Question');
const Answer = require('../models/Answer');
const Product = require('../models/Product');
const { generateAISuggestion } = require('../services/aiSuggestionService');

/**
 * Create a new question
 * Requirements: 1.1, 1.2, 1.3, 5.1, 5.2
 */
const createQuestion = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, questionText } = req.body;

    // Validate productId
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCT',
          message: 'Product ID không hợp lệ'
        }
      });
    }

    // Check product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Không tìm thấy sản phẩm'
        }
      });
    }

    // Requirement 1.2: Validate questionText (10-500 chars)
    if (!questionText || typeof questionText !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'QUESTION_REQUIRED',
          message: 'Câu hỏi là bắt buộc'
        }
      });
    }

    const trimmedText = questionText.trim();
    if (trimmedText.length < 10) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'QUESTION_TOO_SHORT',
          message: 'Câu hỏi phải có ít nhất 10 ký tự'
        }
      });
    }


    if (trimmedText.length > 500) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'QUESTION_TOO_LONG',
          message: 'Câu hỏi không được vượt quá 500 ký tự'
        }
      });
    }

    // Requirement 1.1, 1.3: Create question with status 'pending'
    const question = new Question({
      product: productId,
      user: userId,
      questionText: trimmedText,
      status: 'pending',
      upvotes: [],
      upvoteCount: 0
    });

    await question.save();

    // Requirement 5.1, 5.2: Generate AI suggestion
    let aiAnswer = null;
    try {
      const aiSuggestion = await generateAISuggestion(trimmedText, product);
      
      // Create AI answer if confidence >= 0.5 (handled by service)
      if (aiSuggestion) {
        aiAnswer = new Answer({
          question: question._id,
          user: userId, // Use the question asker as the user for AI answers
          answerText: aiSuggestion.answerText,
          isOfficial: false,
          isAISuggestion: true,
          aiConfidence: aiSuggestion.confidence,
          aiSourceSpecs: aiSuggestion.sourceSpecs
        });
        await aiAnswer.save();
      }
    } catch (aiError) {
      // Log AI error but don't fail the question creation
      console.error('AI suggestion error:', aiError.message);
    }

    // Populate user info for response
    const populatedQuestion = await Question.findById(question._id)
      .populate('user', 'name');

    // Include AI answer if created
    const responseData = {
      ...populatedQuestion.toJSON(),
      answers: aiAnswer ? [await Answer.findById(aiAnswer._id).populate('user', 'name')] : []
    };

    res.status(201).json({
      success: true,
      message: 'Câu hỏi đã được tạo thành công',
      data: responseData
    });
  } catch (error) {
    console.error('Error creating question:', error);
    
    // Handle validation errors from mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: messages.join(', ')
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi tạo câu hỏi'
      }
    });
  }
};


/**
 * Get product questions (public)
 * Requirements: 2.1, 2.2, 2.3
 */
const getProductQuestions = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get current user ID if authenticated (for hasUpvoted field)
    const currentUserId = req.user?._id;

    // Validate productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCT',
          message: 'Product ID không hợp lệ'
        }
      });
    }

    // Check product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Không tìm thấy sản phẩm'
        }
      });
    }

    // Requirement 2.1: Return approved/answered questions only, sorted by upvoteCount descending
    const [questions, totalCount] = await Promise.all([
      Question.find({
        product: productId,
        status: { $in: ['approved', 'answered'] }
      })
        .populate('user', 'name')
        .sort({ upvoteCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Question.countDocuments({
        product: productId,
        status: { $in: ['approved', 'answered'] }
      })
    ]);

    // Requirement 2.2, 2.3: Include answers for each question
    const questionsWithAnswers = await Promise.all(
      questions.map(async (question) => {
        const answers = await Answer.find({ question: question._id })
          .populate('user', 'name role')
          .sort({ isOfficial: -1, createdAt: 1 }); // Official answers first

        const questionObj = question.toJSON();
        
        // Add hasUpvoted field for current user
        questionObj.hasUpvoted = currentUserId 
          ? question.hasUserUpvoted(currentUserId)
          : false;
        
        questionObj.answers = answers;
        return questionObj;
      })
    );

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      data: {
        questions: questionsWithAnswers,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error getting product questions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi lấy câu hỏi sản phẩm'
      }
    });
  }
};


/**
 * Toggle upvote on a question
 * Requirements: 4.1, 4.2
 */
const toggleUpvote = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id: questionId } = req.params;

    // Validate questionId
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUESTION',
          message: 'Question ID không hợp lệ'
        }
      });
    }

    // Find the question
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'QUESTION_NOT_FOUND',
          message: 'Không tìm thấy câu hỏi'
        }
      });
    }

    // Requirement 4.1, 4.2: Toggle upvote using model method
    const hadUpvoted = question.hasUserUpvoted(userId);
    await question.toggleUpvote(userId);

    res.status(200).json({
      success: true,
      message: hadUpvoted ? 'Đã bỏ upvote' : 'Đã upvote câu hỏi',
      data: {
        upvoteCount: question.upvoteCount,
        hasUpvoted: !hadUpvoted
      }
    });
  } catch (error) {
    console.error('Error toggling upvote:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi upvote câu hỏi'
      }
    });
  }
};

/**
 * Delete own question
 * Requirements: 7.1, 7.2, 7.3
 */
const deleteQuestion = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const { id: questionId } = req.params;

    // Validate questionId
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUESTION',
          message: 'Question ID không hợp lệ'
        }
      });
    }

    // Find the question
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'QUESTION_NOT_FOUND',
          message: 'Không tìm thấy câu hỏi'
        }
      });
    }

    // Requirement 7.2: Verify ownership or admin role
    const isOwner = question.user.toString() === userId.toString();
    const isAdmin = userRole === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'NOT_OWNER',
          message: 'Bạn không có quyền xóa câu hỏi này'
        }
      });
    }

    // Requirement 7.1, 7.3: Delete question and all associated answers (cascade delete)
    await Answer.deleteByQuestion(questionId);
    await Question.findByIdAndDelete(questionId);

    res.status(200).json({
      success: true,
      message: 'Câu hỏi đã được xóa thành công'
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi xóa câu hỏi'
      }
    });
  }
};


/**
 * Admin: Get all questions with filtering
 * Requirements: 6.1
 */
const getAllQuestions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, productId } = req.query;

    // Build filter query
    const filter = {};

    // Filter by status if provided
    if (status && ['pending', 'approved', 'answered', 'rejected'].includes(status)) {
      filter.status = status;
    }

    // Filter by product if provided
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      filter.product = productId;
    }

    // Get questions with pagination
    const [questions, totalCount] = await Promise.all([
      Question.find(filter)
        .populate('user', 'name email')
        .populate('product', 'name image')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Question.countDocuments(filter)
    ]);

    // Include answers for each question
    const questionsWithAnswers = await Promise.all(
      questions.map(async (question) => {
        const answers = await Answer.find({ question: question._id })
          .populate('user', 'name role')
          .sort({ createdAt: 1 });

        const questionObj = question.toJSON();
        questionObj.answers = answers;
        return questionObj;
      })
    );

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      data: {
        questions: questionsWithAnswers,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error getting all questions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi lấy danh sách câu hỏi'
      }
    });
  }
};

/**
 * Admin: Update question status
 * Requirements: 6.2, 6.3
 */
const updateQuestionStatus = async (req, res) => {
  try {
    const { id: questionId } = req.params;
    const { status } = req.body;

    // Validate questionId
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUESTION',
          message: 'Question ID không hợp lệ'
        }
      });
    }

    // Validate status
    if (!status || !['pending', 'approved', 'answered', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Status phải là pending, approved, answered hoặc rejected'
        }
      });
    }

    // Find the question
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'QUESTION_NOT_FOUND',
          message: 'Không tìm thấy câu hỏi'
        }
      });
    }

    // Requirement 6.2, 6.3: Update question status
    question.status = status;
    await question.save();

    // Populate for response
    const populatedQuestion = await Question.findById(question._id)
      .populate('user', 'name email')
      .populate('product', 'name image');

    res.status(200).json({
      success: true,
      message: `Câu hỏi đã được ${status === 'approved' ? 'phê duyệt' : status === 'rejected' ? 'từ chối' : 'cập nhật'}`,
      data: populatedQuestion
    });
  } catch (error) {
    console.error('Error updating question status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi cập nhật trạng thái câu hỏi'
      }
    });
  }
};

module.exports = {
  createQuestion,
  getProductQuestions,
  toggleUpvote,
  deleteQuestion,
  // Admin functions
  getAllQuestions,
  updateQuestionStatus
};

const mongoose = require('mongoose');
const Question = require('../models/Question');
const Answer = require('../models/Answer');
const Product = require('../models/Product');
const { generateAISuggestion } = require('../services/aiSuggestionService');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

/**
 * Create a new question
 * Requirements: 1.1, 1.2, 1.3, 5.1, 5.2
 */
const createQuestion = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { productId, questionText } = req.body;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw new BadRequestError('Product ID không hợp lệ', 'INVALID_PRODUCT');
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND');
  }

  if (!questionText || typeof questionText !== 'string') {
    throw new BadRequestError('Câu hỏi là bắt buộc', 'QUESTION_REQUIRED');
  }

  const trimmedText = questionText.trim();
  if (trimmedText.length < 10) {
    throw new BadRequestError('Câu hỏi phải có ít nhất 10 ký tự', 'QUESTION_TOO_SHORT');
  }

  if (trimmedText.length > 500) {
    throw new BadRequestError('Câu hỏi không được vượt quá 500 ký tự', 'QUESTION_TOO_LONG');
  }

  const question = new Question({
    product: productId,
    user: userId,
    questionText: trimmedText,
    status: 'pending',
    upvotes: [],
    upvoteCount: 0
  });

  await question.save();

  let aiAnswer = null;
  try {
    const aiSuggestion = await generateAISuggestion(trimmedText, product);
    if (aiSuggestion) {
      aiAnswer = new Answer({
        question: question._id,
        user: userId,
        answerText: aiSuggestion.answerText,
        isOfficial: false,
        isAISuggestion: true,
        aiConfidence: aiSuggestion.confidence,
        aiSourceSpecs: aiSuggestion.sourceSpecs
      });
      await aiAnswer.save();
    }
  } catch (aiError) {
    console.error('AI suggestion error:', aiError.message);
  }

  const populatedQuestion = await Question.findById(question._id)
    .populate('user', 'name');

  const responseData = {
    ...populatedQuestion.toJSON(),
    answers: aiAnswer ? [await Answer.findById(aiAnswer._id).populate('user', 'name')] : []
  };

  res.status(201).json({
    success: true,
    message: 'Câu hỏi đã được tạo thành công',
    data: responseData
  });
});


/**
 * Get product questions (public)
 * Requirements: 2.1, 2.2, 2.3
 */
const getProductQuestions = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const currentUserId = req.user?._id;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new BadRequestError('Product ID không hợp lệ', 'INVALID_PRODUCT');
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND');
  }

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

  const questionsWithAnswers = await Promise.all(
    questions.map(async (question) => {
      const answers = await Answer.find({ question: question._id })
        .populate('user', 'name role')
        .sort({ isOfficial: -1, createdAt: 1 });

      const questionObj = question.toJSON();
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
});


/**
 * Toggle upvote on a question
 * Requirements: 4.1, 4.2
 */
const toggleUpvote = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id: questionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    throw new BadRequestError('Question ID không hợp lệ', 'INVALID_QUESTION');
  }

  const question = await Question.findById(questionId);
  if (!question) {
    throw new NotFoundError('Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');
  }

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
});

/**
 * Delete own question
 * Requirements: 7.1, 7.2, 7.3
 */
const deleteQuestion = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;
  const { id: questionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    throw new BadRequestError('Question ID không hợp lệ', 'INVALID_QUESTION');
  }

  const question = await Question.findById(questionId);
  if (!question) {
    throw new NotFoundError('Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');
  }

  const isOwner = question.user.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Bạn không có quyền xóa câu hỏi này', 'NOT_OWNER');
  }

  await Answer.deleteByQuestion(questionId);
  await Question.findByIdAndDelete(questionId);

  res.status(200).json({
    success: true,
    message: 'Câu hỏi đã được xóa thành công'
  });
});


/**
 * Admin: Get all questions with filtering
 * Requirements: 6.1
 */
const getAllQuestions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { status, productId } = req.query;

  const filter = {};

  if (status && ['pending', 'approved', 'answered', 'rejected'].includes(status)) {
    filter.status = status;
  }

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    filter.product = productId;
  }

  const [questions, totalCount] = await Promise.all([
    Question.find(filter)
      .populate('user', 'name email')
      .populate('product', 'name image')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Question.countDocuments(filter)
  ]);

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
});

/**
 * Admin: Update question status
 * Requirements: 6.2, 6.3
 */
const updateQuestionStatus = asyncHandler(async (req, res) => {
  const { id: questionId } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    throw new BadRequestError('Question ID không hợp lệ', 'INVALID_QUESTION');
  }

  if (!status || !['pending', 'approved', 'answered', 'rejected'].includes(status)) {
    throw new BadRequestError('Status phải là pending, approved, answered hoặc rejected', 'INVALID_STATUS');
  }

  const question = await Question.findById(questionId);
  if (!question) {
    throw new NotFoundError('Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');
  }

  question.status = status;
  await question.save();

  const populatedQuestion = await Question.findById(question._id)
    .populate('user', 'name email')
    .populate('product', 'name image');

  res.status(200).json({
    success: true,
    message: `Câu hỏi đã được ${status === 'approved' ? 'phê duyệt' : status === 'rejected' ? 'từ chối' : 'cập nhật'}`,
    data: populatedQuestion
  });
});

module.exports = {
  createQuestion,
  getProductQuestions,
  toggleUpvote,
  deleteQuestion,
  // Admin functions
  getAllQuestions,
  updateQuestionStatus
};

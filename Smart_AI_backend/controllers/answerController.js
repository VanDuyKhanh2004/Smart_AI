const mongoose = require('mongoose');
const Answer = require('../models/Answer');
const Question = require('../models/Question');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../utils/errors');

/**
 * Create answer for a question (Admin only)
 * Requirements: 3.1, 3.2, 3.3, 3.4
 * 
 * Property 6: Admin Answer Creates Official Badge and Updates Status
 * Property 7: Answer Authorization
 */
const createAnswer = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { questionId, answerText } = req.body;

  if (!questionId || !mongoose.Types.ObjectId.isValid(questionId)) {
    throw new BadRequestError('Question ID không hợp lệ', 'INVALID_QUESTION');
  }

  const question = await Question.findById(questionId);
  if (!question) {
    throw new NotFoundError('Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');
  }

  if (!answerText || typeof answerText !== 'string') {
    throw new BadRequestError('Câu trả lời là bắt buộc', 'ANSWER_REQUIRED');
  }

  const trimmedText = answerText.trim();
  if (trimmedText.length < 5) {
    throw new BadRequestError('Câu trả lời phải có ít nhất 5 ký tự', 'ANSWER_TOO_SHORT');
  }

  if (trimmedText.length > 1000) {
    throw new BadRequestError('Câu trả lời không được vượt quá 1000 ký tự', 'ANSWER_TOO_LONG');
  }

  const answer = new Answer({
    question: questionId,
    user: userId,
    answerText: trimmedText,
    isOfficial: true,
    isAISuggestion: false
  });

  await answer.save();

  question.status = 'answered';
  await question.save();

  const populatedAnswer = await Answer.findById(answer._id)
    .populate('user', 'name role');

  res.status(201).json({
    success: true,
    message: 'Câu trả lời đã được tạo thành công',
    data: populatedAnswer
  });
});

/**
 * Delete answer (Admin only)
 * Requirements: 6.4
 */
const deleteAnswer = asyncHandler(async (req, res) => {
  const { id: answerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(answerId)) {
    throw new BadRequestError('Answer ID không hợp lệ', 'INVALID_ANSWER');
  }

  const answer = await Answer.findById(answerId);
  if (!answer) {
    throw new NotFoundError('Không tìm thấy câu trả lời', 'ANSWER_NOT_FOUND');
  }

  await Answer.findByIdAndDelete(answerId);

  res.status(200).json({
    success: true,
    message: 'Câu trả lời đã được xóa thành công'
  });
});

module.exports = {
  createAnswer,
  deleteAnswer
};

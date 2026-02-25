const mongoose = require('mongoose');
const Answer = require('../models/Answer');
const Question = require('../models/Question');

/**
 * Create answer for a question (Admin only)
 * Requirements: 3.1, 3.2, 3.3, 3.4
 * 
 * Property 6: Admin Answer Creates Official Badge and Updates Status
 * Property 7: Answer Authorization
 */
const createAnswer = async (req, res) => {
  try {
    const userId = req.user._id;
    const { questionId, answerText } = req.body;

    // Validate questionId
    if (!questionId || !mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUESTION',
          message: 'Question ID không hợp lệ'
        }
      });
    }

    // Check question exists
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

    // Requirement 3.2: Validate answerText (5-1000 chars)
    if (!answerText || typeof answerText !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ANSWER_REQUIRED',
          message: 'Câu trả lời là bắt buộc'
        }
      });
    }

    const trimmedText = answerText.trim();
    if (trimmedText.length < 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ANSWER_TOO_SHORT',
          message: 'Câu trả lời phải có ít nhất 5 ký tự'
        }
      });
    }

    if (trimmedText.length > 1000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ANSWER_TOO_LONG',
          message: 'Câu trả lời không được vượt quá 1000 ký tự'
        }
      });
    }

    // Requirement 3.1: Create answer with isOfficial = true (admin answer)
    const answer = new Answer({
      question: questionId,
      user: userId,
      answerText: trimmedText,
      isOfficial: true,
      isAISuggestion: false
    });

    await answer.save();

    // Requirement 3.3: Update question status to 'answered'
    question.status = 'answered';
    await question.save();

    // Populate user info for response
    const populatedAnswer = await Answer.findById(answer._id)
      .populate('user', 'name role');

    res.status(201).json({
      success: true,
      message: 'Câu trả lời đã được tạo thành công',
      data: populatedAnswer
    });
  } catch (error) {
    console.error('Error creating answer:', error);

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
        message: 'Lỗi server khi tạo câu trả lời'
      }
    });
  }
};

/**
 * Delete answer (Admin only)
 * Requirements: 6.4
 */
const deleteAnswer = async (req, res) => {
  try {
    const { id: answerId } = req.params;

    // Validate answerId
    if (!mongoose.Types.ObjectId.isValid(answerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ANSWER',
          message: 'Answer ID không hợp lệ'
        }
      });
    }

    // Find the answer
    const answer = await Answer.findById(answerId);
    if (!answer) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ANSWER_NOT_FOUND',
          message: 'Không tìm thấy câu trả lời'
        }
      });
    }

    // Delete the answer
    await Answer.findByIdAndDelete(answerId);

    res.status(200).json({
      success: true,
      message: 'Câu trả lời đã được xóa thành công'
    });
  } catch (error) {
    console.error('Error deleting answer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server khi xóa câu trả lời'
      }
    });
  }
};

module.exports = {
  createAnswer,
  deleteAnswer
};

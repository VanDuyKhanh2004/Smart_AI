const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL_NAME = process.env.OPENAI_MODEL || 'gpt-4o';

/**
 * Extract relevant specs from product as a formatted string
 * @param {Object} product - Product document with specs
 * @returns {Object} - Object with specsText and specsList
 */
const extractProductSpecs = (product) => {
  if (!product || !product.specs) {
    return { specsText: '', specsList: [] };
  }

  const specs = product.specs;
  const specsList = [];
  const specsLines = [];

  // Screen specs
  if (specs.screen) {
    if (specs.screen.size) {
      specsList.push(`Màn hình: ${specs.screen.size}`);
      specsLines.push(`- Kích thước màn hình: ${specs.screen.size}`);
    }
    if (specs.screen.resolution) {
      specsList.push(`Độ phân giải: ${specs.screen.resolution}`);
      specsLines.push(`- Độ phân giải: ${specs.screen.resolution}`);
    }
    if (specs.screen.technology) {
      specsList.push(`Công nghệ màn hình: ${specs.screen.technology}`);
      specsLines.push(`- Công nghệ màn hình: ${specs.screen.technology}`);
    }
  }

  // Processor specs
  if (specs.processor) {
    if (specs.processor.chipset) {
      specsList.push(`Chip: ${specs.processor.chipset}`);
      specsLines.push(`- Chip xử lý: ${specs.processor.chipset}`);
    }
    if (specs.processor.cpu) {
      specsList.push(`CPU: ${specs.processor.cpu}`);
      specsLines.push(`- CPU: ${specs.processor.cpu}`);
    }
    if (specs.processor.gpu) {
      specsList.push(`GPU: ${specs.processor.gpu}`);
      specsLines.push(`- GPU: ${specs.processor.gpu}`);
    }
  }


  // Memory specs
  if (specs.memory) {
    if (specs.memory.ram) {
      specsList.push(`RAM: ${specs.memory.ram}`);
      specsLines.push(`- RAM: ${specs.memory.ram}`);
    }
    if (specs.memory.storage) {
      specsList.push(`Bộ nhớ trong: ${specs.memory.storage}`);
      specsLines.push(`- Bộ nhớ trong: ${specs.memory.storage}`);
    }
    if (specs.memory.expandable !== undefined) {
      const expandableText = specs.memory.expandable ? 'Có' : 'Không';
      specsList.push(`Mở rộng bộ nhớ: ${expandableText}`);
      specsLines.push(`- Hỗ trợ thẻ nhớ: ${expandableText}`);
    }
  }

  // Camera specs
  if (specs.camera) {
    if (specs.camera.rear) {
      if (specs.camera.rear.primary) {
        specsList.push(`Camera chính: ${specs.camera.rear.primary}`);
        specsLines.push(`- Camera sau chính: ${specs.camera.rear.primary}`);
      }
      if (specs.camera.rear.secondary) {
        specsList.push(`Camera phụ: ${specs.camera.rear.secondary}`);
        specsLines.push(`- Camera sau phụ: ${specs.camera.rear.secondary}`);
      }
      if (specs.camera.rear.tertiary) {
        specsList.push(`Camera tele: ${specs.camera.rear.tertiary}`);
        specsLines.push(`- Camera tele: ${specs.camera.rear.tertiary}`);
      }
    }
    if (specs.camera.front) {
      specsList.push(`Camera trước: ${specs.camera.front}`);
      specsLines.push(`- Camera trước: ${specs.camera.front}`);
    }
    if (specs.camera.features && specs.camera.features.length > 0) {
      specsList.push(`Tính năng camera: ${specs.camera.features.join(', ')}`);
      specsLines.push(`- Tính năng camera: ${specs.camera.features.join(', ')}`);
    }
  }

  // Battery specs
  if (specs.battery) {
    if (specs.battery.capacity) {
      specsList.push(`Pin: ${specs.battery.capacity}`);
      specsLines.push(`- Dung lượng pin: ${specs.battery.capacity}`);
    }
    if (specs.battery.charging) {
      if (specs.battery.charging.wired) {
        specsList.push(`Sạc có dây: ${specs.battery.charging.wired}`);
        specsLines.push(`- Sạc có dây: ${specs.battery.charging.wired}`);
      }
      if (specs.battery.charging.wireless) {
        specsList.push(`Sạc không dây: ${specs.battery.charging.wireless}`);
        specsLines.push(`- Sạc không dây: ${specs.battery.charging.wireless}`);
      }
    }
  }

  // Connectivity specs
  if (specs.connectivity) {
    if (specs.connectivity.network && specs.connectivity.network.length > 0) {
      specsList.push(`Kết nối mạng: ${specs.connectivity.network.join(', ')}`);
      specsLines.push(`- Kết nối mạng: ${specs.connectivity.network.join(', ')}`);
    }
    if (specs.connectivity.ports && specs.connectivity.ports.length > 0) {
      specsList.push(`Cổng kết nối: ${specs.connectivity.ports.join(', ')}`);
      specsLines.push(`- Cổng kết nối: ${specs.connectivity.ports.join(', ')}`);
    }
  }

  // OS
  if (specs.os) {
    specsList.push(`Hệ điều hành: ${specs.os}`);
    specsLines.push(`- Hệ điều hành: ${specs.os}`);
  }

  // Dimensions
  if (specs.dimensions) {
    specsList.push(`Kích thước: ${specs.dimensions}`);
    specsLines.push(`- Kích thước: ${specs.dimensions}`);
  }

  // Weight
  if (specs.weight) {
    specsList.push(`Trọng lượng: ${specs.weight}`);
    specsLines.push(`- Trọng lượng: ${specs.weight}`);
  }

  // Colors
  if (specs.colors && specs.colors.length > 0) {
    specsList.push(`Màu sắc: ${specs.colors.join(', ')}`);
    specsLines.push(`- Màu sắc có sẵn: ${specs.colors.join(', ')}`);
  }

  return {
    specsText: specsLines.join('\n'),
    specsList
  };
};


/**
 * Parse JSON from AI response text, handling markdown code blocks
 * @param {string} responseText - Raw response from AI
 * @returns {Object} - Parsed JSON object
 */
const parseJsonFromResponse = (responseText) => {
  let cleanedResponse = responseText;
  
  if (responseText.includes('```json')) {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) cleanedResponse = jsonMatch[1].trim();
  } else if (responseText.includes('```')) {
    const codeMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch) cleanedResponse = codeMatch[1].trim();
  }
  
  return JSON.parse(cleanedResponse);
};

/**
 * Generate AI suggestion for a question based on product specs
 * @param {string} questionText - The user's question
 * @param {Object} product - Product document with specs
 * @returns {Object|null} - Suggestion object or null if confidence < 0.5
 * 
 * Returns:
 * {
 *   answerText: string,      // The suggested answer
 *   confidence: number,      // 0-1 confidence score
 *   sourceSpecs: string[]    // Array of specs used to generate answer
 * }
 */
const generateAISuggestion = async (questionText, product) => {
  try {
    // Validate inputs
    if (!questionText || typeof questionText !== 'string') {
      console.error('Invalid questionText provided to generateAISuggestion');
      return null;
    }

    if (!product) {
      console.error('No product provided to generateAISuggestion');
      return null;
    }

    // Extract product specs
    const { specsText, specsList } = extractProductSpecs(product);

    if (!specsText || specsList.length === 0) {
      console.log('Product has no specs, cannot generate AI suggestion');
      return null;
    }

    // Build the prompt for AI
    const systemPrompt = `Bạn là trợ lý AI chuyên trả lời câu hỏi về sản phẩm điện thoại dựa trên thông số kỹ thuật.

NHIỆM VỤ:
1. Phân tích câu hỏi của khách hàng
2. Tìm thông tin liên quan trong thông số kỹ thuật sản phẩm
3. Trả lời câu hỏi dựa HOÀN TOÀN vào thông số có sẵn
4. Đánh giá độ tin cậy của câu trả lời (0-1)

QUY TẮC:
- CHỈ trả lời dựa trên thông số kỹ thuật được cung cấp
- KHÔNG bịa đặt thông tin không có trong specs
- Nếu không tìm thấy thông tin liên quan, trả về confidence = 0
- Trả lời bằng tiếng Việt, ngắn gọn và chính xác
- Liệt kê các thông số đã sử dụng để trả lời

ĐỊNH DẠNG TRẢ VỀ (JSON):
{
  "answerText": "Câu trả lời cho khách hàng",
  "confidence": 0.0-1.0,
  "sourceSpecs": ["Thông số 1", "Thông số 2"],
  "reasoning": "Giải thích ngắn gọn tại sao đưa ra câu trả lời này"
}`;

    const userPrompt = `THÔNG TIN SẢN PHẨM:
Tên: ${product.name}
Hãng: ${product.brand}
Giá: ${new Intl.NumberFormat('vi-VN').format(product.price)} VND

THÔNG SỐ KỸ THUẬT:
${specsText}

CÂU HỎI CỦA KHÁCH HÀNG:
"${questionText}"

Hãy phân tích và trả lời câu hỏi dựa trên thông số kỹ thuật. Chỉ trả về JSON.`;

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      temperature: 0.3, // Lower temperature for more consistent answers
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response?.choices?.[0]?.message?.content?.trim();
    
    if (!content) {
      console.error('OpenAI returned empty response');
      return null;
    }

    // Parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = parseJsonFromResponse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError.message);
      console.error('Raw response:', content);
      return null;
    }

    // Validate response structure
    if (!parsedResponse.answerText || typeof parsedResponse.confidence !== 'number') {
      console.error('Invalid AI response structure:', parsedResponse);
      return null;
    }

    // Ensure confidence is between 0 and 1
    const confidence = Math.max(0, Math.min(1, parsedResponse.confidence));

    // Only return suggestion if confidence >= 0.5 (Requirement 5.4)
    if (confidence < 0.5) {
      console.log(`AI suggestion confidence (${confidence}) below threshold, not returning suggestion`);
      return null;
    }

    // Ensure sourceSpecs is an array
    const sourceSpecs = Array.isArray(parsedResponse.sourceSpecs) 
      ? parsedResponse.sourceSpecs 
      : [];

    // Filter sourceSpecs to only include specs that actually exist in the product
    const validSourceSpecs = sourceSpecs.filter(spec => 
      specsList.some(productSpec => 
        productSpec.toLowerCase().includes(spec.toLowerCase()) ||
        spec.toLowerCase().includes(productSpec.toLowerCase())
      )
    );

    console.log(`AI suggestion generated with confidence ${confidence}, using ${validSourceSpecs.length} source specs`);

    return {
      answerText: parsedResponse.answerText,
      confidence: confidence,
      sourceSpecs: validSourceSpecs.length > 0 ? validSourceSpecs : sourceSpecs.slice(0, 5)
    };

  } catch (error) {
    console.error('Error generating AI suggestion:', error.message);
    
    // Handle specific OpenAI errors
    if (error.message.includes('API key')) {
      console.error('OpenAI API key issue');
    } else if (error.message.includes('quota')) {
      console.error('OpenAI API quota exceeded');
    } else if (error.message.includes('rate limit')) {
      console.error('OpenAI API rate limited');
    }
    
    return null;
  }
};

module.exports = {
  generateAISuggestion,
  extractProductSpecs
};

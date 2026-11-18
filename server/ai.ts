import { GoogleGenAI, Type } from '@google/genai';

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface MerchantAiRequest {
  action: 'description' | 'title' | 'caption' | 'category' | 'whatsapp' | 'full_pack';
  productName: string;
  roughNotes?: string;
  priceUgx?: number;
  storeName?: string;
  district?: string;
  categories?: string[];
}

export async function generateMerchantCopy(input: MerchantAiRequest) {
  const ai = getClient();
  const categoryList = (input.categories || []).join(', ');

  const prompt = `You are UgaByte AI, a practical ecommerce merchandising assistant for Ugandan businesses selling in UGX.
Product name: ${input.productName}
Store name: ${input.storeName || 'Ugandan Merchant'}
Location: ${input.district || 'Kampala, Uganda'}
Price: ${input.priceUgx ? `UGX ${input.priceUgx.toLocaleString()}` : 'Not specified'}
Merchant notes: ${input.roughNotes || 'None provided'}
Available marketplace categories: ${categoryList || 'Fashion & Kitenge, Food & Coffee, Beauty & Shea, Electronics & Solar, Leather & Craft, Campus Essentials'}

Requested focus: ${input.action}

Generate concise, trustworthy, non-hyped, Uganda-first retail copy ready for the merchant to review before publishing.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Return clean, honest, culturally grounded Ugandan retail copy in plain text without markdown code blocks or emojis overload. Always keep pricing references in UGX.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          improvedTitle: {
            type: Type.STRING,
            description: 'Clear, searchable product title under 70 characters.',
          },
          description: {
            type: Type.STRING,
            description: '2-3 crisp sentences highlighting materials, use-case, and reliability for Ugandan buyers.',
          },
          suggestedCategory: {
            type: Type.STRING,
            description: 'Best matching category name from the provided list.',
          },
          marketingCaption: {
            type: Type.STRING,
            description: 'Short social media caption for Instagram or TikTok.',
          },
          whatsappPromo: {
            type: Type.STRING,
            description: 'Ready-to-forward WhatsApp status/broadcast message with UGX price and ordering cue.',
          },
        },
        required: [
          'improvedTitle',
          'description',
          'suggestedCategory',
          'marketingCaption',
          'whatsappPromo',
        ],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  return JSON.parse(raw);
}

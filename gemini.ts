// Vercel Serverless Function
// This file should be placed in the /api directory of your project.

// Use the Web-specific version for Edge environments
import { GoogleGenAI, GenerateContentResponse, Content } from "@google/genai";

interface StandardGeminiRequest {
    isChat?: false;
    model: string;
    contents: any;
    config?: any;
}

interface ChatGeminiRequest {
    isChat: true;
    model: string;
    contents: {
      history: Content[],
      systemInstruction?: any;
      generationConfig?: any;
    };
    userMessage: string;
    config?: never;
}

type GeminiRequest = StandardGeminiRequest | ChatGeminiRequest;

export default async function handler(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const body: GeminiRequest = await req.json();
        
        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
            console.error("API_KEY environment variable not set on the server.");
            return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        let geminiResponse: GenerateContentResponse;

        // By checking for the falsy case first (!body.isChat), TypeScript can correctly
        // narrow the type of `body` to StandardGeminiRequest in this block.
        if (!body.isChat) {
            // Handle standard generateContent request
            const { model, contents, config } = body;
            geminiResponse = await ai.models.generateContent({
                model,
                contents,
                config,
            });
        } else {
            // Handle chat session
            const { model, contents, userMessage } = body;
            const chat = ai.chats.create({
                model: model,
                config: { 
                    systemInstruction: contents.systemInstruction,
                    ...(contents.generationConfig || {})
                },
                history: contents.history,
            });
            geminiResponse = await chat.sendMessage({ message: userMessage });
        }
        
        const responseData = {
            text: geminiResponse.text,
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in Gemini API handler:', error);
        return new Response(JSON.stringify({ error: 'Failed to process Gemini request' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

export const config = {
    runtime: 'edge',
};
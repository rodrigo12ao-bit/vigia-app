import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No API key");
    return;
  }
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.list();
    const models = [];
    for await (const m of response) {
      models.push(m.name);
    }
    console.log("Available models:");
    console.log(models.join('\n'));
  } catch (e) {
    console.error("Error listing models:", e);
  }
}

run();

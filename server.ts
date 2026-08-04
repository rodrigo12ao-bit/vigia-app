import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { VIGIA_LIVE_BASE_PROMPT, VIGIA_TEXT_BASE_PROMPT } from './src/data/prompts.js';

// Bypasses local network SSL proxy issues for Google APIs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

dotenv.config();

const app = express();
const PORT = 3000;

const knowledgeBasePath = path.join(process.cwd(), 'src', 'data', 'conhecimento_defesa_civil.md');
let VIGIA_KNOWLEDGE_BASE = '';
try {
  VIGIA_KNOWLEDGE_BASE = fs.readFileSync(knowledgeBasePath, 'utf8');
  console.log('Base de conhecimento da Vigia carregada com sucesso.');
} catch (e) {
  console.error('Aviso: Base de conhecimento não encontrada em', knowledgeBasePath);
}

const INJECTED_KNOWLEDGE_PROMPT = `\n\n=== MANUAL OFICIAL DE DEFESA CIVIL ===\nVocê deve basear rigorosamente suas orientações factuais no manual abaixo:\n${VIGIA_KNOWLEDGE_BASE}\n=====================================\n`;

const VIGIA_LIVE_SYSTEM_INSTRUCTION = VIGIA_LIVE_BASE_PROMPT + INJECTED_KNOWLEDGE_PROMPT + "\n\nREGRA DE OURO COMPORTAMENTAL: Evite usar repetidamente as expressões 'Olha só', 'Criança incrível' ou 'Superpoder'. Seja concisa, direta e natural, usando no máximo 2 frases curtas. Não repita os mesmos bordões.";

app.use(express.json({ limit: '10mb' }));

// Lazy initialization of Gemini client
function getGenAI(apiVersion?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      ...(apiVersion ? { apiVersion } : {}),
    },
  });
}

// GET /api/live-token - Gera token efêmero para conexão direta à Gemini Live API pelo navegador
app.get('/api/live-token', async (req, res) => {
  try {
    const ai = getGenAI('v1alpha');
    const tokenRes = await ai.authTokens.create({
      config: {
        uses: 1,
      },
    });
    if (!tokenRes || !tokenRes.name) {
      throw new Error('Não foi possível gerar token efêmero.');
    }
    return res.json({ token: tokenRes.name });
  } catch (err: any) {
    console.error('Erro ao gerar live-token:', err);
    return res.status(500).json({ error: 'Erro ao gerar token para Live API', details: err?.message || String(err) });
  }
});

// In-memory cache for common queries to preserve API quota
const responseCache = new Map<string, any>();
const MAX_CACHE_SIZE = 100;

// Request queue to process requests sequentially with cooling delay (prevents rate-limit spikes)
let requestQueue: Promise<void> = Promise.resolve();

function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  const previousQueue = requestQueue;
  let resolveCurrent: () => void;
  requestQueue = new Promise((resolve) => {
    resolveCurrent = resolve;
  });

  return (async () => {
    try {
      await previousQueue;
      return await fn();
    } finally {
      resolveCurrent!();
    }
  })();
}

// System prompt for Vigia
const VIGIA_SYSTEM_INSTRUCTION = VIGIA_TEXT_BASE_PROMPT + INJECTED_KNOWLEDGE_PROMPT;

// API Chat Endpoint
app.post('/api/chat', async (req, res) => {
    let contentsPrompt = '';
    let modelUsed = 'gemini-3.5-flash-lite';

    try {
      const { message, chatHistory, image, avatarGender, nickname, starsScore, unlockedBadgesCount } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Mensagem inválida.' });
      }

      // Verificação Determinística de Segurança (Fallback de Emergência)
      const emergencyRegex = /\b(socorro|tem fogo|pegando fogo|inc[êe]ndio na|inc[êe]ndio aqui|t[áa] queimando|[áa]gua subindo|enchente aqui|enchente na|t[áa] inundando|alagou a|alagou aqui|fio ca[íi]do|soltando fa[íi]sca|tomei choque|levou choque|tomou choque|barranco caindo|deslizamento aqui|deslizamento na|machuquei|machucado grave|t[áa] sangrando|cortou.*fundo|me ajuda urgente|algu[éê]m desmaiou|emerg[êe]ncia)\b/i;
      
      if (emergencyRegex.test(message)) {
        return res.json({
          reply: "[ALERTA DE SEGURANÇA] Por favor, pare o que está fazendo, afaste-se do perigo e CHAME UM ADULTO AGORA! Em emergências reais, peça para ligarem para o 199 (Defesa Civil) ou 193 (Bombeiros).",
          avatarState: "alert",
          topicIllustration: "geral",
          challengeOrQuestion: "Você já conseguiu chamar um adulto para te ajudar?",
          interactiveOptions: ["Já chamei um adulto!", "Ligar 199 ou 193"],
          suggestedFollowUps: ["O que eu faço agora?"],
          emergencyTip: "LIGUE 199 OU 193! Nunca tente resolver uma emergência sozinho.",
          debugInfo: {
            modelUsed: "local-fallback",
            promptSent: "N/A - Interceptado localmente",
            rawResponse: "Resposta gerada por regra determinística no servidor",
            error: null,
            status: "Sucesso (Fallback de Segurança)"
          }
        });
      }

      const ai = getGenAI();
      const genderInstruction = avatarGender === 'male' ? 'Você é um tutor masculino chamado Vigia.' : 'Você é uma tutora feminina chamada Vigia.';
      const userContext = `\nDADOS DA CRIANÇA:\n- Nome: ${nickname || 'Amigo(a)'}\n- Pontuação: ${starsScore || 0} estrelas\n- Emblemas conquistados: ${unlockedBadgesCount || 0}\n(Instrução: Trate a criança pelo nome de forma carinhosa, e se ela perguntar sobre pontos, elogie o progresso!)`;

      const baseInstruction = `[PERSONALIDADE ACOLHEDORA]: ${genderInstruction} Você tem uma personalidade EXTREMAMENTE AMIGÁVEL, acolhedora e empática. Converse como um(a) amigo(a) próximo(a) e demonstre que se importa muito com a segurança do usuário. Crie um vínculo.\n${userContext}`;
      
      if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        const recentHistory = chatHistory
          .slice(-30)
          .map((h: any) => `${h.role === 'user' ? (nickname || 'Criança') : 'Vigia'}: ${h.content}`)
          .join('\n');
        contentsPrompt = `${baseInstruction}\n\nHistórico recente da conversa:\n${recentHistory}\n\nMensagem atual de ${nickname || 'Criança'}: "${message}"`;
      } else {
        contentsPrompt = `${baseInstruction}\n\nMensagem da criança para a Vigia: "${message}"`;
      }

      // Prepare contents payload (text only or image + text)
      let contentsPayload: any;
      if (image && image.data) {
        contentsPayload = [
          {
            inlineData: {
              mimeType: image.mimeType || 'image/jpeg',
              data: image.data,
            },
          },
          {
            text: `${contentsPrompt}\n\n[ATENÇÃO DA TUTORA VIGIA]: A criança anexou uma foto/imagem para ser analisada. Analise detalhadamente os elementos visuais na foto e oriente sobre segurança, riscos ou prevenção de forma amigável e acolhedora.`,
          },
        ];
      } else {
        contentsPayload = contentsPrompt;
      }

      // Check cache for identical queries (include history length in cache key to avoid context mismatch)
      const cacheKey = !image ? `${(message || '').trim().toLowerCase()}_${chatHistory?.length || 0}` : '';
      if (cacheKey && responseCache.has(cacheKey)) {
        const cached = responseCache.get(cacheKey);
        return res.json({
          ...cached,
          debugInfo: {
            modelUsed: 'memoria-cache',
            promptSent: contentsPrompt,
            rawResponse: 'Resposta recuperada da memória cache para economizar cota de API',
            error: null,
            status: 'Sucesso (Cache)',
          },
        });
      }

      // Candidate models: prefer flash-lite for extreme speed, fallback to flash
      const candidateModels = [
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-flash-latest'
      ];

      let response: any = null;
      let lastModelError: string = '';
      let isRateLimited = false;

      for (const model of candidateModels) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            modelUsed = model;

            const callConfig: any = {
              systemInstruction: VIGIA_SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              temperature: 0.7,
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  reply: { type: Type.STRING, description: 'Resposta curta, acolhedora e pausada da Vigia em pt-BR' },
                  avatarState: {
                    type: Type.STRING,
                    description: 'Estado do avatar (idle, listening, thinking, speaking, explaining, asking, celebrating, serious, closing, alert)',
                  },
                  topicIllustration: {
                    type: Type.STRING,
                    description: 'Ilustração temática relevante ao assunto falado: enchentes, deslizamentos, tempestades, incendios, mochila, numeros, ou geral',
                  },
                  challengeOrQuestion: {
                    type: Type.STRING,
                    description: 'Pergunta curta ou pequeno desafio educativo',
                  },
                  interactiveOptions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '2 a 3 opções dinâmicas de continuação (ex: Fazer missão, Ouvir história, Continuar)',
                  },
                  suggestedFollowUps: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '2 a 3 perguntas curtas sugeridas',
                  },
                  emergencyTip: {
                    type: Type.STRING,
                    description: 'Lembrete de segurança em emergências com adulto responsável',
                  },
                },
                required: ['reply', 'avatarState', 'interactiveOptions', 'suggestedFollowUps'],
              },
            };

            response = await ai.models.generateContent({
              model: modelUsed,
              contents: contentsPayload,
              config: callConfig,
            });

            if (response && response.text) {
              lastModelError = '';
              isRateLimited = false;
              break; // Successfully got response
            }
          } catch (err: any) {
            lastModelError = err?.message || String(err);
            const is429 = lastModelError.includes('429') || lastModelError.includes('RESOURCE_EXHAUSTED') || lastModelError.includes('Quota exceeded');
            if (is429) {
              isRateLimited = true;
              console.warn(`Modelo ${model} retornou 429 (tentativa ${attempt + 1}). Aguardando 1.5s...`);
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              console.warn(`Modelo ${model} falhou com erro não-429:`, lastModelError);
              break;
            }
          }
        }

        if (response && response.text) {
          break;
        }
      }

      // If all models hit rate limits / quota zero or failed
      if (!response || !response.text) {
        const quotaMessage = 'A Vigia está temporariamente indisponível. Aguarde um momento e tente novamente.';
        return res.json({
          reply: quotaMessage,
          avatarState: 'serious',
          topicIllustration: 'geral',
          challengeOrQuestion: 'Quer tentar me perguntar de novo em alguns instantes?',
          interactiveOptions: ['Tentar novamente em instantes', 'Ver Dicas de Segurança'],
          suggestedFollowUps: ['O que é uma enchente?', 'O que vai na mochila de emergência?'],
          emergencyTip: 'Em caso de emergência, avise um adulto e ligue 199 (Defesa Civil) ou 193 (Bombeiros)!',
          debugInfo: {
            modelUsed: candidateModels.join(', '),
            promptSent: contentsPrompt,
            rawResponse: 'Cota de API excedida (429)',
            error: lastModelError || 'Limite de cota de API atingido (429)',
            status: isRateLimited ? 'Cota Excedida (429)' : 'Erro de Modelo',
          },
        });
      }

      const rawText = response.text || '';
      let parsedData;
      try {
        let cleanJson = rawText.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
        parsedData = JSON.parse(cleanJson);
      } catch (e) {
        parsedData = {
          reply: rawText || 'Boa pergunta! Vamos aprender juntos sobre prevenção e Defesa Civil.',
          avatarState: 'speaking',
          challengeOrQuestion: 'Você quer que eu explique com um exemplo do dia a dia?',
          interactiveOptions: ['Explicar de forma simples', 'Fazer um desafio rápido', 'Continuar conversando'],
          suggestedFollowUps: ['O que é uma enchente?', 'Por que não posso brincar na água da enchente?', 'O que vai na mochila de emergência?'],
          emergencyTip: 'Em caso de emergência com chuva forte, avise um adulto e ligue 199 ou 193!',
        };
      }

      if (cacheKey && parsedData && parsedData.reply && !parsedData.reply.includes('temporariamente indisponível')) {
        if (responseCache.size > MAX_CACHE_SIZE) {
          const firstKey = responseCache.keys().next().value;
          if (firstKey) responseCache.delete(firstKey);
        }
        responseCache.set(cacheKey, parsedData);
      }

      return res.json({
        ...parsedData,
        debugInfo: {
          modelUsed,
          promptSent: contentsPrompt,
          rawResponse: rawText,
          error: null,
          status: 'Sucesso',
        },
      });
    } catch (error: any) {
      console.error('Erro detalhado na API /api/chat:', error);
      const errorMessage = error?.message || String(error);
      const is429Err = errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('Quota exceeded');
      const finalReply = is429Err
        ? 'A Vigia está temporariamente indisponível. Aguarde um momento e tente novamente.'
        : `Tive um imprevisto técnico ao consultar o Gemini: ${errorMessage}. Por favor, tente perguntar novamente!`;
      return res.status(500).json({
        error: `Erro ao chamar Gemini API (${modelUsed}): ${errorMessage}`,
        reply: finalReply,
        avatarState: 'serious',
        interactiveOptions: ['Tentar novamente', 'Perguntar sobre enchentes'],
        suggestedFollowUps: ['O que é uma enchente?', 'O que fazer em emergências?'],
        emergencyTip: 'Em perigo real, avise um adulto responsável e ligue 199 para a Defesa Civil ou 193 para os Bombeiros!',
        debugInfo: {
          modelUsed,
          promptSent: contentsPrompt,
          rawResponse: '',
          error: errorMessage,
          status: is429Err ? 'Cota Excedida (429)' : 'Erro',
        },
      });
    }
});

// API Audio Transcription Endpoint (Gemini Audio Transcription)
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio, mimeType } = req.body;
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: 'Áudio não informado ou formato inválido.' });
    }

    const ai = getGenAI();

    // Use Gemini flash models for audio transcription
    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
    let transcribedText = '';
    let lastError = '';

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: audio,
              },
            },
            {
              text: 'Transcreva com extrema precisão exatamente o que foi falado neste áudio em Português do Brasil (pt-BR). Retorne SOMENTE o texto exato transcrito em texto simples, sem aspas, sem explicações e sem introduções. Se o áudio for apenas silêncio, ruído, chiado ou inaudível sem fala, retorne exatamente "NO_SPEECH".',
            },
          ],
          config: {
            temperature: 0.1,
          },
        });

        const rawResult = response.text ? response.text.trim() : '';
        if (rawResult && rawResult !== 'NO_SPEECH') {
          transcribedText = rawResult.replace(/^["']|["']$/g, '').trim();
        }
        lastError = '';
        break;
      } catch (err: any) {
        lastError = err?.message || String(err);
        console.warn(`Tentativa de transcrição com modelo ${model} falhou:`, lastError);
      }
    }

    if (lastError && !transcribedText) {
      console.error('[Transcrição] Erro detalhado da transcrição:', lastError);
    }

    return res.json({ text: transcribedText });
  } catch (err: any) {
    console.error('[Transcrição] Erro na API /api/transcribe:', err);
    return res.status(500).json({ error: 'Erro ao processar transcrição', details: err?.message || String(err) });
  }
});

// API TTS Endpoint (Optional Gemini TTS)
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Texto não informado.' });
    }

    const ai = getGenAI();
    const cleanText = text.slice(0, 300).replace(/[^\w\s\d,?!.áàâãéèêíïóôõúüçÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ-]/gi, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: `Diga com entusiasmo alegre e infantil: ${cleanText}` }] }],
      config: {
        responseModalities: ['AUDIO' as any],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return res.json({ audio: base64Audio });
    } else {
      return res.status(500).json({ error: 'Áudio não gerado' });
    }
  } catch (err: any) {
    try {
      const raw = err && (err.stack || err.message || JSON.stringify(err)) ? (err.stack || err.message || JSON.stringify(err)) : String(err);
      const apiKey = process.env.GEMINI_API_KEY;
      const sanitized = apiKey ? raw.split(apiKey).join('[REDACTED_API_KEY]') : raw;
      console.error('TTS API error (sanitized):', sanitized);
    } catch (e) {
      console.error('TTS API error (unable to sanitize):', err);
    }
    return res.status(500).json({ error: 'Serviço de voz indisponível no momento' });
  }
});

// API Scenario Risk & Action Plan Analyzer (AI Intelligence)
app.post('/api/analyze-scenario', async (req, res) => {
  return enqueueRequest(async () => {
    try {
      const { scenario, houseType, location } = req.body;
      if (!scenario || typeof scenario !== 'string') {
        return res.status(400).json({ error: 'Cenário não informado.' });
      }

      const ai = getGenAI();
      const prompt = `Analise este cenário de risco/emergência descrito por uma criança ou família e gere um plano de ação educativo e amigável:
Cenário: "${scenario}"
Tipo de moradia: "${houseType || 'Não informado'}"
Localização/Região: "${location || 'Brasil'}"

Gere uma resposta em JSON com:
- riskLevel: "Baixo", "Médio" ou "Alto"
- riskScore: número de 1 a 100
- summary: resumo amigável em 2 frases
- actionSteps: array com 3 a 5 passos de ação preventivos e seguros (ex: ir para lugar alto, avisar adulto, desligar chave de luz)
- essentialKitItems: array com 3 a 4 itens essenciais da mochila de emergência para este caso
- emergencyNumbersToCall: array de números relevantes ex: ["199 (Defesa Civil)", "193 (Bombeiros)"]
- customQuiz: objeto com { question: "pergunta curta de teste", options: ["op1", "op2", "op3"], correctIndex: número (0, 1 ou 2), explanation: "explicação curta" }
- encouragement: frase motivadora da tutora Vigia`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'Você é a Vigia, tutora virtual de Defesa Civil. Analise riscos com clareza, empatia e tom educativo e seguro para crianças.',
          responseMimeType: 'application/json',
          temperature: 0.3,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              riskLevel: { type: Type.STRING },
              riskScore: { type: Type.INTEGER },
              summary: { type: Type.STRING },
              actionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
              essentialKitItems: { type: Type.ARRAY, items: { type: Type.STRING } },
              emergencyNumbersToCall: { type: Type.ARRAY, items: { type: Type.STRING } },
              customQuiz: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
              encouragement: { type: Type.STRING },
            },
            required: ['riskLevel', 'riskScore', 'summary', 'actionSteps', 'essentialKitItems', 'customQuiz', 'encouragement'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json(parsed);
    } catch (err: any) {
      console.error('Erro em /api/analyze-scenario:', err);
      return res.json({
        riskLevel: 'Médio',
        riskScore: 50,
        summary: 'Sempre que houver dúvida ou risco de tempestade ou inundação, a principal regra é avisar um adulto de confiança!',
        actionSteps: [
          'Avisar um adulto responsável imediatamente',
          'Procurar um local alto e coberto',
          'Não tocar em tomadas ou aparelhos elétricos molhados',
          'Ligar para 199 (Defesa Civil) ou 193 (Bombeiros)',
        ],
        essentialKitItems: ['Garrafa de água', 'Lanterna com pilhas', 'Apito de emergência', 'Documentos em saco plástico'],
        emergencyNumbersToCall: ['199 (Defesa Civil)', '193 (Bombeiros)'],
        customQuiz: {
          question: 'O que você deve fazer em primeiro lugar em qualquer situação de emergência?',
          options: ['Tentar resolver sozinho', 'Avisar um adulto responsável imediatamente', 'Esperar a chuva passar sem falar nada'],
          correctIndex: 1,
          explanation: 'Avisar um adulto responsável é sempre a primeira e mais importante atitude de segurança!',
        },
        encouragement: 'Você está no caminho certo para ser um Super Protetor da Defesa Civil!',
      });
    }
  });
});

// API Dynamic Quiz Generator
app.post('/api/generate-quiz', async (req, res) => {
  return enqueueRequest(async () => {
    try {
      const { topic, difficulty } = req.body;
      const ai = getGenAI();
      const prompt = `Gere uma pergunta de quiz educativa, divertida e inédita sobre Proteção e Defesa Civil.
Tema solicitado: "${topic || 'Prevenção Geral'}"
Nível de dificuldade: "${difficulty || 'fácil'}"

Gere uma resposta em JSON com:
- question: pergunta clara para criança de 8 a 12 anos
- options: array com exatamente 3 opções de resposta
- correctIndex: índice da resposta correta (0, 1 ou 2)
- explanation: explicação educativa e encorajadora do porquê está certa
- rewardStars: número de estrelas bônus (10, 15 ou 20)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'Você é a Vigia. Crie perguntas divertidas, educativas e seguras sobre segurança e Defesa Civil para crianças.',
          responseMimeType: 'application/json',
          temperature: 0.7,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctIndex: { type: Type.INTEGER },
              explanation: { type: Type.STRING },
              rewardStars: { type: Type.INTEGER },
            },
            required: ['question', 'options', 'correctIndex', 'explanation', 'rewardStars'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ id: 'ai_' + Date.now(), ...parsed });
    } catch (err: any) {
      console.error('Erro em /api/generate-quiz:', err);
      return res.json({
        id: 'ai_fallback_' + Date.now(),
        question: 'Qual é o número correto para ligar para a Defesa Civil em caso de emergência por chuvas forte?',
        options: ['199', '190', '192'],
        correctIndex: 0,
        explanation: 'O número 199 é a linha direta gratuita da Defesa Civil para emergências ambientais e chuvas!',
        rewardStars: 15,
      });
    }
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`DC Assistente rodando em http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server, path: '/api/live-ws' });

  wss.on('connection', async (ws, req) => {
    console.log('[Live WS Proxy] Cliente conectado');
    let session: any = null;
    
    // Parse context from URL query
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const isEscapeGame = url.searchParams.get('context') === 'escape';
    
    let dynamicSystemInstruction = VIGIA_LIVE_SYSTEM_INSTRUCTION;
    if (isEscapeGame) {
       dynamicSystemInstruction += `\nCONTEXTO ATUAL: O usuário está em um JOGO 3D DE TREINAMENTO (ESCAPE). Ele é um agente da Defesa Civil e você é a "Vigia", um drone IA flutuante. VOCÊ É ONISCIENTE SOBRE O JOGO.
Controles que você deve ensinar se ele perguntar:
- WASD/Setas: Andar
- Shift: Correr
- Ctrl/C: Agachar
- Z: Deitar/Rastejar no chão
- Espaço: Pular
- Clique Esquerdo: Socar/Pegar itens
- Clique Direito: Arremessar item
- F: Ligar Lanterna
- 1 a 4: Usar inventário.
Se o jogador perguntar o que fazer, analise o objetivo, o XP atual e o inventário (fornecidos nos updates) e dê instruções claras e imersivas!`;
    }

    try {
      const liveModel = 'gemini-3.1-flash-live-preview';
      console.log(`[Live WS Proxy] Conectando ao Gemini usando modelo: ${liveModel}`);
      
      const ai = getGenAI();
      session = await ai.live.connect({
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: dynamicSystemInstruction,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' },
            },
          },
        },
        callbacks: {
          onopen: () => {
            console.log('[Live WS Proxy] Sessão Gemini Live aberta com sucesso');
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'open' }));
            }
            
            // Send initial text prompt so Vigia speaks first!
            const greetingMsg = isEscapeGame 
              ? "Olá! Diga que o microfone está conectado e que você é o Drone de ajuda no jogo Escape e pergunte o que ele quer investigar agora."
              : "Olá! Diga um oi super animado, diga que está na escuta, e pergunte sobre o que vamos falar.";
              
            if (session) {
               try {
                 session.send({
                   clientContent: {
                     turns: [{
                       role: 'user',
                       parts: [{ text: greetingMsg }]
                     }],
                     turnComplete: true
                   }
                 });
               } catch (e) { console.error("Falha ao enviar greeting", e); }
            }
          },
          onmessage: (msg: any) => {
            if (ws.readyState !== ws.OPEN) return;
            const content = msg.serverContent;
            if (content?.inputTranscription?.text) {
              ws.send(JSON.stringify({ type: 'input_transcription', text: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              ws.send(JSON.stringify({ type: 'output_transcription', text: content.outputTranscription.text }));
            }
            if (content?.interrupted) {
              ws.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (content?.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                  // Log when server gets audio from Gemini
                  // console.log(`[TELEMETRIA-BACKEND] ${Date.now()}ms - T_SRV_AUDIO_FROM_GEMINI e T_SRV_AUDIO_TO_CLIENT`);
                  ws.send(JSON.stringify({ type: 'audio_chunk', pcmBase64: part.inlineData.data }));
                }
              }
            }
            if (content?.turnComplete) {
              console.log(`[TELEMETRIA-BACKEND] ${Date.now()}ms - T_SRV_TURN_END (Gemini confirmou fim do turno)`);
              ws.send(JSON.stringify({ type: 'turn_complete' }));
            }
          },
          onerror: (err: any) => {
            console.error('[Live WS Proxy] Erro no Gemini Live:', err?.message || String(err));
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'Erro na conexão ao vivo com a Gemini API.' }));
            }
          },
          onclose: (e: any) => {
            console.log('[Live WS Proxy] Gemini Live encerrado:', e?.code, e?.reason);
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'close' }));
            }
          },
        },
      });

      let firstAudioReceived = false;

      ws.on('message', (data: any) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.type === 'realtime_audio' && payload.pcmBase64 && session) {
            if (!firstAudioReceived) {
              console.log(`[TELEMETRIA-BACKEND] ${Date.now()}ms - T_SRV_AUDIO_IN e T_SRV_AUDIO_TO_GEMINI (Primeiro frame do usuário)`);
              firstAudioReceived = true;
            }
            session.sendRealtimeInput({
              audio: {
                data: payload.pcmBase64,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (payload.clientContent && session) {
            session.send({ clientContent: payload.clientContent });
            if (payload.clientContent.turnComplete) {
              // Reseta o primeiro frame pra próxima fala
              firstAudioReceived = false; 
            }
          }
        } catch (e) {
          console.error('[Live WS Proxy] Erro ao processar mensagem do cliente:', e);
        }
      });

      ws.on('close', () => {
        console.log('[Live WS Proxy] Cliente desconectou');
        if (session) {
          try {
            session.close();
          } catch (e) {}
          session = null;
        }
      });
    } catch (err: any) {
      console.error('[Live WS Proxy] Falha ao iniciar sessão Gemini Live:', err?.message || String(err));
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Não foi possível conectar ao modo ao vivo.' }));
        ws.close();
      }
    }
  });
}

startServer();

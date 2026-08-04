import { performance } from 'perf_hooks';
import fetch from 'node-fetch';

async function runTest() {
  const host = 'http://localhost:3000';
  const question = 'Teste de desempenho: qual a diferença entre enchente e alagamento?';

  try {
    console.log('Starting chat test...');
    const sendTs = performance.now();
    const chatResp = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, chatHistory: [] }),
    });
    const respTs = performance.now();
    const chatData = await chatResp.json().catch((e) => ({ error: 'invalid-json', raw: e }));

    console.log('Chat HTTP status:', chatResp.status);
    console.log('Time send -> response (ms):', Math.round(respTs - sendTs));
    console.log('Chat response summary:', chatData.reply ? chatData.reply.slice(0, 160) : JSON.stringify(chatData).slice(0,160));

    // Start TTS request (measure time to get audio)
    if (chatData && chatData.reply) {
      console.log('\nStarting TTS request...');
      const ttsStart = performance.now();
      const ttsResp = await fetch(`${host}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatData.reply }),
      });
      const ttsRespTs = performance.now();
      let ttsData;
      try { ttsData = await ttsResp.json(); } catch (e) { ttsData = { error: 'invalid-json' }; }
      console.log('TTS HTTP status:', ttsResp.status);
      console.log('Time TTS request (ms):', Math.round(ttsRespTs - ttsStart));
      if (ttsData && ttsData.audio) {
        console.log('TTS returned audio (base64 length):', ttsData.audio.length);
      } else {
        console.log('TTS error / no audio:', ttsData.error || JSON.stringify(ttsData).slice(0,160));
      }
    } else {
      console.log('No chat reply to request TTS.');
    }

  } catch (err) {
    console.error('Test client error:', err);
  }
}

runTest();

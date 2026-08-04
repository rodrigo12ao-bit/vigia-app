const questions = [
  'O que eu faço se ver água subindo na rua?',
  'Como posso ajudar um adulto em uma tempestade?'
];

(async () => {
  for (const q of questions) {
    const start = Date.now();
    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q, chatHistory: [] }),
    });
    const data = await resp.json();
    console.log('Question:', q);
    console.log('Status:', resp.status);
    console.log('Reply:', data.reply);
    console.log('Time ms:', Date.now() - start);
    console.log('---');
  }
})();

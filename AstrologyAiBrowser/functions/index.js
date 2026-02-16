const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const openaiApiKey = defineSecret("OPENAI_API_KEY");

exports.chat = onCall({ secrets: [openaiApiKey], cors: true }, async (request) => {
    const { messages } = request.data;

    if (!messages || !Array.isArray(messages)) {
        throw new HttpsError("invalid-argument", "Messages array required");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey.value()}`
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 60
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new HttpsError("internal", data.error.message);
    }

    return { content: data.choices[0].message.content };
});

exports.tts = onCall({ secrets: [openaiApiKey], cors: true }, async (request) => {
    const { text } = request.data;

    if (!text) {
        throw new HttpsError("invalid-argument", "Text required");
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey.value()}`
        },
        body: JSON.stringify({
            model: "tts-1-hd",
            input: text,
            voice: "nova"
        })
    });

    if (!response.ok) {
        throw new HttpsError("internal", "TTS request failed");
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    return { audio: base64Audio };
});

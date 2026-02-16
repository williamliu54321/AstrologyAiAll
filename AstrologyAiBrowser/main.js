import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OPENAI_API_KEY } from './config.js';

const container = document.getElementById('avatar-container');
const statusEl = document.getElementById('status');
const subtitlesEl = document.getElementById('subtitles');
const startBtn = document.getElementById('start-btn');

let scene, camera, renderer, avatar;
let morphTargetMeshes = [];
let isSpeaking = false;
let isListening = false;
let recognition = null;
let currentTranscript = '';
let silenceTimer = null;
let longSilenceTimer = null;
let typewriterInterval = null;
let conversationActive = false;

let conversationHistory = [
    { role: 'system', content: 'You are a mystical astrology AI. Keep responses to 1-2 short sentences. Be concise.' }
];

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f1a);

    camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 1.5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 2);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x9090ff, 0.4);
    fillLight.position.set(-1, 1, -1);
    scene.add(fillLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.5, 0);
    controls.enablePan = false;
    controls.update();

    loadAvatar();
    animate();
}

function loadAvatar() {
    const loader = new GLTFLoader();
    const avatarUrl = 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus+Visemes,mouthOpen,mouthSmile,eyesClosed,eyesLookUp,eyesLookDown&textureSizeLimit=1024&textureFormat=png';

    loader.load(
        avatarUrl,
        (gltf) => {
            avatar = gltf.scene;
            avatar.position.set(0, 0, 0);
            scene.add(avatar);

            avatar.traverse((child) => {
                if (child.isMesh && child.morphTargetInfluences && child.morphTargetDictionary) {
                    morphTargetMeshes.push(child);
                }
            });

            setStatus('ready', 'Click to start');
        },
        (progress) => {
            setStatus('loading', 'Loading: ' + (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        (error) => {
            console.error('Error loading avatar:', error);
            setStatus('error', 'Error loading avatar');
        }
    );
}

function setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        setStatus('error', 'Speech recognition not supported');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        currentTranscript = '';
        setStatus('listening', 'Listening...');

        // Start long silence timer - if no speech for 10s, prompt user
        if (longSilenceTimer) clearTimeout(longSilenceTimer);
        longSilenceTimer = setTimeout(() => {
            if (isListening && !currentTranscript.trim()) {
                stopListening();
                promptUser();
            }
        }, 10000);
    };

    recognition.onresult = (event) => {
        // Clear timers on new speech
        if (silenceTimer) clearTimeout(silenceTimer);
        if (longSilenceTimer) clearTimeout(longSilenceTimer);

        let transcript = '';

        for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }

        currentTranscript = transcript;
        setSubtitle('user', transcript);

        // Start silence timer - if no new speech for 2.5s, process
        silenceTimer = setTimeout(() => {
            if (currentTranscript.trim().length > 3 && isListening) {
                stopListening();
                processUserInput(currentTranscript);
            }
        }, 2500);
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        // Don't auto-restart on no-speech - wait for user
        if (event.error === 'no-speech') {
            setStatus('ready', 'Say something...');
        }
    };

    recognition.onend = () => {
        isListening = false;
        // Only auto-restart if we didn't get any input
        if (conversationActive && !isSpeaking && !currentTranscript.trim()) {
            setTimeout(startListening, 1000);
        }
    };
}

async function startConversation() {
    conversationActive = true;
    setupSpeechRecognition();
    startBtn.classList.add('hidden');

    setStatus('thinking', 'Waking up...');

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: conversationHistory,
                max_tokens: 60
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const greeting = data.choices[0].message.content;
        conversationHistory.push({ role: 'assistant', content: greeting });

        await speakWithOpenAI(greeting);
    } catch (error) {
        console.error('Error:', error);
        setStatus('error', 'Error: ' + error.message);
    }
}

function startListening() {
    if (recognition && !isListening && !isSpeaking && conversationActive) {
        try {
            currentTranscript = '';
            recognition.start();
        } catch (e) {
            console.log('Recognition error:', e);
        }
    }
}

function stopListening() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (longSilenceTimer) clearTimeout(longSilenceTimer);
    silenceTimer = null;
    longSilenceTimer = null;
    isListening = false;
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
}

async function promptUser() {
    // AI asks a follow-up question when user is silent too long
    setStatus('thinking', 'Thinking...');

    conversationHistory.push({
        role: 'user',
        content: '(The user is silent. Ask them an engaging follow-up question to continue the conversation.)'
    });

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: conversationHistory,
                max_tokens: 60
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const promptMessage = data.choices[0].message.content;
        conversationHistory.push({ role: 'assistant', content: promptMessage });

        await speakWithOpenAI(promptMessage);
    } catch (error) {
        console.error('Error:', error);
        setStatus('error', 'Error: ' + error.message);
        setTimeout(startListening, 2000);
    }
}

async function processUserInput(userText) {
    // Ignore if too short (probably noise)
    if (!userText.trim() || userText.trim().length < 3) {
        startListening();
        return;
    }

    setStatus('thinking', 'Thinking...');

    conversationHistory.push({ role: 'user', content: userText });

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: conversationHistory,
                max_tokens: 60
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const assistantMessage = data.choices[0].message.content;
        conversationHistory.push({ role: 'assistant', content: assistantMessage });

        await speakWithOpenAI(assistantMessage);
    } catch (error) {
        console.error('Error:', error);
        setStatus('error', 'Error: ' + error.message);
        setTimeout(startListening, 2000);
    }
}

async function speakWithOpenAI(text) {
    setStatus('speaking', 'Speaking...');
    subtitlesEl.className = 'ai';
    subtitlesEl.textContent = '';
    isSpeaking = true;

    try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'tts-1',
                input: text,
                voice: 'nova'
            })
        });

        if (!response.ok) throw new Error('TTS request failed');

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onplay = () => {
            startTalking();
            startTypewriter(text, audio.duration);
        };

        audio.onended = () => {
            stopTalking();
            stopTypewriter();
            subtitlesEl.textContent = text;
            isSpeaking = false;
            URL.revokeObjectURL(audioUrl);
            // Auto-start listening after AI finishes
            setTimeout(startListening, 500);
        };

        audio.onerror = () => {
            stopTalking();
            isSpeaking = false;
            setStatus('error', 'Audio error');
            setTimeout(startListening, 1000);
        };

        audio.play();
    } catch (error) {
        console.error('TTS Error:', error);
        stopTalking();
        isSpeaking = false;
        setStatus('error', 'TTS error');
        setTimeout(startListening, 1000);
    }
}

function setMorphTarget(name, value) {
    morphTargetMeshes.forEach(mesh => {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) {
            mesh.morphTargetInfluences[index] = value;
        }
    });
}

let talkingAnimation = null;

function startTalking() {
    const talkingVisemes = ['viseme_aa', 'viseme_O', 'viseme_E', 'viseme_I', 'viseme_U', 'viseme_sil'];
    let visemeIndex = 0;
    let lastTime = 0;
    const speed = 100;

    function animateMouth(time) {
        if (!isSpeaking) {
            talkingVisemes.forEach(v => setMorphTarget(v, 0));
            setMorphTarget('mouthOpen', 0);
            return;
        }

        if (time - lastTime > speed) {
            talkingVisemes.forEach(v => setMorphTarget(v, 0));
            const currentViseme = talkingVisemes[visemeIndex];
            const intensity = 0.3 + Math.random() * 0.5;
            setMorphTarget(currentViseme, intensity);
            setMorphTarget('mouthOpen', intensity * 0.7);
            visemeIndex = (visemeIndex + 1) % talkingVisemes.length;
            lastTime = time;
        }

        if (avatar) {
            avatar.rotation.y = Math.sin(time * 0.002) * 0.08;
            avatar.rotation.x = Math.sin(time * 0.003) * 0.03;
        }

        talkingAnimation = requestAnimationFrame(animateMouth);
    }

    talkingAnimation = requestAnimationFrame(animateMouth);
}

function stopTalking() {
    if (talkingAnimation) {
        cancelAnimationFrame(talkingAnimation);
    }
    ['viseme_aa', 'viseme_O', 'viseme_E', 'viseme_I', 'viseme_U', 'viseme_sil'].forEach(v => setMorphTarget(v, 0));
    setMorphTarget('mouthOpen', 0);
}

function animate() {
    requestAnimationFrame(animate);

    if (avatar && !isSpeaking) {
        avatar.rotation.y = Math.sin(Date.now() * 0.001) * 0.03;

        if (Math.random() < 0.005) {
            setMorphTarget('eyesClosed', 1);
            setTimeout(() => setMorphTarget('eyesClosed', 0), 150);
        }
    }

    renderer.render(scene, camera);
}

function setStatus(type, text) {
    statusEl.textContent = text;
    statusEl.className = type;
}

function setSubtitle(speaker, text) {
    subtitlesEl.textContent = text;
    subtitlesEl.className = speaker;
}

function startTypewriter(text, duration) {
    stopTypewriter();
    const words = text.split(' ');
    let wordIndex = 0;
    const totalDuration = (duration || (text.length * 0.06)) * 1000;
    const interval = totalDuration / words.length;

    subtitlesEl.textContent = '';

    typewriterInterval = setInterval(() => {
        if (wordIndex < words.length) {
            subtitlesEl.textContent += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
            wordIndex++;
        } else {
            stopTypewriter();
        }
    }, interval);
}

function stopTypewriter() {
    if (typewriterInterval) {
        clearInterval(typewriterInterval);
        typewriterInterval = null;
    }
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

startBtn.addEventListener('click', () => startConversation());

init();

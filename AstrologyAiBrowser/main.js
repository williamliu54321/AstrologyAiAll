import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OPENAI_API_KEY } from './config.js';

const container = document.getElementById('avatar-container');
const textInput = document.getElementById('text-input');
const speakBtn = document.getElementById('speak-btn');
const listenBtn = document.getElementById('listen-btn');
const statusEl = document.getElementById('status');

let scene, camera, renderer, avatar, mixer;
let morphTargetMeshes = [];
let isSpeaking = false;
let isListening = false;
let recognition = null;

// Conversation history for context
let conversationHistory = [
    { role: 'system', content: 'You are a mystical astrology AI assistant. You provide insights about zodiac signs, horoscopes, planetary alignments, and spiritual guidance. Keep responses concise (2-3 sentences) and mystical in tone.' }
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
    setupSpeechRecognition();
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

            setStatus('Ready! Click "Listen" to speak.');
        },
        (progress) => {
            setStatus('Loading avatar: ' + (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        (error) => {
            console.error('Error loading avatar:', error);
            setStatus('Error loading avatar');
        }
    );
}

function setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        setStatus('Speech recognition not supported in this browser');
        listenBtn.disabled = true;
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        listenBtn.textContent = '🎤 Listening...';
        listenBtn.classList.add('listening');
        setStatus('Listening...');
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        textInput.value = transcript;

        if (event.results[event.results.length - 1].isFinal) {
            stopListening();
            processUserInput(transcript);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setStatus('Error: ' + event.error);
        stopListening();
    };

    recognition.onend = () => {
        stopListening();
    };
}

function startListening() {
    if (recognition && !isListening && !isSpeaking) {
        recognition.start();
    }
}

function stopListening() {
    isListening = false;
    listenBtn.textContent = '🎤 Listen';
    listenBtn.classList.remove('listening');
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
}

async function processUserInput(userText) {
    if (!userText.trim()) return;

    setStatus('Thinking...');

    // Add user message to history
    conversationHistory.push({ role: 'user', content: userText });

    try {
        // Get GPT response
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: conversationHistory,
                max_tokens: 150
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const assistantMessage = data.choices[0].message.content;
        conversationHistory.push({ role: 'assistant', content: assistantMessage });

        // Speak the response with OpenAI TTS
        await speakWithOpenAI(assistantMessage);

    } catch (error) {
        console.error('Error:', error);
        setStatus('Error: ' + error.message);
    }
}

async function speakWithOpenAI(text) {
    setStatus('Speaking...');

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
                voice: 'nova' // Options: alloy, echo, fable, onyx, nova, shimmer
            })
        });

        if (!response.ok) {
            throw new Error('TTS request failed');
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onplay = () => {
            startTalking();
        };

        audio.onended = () => {
            stopTalking();
            setStatus('Ready! Click "Listen" to speak.');
            URL.revokeObjectURL(audioUrl);
        };

        audio.play();

    } catch (error) {
        console.error('TTS Error:', error);
        // Fallback to browser TTS
        speakWithBrowser(text);
    }
}

function speakWithBrowser(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onstart = () => startTalking();
    utterance.onend = () => {
        stopTalking();
        setStatus('Ready! Click "Listen" to speak.');
    };
    speechSynthesis.speak(utterance);
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
    isSpeaking = true;
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
    isSpeaking = false;
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

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
    console.log('Status:', text);
}

// Event listeners
speakBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) processUserInput(text);
});

listenBtn.addEventListener('click', () => {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
});

textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        speakBtn.click();
    }
});

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

init();

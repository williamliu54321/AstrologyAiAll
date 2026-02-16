import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';

// Firebase config
const firebaseConfig = {
    projectId: "demosite2025"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const chatFunction = httpsCallable(functions, 'chat');
const ttsFunction = httpsCallable(functions, 'tts');

const container = document.getElementById('avatar-container');
const statusEl = document.getElementById('status');
const subtitlesEl = document.getElementById('subtitles');
const startBtn = document.getElementById('start-btn');

let scene, camera, renderer, avatar, mixer, controls;
let morphTargetMeshes = [];
let isSpeaking = false;
let audioContext = null;
let analyser = null;
let isListening = false;
let recognition = null;
let currentTranscript = '';
let silenceTimer = null;
let longSilenceTimer = null;
let typewriterInterval = null;
let conversationActive = false;
let clock = new THREE.Clock();

let crystalBall, crystalBallGlow;
let candleLights = [];

const OPENING_MESSAGE = "Welcome! I'm your astrology guide. Ask me about your horoscope, love compatibility, what the stars say about your week ahead, or anything else on your mind.";

let conversationHistory = [
    { role: 'system', content: 'You are a friendly astrology AI guide. Keep responses to 1-2 short sentences. Be warm, insightful, and concise. You help users with horoscopes, zodiac compatibility, and cosmic guidance.' }
];

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a12);
    scene.fog = new THREE.FogExp2(0x0a0a12, 0.3);

    camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(-0.01, 2.05, 1.89);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x4444aa, 0.3);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xaa88ff, 0.8);
    mainLight.position.set(1, 2, 2);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x4466ff, 0.3);
    fillLight.position.set(-1, 1, -1);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00ffff, 0.4);
    rimLight.position.set(0, 1, -2);
    scene.add(rimLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.4, 0);
    controls.enabled = false;
    controls.update();

    createTable();
    createCrystalBall();
    createCandleLights();
    loadAvatar();
    animate();
}

function createTable() {
    const tableTopGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 32);
    const tableMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a0a1a,
        roughness: 1.0,
        metalness: 0
    });
    const tableTop = new THREE.Mesh(tableTopGeometry, tableMaterial);
    tableTop.position.set(0, 1.05, 0.4);
    scene.add(tableTop);

    const pedestalGeometry = new THREE.CylinderGeometry(0.08, 0.15, 0.4, 16);
    const pedestal = new THREE.Mesh(pedestalGeometry, tableMaterial);
    pedestal.position.set(0, 0.83, 0.4);
    scene.add(pedestal);
}

function createCrystalBall() {
    const standGeometry = new THREE.CylinderGeometry(0.08, 0.12, 0.05, 16);
    const standMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a1a0a,
        metalness: 0.8,
        roughness: 0.3
    });
    const stand = new THREE.Mesh(standGeometry, standMaterial);
    stand.position.set(0, 1.15, 0.4);
    scene.add(stand);

    const ballGeometry = new THREE.SphereGeometry(0.1, 32, 32);
    const ballMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x8888ff,
        metalness: 0,
        roughness: 0,
        transmission: 0.95,
        thickness: 0.5,
        envMapIntensity: 1,
        clearcoat: 1,
        clearcoatRoughness: 0,
        ior: 2.33
    });
    crystalBall = new THREE.Mesh(ballGeometry, ballMaterial);
    crystalBall.position.set(0, 1.27, 0.4);
    scene.add(crystalBall);

    const glowGeometry = new THREE.SphereGeometry(0.07, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x9966ff,
        transparent: true,
        opacity: 0.6
    });
    crystalBallGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    crystalBallGlow.position.copy(crystalBall.position);
    scene.add(crystalBallGlow);

    const crystalLight = new THREE.PointLight(0x9966ff, 0.8, 2);
    crystalLight.position.copy(crystalBall.position);
    scene.add(crystalLight);
}

function createCandleLights() {
    const candlePositions = [
        { x: -0.6, y: 1.5, z: 0.1 },
        { x: 0.6, y: 1.5, z: 0.1 },
    ];

    candlePositions.forEach(pos => {
        const light = new THREE.PointLight(0xff6600, 0.2, 1.0);
        light.position.set(pos.x, pos.y, pos.z);
        scene.add(light);
        candleLights.push(light);
    });
}

function loadAvatar() {
    const loader = new GLTFLoader();
    const avatarUrl = 'https://models.readyplayer.me/69926f253105e53ecf869615.glb?morphTargets=ARKit,Oculus+Visemes,mouthOpen,mouthSmile,eyesClosed,eyesLookUp,eyesLookDown&textureSizeLimit=1024&textureFormat=png';

    loader.load(
        avatarUrl,
        (gltf) => {
            avatar = gltf.scene;
            avatar.position.set(0, 0, 0);
            scene.add(avatar);

            mixer = new THREE.AnimationMixer(avatar);

            avatar.traverse((child) => {
                if (child.isMesh && child.morphTargetInfluences && child.morphTargetDictionary) {
                    morphTargetMeshes.push(child);
                }

                if (child.isBone) {
                    const name = child.name.toLowerCase();
                    if (name.includes('leftarm') || name.includes('left_arm') || name === 'leftarm') {
                        child.rotation.z = 1.1;
                    }
                    if (name.includes('rightarm') || name.includes('right_arm') || name === 'rightarm') {
                        child.rotation.z = -1.1;
                    }
                    if (name.includes('leftforearm') || name.includes('left_forearm')) {
                        child.rotation.z = 0.3;
                    }
                    if (name.includes('rightforearm') || name.includes('right_forearm')) {
                        child.rotation.z = -0.3;
                    }
                }
            });

            setStatus('ready', 'Click to start');
        },
        (progress) => {
            const percent = progress.total > 0 ? (progress.loaded / progress.total * 100).toFixed(0) : 0;
            setStatus('loading', 'Loading: ' + percent + '%');
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

        if (longSilenceTimer) clearTimeout(longSilenceTimer);
        longSilenceTimer = setTimeout(() => {
            if (isListening && !currentTranscript.trim()) {
                stopListening();
                promptUser();
            }
        }, 10000);
    };

    recognition.onresult = (event) => {
        if (silenceTimer) clearTimeout(silenceTimer);
        if (longSilenceTimer) clearTimeout(longSilenceTimer);

        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }

        currentTranscript = transcript;
        setSubtitle('user', transcript);

        silenceTimer = setTimeout(() => {
            if (currentTranscript.trim().length > 3 && isListening) {
                stopListening();
                processUserInput(currentTranscript);
            }
        }, 2500);
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
            setStatus('ready', 'Say something...');
        }
    };

    recognition.onend = () => {
        isListening = false;
        if (conversationActive && !isSpeaking && !currentTranscript.trim()) {
            setTimeout(startListening, 1000);
        }
    };
}

async function startConversation() {
    conversationActive = true;
    setupSpeechRecognition();
    startBtn.classList.add('hidden');

    conversationHistory.push({ role: 'assistant', content: OPENING_MESSAGE });
    await speakWithTTS(OPENING_MESSAGE);
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
    setStatus('thinking', 'Thinking...');

    conversationHistory.push({
        role: 'user',
        content: '(The user is silent. Ask them a mystical follow-up question about their fate or destiny.)'
    });

    try {
        const result = await chatFunction({ messages: conversationHistory });
        const promptMessage = result.data.content;
        conversationHistory.push({ role: 'assistant', content: promptMessage });

        await speakWithTTS(promptMessage);
    } catch (error) {
        console.error('Error:', error);
        setStatus('error', 'Error: ' + error.message);
        setTimeout(startListening, 2000);
    }
}

async function processUserInput(userText) {
    if (!userText.trim() || userText.trim().length < 3) {
        startListening();
        return;
    }

    setStatus('thinking', 'Consulting the spirits...');

    conversationHistory.push({ role: 'user', content: userText });

    try {
        const result = await chatFunction({ messages: conversationHistory });
        const assistantMessage = result.data.content;
        conversationHistory.push({ role: 'assistant', content: assistantMessage });

        await speakWithTTS(assistantMessage);
    } catch (error) {
        console.error('Error:', error);
        setStatus('error', 'Error: ' + error.message);
        setTimeout(startListening, 2000);
    }
}

async function speakWithTTS(text) {
    setStatus('speaking', 'Speaking...');
    subtitlesEl.className = 'ai';
    subtitlesEl.textContent = '';
    isSpeaking = true;

    try {
        const result = await ttsFunction({ text: text });
        const base64Audio = result.data.audio;

        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        source.connect(analyser);
        analyser.connect(audioContext.destination);

        source.onended = () => {
            stopTalking();
            stopTypewriter();
            subtitlesEl.textContent = text;
            isSpeaking = false;
            setTimeout(startListening, 500);
        };

        source.start();
        startTalking();
        startTypewriter(text, audioBuffer.duration);

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
    const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);

    function animateMouth(time) {
        if (!isSpeaking) {
            setMorphTarget('mouthOpen', 0);
            setMorphTarget('viseme_aa', 0);
            setMorphTarget('viseme_O', 0);
            setMorphTarget('viseme_E', 0);
            return;
        }

        let volume = 0;
        if (analyser) {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            volume = sum / dataArray.length / 255;
        }

        const mouthOpen = Math.min(volume * 3.2, 1);
        setMorphTarget('mouthOpen', mouthOpen * 0.9);

        if (mouthOpen > 0.45) {
            setMorphTarget('viseme_aa', mouthOpen * 0.8);
            setMorphTarget('viseme_O', 0);
        } else if (mouthOpen > 0.18) {
            setMorphTarget('viseme_aa', 0);
            setMorphTarget('viseme_O', mouthOpen * 0.85);
        } else {
            setMorphTarget('viseme_aa', 0);
            setMorphTarget('viseme_O', 0);
            setMorphTarget('viseme_E', mouthOpen * 0.6);
        }

        if (avatar) {
            avatar.rotation.y = Math.sin(time * 0.002) * 0.06;
            avatar.rotation.x = Math.sin(time * 0.003) * 0.02;
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

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (mixer) mixer.update(delta);

    if (avatar && !isSpeaking) {
        avatar.rotation.y = Math.sin(time * 0.5) * 0.05;
        avatar.position.y = Math.sin(time * 2) * 0.003;

        if (Math.random() < 0.005) {
            setMorphTarget('eyesClosed', 1);
            setTimeout(() => setMorphTarget('eyesClosed', 0), 150);
        }
    }

    if (crystalBallGlow) {
        const pulse = 0.5 + Math.sin(time * 2) * 0.2;
        crystalBallGlow.material.opacity = pulse;
        crystalBallGlow.scale.setScalar(0.9 + Math.sin(time * 3) * 0.1);
    }

    if (crystalBall) {
        crystalBall.rotation.y = time * 0.3;
    }

    candleLights.forEach((light, index) => {
        light.intensity = 0.3 + Math.random() * 0.2 + Math.sin(time * 10 + index) * 0.1;
    });

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

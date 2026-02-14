import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('avatar-container');
const textInput = document.getElementById('text-input');
const speakBtn = document.getElementById('speak-btn');

let scene, camera, renderer, avatar, mixer;
let morphTargetMeshes = [];
let isSpeaking = false;

// Viseme mapping for lip sync
const visemeMap = {
    'viseme_sil': 0,    // silence
    'viseme_PP': 0,     // p, b, m
    'viseme_FF': 0,     // f, v
    'viseme_TH': 0,     // th
    'viseme_DD': 0,     // t, d
    'viseme_kk': 0,     // k, g
    'viseme_CH': 0,     // ch, j, sh
    'viseme_SS': 0,     // s, z
    'viseme_nn': 0,     // n, l
    'viseme_RR': 0,     // r
    'viseme_aa': 0,     // a
    'viseme_E': 0,      // e
    'viseme_I': 0,      // i
    'viseme_O': 0,      // o
    'viseme_U': 0,      // u
};

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f1a);

    // Camera
    camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 1.5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 2);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x9090ff, 0.4);
    fillLight.position.set(-1, 1, -1);
    scene.add(fillLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.5, 0);
    controls.enablePan = false;
    controls.update();

    // Load Avatar
    loadAvatar();

    // Animation loop
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

            // Find meshes with morph targets (for lip sync)
            avatar.traverse((child) => {
                if (child.isMesh && child.morphTargetInfluences && child.morphTargetDictionary) {
                    morphTargetMeshes.push(child);
                    console.log('Found morph targets:', Object.keys(child.morphTargetDictionary));
                }
            });

            console.log('Avatar loaded with', morphTargetMeshes.length, 'morph target meshes');
        },
        (progress) => {
            console.log('Loading:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        (error) => {
            console.error('Error loading avatar:', error);
        }
    );
}

// Set a morph target value on all meshes
function setMorphTarget(name, value) {
    morphTargetMeshes.forEach(mesh => {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) {
            mesh.morphTargetInfluences[index] = value;
        }
    });
}

// Animate mouth for talking
let talkingAnimation = null;

function startTalking() {
    isSpeaking = true;

    // Visemes to cycle through for talking effect
    const talkingVisemes = ['viseme_aa', 'viseme_O', 'viseme_E', 'viseme_I', 'viseme_U', 'viseme_sil'];
    let visemeIndex = 0;
    let lastTime = 0;
    const speed = 100; // ms per viseme

    function animateMouth(time) {
        if (!isSpeaking) {
            // Reset mouth
            talkingVisemes.forEach(v => setMorphTarget(v, 0));
            setMorphTarget('mouthOpen', 0);
            return;
        }

        if (time - lastTime > speed) {
            // Reset previous viseme
            talkingVisemes.forEach(v => setMorphTarget(v, 0));

            // Set current viseme with some randomness for natural look
            const currentViseme = talkingVisemes[visemeIndex];
            const intensity = 0.3 + Math.random() * 0.5;
            setMorphTarget(currentViseme, intensity);
            setMorphTarget('mouthOpen', intensity * 0.7);

            visemeIndex = (visemeIndex + 1) % talkingVisemes.length;
            lastTime = time;
        }

        // Subtle head movement while talking
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
    // Reset all mouth shapes
    Object.keys(visemeMap).forEach(v => setMorphTarget(v, 0));
    setMorphTarget('mouthOpen', 0);
}

function animate() {
    requestAnimationFrame(animate);

    // Subtle idle animation when not speaking
    if (avatar && !isSpeaking) {
        avatar.rotation.y = Math.sin(Date.now() * 0.001) * 0.03;

        // Blink occasionally
        if (Math.random() < 0.005) {
            setMorphTarget('eyesClosed', 1);
            setTimeout(() => setMorphTarget('eyesClosed', 0), 150);
        }
    }

    renderer.render(scene, camera);
}

// Text-to-speech with lip sync
function speak(text) {
    if (!text || !('speechSynthesis' in window)) {
        console.error('Speech synthesis not available');
        return;
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => {
        console.log('Speaking:', text);
        startTalking();
    };

    utterance.onend = () => {
        console.log('Finished speaking');
        stopTalking();
    };

    utterance.onerror = () => {
        stopTalking();
    };

    speechSynthesis.speak(utterance);
}

// Event listeners
speakBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) speak(text);
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

// Start
init();

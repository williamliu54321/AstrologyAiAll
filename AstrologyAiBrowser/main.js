import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('avatar-container');
const textInput = document.getElementById('text-input');
const speakBtn = document.getElementById('speak-btn');

let scene, camera, renderer, head, mixer;
let isSpeaking = false;

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

    // Ready Player Me avatar URL
    const avatarUrl = 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus+Visemes,mouthOpen,mouthSmile,eyesClosed,eyesLookUp,eyesLookDown&textureSizeLimit=1024&textureFormat=png';

    loader.load(
        avatarUrl,
        (gltf) => {
            head = gltf.scene;
            head.position.set(0, 0, 0);
            scene.add(head);

            // Setup animation mixer if animations exist
            if (gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(head);
            }

            console.log('Avatar loaded!');
        },
        (progress) => {
            console.log('Loading:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        (error) => {
            console.error('Error loading avatar:', error);
            createFallbackHead();
        }
    );
}

function createFallbackHead() {
    // Simple sphere head as fallback
    const headGeo = new THREE.SphereGeometry(0.3, 32, 32);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.5, 0);
    scene.add(head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.1, 0.05, 0.25);
    head.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.1, 0.05, 0.25);
    head.add(rightEye);

    console.log('Using fallback head');
}

function animate() {
    requestAnimationFrame(animate);

    if (mixer) {
        mixer.update(0.016);
    }

    // Simple idle animation
    if (head && !isSpeaking) {
        head.rotation.y = Math.sin(Date.now() * 0.001) * 0.05;
    }

    renderer.render(scene, camera);
}

// Text-to-speech with simple animation
function speak(text) {
    if (!text || !('speechSynthesis' in window)) {
        console.error('Speech synthesis not available');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => {
        isSpeaking = true;
    };

    utterance.onend = () => {
        isSpeaking = false;
    };

    // Animate while speaking
    const speakAnimation = () => {
        if (isSpeaking && head) {
            head.rotation.y = Math.sin(Date.now() * 0.003) * 0.1;
            head.rotation.x = Math.sin(Date.now() * 0.005) * 0.02;
            requestAnimationFrame(speakAnimation);
        }
    };

    speechSynthesis.speak(utterance);
    speakAnimation();
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

// --- DOM Elements ---
const loadingOverlay = document.getElementById('loadingOverlay');
const helpModal = document.getElementById('helpModal');
const closeHelpModal = document.getElementById('closeHelpModal');
const helpButton = document.getElementById('helpButton');

// Tabs
const tabLinks = document.querySelectorAll('.tab-link');
const tabContents = document.querySelectorAll('.tab-content');
let currentActiveTab = 'mirrorTab';

// Gesture Mirror Tab
const videoElement = document.getElementById('webcamFeed');
const canvasElement = document.getElementById('gestureCanvas');
const particleCanvas = document.getElementById('particleCanvas');
const canvasCtx = canvasElement.getContext('2d');
const particleCtx = particleCanvas ? particleCanvas.getContext('2d') : null;
const gestureLabelElement = document.getElementById('gestureLabel');
const speakButton = document.getElementById('speakButton');
const captureImageButton = document.getElementById('captureImageButton');
const clearLabelButton = document.getElementById('clearLabelButton');
const gestureHistoryList = document.getElementById('gestureHistoryList');
const gestureCounterList = document.getElementById('gestureCounterList');
const clearHistoryButton = document.getElementById('clearHistoryButton');

// RPS Tab
const videoElementRPS = document.getElementById('webcamFeedRPS');
const canvasElementRPS = document.getElementById('gestureCanvasRPS');
const canvasCtxRPS = canvasElementRPS.getContext('2d');
const playerMoveIcon = document.getElementById('playerMoveIcon');
const aiMoveIcon = document.getElementById('aiMoveIcon');
const rpsResultText = document.getElementById('rpsResult');
const playerGestureRPSLabel = document.getElementById('playerGestureRPS');

// --- Global State & Config ---
let lastRecognizedGestureMirror = ""; // For mirror tab, stores the first hand's gesture for speaking
let lastPlayerGestureRPS = null;
let rpsPlayerLockedMove = null;
let rpsAiLockedMove = null;
let rpsTimeoutId = null;

const MAX_HISTORY_ITEMS = 5;
let gestureHistory = [];
let gestureCounts = {};
let firstResultsReceived = false;
let GE_Mirror, GE_RPS; // Gesture Estimators
let particlesArray = [];

// --- Fingerpose Setup (Using stable definitions) ---
function initializeFingerpose() {
    if (typeof fp === 'undefined' || !fp.GestureEstimator || !fp.Gestures || !fp.GestureDescription || !fp.Finger || !fp.FingerCurl || !fp.FingerDirection) {
        console.error("Fingerpose library (fp) or its key components are not loaded correctly!");
        showLoadingError("Critical Error: AI Gesture Library components missing.<br>Check console (F12).");
        return false;
    }
    console.log("Fingerpose (fp) object and its key components seem available. Initializing GestureEstimators.");

    const { Finger, FingerCurl, FingerDirection, Gestures } = fp;

    try {
        // Mirror Tab: Only pre-defined gestures for maximum stability
        GE_Mirror = new fp.GestureEstimator([
            Gestures.VictoryGesture,
            Gestures.ThumbsUpGesture
            // Add more stable custom gestures here later if needed
        ]);
        console.log("Fingerpose GE_Mirror initialized with PRE-DEFINED gestures.");

        // RPS Tab: Custom gestures using only addCurl and addDirection with confidence scores
        const rockGestureRPS = new fp.GestureDescription('rock');
        rockGestureRPS.addCurl(Finger.Thumb, FingerCurl.FullCurl, 0.9);
        rockGestureRPS.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.9);
        rockGestureRPS.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
        rockGestureRPS.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
        rockGestureRPS.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
        rockGestureRPS.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

        const paperGestureRPS = new fp.GestureDescription('paper');
        paperGestureRPS.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
        paperGestureRPS.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
        paperGestureRPS.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
        paperGestureRPS.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
        paperGestureRPS.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
        // Add preferred directions for an open palm
        for(let finger of [Finger.Index, Finger.Middle, Finger.Ring, Finger.Pinky]) {
            paperGestureRPS.addDirection(finger, FingerDirection.VerticalUp, 0.80);
            paperGestureRPS.addDirection(finger, FingerDirection.DiagonalUpLeft, 0.70);
            paperGestureRPS.addDirection(finger, FingerDirection.DiagonalUpRight, 0.70);
        }
        paperGestureRPS.addDirection(Finger.Thumb, FingerDirection.HorizontalLeft, 0.6);
        paperGestureRPS.addDirection(Finger.Thumb, FingerDirection.HorizontalRight, 0.6);
        paperGestureRPS.addDirection(Finger.Thumb, FingerDirection.DiagonalUpLeft, 0.6);
        paperGestureRPS.addDirection(Finger.Thumb, FingerDirection.DiagonalUpRight, 0.6);


        const scissorsGestureRPS = new fp.GestureDescription('scissors');
        scissorsGestureRPS.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
        scissorsGestureRPS.addDirection(Finger.Index, FingerDirection.VerticalUp, 1.0);
        scissorsGestureRPS.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
        scissorsGestureRPS.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1.0);
        scissorsGestureRPS.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
        scissorsGestureRPS.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
        scissorsGestureRPS.addCurl(Finger.Thumb, FingerCurl.FullCurl, 0.9);

        GE_RPS = new fp.GestureEstimator([
            rockGestureRPS,
            paperGestureRPS,
            scissorsGestureRPS,
        ]);
        console.log("Fingerpose GE_RPS initialized with custom Rock, Paper (refined), Scissors.");

        return true;
    } catch (error) {
        console.error("Error initializing Fingerpose GestureEstimators:", error);
        showLoadingError(`Error in AI Gesture Definitions.<br>Details: ${error.message}<br>Check console (F12). Error Stack: ${error.stack}`);
        return false;
    }
}

// --- showLoadingError function ---
function showLoadingError(message) {
    if (loadingOverlay.style.display !== 'none') {
        loadingOverlay.innerHTML = `<p style='color:red; text-align:center;'>${message}</p>`;
    }
}

// --- MediaPipe Hands Setup (Updated for 2 hands) ---
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
    maxNumHands: 2, // <<<<<<< MODIFICATION: Allow up to 2 hands
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
});
hands.onResults(processHandResults);

// --- Camera Setup ---
const cameraMirror = new Camera(videoElement, {
    onFrame: async () => {
        if (currentActiveTab !== 'mirrorTab' || !videoElement.videoWidth || !videoElement.videoHeight) return;
        if (canvasElement.width !== videoElement.videoWidth || canvasElement.height !== videoElement.videoHeight) {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            if (particleCanvas) {
                particleCanvas.width = videoElement.videoWidth;
                particleCanvas.height = videoElement.videoHeight;
            }
        }
        await hands.send({ image: videoElement });
    },
    width: 640, height: 480
});

const cameraRPS = new Camera(videoElementRPS, {
    onFrame: async () => {
        if (currentActiveTab !== 'rpsTab' || !videoElementRPS.videoWidth || !videoElementRPS.videoHeight) return;
        if (canvasElementRPS.width !== videoElementRPS.videoWidth || canvasElementRPS.height !== videoElementRPS.videoHeight) {
            canvasElementRPS.width = videoElementRPS.videoWidth;
            canvasElementRPS.height = videoElementRPS.videoHeight;
        }
        await hands.send({ image: videoElementRPS });
    },
    width: 320, height: 240
});

function startApp() {
    loadingOverlay.style.display = 'flex';
    gestureLabelElement.textContent = "Initializing AI...";
    if (!initializeFingerpose()) {
        console.error("Halting app start due to Fingerpose initialization failure.");
        return;
    }
    if (currentActiveTab === 'mirrorTab') {
        cameraMirror.start().then(logCameraStart).catch(showCameraError);
    } else if (currentActiveTab === 'rpsTab') {
        cameraRPS.start().then(logCameraStart).catch(showCameraError);
    }
    setupTabs();
    if (typeof initParticles === "function") initParticles();
    if (typeof animateParticles === "function") animateParticles();
}

function logCameraStart() { console.log("Camera for current tab started. MediaPipe model loading..."); }
function showCameraError(err) {
    console.error("Camera start failed:", err);
    showLoadingError("Error starting camera. <br>Check permissions & use http/https.");
}

// --- Main Processing Logic based on Active Tab ---
function processHandResults(results) {
    if (!firstResultsReceived && (GE_Mirror || GE_RPS)) {
        if (loadingOverlay.style.display !== 'none') {
            loadingOverlay.style.display = 'none';
        }
        firstResultsReceived = true;
        console.log("MediaPipe model loaded, processing frames. Max hands: 2");
    }

    if (currentActiveTab === 'mirrorTab' && GE_Mirror) {
        processMirrorResults(results);
    } else if (currentActiveTab === 'rpsTab' && GE_RPS) {
        processRPSResults(results);
    }
}

// --- Gesture Mirror Tab Logic (Updated for potentially two hands) ---
function processMirrorResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    let recognizedGesturesOnMirror = [];

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            drawNeonHand(landmarks, canvasCtx, canvasElement);
            if (typeof updateParticles === "function") updateParticles(landmarks, canvasElement);

            const fingerposeLandmarks = landmarks.map(lm => [lm.x, lm.y, lm.z]);
            try {
                const estimatedGestures = GE_Mirror.estimate(fingerposeLandmarks, 7.5);
                if (estimatedGestures.gestures && estimatedGestures.gestures.length > 0) {
                    estimatedGestures.gestures.sort((a, b) => b.score - a.score);
                    let gestureName = estimatedGestures.gestures[0].name.replace(/_/g, ' ').toLowerCase();
                    recognizedGesturesOnMirror.push(capitalize(gestureName));
                } else {
                    recognizedGesturesOnMirror.push("No specific gesture"); // Add placeholder if this hand has no specific gesture
                }
            } catch (error) {
                console.error("Mirror Fingerpose estimation error:", error);
                recognizedGesturesOnMirror.push("Estimation Error");
            }
        }
    }

    let displayGestureName = "Detecting...";
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        if (recognizedGesturesOnMirror.length > 0) {
            displayGestureName = recognizedGesturesOnMirror.join(" | ");
            // For history/counter and speaking, use the first detected valid gesture
            const firstValidGesture = recognizedGesturesOnMirror.find(g => g && g !== "No specific gesture" && g !== "Estimation Error");
            if (firstValidGesture) {
                if (firstValidGesture !== lastRecognizedGestureMirror) {
                    updateGestureHistory(firstValidGesture);
                    updateGestureCounter(firstValidGesture);
                    lastRecognizedGestureMirror = firstValidGesture;
                }
            } else {
                lastRecognizedGestureMirror = "";
            }
        } else { // Hands detected but no gestures recognized for any
             displayGestureName = "No specific gesture";
             lastRecognizedGestureMirror = "";
        }
    } else { // No hands detected at all
        displayGestureName = "No Hand Detected";
        lastRecognizedGestureMirror = "";
    }
    updateGestureLabel(displayGestureName);
    canvasCtx.restore();
}


// --- Rock-Paper-Scissors Tab Logic (Still focuses on the first detected hand) ---
const RPS_MOVES_FROM_FP = ['rock', 'paper', 'scissors'];
const GAME_MOVES = ['rock', 'paper', 'scissors'];
const RPS_ICONS = { rock: '✊', paper: '✋', scissors: '✌️', unknown: '❓' };
const RPS_LOCK_DELAY = 1500;

function processRPSResults(results) {
    canvasCtxRPS.save();
    canvasCtxRPS.clearRect(0, 0, canvasElementRPS.width, canvasElementRPS.height);
    let detectedGestureRPS = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const firstHandLandmarks = results.multiHandLandmarks[0];
        drawNeonHand(firstHandLandmarks, canvasCtxRPS, canvasElementRPS);

        const fingerposeLandmarks = firstHandLandmarks.map(lm => [lm.x, lm.y, lm.z]);
        try {
            const estimatedGestures = GE_RPS.estimate(fingerposeLandmarks, 8.0);
            if (estimatedGestures.gestures && estimatedGestures.gestures.length > 0) {
                estimatedGestures.gestures.sort((a, b) => b.score - a.score);
                let bestMatch = estimatedGestures.gestures[0].name.toLowerCase();
                if (RPS_MOVES_FROM_FP.includes(bestMatch)) {
                    detectedGestureRPS = bestMatch;
                }
            }
        } catch (error) { console.error("RPS Fingerpose estimation error:", error); }
    }

    playerGestureRPSLabel.textContent = detectedGestureRPS ? `Detected: ${capitalize(detectedGestureRPS)}` : "Show Rock, Paper, or Scissors!";

    if (detectedGestureRPS && !rpsPlayerLockedMove) {
        if (detectedGestureRPS !== lastPlayerGestureRPS) {
            lastPlayerGestureRPS = detectedGestureRPS;
            clearTimeout(rpsTimeoutId);
            playerGestureRPSLabel.textContent = `Hold ${capitalize(detectedGestureRPS)}...`;
            rpsTimeoutId = setTimeout(() => {
                if (lastPlayerGestureRPS === detectedGestureRPS) {
                    playRPSRound(detectedGestureRPS);
                }
            }, RPS_LOCK_DELAY);
        }
    } else if (!detectedGestureRPS && !rpsPlayerLockedMove) {
        clearTimeout(rpsTimeoutId);
        lastPlayerGestureRPS = null;
        if (playerMoveIcon.textContent !== RPS_ICONS.unknown) {
            playerMoveIcon.textContent = RPS_ICONS.unknown;
            playerMoveIcon.className = 'rps-icon';
        }
    }
    canvasCtxRPS.restore();
}

function playRPSRound(playerGameMove) {
    if (rpsPlayerLockedMove) return;
    rpsPlayerLockedMove = playerGameMove;
    playerMoveIcon.textContent = RPS_ICONS[playerGameMove] || RPS_ICONS.unknown;
    playerMoveIcon.className = `rps-icon ${playerGameMove} animate-glow`;
    playerGestureRPSLabel.textContent = `You played: ${capitalize(playerGameMove)}`;

    let aiSelectedMove = GAME_MOVES[Math.floor(Math.random() * GAME_MOVES.length)];
    rpsAiLockedMove = aiSelectedMove;
    
    aiMoveIcon.textContent = RPS_ICONS[rpsAiLockedMove] || RPS_ICONS.unknown;
    aiMoveIcon.className = `rps-icon ${rpsAiLockedMove} animate-glow`;

    let resultMessage = ""; let resultClass = "";
    if (playerGameMove === rpsAiLockedMove) {
        resultMessage = "It's a Draw!"; resultClass = "draw";
    } else if (
        (playerGameMove === 'rock' && rpsAiLockedMove === 'scissors') ||
        (playerGameMove === 'paper' && rpsAiLockedMove === 'rock') ||
        (playerGameMove === 'scissors' && rpsAiLockedMove === 'paper')
    ) {
        resultMessage = "You Win!"; resultClass = "win";
    } else {
        resultMessage = "AI Wins!"; resultClass = "lose";
    }
    rpsResultText.textContent = resultMessage;
    rpsResultText.className = `rps-result-text ${resultClass}`;

    setTimeout(() => {
        rpsPlayerLockedMove = null; rpsAiLockedMove = null;
        playerMoveIcon.textContent = RPS_ICONS.unknown; playerMoveIcon.className = 'rps-icon';
        aiMoveIcon.textContent = RPS_ICONS.unknown; aiMoveIcon.className = 'rps-icon';
        rpsResultText.textContent = "Make a move to start!"; rpsResultText.className = 'rps-result-text';
        lastPlayerGestureRPS = null;
    }, 3000);
}

// --- Drawing Function (common) ---
function drawNeonHand(landmarks, ctx, targetCanvasElement) {
    const connections = window.HAND_CONNECTIONS;
    if (!connections) { console.warn("HAND_CONNECTIONS not available."); return; }
    const currentTime = Date.now();
    const pulseCycle = 1800, pulseProgress = (currentTime % pulseCycle) / pulseCycle;
    const pulseFactor = Math.sin(pulseProgress * Math.PI);
    const baseLineWidth = Math.max(2, targetCanvasElement.width / 200);
    const pulseLineWidth = baseLineWidth + pulseFactor * (baseLineWidth * 0.8);
    const baseShadowBlur = 8, pulseShadowBlur = baseShadowBlur + pulseFactor * 12;
    const baseAlpha = 0.65, pulseAlpha = baseAlpha + pulseFactor * 0.35;
    const neonColor = `rgba(0, 255, 127, ${pulseAlpha})`;
    ctx.strokeStyle = neonColor; ctx.lineWidth = pulseLineWidth;
    ctx.shadowColor = neonColor; ctx.shadowBlur = pulseShadowBlur;
    for (const connection of connections) {
        const start = landmarks[connection[0]], end = landmarks[connection[1]];
        if (start && end) {
            ctx.beginPath();
            ctx.moveTo(start.x * targetCanvasElement.width, start.y * targetCanvasElement.height);
            ctx.lineTo(end.x * targetCanvasElement.width, end.y * targetCanvasElement.height);
            ctx.stroke();
        }
    }
    ctx.fillStyle = neonColor;
    ctx.shadowColor = `rgba(0, 255, 127, ${pulseAlpha * 0.6})`;
    ctx.shadowBlur = pulseShadowBlur * 0.6;
    const jointRadius = pulseLineWidth * 1.1;
    for (const landmark of landmarks) {
        if (landmark) {
            ctx.beginPath();
            ctx.arc(landmark.x * targetCanvasElement.width, landmark.y * targetCanvasElement.height, jointRadius, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
}

// --- Particle Effects for Mirror Tab ---
class Particle {
    constructor(x, y, size, color, weight) {
        this.x = x; this.y = y; this.size = size; this.color = color; this.weight = weight;
    }
    draw() {
        if (!particleCtx) return;
        particleCtx.beginPath(); particleCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
        particleCtx.fillStyle = this.color; particleCtx.fill();
    }
    update() {
        this.size -= 0.05 * this.weight; if (this.size < 0) this.size = 0;
        this.y -= this.weight * 0.5; this.x += (Math.random() - 0.5) * this.weight;
    }
}
function initParticles() { particlesArray = []; }
function updateParticles(landmarks, targetCanvasElement) {
    if (currentActiveTab !== 'mirrorTab' || Math.random() > 0.7 || !particleCanvas) return;
    for (let i = 0; i < landmarks.length; i++) {
        if (Math.random() > 0.9) {
            const x = landmarks[i].x * targetCanvasElement.width, y = landmarks[i].y * targetCanvasElement.height;
            const size = Math.random() * 3 + 2, color = `hsla(${Math.random() * 60 + 90}, 100%, 70%, ${Math.random() * 0.5 + 0.3})`;
            const weight = Math.random() * 1 + 0.5;
            particlesArray.push(new Particle(x, y, size, color, weight));
        }
    }
}
function animateParticles() {
    if (currentActiveTab === 'mirrorTab' && particleCanvas && particleCtx) {
        particleCtx.fillStyle = 'rgba(26, 26, 46, 0.1)';
        particleCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);
        for (let i = 0; i < particlesArray.length; i++) {
            particlesArray[i].update(); particlesArray[i].draw();
            if (particlesArray[i].size <= 0.2) { particlesArray.splice(i, 1); i--; }
        }
    }
    requestAnimationFrame(animateParticles);
}

// --- UI Updates and Interactions (Common) ---
function capitalize(str) { return str && str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : ""; }

function updateGestureLabel(gestureName) { // gestureName could be "Gesture1 | Gesture2" or a single gesture
    const currentDisplay = gestureName; // Use the combined or single name directly
    if (gestureLabelElement.textContent !== currentDisplay) {
        gestureLabelElement.textContent = currentDisplay;
        gestureLabelElement.style.opacity = 0; gestureLabelElement.style.transform = 'translateY(10px)';
        void gestureLabelElement.offsetWidth;
        gestureLabelElement.style.opacity = 1; gestureLabelElement.style.transform = 'translateY(0px)';
        
        if (currentActiveTab === 'mirrorTab') {
            // For speaking, use the first part of the gesture string if combined
            const parts = currentDisplay.split(" | ");
            const firstGesture = parts[0];
            lastRecognizedGestureMirror = (firstGesture && firstGesture !== "Detecting..." && firstGesture !== "No Hand Detected" && firstGesture !== "No specific gesture" && firstGesture !== "Estimation Error") ? firstGesture : "";
        }
    }
}

function updateGestureHistory(gestureName) { // Expects a single gesture name
    const capName = capitalize(gestureName);
    if (gestureHistory.length > 0 && gestureHistory[0].split(" - ")[1] === capName) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    gestureHistory.unshift(`${time} - ${capName}`);
    if (gestureHistory.length > MAX_HISTORY_ITEMS) gestureHistory.pop();
    renderGestureHistory();
}
function renderGestureHistory() {
    gestureHistoryList.innerHTML = '';
    if (gestureHistory.length === 0) {
        const ph = document.createElement('li'); ph.textContent = "No history yet.";
        ph.style.cssText = "opacity: 0.5; text-align: center; font-style: italic; color: #777; animation: none; transform: none; border-bottom: none;";
        gestureHistoryList.appendChild(ph);
    } else {
        gestureHistory.forEach(e => { const li = document.createElement('li'); li.textContent = e; gestureHistoryList.appendChild(li); });
    }
}
function updateGestureCounter(gestureName) { // Expects a single gesture name
    const capName = capitalize(gestureName);
    gestureCounts[capName] = (gestureCounts[capName] || 0) + 1;
    renderGestureCounter();
}
function renderGestureCounter() {
    gestureCounterList.innerHTML = '';
    const sorted = Object.entries(gestureCounts).sort(([,a],[,b]) => b-a);
    if (sorted.length === 0) {
        const ph = document.createElement('li'); ph.textContent = "No counts yet.";
        ph.style.cssText = "opacity: 0.5; text-align: center; font-style: italic; color: #777; animation: none; transform: none; border-bottom: none;";
        gestureCounterList.appendChild(ph);
    } else {
        for (const [gest, count] of sorted) { const li = document.createElement('li'); li.textContent = `${gest}: ${count}`; gestureCounterList.appendChild(li); }
    }
}

// --- Tab Switching Logic ---
function setupTabs() {
    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const targetTab = link.dataset.tab; activateTab(targetTab);
        });
    });
}
function activateTab(tabId) {
    tabContents.forEach(content => content.classList.remove('active'));
    tabLinks.forEach(link => link.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.tab-link[data-tab="${tabId}"]`).classList.add('active');
    currentActiveTab = tabId;
    if (tabId === 'mirrorTab') {
        if(cameraRPS && typeof cameraRPS.stop === 'function') cameraRPS.stop();
        if(cameraMirror && typeof cameraMirror.start === 'function') cameraMirror.start().then(logCameraStart).catch(showCameraError);
        rpsPlayerLockedMove = null; rpsAiLockedMove = null; clearTimeout(rpsTimeoutId);
        playerMoveIcon.textContent = RPS_ICONS.unknown; aiMoveIcon.textContent = RPS_ICONS.unknown;
        playerMoveIcon.className = 'rps-icon'; aiMoveIcon.className = 'rps-icon';
        rpsResultText.textContent = "Make a move to start!"; rpsResultText.className = 'rps-result-text';
    } else if (tabId === 'rpsTab') {
        if(cameraMirror && typeof cameraMirror.stop === 'function') cameraMirror.stop();
        if(cameraRPS && typeof cameraRPS.start === 'function') cameraRPS.start().then(logCameraStart).catch(showCameraError);
        gestureLabelElement.textContent = "Play RPS below!";
    }
    console.log("Active tab:", currentActiveTab);
}

// --- Event Listeners (Common & Mirror Tab) ---
if (speakButton) {
    speakButton.addEventListener('click', () => {
        if (lastRecognizedGestureMirror) { // Uses the first gesture from mirror tab
            const utt = new SpeechSynthesisUtterance(lastRecognizedGestureMirror);
            utt.lang = 'en-US'; utt.rate = 0.9; window.speechSynthesis.speak(utt);
        } else { window.speechSynthesis.speak(new SpeechSynthesisUtterance("No gesture on mirror.")); }
    });
}
if (captureImageButton) {
    captureImageButton.addEventListener('click', () => {
        const dataURL = canvasElement.toDataURL('image/png');
        const link = document.createElement('a'); link.href = dataURL;
        link.download = `ChittyMirror_Gesture_${(lastRecognizedGestureMirror || 'capture').replace(/\s+/g, '_')}_${Date.now()}.png`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    });
}
if (clearLabelButton) {
    clearLabelButton.addEventListener('click', () => {
        gestureLabelElement.textContent = "Cleared"; lastRecognizedGestureMirror = "";
    });
}
if (helpButton && helpModal && closeHelpModal) {
    helpButton.addEventListener('click', () => { helpModal.style.display = 'block'; });
    closeHelpModal.addEventListener('click', () => { helpModal.style.display = 'none'; });
    window.addEventListener('click', (e) => { if (e.target == helpModal) helpModal.style.display = 'none'; });
}
if (clearHistoryButton) {
    clearHistoryButton.addEventListener('click', () => {
        gestureHistory = []; renderGestureHistory(); console.log("Gesture history cleared.");
    });
}

// --- Speech Synthesis Check ---
if (!('speechSynthesis' in window)) {
    if (speakButton) { speakButton.disabled = true; speakButton.title = "Speech synthesis not supported.";}
    console.warn("Speech Synthesis not supported.");
}

// --- Start the application ---
window.onload = () => {
    startApp();
    renderGestureHistory();
    renderGestureCounter();
};
console.log("ChittyMirror: script.js loaded. Initializing app...");
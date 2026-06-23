const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/4cByU1YCI/';
const PREDICTION_INTERVAL = 300;

const state = {
    model: null,
    webcam: null,
    isRunning: false,
    lastItem: '',
    lastPredictionTime: 0,
    lowStockItems: [],
};

const UI = {};

function $id(id) {
    return document.getElementById(id);
}

function initPage() {
    cacheElements();
    attachButtonListeners();
    attachOptionListeners();
    hideBlockingOverlay();
    loadShoppingList();
    updateLowStockList();
    console.log('ShelfSense UI initialized.');
}

function cacheElements() {
    UI.startBtn = $id('start-btn');
    UI.stopBtn = $id('stop-btn');
    UI.webcamContainer = $id('webcam-container');
    UI.scanAnimation = $id('scan-animation');
    UI.scanPrompt = $id('scan-prompt');
    UI.resultItem = $id('result-item');
    UI.resultStatus = $id('result-status');
    UI.lowStockList = $id('lowStockList');
    UI.labelContainer = $id('label-container');
    UI.shoppingInput = $id('shopping-input');
    UI.shoppingList = $id('shopping-list');
    UI.addShoppingBtn = $id('add-shopping-btn');
    UI.orderBlinkitBtn = $id('order-blinkit-btn');
    UI.orderZeptoBtn = $id('order-zepto-btn');
    UI.orderAmazonBtn = $id('order-amazon-btn');
    UI.selfAnalysisModal = $id('self-analysis-modal');
    UI.resultsModal = $id('results-modal');
    UI.infoModal = $id('info-modal');
    UI.guideModal = $id('guide-modal');
    UI.closeResultsBtn = $id('close-results');
    UI.saveCombinedResultBtn = $id('save-combined-result');
    UI.closeModalBtn = $id('close-modal');
    UI.closeGuideBtn = $id('close-guide');
}

function attachButtonListeners() {
    if (UI.startBtn) UI.startBtn.addEventListener('click', startScan);
    if (UI.stopBtn) UI.stopBtn.addEventListener('click', stopScan);
    if (UI.addShoppingBtn) UI.addShoppingBtn.addEventListener('click', addShoppingItem);
    if (UI.orderBlinkitBtn) UI.orderBlinkitBtn.addEventListener('click', () => orderTo('blinkit'));
    if (UI.orderZeptoBtn) UI.orderZeptoBtn.addEventListener('click', () => orderTo('zepto'));
    if (UI.orderAmazonBtn) UI.orderAmazonBtn.addEventListener('click', () => orderTo('amazon'));

    if (UI.closeResultsBtn) UI.closeResultsBtn.addEventListener('click', () => toggleModal(UI.resultsModal, false));
    if (UI.saveCombinedResultBtn) UI.saveCombinedResultBtn.addEventListener('click', () => {
        alert('Result saved for later review.');
        toggleModal(UI.resultsModal, false);
    });
    if (UI.closeModalBtn) UI.closeModalBtn.addEventListener('click', () => toggleModal(UI.infoModal, false));
    if (UI.closeGuideBtn) UI.closeGuideBtn.addEventListener('click', () => toggleModal(UI.guideModal, false));
}

function attachOptionListeners() {
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.option-btn').forEach(item => item.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
}

function hideBlockingOverlay() {
    const overlay = $id('modal-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
    }
}

async function startScan() {
    if (state.isRunning) return;
    state.isRunning = true;
    console.log('Start scan pressed.');

    try {
        if (typeof tf === 'undefined' || typeof tmImage === 'undefined') {
            throw new Error('TensorFlow or Teachable Machine library is not loaded.');
        }

        await tf.setBackend('webgl');
        await tf.ready();

        state.webcam = new tmImage.Webcam(224, 224, true);
        await state.webcam.setup();
        await state.webcam.play();

        if (UI.webcamContainer) {
            UI.webcamContainer.innerHTML = '';
            UI.webcamContainer.appendChild(state.webcam.canvas);
        }

        UI.scanAnimation?.classList.remove('hidden');
        UI.scanPrompt?.classList.remove('hidden');

        try {
            state.model = await tmImage.load(`${MODEL_URL}model.json`, `${MODEL_URL}metadata.json`);
            console.log('Model loaded successfully.');
            updateStatus('Model loaded. Scanning items...');
        } catch (err) {
            console.warn('Model load failed; continuing with camera preview only.', err);
            updateStatus('Camera active. Model unavailable. Check network or browser privacy settings.');
        }

        requestAnimationFrame(scanLoop);
    } catch (error) {
        console.error('startScan error:', error);
        alert('Unable to start scanner. Please allow camera access and refresh the page.');
        state.isRunning = false;
    }
}

function stopScan() {
    if (state.webcam) {
        state.webcam.stop();
        state.webcam = null;
    }

    if (UI.webcamContainer) {
        UI.webcamContainer.innerHTML = `<div class="text-center text-gray-400"><i class="fas fa-camera text-5xl mb-4"></i><p>Camera stopped</p><p class="text-xs">Click \"Start Scan\" to resume</p></div>`;
    }

    UI.scanAnimation?.classList.add('hidden');
    UI.scanPrompt?.classList.add('hidden');
    updateStatus('Scanner stopped.');
    state.isRunning = false;
}

function scanLoop() {
    if (!state.isRunning || !state.webcam) return;
    state.webcam.update();
    const now = Date.now();

    if (now - state.lastPredictionTime > PREDICTION_INTERVAL && state.model) {
        state.lastPredictionTime = now;
        runPrediction();
    }

    requestAnimationFrame(scanLoop);
}

async function runPrediction() {
    if (!state.model || !state.webcam) return;

    try {
        const predictions = await state.model.predict(state.webcam.canvas);
        if (!predictions || predictions.length === 0) return;

        const best = predictions.reduce((max, item) => (item.probability > max.probability ? item : max), predictions[0]);
        if (!best || best.probability < 0.75) return;

        const rawLabel = best.className.toLowerCase();
        const confidence = Math.round(best.probability * 100);
        const itemName = formatLabel(rawLabel);
        const statusText = inferStatus(rawLabel);

        if (itemName === state.lastItem && confidence < 90) return;
        state.lastItem = itemName;

        updateScanResult(itemName, statusText, confidence);
    } catch (error) {
        console.warn('Prediction failed:', error);
    }
}

function formatLabel(label) {
    return label.replace(/needs to be filled|half filled|fully filled/g, '')
        .replace(/30|50|100/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, char => char.toUpperCase());
}

function inferStatus(label) {
    if (label.includes('fully') || label.includes('100')) return 'Full Stock';
    if (label.includes('half') || label.includes('50')) return 'Medium Stock';
    return 'Low Stock';
}

function updateScanResult(item, status, confidence) {
    if (UI.resultItem) UI.resultItem.innerText = item;
    if (UI.resultStatus) UI.resultStatus.innerHTML = `<span class="text-lg font-semibold">${status}</span><br><span class="text-xs text-gray-600">Confidence: ${confidence}%</span>`;

    const box = $id('result-box');
    if (box) {
        box.classList.remove('bg-green-100', 'bg-yellow-100', 'bg-red-100');
        if (status.includes('Full')) box.classList.add('bg-green-100');
        else if (status.includes('Medium')) box.classList.add('bg-yellow-100');
        else box.classList.add('bg-red-100');
    }

    document.querySelectorAll('.item-card').forEach(card => {
        card.classList.remove('item-highlight');
        if (card.dataset.item && card.dataset.item.toLowerCase() === item.toLowerCase()) {
            card.classList.add('item-highlight');
        }
    });

    setLowStock(item, status.includes('Low'));
    if (UI.labelContainer) UI.labelContainer.innerHTML = `<b>${item}</b><br>${confidence}%`;
}

function setLowStock(itemName, needsRefill) {
    if (needsRefill) {
        if (!state.lowStockItems.includes(itemName)) {
            state.lowStockItems.push(itemName);
        }
    } else {
        state.lowStockItems = state.lowStockItems.filter(name => name !== itemName);
    }
    updateLowStockList();
}

function updateLowStockList() {
    if (!UI.lowStockList) return;
    UI.lowStockList.innerHTML = '';

    if (state.lowStockItems.length === 0) {
        UI.lowStockList.innerHTML = '<li class="text-green-600 font-medium">All items are full</li>';
        return;
    }

    state.lowStockItems.forEach(item => {
        const li = document.createElement('li');
        li.className = 'bg-red-100 text-red-700 px-3 py-2 rounded-lg';
        li.textContent = item;
        UI.lowStockList.appendChild(li);
    });
}

function updateStatus(message) {
    if (UI.resultStatus) UI.resultStatus.innerText = message;
}

function addShoppingItem() {
    const value = UI.shoppingInput?.value.trim();
    if (!value) return;

    const list = JSON.parse(localStorage.getItem('shoppingList') || '[]');
    list.push(value);
    localStorage.setItem('shoppingList', JSON.stringify(list));
    UI.shoppingInput.value = '';
    loadShoppingList();
}

function loadShoppingList() {
    if (!UI.shoppingList) return;
    const list = JSON.parse(localStorage.getItem('shoppingList') || '[]');
    UI.shoppingList.innerHTML = '';

    list.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center bg-gray-100 px-3 py-2 rounded-lg';
        li.innerHTML = `<span>${item}</span><button type="button" class="text-red-500 text-xs" data-index="${index}">?</button>`;
        UI.shoppingList.appendChild(li);
    });

    UI.shoppingList.querySelectorAll('button[data-index]').forEach(button => {
        button.addEventListener('click', () => removeShoppingItem(Number(button.dataset.index)));
    });
}

function removeShoppingItem(index) {
    const list = JSON.parse(localStorage.getItem('shoppingList') || '[]');
    list.splice(index, 1);
    localStorage.setItem('shoppingList', JSON.stringify(list));
    loadShoppingList();
}

function orderTo(platform) {
    const selectedItem = UI.resultItem?.innerText || '';
    if (!selectedItem || selectedItem === 'Waiting for scan...') {
        alert('Please scan an item first.');
        return;
    }

    let url = '';
    if (platform === 'blinkit') url = `https://blinkit.com/s/?q=${encodeURIComponent(selectedItem)}`;
    else if (platform === 'zepto') url = `https://www.zeptonow.com/search?query=${encodeURIComponent(selectedItem)}`;
    else if (platform === 'amazon') url = `https://www.amazon.in/s?k=${encodeURIComponent(selectedItem)}`;

    if (url) window.open(url, '_blank');
}

function toggleModal(modalElement, show) {
    if (!modalElement) return;
    modalElement.classList.toggle('show', show);
}

window.setupScanner = startScan;
window.addEventListener('DOMContentLoaded', initPage);

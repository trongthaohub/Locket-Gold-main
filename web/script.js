const tg = window.Telegram.WebApp;
const API_BASE = '/api';

// Initialize Telegram WebApp
tg.expand();
tg.ready();
tg.enableClosingConfirmation();

// State
let currentUser = null;
let currentUid = null;

// DOM Elements
const usernameInput = document.getElementById('username');
const resolveBtn = document.getElementById('resolve-btn');
const userInfoSection = document.getElementById('user-info');
const inputSection = document.getElementById('input-section');
const displayUid = document.getElementById('display-uid');
const displayStatus = document.getElementById('display-status');
const activateBtn = document.getElementById('activate-btn');
const processingSection = document.getElementById('processing-section');
const successSection = document.getElementById('success-section');
const logsContainer = document.getElementById('logs');
const progressBar = document.querySelector('.loading-fill');
const statUsers = document.getElementById('stat-users');
const statRequests = document.getElementById('stat-requests');

// Load Initial Stats
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        animateValue(statUsers, 0, data.unique_users, 1500);
        animateValue(statRequests, 0, data.total, 1500);
    } catch (error) {
        console.error('Failed to load stats', error);
    }
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function addLog(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = 'log-entry fade-in';
    const prefix = type === 'error' ? '[!]' : '[*]';
    entry.innerHTML = `<span class="log-prefix">${prefix}</span><span>${msg}</span>`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Resolve Username
resolveBtn.addEventListener('click', async () => {
    const input = usernameInput.value.trim();
    if (!input) {
        tg.HapticFeedback.notificationOccurred('error');
        return;
    }

    tg.HapticFeedback.impactOccurred('medium');
    resolveBtn.disabled = true;
    resolveBtn.innerHTML = '<div class="spinner-small"></div>';

    try {
        const response = await fetch(`${API_BASE}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: input })
        });
        const data = await response.json();

        if (data.success) {
            currentUid = data.uid;
            currentUser = input;
            displayUid.textContent = data.uid;
            displayStatus.textContent = data.status_text;

            userInfoSection.classList.remove('hidden');
            resolveBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            tg.HapticFeedback.notificationOccurred('success');
        } else {
            tg.showAlert(data.error || 'User not found');
            resolveBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
            tg.HapticFeedback.notificationOccurred('error');
        }
    } catch (error) {
        tg.showAlert('Connection failed');
    } finally {
        resolveBtn.disabled = false;
    }
});

// Activate Gold
activateBtn.addEventListener('click', async () => {
    if (!currentUid) return;

    tg.HapticFeedback.impactOccurred('heavy');
    userInfoSection.classList.add('hidden');
    inputSection.classList.add('hidden');
    processingSection.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE}/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: currentUid,
                username: currentUser,
                user_id: tg.initDataUnsafe.user?.id || 0
            })
        });
        const data = await response.json();

        if (data.success) {
            startPolling(data.request_id);
        } else {
            tg.showAlert(data.error || 'Activation failed');
            userInfoSection.classList.remove('hidden');
            inputSection.classList.remove('hidden');
            processingSection.classList.add('hidden');
        }
    } catch (error) {
        tg.showAlert('API Connection error');
    }
});

// Polling for progress
function startPolling(requestId) {
    let progress = 0;
    let lastLogLength = 0;

    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/status/${requestId}`);
            const data = await response.json();

            // New logs handling
            if (data.logs && data.logs.length > lastLogLength) {
                for (let i = lastLogLength; i < data.logs.length; i++) {
                    addLog(data.logs[i]);
                }
                lastLogLength = data.logs.length;
                tg.HapticFeedback.selectionChanged();
            }

            // Pseudo-progress for smoother UI
            progress = Math.min(progress + 2, 98);
            progressBar.style.width = `${progress}%`;

            if (data.completed) {
                clearInterval(interval);
                progressBar.style.width = '100%';

                setTimeout(() => {
                    if (data.success) {
                        showSuccess(data);
                    } else {
                        tg.showAlert(data.error || 'Activation failed');
                        window.location.reload();
                    }
                }, 800);
            }
        } catch (error) {
            console.error('Polling error', error);
        }
    }, 1500);
}

function showSuccess(data) {
    processingSection.classList.add('hidden');
    successSection.classList.remove('hidden');

    document.getElementById('ios-link').href = data.nextdns_link;
    document.getElementById('android-dns').textContent = `${data.nextdns_id}.dns.nextdns.io`;

    tg.HapticFeedback.notificationOccurred('success');
}

// Initial load
loadStats();
tg.ready();

// CSS for spinner if not in style.css
const style = document.createElement('style');
style.textContent = `
    .spinner-small {
        width: 20px;
        height: 20px;
        border: 3px solid rgba(0,0,0,0.1);
        border-top: 3px solid #000;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(style);

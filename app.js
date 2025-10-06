(() => {
    const form = document.getElementById('new-timer-form');
    const nameInput = document.getElementById('timer-name');
    const minutesInput = document.getElementById('timer-minutes');
    const secondsInput = document.getElementById('timer-seconds');
    const list = document.getElementById('timers-list');
    const clockEl = document.getElementById('app-clock');
	const topDateInput = document.getElementById('top-date');
	const topDateLabel = document.getElementById('top-date-label');
    const copyToggleBtn = document.getElementById('copy-toggle');
    const copyPanel = document.getElementById('copy-panel');
    const copyDaysList = document.getElementById('copy-days');
    const copySelectAllBtn = document.getElementById('copy-select-all');
    const copyClearBtn = document.getElementById('copy-clear');
    const copyGoBtn = document.getElementById('copy-go');

	/**
	 * timersByDate maps dateKey (YYYY-MM-DD) -> Map<timerId, Timer>
	 * @type {Map<string, Map<string, {id:string,dateKey:string,name:string,remainingMs:number,isRunning:boolean,intervalId:number|null,startedAt:number|null}>>}
	 */
	const timersByDate = new Map();

	/** @type {string} */
	let selectedDateKey;
    // No week navigation now; using top date input

	/** @type {number} */
	let lastPersistedAtMs = 0;

	const STORAGE_KEY = 'task-timer-app:v1';

	function saveState() {
		/** @type {{ selectedDateKey: string, timersByDate: Record<string, Array<{id:string,name:string,remainingMs:number}>> }} */
		const snapshot = { selectedDateKey, timersByDate: {} };
		for (const [dateKey, map] of timersByDate.entries()) {
			snapshot.timersByDate[dateKey] = Array.from(map.values()).map(t => ({ id: t.id, name: t.name, remainingMs: t.remainingMs }));
		}
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
		} catch (_) {
			// ignore quota or serialization errors
		}
	}

	function loadState() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return false;
			const snapshot = JSON.parse(raw);
			if (!snapshot || typeof snapshot !== 'object') return false;
			if (snapshot.selectedDateKey && typeof snapshot.selectedDateKey === 'string') {
				selectedDateKey = snapshot.selectedDateKey;
			}
			const tb = snapshot.timersByDate || {};
			for (const dateKey of Object.keys(tb)) {
				const arr = Array.isArray(tb[dateKey]) ? tb[dateKey] : [];
				const map = new Map();
				for (const t of arr) {
					if (!t || typeof t !== 'object') continue;
					const id = String(t.id || generateId());
					map.set(id, {
						id,
						dateKey,
						name: String(t.name || ''),
						remainingMs: Math.max(0, Number(t.remainingMs || 0)),
						isRunning: false,
						intervalId: null,
						startedAt: null
					});
				}
				if (map.size > 0) {
					timersByDate.set(dateKey, map);
				}
			}
			return true;
		} catch (_) {
			return false;
		}
	}

    function generateId() {
        return Math.random().toString(36).slice(2, 10);
    }

    function formatTime(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const mm = String(minutes).padStart(2, '0');
        const ss = String(seconds).padStart(2, '0');
        return `${mm}:${ss}`;
    }

	function toDateKey(d) {
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function parseDateKey(key) {
		const [y, m, d] = key.split('-').map((v) => parseInt(v, 10));
		return new Date(y, (m - 1), d);
	}

	function addDays(date, days) {
		const d = new Date(date);
		d.setDate(d.getDate() + days);
		return d;
	}

// Week helpers removed

	function getTimersMap(dateKey) {
		let map = timersByDate.get(dateKey);
		if (!map) {
			map = new Map();
			timersByDate.set(dateKey, map);
		}
		return map;
	}

    function formatLocalDateTime(date) {
        // Example: Mon, Oct 6, 2025 14:05:09
        const day = date.toLocaleDateString(undefined, { weekday: 'short' });
        const month = date.toLocaleDateString(undefined, { month: 'short' });
        const dayNum = date.toLocaleDateString(undefined, { day: '2-digit' });
        const year = date.toLocaleDateString(undefined, { year: 'numeric' });
        const time = date.toLocaleTimeString(undefined, { hour12: false });
        return `${day}, ${month} ${dayNum}, ${year} ${time}`;
    }

    function startClock() {
        if (!clockEl) return;
        const update = () => {
            clockEl.textContent = formatLocalDateTime(new Date());
        };
        update();
        setInterval(update, 1000);
    }

	function createTimerElement(timer) {
        const li = document.createElement('li');
        li.className = 'timer-item';
        li.dataset.id = timer.id;
		li.dataset.date = timer.dateKey;

        const nameEl = document.createElement('div');
        nameEl.className = 'timer-name';
        nameEl.textContent = timer.name;

        const timeEl = document.createElement('div');
        timeEl.className = 'timer-remaining';
        timeEl.textContent = formatTime(timer.remainingMs);

        const controls = document.createElement('div');
        controls.className = 'timer-controls';

		const startBtn = document.createElement('button');
        startBtn.textContent = 'Start';
		startBtn.addEventListener('click', () => startTimer(timer.id, timer.dateKey));

		const pauseBtn = document.createElement('button');
        pauseBtn.textContent = 'Pause';
		pauseBtn.addEventListener('click', () => pauseTimer(timer.id, timer.dateKey));

		const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
		deleteBtn.addEventListener('click', () => deleteTimer(timer.id, timer.dateKey));

        controls.append(startBtn, pauseBtn, deleteBtn);
        li.append(nameEl, timeEl, controls);
        return li;
    }

	function renderTimer(timer) {
		if (selectedDateKey !== timer.dateKey) return null;
        const existing = list.querySelector(`li[data-id="${timer.id}"]`);
        if (existing) {
            const timeEl = existing.querySelector('.timer-remaining');
            if (timeEl) timeEl.textContent = formatTime(timer.remainingMs);
            return existing;
        }
        const el = createTimerElement(timer);
		list.prepend(el);
        return el;
    }

	function tick(timerId, dateKey) {
		const map = timersByDate.get(dateKey);
		if (!map) return;
		const timer = map.get(timerId);
        if (!timer) return;
        const now = Date.now();
        const elapsed = now - (timer.startedAt || now);
        const newRemaining = timer.remainingMs - elapsed;
        timer.startedAt = now;
        timer.remainingMs = Math.max(0, newRemaining);
        renderTimer(timer);
		if (now - lastPersistedAtMs > 1000) {
			lastPersistedAtMs = now;
			saveState();
		}
        if (timer.remainingMs <= 0) {
			pauseTimer(timerId, dateKey);
        }
    }

	function startTimer(timerId, dateKey) {
		const map = timersByDate.get(dateKey);
		if (!map) return;
		const timer = map.get(timerId);
		if (!timer || timer.isRunning || timer.remainingMs <= 0) return;
        timer.isRunning = true;
        timer.startedAt = Date.now();
		timer.intervalId = setInterval(() => tick(timerId, dateKey), 200);
        renderTimer(timer);
        saveState();
    }

	function pauseTimer(timerId, dateKey) {
		const map = timersByDate.get(dateKey);
		if (!map) return;
		const timer = map.get(timerId);
		if (!timer || !timer.isRunning) return;
        timer.isRunning = false;
        timer.startedAt = null;
        if (timer.intervalId) {
            clearInterval(timer.intervalId);
            timer.intervalId = null;
        }
        renderTimer(timer);
    }

	function deleteTimer(timerId, dateKey) {
		const map = timersByDate.get(dateKey);
		if (!map) return;
		const timer = map.get(timerId);
		if (!timer) return;
		pauseTimer(timerId, dateKey);
		map.delete(timerId);
		const el = list.querySelector(`li[data-id="${timerId}"]`);
        if (el) el.remove();
        saveState();
    }

	function renderTimersForSelectedDate() {
		list.innerHTML = '';
		const map = getTimersMap(selectedDateKey);
		// Show newest first
		Array.from(map.values()).reverse().forEach((t) => {
			renderTimer(t);
		});
	}

	function pauseAllRunningForDate(dateKey) {
		const map = timersByDate.get(dateKey);
		if (!map) return;
		for (const t of map.values()) {
			if (t.isRunning) {
				pauseTimer(t.id, dateKey);
			}
		}
	}

    function updateTopDateUI() {
        if (!topDateInput || !topDateLabel) return;
        topDateInput.value = selectedDateKey;
        const d = parseDateKey(selectedDateKey);
        const label = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
        topDateLabel.textContent = label;
        renderCopyDays();
    }

    function selectDate(dateKey) {
		if (selectedDateKey && selectedDateKey !== dateKey) {
			pauseAllRunningForDate(selectedDateKey);
		}
		selectedDateKey = dateKey;
        updateTopDateUI();
		renderTimersForSelectedDate();
        saveState();
	}

    // Week rendering removed

	form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = String(nameInput.value || '').trim();
        const minutes = parseInt(String(minutesInput.value || '0'), 10) || 0;
        const seconds = parseInt(String(secondsInput.value || '0'), 10) || 0;
        const boundedSeconds = Math.min(Math.max(seconds, 0), 59);
        const totalMs = (Math.max(minutes, 0) * 60 + boundedSeconds) * 1000;
        if (!name || totalMs <= 0) {
            alert('Please provide a name and a positive duration.');
            return;
        }
        const id = generateId();
		const timer = {
            id,
			dateKey: selectedDateKey,
            name,
            remainingMs: totalMs,
            isRunning: false,
            intervalId: null,
            startedAt: null
        };
		getTimersMap(selectedDateKey).set(id, timer);
		renderTimer(timer);
        form.reset();
        nameInput.focus();
        saveState();
    });

    if (topDateInput) {
        topDateInput.addEventListener('change', () => {
            const val = String(topDateInput.value || '').trim();
            if (!val) return;
            selectDate(val);
        });
    }

	function copyTimersToDate(fromKey, toKey) {
		if (fromKey === toKey) return;
		const fromMap = getTimersMap(fromKey);
		const toMap = getTimersMap(toKey);
		for (const src of fromMap.values()) {
			const id = generateId();
			toMap.set(id, {
				id,
				dateKey: toKey,
				name: src.name,
				remainingMs: src.remainingMs,
				isRunning: false,
				intervalId: null,
				startedAt: null
			});
		}
		if (toKey === selectedDateKey) {
			renderTimersForSelectedDate();
		}
        saveState();
	}

    function renderCopyDays() {
        if (!copyDaysList) return;
        copyDaysList.innerHTML = '';
        if (!selectedDateKey) return;
        const start = parseDateKey(selectedDateKey);
        for (let i = 1; i <= 15; i++) {
            const d = addDays(start, i);
            const key = toDateKey(d);
            const li = document.createElement('li');
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = key;
            const name = d.toLocaleDateString(undefined, { weekday: 'long' });
            const display = `${name}, ${d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}`;
            const span = document.createElement('span');
            span.textContent = display;
            label.append(cb, span);
            li.append(label);
            copyDaysList.append(li);
        }
    }

    if (copyToggleBtn && copyPanel) {
        copyToggleBtn.addEventListener('click', () => {
            const expanded = copyToggleBtn.getAttribute('aria-expanded') === 'true';
            const next = !expanded;
            copyToggleBtn.setAttribute('aria-expanded', String(next));
            if (next) {
                copyPanel.removeAttribute('hidden');
                renderCopyDays();
            } else {
                copyPanel.setAttribute('hidden', '');
            }
        });
    }

    if (copySelectAllBtn && copyDaysList) {
        copySelectAllBtn.addEventListener('click', () => {
            copyDaysList.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
        });
    }

    if (copyClearBtn && copyDaysList) {
        copyClearBtn.addEventListener('click', () => {
            copyDaysList.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
        });
    }

    if (copyGoBtn && copyDaysList) {
        copyGoBtn.addEventListener('click', () => {
            const selected = Array.from(copyDaysList.querySelectorAll('input[type="checkbox"]'))
                .filter((cb) => cb.checked)
                .map((cb) => cb.value);
            const uniqueTargets = Array.from(new Set(selected)).filter((k) => k !== selectedDateKey);
            if (uniqueTargets.length === 0) {
                alert('Select at least one future date.');
                return;
            }
            uniqueTargets.forEach((toKey) => copyTimersToDate(selectedDateKey, toKey));
            alert(`Copied timers to ${uniqueTargets.length} date(s).`);
        });
    }

    (function init() {
        const hadState = loadState();
        if (!hadState || !selectedDateKey) {
            const today = new Date();
            const todayKey = toDateKey(today);
            selectedDateKey = todayKey;
        }
        updateTopDateUI();
        renderTimersForSelectedDate();
        startClock();
    })();
})();



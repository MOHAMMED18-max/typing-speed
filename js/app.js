/* Typing Speed — app.js — updated for passage library, car progression, Start-Test-before-typing */
(function () {
  'use strict';

  const LS_BEST = 'ts_best';
  const LS_HISTORY = 'ts_history';
  const LS_LEVEL_BEST = 'ts_level_best';

  let currentLevel = 'level1';
  let currentDuration = 60;
  let currentMode = 'timed'; // 'timed' or 'passage'
  let currentPassage = null; // {title, author, category, sourceType, text}
  let currentText = '';
  let recentByLevel = {}; // level -> array of recent indexes
  let timer = null;
  let timeLeft = 60;
  let elapsed = 0; // for passage mode
  let isReady = false; // passage visible, waiting for first keystroke
  let isActive = false;
  let isFinished = false;
  let startTime = null;
  let errorCount = 0;
  let wpmSamples = [];
  let totalTyped = 0;
  let correctChars = 0;

  const typingWrapper = document.getElementById('typingWrapper');
  const typingText = document.getElementById('typingText');
  const hiddenInput = document.getElementById('hiddenInput');
  const typingIdle = document.getElementById('typingIdle');
  const typingHint = document.getElementById('typingHint');
  const passageMeta = document.getElementById('passageMeta');
  const metaLevel = document.getElementById('metaLevel');
  const metaCategory = document.getElementById('metaCategory');
  const metaSource = document.getElementById('metaSource');
  const metaTitle = document.getElementById('metaTitle');
  const metaAuthor = document.getElementById('metaAuthor');
  const carRail = document.getElementById('carRail');
  const railProgress = document.getElementById('railProgress');
  const railCar = document.getElementById('railCar');
  const carRailLabel = document.getElementById('carRailLabel');
  const carRailPercent = document.getElementById('carRailPercent');
  const metricTime = document.getElementById('metricTime');
  const metricTimeLabel = document.getElementById('metricTimeLabel');
  const metricWpm = document.getElementById('metricWpm');
  const metricAcc = document.getElementById('metricAcc');
  const metricErrors = document.getElementById('metricErrors');
  const resultsEl = document.getElementById('results');
  const resultsPassage = document.getElementById('resultsPassage');
  const resLevel = document.getElementById('resLevel');
  const resCategory = document.getElementById('resCategory');
  const resTitle = document.getElementById('resTitle');
  const resAuthor = document.getElementById('resAuthor');
  const resWpm = document.getElementById('resWpm');
  const resAcc = document.getElementById('resAcc');
  const resChars = document.getElementById('resChars');
  const resCorrect = document.getElementById('resCorrect');
  const resIncorrect = document.getElementById('resIncorrect');
  const resErrors = document.getElementById('resErrors');
  const resTime = document.getElementById('resTime');
  const resConsistency = document.getElementById('resConsistency');
  const heroAvgWpm = document.getElementById('heroAvgWpm');
  const heroBestWpm = document.getElementById('heroBestWpm');
  const heroAvgAcc = document.getElementById('heroAvgAcc');
  const heroTests = document.getElementById('heroTests');
  const timeGroup = document.getElementById('timeGroup');
  const startTestBtn = document.getElementById('startTestBtn');
  const idleStartBtn = document.getElementById('idleStartBtn');
  const newParagraphBtn = document.getElementById('newParagraphBtn');

  function getPassages(level) {
    const src = (typeof passages !== 'undefined' && passages[level]) ? passages[level] : (typeof paragraphs !== 'undefined' && paragraphs[level] ? paragraphs[level] : []);
    return src;
  }

  function normalizeEntry(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return { title: 'Original Passage', author: null, category: 'General', sourceType: 'original', text: entry };
    }
    return entry;
  }

  function pickRandomPassage(level) {
    const list = getPassages(level);
    if (!list.length) return null;
    if (!recentByLevel[level]) recentByLevel[level] = [];
    let idx;
    if (list.length <= 5) {
      // avoid last one only
      const last = recentByLevel[level][recentByLevel[level].length - 1];
      do { idx = Math.floor(Math.random() * list.length); } while (idx === last && list.length > 1);
    } else {
      // avoid last 5
      let tries = 0;
      do {
        idx = Math.floor(Math.random() * list.length);
        tries++;
        if (tries > 20) break;
      } while (recentByLevel[level].includes(idx));
    }
    recentByLevel[level].push(idx);
    if (recentByLevel[level].length > 5) recentByLevel[level].shift();
    return normalizeEntry(list[idx]);
  }

  function levelToName(level) {
    const map = { level1: 'Beginner', level2: 'Easy', level3: 'Intermediate', level4: 'Advanced', level5: 'Expert' };
    return map[level] || level;
  }

  function safeScrollIntoView(el, opts) {
    if (el && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView(opts); } catch (e) { /* ignore unsupported options in some environments */ }
    }
  }

  function levelNumber(level) {
    const m = level.match(/level(\d)/);
    return m ? m[1] : level;
  }

  function levelLabelLong(level) {
    const n = levelToName(level);
    const num = levelNumber(level);
    return `LEVEL ${num} — ${n.toUpperCase()}`;
  }

  function carLabelForLevel(level) {
    const map = { level1: 'cruising', level2: 'steady', level3: 'moderate', level4: 'brisk', level5: 'maximum' };
    return map[level] || 'cruising';
  }

  function showPassageMeta(passage) {
    if (!passage) { passageMeta.hidden = true; return; }
    passageMeta.hidden = false;
    metaLevel.textContent = levelLabelLong(currentLevel);
    metaCategory.textContent = (passage.category || 'General').toUpperCase();
    // source badge
    if (passage.sourceType === 'public-domain') {
      metaSource.textContent = '· PUBLIC DOMAIN';
    } else {
      metaSource.textContent = '· ORIGINAL PASSAGE';
    }
    metaTitle.textContent = '"' + passage.title + '"';
    if (passage.author) {
      metaAuthor.textContent = 'by ' + passage.author;
    } else {
      metaAuthor.textContent = '';
    }
  }

  function updateCarRail(level, progress) {
    const label = carLabelForLevel(level);
    carRailLabel.textContent = `Level ${levelNumber(level)} — ${label}`;
    const pct = Math.round(progress * 100);
    carRailPercent.textContent = pct + '%';
    railProgress.style.width = pct + '%';
    // car left is pct, but clamp 0-96 to keep visible within track
    const clamped = Math.min(96, Math.max(0, pct));
    railCar.style.left = clamped + '%';
    // speed hint: higher levels have slightly faster jitter if active
    // we keep rail element class for animation speed
    carRail.dataset.level = level;
  }

  function setIdleState() {
    isReady = false;
    isActive = false;
    isFinished = false;
    currentPassage = null;
    currentText = '';
    typingText.innerHTML = '';
    typingWrapper.classList.remove('ready', 'active', 'finished');
    typingIdle.hidden = false;
    typingHint.hidden = true;
    passageMeta.hidden = true;
    // reset car to 0, keep level label
    updateCarRail(currentLevel, 0);
    carRail.classList.remove('typing');
    // metrics reset
    if (currentMode === 'timed') {
      metricTime.textContent = currentDuration;
      metricTimeLabel.textContent = 'seconds';
    } else {
      metricTime.textContent = '0';
      metricTimeLabel.textContent = 'elapsed';
    }
    metricWpm.textContent = '0';
    metricAcc.innerHTML = '100<span class="metric-unit">%</span>';
    metricErrors.textContent = '0';
    resultsEl.hidden = true;
    hiddenInput.value = '';
    hiddenInput.disabled = true;
    clearInterval(timer);
    timer = null;
    timeLeft = currentDuration;
    elapsed = 0;
  }

  function enterReadyState(passage) {
    currentPassage = passage;
    currentText = passage.text;
    // render text spans
    typingText.innerHTML = '';
    for (let i = 0; i < currentText.length; i++) {
      const span = document.createElement('span');
      span.textContent = currentText[i];
      span.className = 'char';
      if (i === 0) span.classList.add('current');
      typingText.appendChild(span);
    }
    showPassageMeta(passage);
    updateCarRail(currentLevel, 0);
    carRail.classList.remove('typing');

    hiddenInput.value = '';
    totalTyped = 0;
    correctChars = 0;
    errorCount = 0;
    wpmSamples = [];
    startTime = null;
    isReady = true;
    isActive = false;
    isFinished = false;
    timeLeft = currentDuration;
    elapsed = 0;
    if (currentMode === 'timed') {
      metricTime.textContent = timeLeft;
      metricTimeLabel.textContent = 'seconds';
    } else {
      metricTime.textContent = '0';
      metricTimeLabel.textContent = 'elapsed';
    }
    metricWpm.textContent = '0';
    metricAcc.innerHTML = '100<span class="metric-unit">%</span>';
    metricErrors.textContent = '0';
    resultsEl.hidden = true;
    hiddenInput.disabled = false;
    clearInterval(timer);
    timer = null;
    typingWrapper.classList.remove('finished', 'active');
    typingWrapper.classList.add('ready');
    typingIdle.hidden = true;
    typingHint.hidden = false;
    typingWrapper.scrollTop = 0;
    // focus for typing, but don't start timer yet
    setTimeout(() => hiddenInput.focus(), 30);
  }

  function startTest() {
    const passage = pickRandomPassage(currentLevel);
    if (!passage) {
      console.error('No passage for level', currentLevel);
      return;
    }
    enterReadyState(passage);
  }

  function updateMetrics() {
    let elapsedSec;
    let wpm = 0;
    // WPM = (total typed characters / 5) / minutes — only typed, not remaining passage
    if (currentMode === 'passage') {
      elapsedSec = elapsed;
      if (elapsedSec > 0) {
        const minutes = elapsedSec / 60;
        wpm = Math.round((totalTyped / 5) / minutes) || 0;
        if (!isFinite(wpm)) wpm = 0;
      }
      metricTime.textContent = elapsedSec;
    } else {
      elapsedSec = currentDuration - timeLeft;
      if (elapsedSec > 0) {
        const minutes = elapsedSec / 60;
        wpm = Math.round((totalTyped / 5) / minutes) || 0;
        if (!isFinite(wpm)) wpm = 0;
      }
      metricTime.textContent = timeLeft;
    }
    metricWpm.textContent = wpm;
    // Accuracy = correct / totalTyped * 100 — only typed, remaining passage NOT counted
    let acc = 100;
    if (totalTyped > 0) acc = Math.round((correctChars / totalTyped) * 100);
    else acc = 100; // live display before typing stays 100; results with 0 typed will show 0 (see finishTest)
    if (!isFinite(acc)) acc = 100;
    metricAcc.innerHTML = acc + '<span class="metric-unit">%</span>';
    metricErrors.textContent = errorCount;
  }

  function startTimer() {
    if (timer) return;
    startTime = Date.now();
    isActive = true;
    isReady = false;
    typingWrapper.classList.remove('ready');
    typingWrapper.classList.add('active');
    carRail.classList.add('typing');
    typingHint.hidden = true;
    timer = setInterval(() => {
      if (currentMode === 'passage') {
        elapsed++;
        metricTime.textContent = elapsed;
        const minutes = elapsed / 60;
        const wpmNow = minutes > 0 ? Math.round((totalTyped / 5) / minutes) : 0;
        wpmSamples.push(wpmNow);
        updateMetrics();
      } else {
        timeLeft--;
        if (timeLeft <= 0) {
          timeLeft = 0;
          metricTime.textContent = timeLeft;
          finishTest();
          return;
        }
        metricTime.textContent = timeLeft;
        const elapsedSec = currentDuration - timeLeft;
        const minutes = elapsedSec / 60;
        const wpmNow = minutes > 0 ? Math.round((totalTyped / 5) / minutes) : 0;
        wpmSamples.push(wpmNow);
        updateMetrics();
        scrollToCurrent();
      }
    }, 1000);
  }

  function scrollToCurrent() {
    const current = typingText.querySelector('.char.current');
    if (!current) return;
    const wrapperRect = typingWrapper.getBoundingClientRect();
    const charRect = current.getBoundingClientRect();
    if (charRect.bottom > wrapperRect.bottom - 28) {
      typingWrapper.scrollTop += charRect.bottom - wrapperRect.bottom + 36;
    } else if (charRect.top < wrapperRect.top + 12) {
      typingWrapper.scrollTop -= wrapperRect.top - charRect.top + 16;
    }
  }

  function updateCarProgress() {
    const progress = currentText.length ? totalTyped / currentText.length : 0;
    updateCarRail(currentLevel, progress);
  }

  function handleInput() {
    if (isFinished || !isReady && !isActive) return;
    // if ready and first char, start timer
    const value = hiddenInput.value;
    if (value.length > currentText.length) {
      hiddenInput.value = value.slice(0, currentText.length);
      return;
    }
    if (!isActive && value.length > 0) {
      startTimer();
    }
    totalTyped = value.length;
    correctChars = 0;
    errorCount = 0;
    const chars = typingText.querySelectorAll('.char');
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      ch.classList.remove('correct', 'incorrect', 'current');
      if (i < value.length) {
        const isCorrect = value[i] === currentText[i];
        if (isCorrect) {
          ch.classList.add('correct');
          correctChars++;
        } else {
          ch.classList.add('incorrect');
          errorCount++;
        }
      } else if (i === value.length) {
        ch.classList.add('current');
      }
    }
    if (value.length === currentText.length && value.length > 0) {
      // passage completed
      finishTest();
      return;
    }
    updateMetrics();
    updateCarProgress();
    scrollToCurrent();
  }

  function calculateConsistency(samples) {
    if (samples.length < 2) return 100;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    if (avg === 0) return 100;
    const variance = samples.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / samples.length;
    const stdDev = Math.sqrt(variance);
    let cons = 100 - (stdDev / avg) * 100;
    cons = Math.max(0, Math.min(100, cons));
    return Math.round(cons);
  }

  function finishTest() {
    if (isFinished) return;
    isFinished = true;
    isActive = false;
    isReady = false;
    clearInterval(timer);
    timer = null;
    typingWrapper.classList.remove('active', 'ready');
    typingWrapper.classList.add('finished');
    carRail.classList.remove('typing');
    hiddenInput.disabled = true;
    updateCarProgress(); // ensure 100% if completed
    // force car to finish if completed passage
    if (totalTyped === currentText.length) {
      updateCarRail(currentLevel, 1);
    }

    let timeSpent;
    let minutes;
    if (currentMode === 'passage') {
      timeSpent = elapsed || (startTime ? Math.round((Date.now() - startTime) / 1000) : 0);
      if (timeSpent === 0) timeSpent = 1;
      minutes = timeSpent / 60;
    } else {
      timeSpent = currentDuration - timeLeft;
      if (timeSpent === 0) timeSpent = currentDuration;
      // if completed early, timeSpent is actual elapsed
      minutes = timeSpent / 60;
    }
    // WPM and accuracy based ONLY on actually typed characters — remaining passage ignored
    const wpm = minutes > 0 ? Math.round((totalTyped / 5) / minutes) : 0;
    const accuracy = totalTyped > 0 ? Math.round((correctChars / totalTyped) * 100) : 0;
    const incorrect = totalTyped - correctChars;
    if (wpmSamples.length === 0 && wpm > 0) wpmSamples.push(wpm);
    const consistency = calculateConsistency(wpmSamples.length ? wpmSamples : [wpm]);

    resWpm.textContent = isFinite(wpm) ? wpm : 0;
    resAcc.textContent = (isFinite(accuracy) ? accuracy : 100) + '%';
    resChars.textContent = totalTyped;
    resCorrect.textContent = correctChars;
    resIncorrect.textContent = incorrect < 0 ? 0 : incorrect;
    resErrors.textContent = errorCount;
    resTime.textContent = timeSpent + 's';
    resConsistency.textContent = consistency + '%';

    // passage info in results
    if (currentPassage) {
      resultsPassage.hidden = false;
      resLevel.textContent = levelLabelLong(currentLevel);
      resCategory.textContent = (currentPassage.category || '').toUpperCase();
      resTitle.textContent = '"' + currentPassage.title + '"';
      if (currentPassage.author) {
        resAuthor.textContent = 'by ' + currentPassage.author + (currentPassage.sourceType === 'public-domain' ? ' — Public Domain' : '');
      } else {
        resAuthor.textContent = currentPassage.sourceType === 'public-domain' ? 'Public Domain' : 'Original passage';
      }
    } else {
      resultsPassage.hidden = true;
    }

    resultsEl.hidden = false;
    safeScrollIntoView(resultsEl, { behavior: 'smooth', block: 'nearest' });

    saveResult({
      date: new Date().toISOString(),
      level: currentLevel,
      levelName: levelToName(currentLevel),
      duration: currentMode === 'passage' ? 'passage' : currentDuration,
      mode: currentMode,
      wpm: wpm,
      accuracy: accuracy,
      errors: errorCount,
      chars: totalTyped,
      correct: correctChars,
      consistency: consistency,
      passageTitle: currentPassage ? currentPassage.title : '',
      passageAuthor: currentPassage ? currentPassage.author : null,
      category: currentPassage ? currentPassage.category : ''
    });

    updateHeroStats();
    renderHistory();
    updateLevelBests();
    updateLeaderboardHighlight();
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch { return []; }
  }
  function saveHistory(arr) {
    localStorage.setItem(LS_HISTORY, JSON.stringify(arr.slice(0, 20)));
  }
  function loadBest() {
    try { return JSON.parse(localStorage.getItem(LS_BEST) || 'null'); } catch { return null; }
  }
  function loadLevelBest() {
    try { return JSON.parse(localStorage.getItem(LS_LEVEL_BEST) || '{}'); } catch { return {}; }
  }

  function saveResult(result) {
    const history = loadHistory();
    history.unshift(result);
    saveHistory(history);
    const best = loadBest();
    if (!best || result.wpm > best.wpm || (result.wpm === best.wpm && result.accuracy > best.accuracy)) {
      localStorage.setItem(LS_BEST, JSON.stringify(result));
    }
    const levelBest = loadLevelBest();
    const cur = levelBest[result.level];
    if (!cur || result.wpm > cur.wpm) {
      levelBest[result.level] = result;
      localStorage.setItem(LS_LEVEL_BEST, JSON.stringify(levelBest));
    }
  }

  function updateHeroStats() {
    const history = loadHistory();
    const best = loadBest();
    if (history.length === 0) {
      heroAvgWpm.textContent = '—';
      heroAvgAcc.textContent = '—';
      heroTests.textContent = '0';
      heroBestWpm.textContent = '—';
      return;
    }
    const avgWpm = Math.round(history.reduce((s, r) => s + r.wpm, 0) / history.length);
    const avgAcc = Math.round(history.reduce((s, r) => s + r.accuracy, 0) / history.length);
    heroAvgWpm.textContent = avgWpm;
    heroAvgAcc.textContent = avgAcc + '%';
    heroTests.textContent = history.length;
    heroBestWpm.textContent = best ? best.wpm : '—';
  }

  function renderHistory() {
    const tbody = document.getElementById('historyBody');
    const history = loadHistory();
    if (!history.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No tests yet. Complete a test to see your history.</td></tr>';
      return;
    }
    tbody.innerHTML = history.map(r => {
      const d = new Date(r.date);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const dur = r.duration === 'passage' ? 'Passage' : r.duration + 's';
      return `<tr>
        <td>${dateStr}</td>
        <td>${r.levelName || levelToName(r.level)}</td>
        <td>${dur}</td>
        <td class="wpm-strong">${r.wpm}</td>
        <td>${r.accuracy}%</td>
        <td>${r.errors}</td>
      </tr>`;
    }).join('');
  }

  function updateLevelBests() {
    const levelBest = loadLevelBest();
    for (let i = 1; i <= 5; i++) {
      const key = 'level' + i;
      const el = document.getElementById('levelBest' + i);
      if (!el) continue;
      const best = levelBest[key];
      if (best) {
        el.textContent = `Best: ${best.wpm} WPM · ${best.accuracy}% accuracy`;
      } else {
        el.textContent = 'No attempts yet';
      }
    }
    document.querySelectorAll('.level-card').forEach(card => {
      card.classList.toggle('active', card.dataset.level === currentLevel);
    });
    updateCarRail(currentLevel, isFinished ? 1 : (isReady || isActive ? (currentText.length ? totalTyped/currentText.length : 0) : 0));
  }

  const demoLeaderboard = [
    { name: 'Alex Morgan', wpm: 142, accuracy: 98, level: 'Expert' },
    { name: 'Samantha Lee', wpm: 128, accuracy: 97, level: 'Advanced' },
    { name: 'Jordan Taylor', wpm: 121, accuracy: 96, level: 'Expert' },
    { name: 'Casey Kim', wpm: 114, accuracy: 99, level: 'Intermediate' },
    { name: 'Riley Chen', wpm: 108, accuracy: 95, level: 'Advanced' },
    { name: 'Morgan Blake', wpm: 102, accuracy: 97, level: 'Intermediate' },
    { name: 'Jamie Patel', wpm: 96, accuracy: 94, level: 'Advanced' },
    { name: 'Taylor Brooks', wpm: 89, accuracy: 96, level: 'Easy' },
    { name: 'Avery Quinn', wpm: 84, accuracy: 93, level: 'Intermediate' },
    { name: 'Harper Wells', wpm: 78, accuracy: 95, level: 'Beginner' },
  ];

  function renderLeaderboard() {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = demoLeaderboard.map((row, idx) => {
      let rankClass = 'rank';
      if (idx === 0) rankClass += ' gold';
      else if (idx === 1) rankClass += ' silver';
      else if (idx === 2) rankClass += ' bronze';
      return `<tr>
        <td><span class="${rankClass}">${idx + 1}</span></td>
        <td>${row.name}</td>
        <td class="wpm-strong">${row.wpm}</td>
        <td>${row.accuracy}%</td>
        <td>${row.level}</td>
      </tr>`;
    }).join('');
    updateLeaderboardHighlight();
  }

  function updateLeaderboardHighlight() {
    const best = loadBest();
    const callout = document.getElementById('personalBestCallout');
    const textEl = document.getElementById('personalBestText');
    if (!best) {
      callout.hidden = true;
      return;
    }
    callout.hidden = false;
    const dur = best.duration === 'passage' ? 'Passage' : best.duration + 's';
    textEl.textContent = `${best.wpm} WPM · ${best.accuracy}% accuracy · ${best.levelName || levelToName(best.level)} · ${dur}`;
  }

  function resetTestToIdle() {
    setIdleState();
  }

  function handleModeChange(newMode) {
    currentMode = newMode;
    document.querySelectorAll('[data-mode]').forEach(b => {
      const active = b.dataset.mode === newMode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    if (newMode === 'passage') {
      timeGroup.style.opacity = '0.5';
      timeGroup.style.pointerEvents = 'none';
      metricTimeLabel.textContent = 'elapsed';
      if (isReady || isActive) {
        // keep current passage but reset timer handling
        // maintain ready state
      }
    } else {
      timeGroup.style.opacity = '1';
      timeGroup.style.pointerEvents = '';
      metricTimeLabel.textContent = 'seconds';
    }
    // if a test is not started, just update metrics
    if (isReady) {
      if (newMode === 'passage') {
        metricTime.textContent = '0';
        elapsed = 0;
      } else {
        timeLeft = currentDuration;
        metricTime.textContent = timeLeft;
      }
    } else if (!isActive && !isFinished) {
      // idle
      if (newMode === 'passage') metricTime.textContent = '0';
      else metricTime.textContent = currentDuration;
    }
  }

  function initEvents() {
    // Mode selector
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        handleModeChange(btn.dataset.mode);
      });
    });
    // Time selector
    document.querySelectorAll('[data-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-time]').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        currentDuration = parseInt(btn.dataset.time, 10);
        if (currentMode === 'timed') {
          if (isReady) {
            timeLeft = currentDuration;
            metricTime.textContent = timeLeft;
          } else if (!isActive && !isFinished) {
            // idle
            metricTime.textContent = currentDuration;
          } else if (isActive) {
            // if active, we keep timeLeft as is? For simplicity reset to new duration only if not active
          }
        }
      });
    });

    // Level selector (segmented)
    document.querySelectorAll('.seg-btn[data-level]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn[data-level]').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        currentLevel = btn.dataset.level;
        updateLevelBests();
        // If passage already visible, load new passage from new level immediately (still before typing)
        if (isReady || isActive) {
          // For active, we want to reset? Let's finish current? Simpler to start new test ready
          startTest();
        } else if (isFinished) {
          // do nothing, next Start Test will use new level
        }
        // idle: just update selection, rail label
        if (!isReady && !isActive && !isFinished) {
          updateCarRail(currentLevel, 0);
        }
      });
    });

    // Level cards
    document.querySelectorAll('.level-card').forEach(card => {
      const select = () => {
        currentLevel = card.dataset.level;
        document.querySelectorAll('.seg-btn[data-level]').forEach(b => {
          const isActive = b.dataset.level === currentLevel;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', String(isActive));
        });
        updateLevelBests();
        startTest();
        safeScrollIntoView(document.getElementById('test'), { behavior: 'smooth' });
      };
      card.addEventListener('click', select);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      });
    });

    // Start Test buttons
    if (startTestBtn) startTestBtn.addEventListener('click', () => {
      startTest();
    });
    if (idleStartBtn) idleStartBtn.addEventListener('click', () => {
      startTest();
    });
    if (newParagraphBtn) newParagraphBtn.addEventListener('click', () => {
      if (isReady || isActive || isFinished) {
        startTest();
      } else {
        startTest();
      }
    });

    // Typing wrapper focus
    typingWrapper.addEventListener('click', () => {
      if (isFinished) return;
      if (!isReady && !isActive) return; // need Start Test first
      hiddenInput.focus();
    });
    typingWrapper.addEventListener('keydown', (e) => {
      if (!isReady && !isActive) {
        // if idle, Start Test on any typing? Instead require Start Test
        return;
      }
      if (e.key.length === 1 || e.key === 'Backspace') {
        hiddenInput.focus();
      }
    });

    hiddenInput.addEventListener('input', handleInput);
    hiddenInput.addEventListener('keydown', (e) => {
      if (isFinished) {
        e.preventDefault();
        return;
      }
      if (!isReady && !isActive) {
        // block typing if not ready
        e.preventDefault();
        return;
      }
    });

    // Restart
    document.getElementById('restartBtn').addEventListener('click', () => {
      if (isReady || isActive) startTest();
      else startTest();
    });
    document.getElementById('tryAgainBtn').addEventListener('click', () => startTest());
    document.getElementById('newTestBtn').addEventListener('click', () => {
      setIdleState();
      safeScrollIntoView(document.getElementById('test'), { behavior: 'smooth' });
    });
    document.getElementById('changeLevelBtn').addEventListener('click', (e) => {
      e.preventDefault();
      setIdleState();
      safeScrollIntoView(document.getElementById('levels'), { behavior: 'smooth' });
    });

    // Tab+Enter restart
    let tabPressed = false;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        tabPressed = true;
        setTimeout(() => tabPressed = false, 1000);
      }
      if (e.key === 'Enter' && tabPressed) {
        e.preventDefault();
        startTest();
        tabPressed = false;
      }
    });

    // History clear
    const clearBtn = document.getElementById('clearHistoryBtn');
    const dialog = document.getElementById('confirmDialog');
    clearBtn.addEventListener('click', () => {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else {
        if (confirm('Clear history? This cannot be undone.')) doClearHistory();
      }
    });
    if (dialog) {
      dialog.addEventListener('close', () => {
        if (dialog.returnValue === 'confirm') doClearHistory();
      });
    }
    function doClearHistory() {
      localStorage.removeItem(LS_HISTORY);
      renderHistory();
      updateHeroStats();
    }

    // Mobile menu
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const mobileNav = document.getElementById('mobileNav');
    if (mobileBtn && mobileNav) {
      mobileBtn.addEventListener('click', () => {
        const isOpen = mobileNav.classList.toggle('open');
        mobileBtn.setAttribute('aria-expanded', String(isOpen));
        mobileNav.setAttribute('aria-hidden', String(!isOpen));
      });
      mobileNav.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          mobileNav.classList.remove('open');
          mobileBtn.setAttribute('aria-expanded', 'false');
          mobileNav.setAttribute('aria-hidden', 'true');
        });
      });
    }

    // Header scrolled state + nav active
    const sections = ['test', 'levels', 'leaderboard', 'about'];
    const navLinks = document.querySelectorAll('.nav-link');
    const headerEl = document.querySelector('.header');
    window.addEventListener('scroll', () => {
      if (headerEl) headerEl.classList.toggle('scrolled', window.scrollY > 6);
      let current = '';
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 100) current = id;
      }
      navLinks.forEach(a => {
        a.style.borderBottomColor = a.dataset.nav === current ? 'var(--text)' : 'transparent';
        a.style.color = a.dataset.nav === current ? 'var(--text)' : '';
      });
    });

    const heroStart = document.getElementById('heroStartBtn');
    if (heroStart) {
      heroStart.addEventListener('click', (e) => {
        e.preventDefault();
        safeScrollIntoView(document.getElementById('test'), { behavior: 'smooth' });
        // do not auto-start, let user press Start Test
      });
    }
  }

  function init() {
    if (typeof passages === 'undefined' && typeof paragraphs === 'undefined') {
      console.error('Passage data not loaded');
      return;
    }
    renderLeaderboard();
    renderHistory();
    updateHeroStats();
    updateLevelBests();
    setIdleState();
    handleModeChange('timed');
    initEvents();
    hiddenInput.setAttribute('autocomplete', 'off');
    // ensure car rail initial
    updateCarRail(currentLevel, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();

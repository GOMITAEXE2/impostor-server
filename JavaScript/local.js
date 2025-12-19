// ==========================================
// MODO LOCAL (v8 - OPTIMIZADO: SIN CHAT/ADIVINAR)
// ==========================================
var lPlayers=[], lRoles=[], lSettings={}, lWordObj=null, lRevealIdx=0, lTimer=0, lInt, lPhase="DISCUSS", lVotes={}, lTieTargets=[];
var lTurnOrder=[], lTurnIdx=0; 

// Historial: { "Nombre": { chance: 0, streak: 0 } }
var impHistory = JSON.parse(localStorage.getItem('imp_v7_history') || '{}');

document.addEventListener('DOMContentLoaded', function() {
    var lpInput = document.getElementById('local-player-input');
    if(lpInput) lpInput.onkeypress = function(e) { if(e.key==='Enter') addLocalPlayer(); };
    initLocalShutter();
});

function addLocalPlayer() {
    var inp = document.getElementById('local-player-input');
    var val = inp.value.trim();
    if(val && !lPlayers.includes(val)) { lPlayers.push(val); inp.value=""; renderLocalPlayers(); }
}

function renderLocalPlayers() {
    document.getElementById('local-player-list').innerHTML = lPlayers.map(function(p,i) {
        return '<li class="bg-slate-700 px-3 py-2 rounded flex justify-between text-sm text-white"><span>'+(i+1)+'. '+p+'</span><span onclick="lPlayers.splice('+i+',1);renderLocalPlayers()" class="text-red-400 font-bold cursor-pointer">✕</span></li>';
    }).join('');
    updateLocalImpostors();
}

function updateLocalImpostors() {
    var max = Math.ceil(lPlayers.length / 2) - 1; if (max < 1) max = 1;
    var el = document.getElementById('local-imp-count');
    if (parseInt(el.innerText) > max) el.innerText = max;
}

function changeLocalImpostors(d) {
    var el = document.getElementById('local-imp-count');
    var cur = parseInt(el.innerText) + d;
    var max = Math.ceil(lPlayers.length / 2) - 1; if (max < 1) max = 1;
    if (cur >= 1 && cur <= max) el.innerText = cur;
}

// --- INICIO DE PARTIDA ---
function startLocalGame() {
    if (lPlayers.length < 3) return showSystemMessage("Faltan Jugadores", "Mínimo 3 jugadores.");
    
    // Configuración Simplificada (Sin Audio/Adivinar)
    lSettings.withTime = document.getElementById('local-time-switch').checked;
    lSettings.tDisc = parseInt(document.getElementById('local-time-discuss').value) || 30;
    lSettings.tVote = parseInt(document.getElementById('local-time-vote').value) || 15;
    
    // Equilibrado
    lSettings.balanced = document.getElementById('local-balanced-switch').checked;
    lSettings.balRate = parseInt(document.getElementById('local-balanced-rate').value) || 50;

    // Pistas
    lSettings.hintsOn = document.getElementById('local-hint-switch').checked;
    var cantPistas = lSettings.hintsOn ? parseInt(document.getElementById('local-hint-count').value) : 0;
    var cat = document.getElementById('local-cat-select').value;
    var lista = DB[cat] || DB.games;
    var rawItem = lista[Math.floor(Math.random() * lista.length)];
    lWordObj = getSafeWordObj(rawItem, cantPistas);

    // Asignación de Roles (Balanceada)
    var numImps = parseInt(document.getElementById('local-imp-count').innerText);
    var roles = new Array(lPlayers.length).fill('civil');
    var indices = Array.from({length: lPlayers.length}, (_, i) => i);
    
    if (lSettings.balanced) {
        lPlayers.forEach(p => { if(!impHistory[p]) impHistory[p] = { chance: 0, streak: 0 }; });
        
        indices.sort((a, b) => {
            var pA = impHistory[lPlayers[a]];
            var pB = impHistory[lPlayers[b]];
            if (pB.chance !== pA.chance) return pB.chance - pA.chance;
            return Math.random() - 0.5;
        });

        var selectedImps = indices.slice(0, numImps);
        selectedImps.forEach(idx => roles[idx] = 'impostor');

        lPlayers.forEach((name, i) => {
            var data = impHistory[name];
            var isImp = (roles[i] === 'impostor');
            if (isImp) {
                data.streak++;
                if (data.streak >= 3) data.chance = 0;
                else if (data.chance >= 100) data.chance = Math.max(0, data.chance - 50);
                else if (data.streak === 1) data.chance = Math.max(0, data.chance - 15);
                else if (data.streak === 2) data.chance = Math.max(0, data.chance - 30);
            } else {
                data.streak = 0;
                data.chance = Math.min(100, data.chance + lSettings.balRate);
            }
            impHistory[name] = data;
        });
        localStorage.setItem('imp_v7_history', JSON.stringify(impHistory));

    } else {
        indices.sort(() => Math.random() - 0.5);
        for (let i = 0; i < numImps; i++) roles[indices[i]] = 'impostor';
    }

    lRoles = lPlayers.map((n, i) => ({ id: i, name: n, role: roles[i], alive: true }));

    // Orden aleatorio de turnos
    var startIdx = Math.floor(Math.random() * lPlayers.length);
    lTurnOrder = [];
    for(let i=0; i<lPlayers.length; i++) lTurnOrder.push((startIdx + i) % lPlayers.length);
    lTurnIdx = 0;

    lRevealIdx = 0;
    showScreen('local-reveal');
    setupLocalReveal();
}

function setupLocalReveal() {
    document.getElementById('local-reveal-actions').classList.add('opacity-0','pointer-events-none');
    document.getElementById('local-next-btn').classList.add('hidden'); 
    document.getElementById('local-start-btn').classList.add('hidden');
    var door = document.getElementById('shutter-door');
    door.classList.remove('gravity-fall'); door.style.transform = 'translateY(0)';

    var p = lRoles[lRevealIdx];
    document.getElementById('local-reveal-name').innerText = p.name;
    document.getElementById('local-secret-word').innerText = lWordObj.name;
    
    var hCont = document.getElementById('local-hint-container');
    if(p.role === 'impostor' && lSettings.hintsOn && lWordObj.hints.length > 0) {
        document.getElementById('local-hint-text').innerText = "- " + lWordObj.hints.join("\n- ");
        hCont.classList.remove('hidden');
    } else hCont.classList.add('hidden');

    if(p.role==='civil') { document.getElementById('local-role-civil').classList.remove('hidden'); document.getElementById('local-role-impostor').classList.add('hidden'); } 
    else { document.getElementById('local-role-civil').classList.add('hidden'); document.getElementById('local-role-impostor').classList.remove('hidden'); }
}

function nextLocalReveal() { lRevealIdx++; setupLocalReveal(); }
function runLocalGame() { showScreen('local-game'); startTurnPhase('DISCUSS'); }

function startTurnPhase(ph, tie) {
    if(tie===undefined) tie=false; lPhase=ph; clearInterval(lInt);
    document.getElementById('local-voting-area').classList.add('hidden');
    
    if(ph === 'DISCUSS') {
        lTurnOrder = lTurnOrder.filter(idx => lRoles[idx].alive);
        lTurnIdx = 0;
        processTurn(); 
    } else {
        document.getElementById('local-phase-label').innerText = tie ? "DESEMPATE" : "VOTACIÓN";
        document.getElementById('local-voting-area').classList.remove('hidden');
        if(!tie) lVotes={}; 
        lTurnOrder = lTurnOrder.filter(idx => lRoles[idx].alive);
        lTurnIdx = 0;
        processVotingTurn();
    }
}

function processTurn() {
    if(lTurnIdx >= lTurnOrder.length) { startTurnPhase('VOTE'); return; }
    var p = lRoles[lTurnOrder[lTurnIdx]];
    if(!p.alive) { lTurnIdx++; processTurn(); return; }
    
    document.getElementById('local-phase-label').innerText = "TURNO DE HABLAR";
    document.getElementById('local-current-player').innerText = p.name;
    updateGridVisuals(p.id);
    
    startTimer(lSettings.tDisc, function() { skipLocalTurn(); });
}

function skipLocalTurn() { lTurnIdx++; processTurn(); }

function processVotingTurn() {
    if(lTurnIdx >= lTurnOrder.length) { resolveLocalVotes(); return; }
    var p = lRoles[lTurnOrder[lTurnIdx]];
    if(!p.alive) { lTurnIdx++; processVotingTurn(); return; }
    
    document.getElementById('local-current-player').innerText = p.name;
    updateGridVisuals(p.id);
    renderVotingGrid();
    
    startTimer(lSettings.tVote, function() { handleLocalTimeoutVote(p.id); });
}

function startTimer(seconds, onFinish) {
    clearInterval(lInt);
    if(!lSettings.withTime) { document.getElementById('local-timer').innerText = "∞"; return; }
    var left = seconds;
    var bar = document.getElementById('local-timer-bar');
    var disp = document.getElementById('local-timer');
    disp.innerText = fmtTime(left);
    lInt = setInterval(function() {
        left--; disp.innerText = fmtTime(left); bar.style.width = ((left/seconds)*100) + "%";
        if(left <= 0) { clearInterval(lInt); onFinish(); }
    }, 1000);
}

function updateGridVisuals(activeIdx) {
    var grid = document.getElementById('local-grid');
    var html = lRoles.map(p => {
        var isActive = (p.id === activeIdx);
        var activeClass = isActive ? "turn-active" : "opacity-50";
        return `<div class="p-3 bg-slate-700 rounded border border-slate-600 transition-all ${activeClass}">
            <div class="font-bold text-white">${p.name} ${p.alive?'':'💀'}</div>
        </div>`;
    }).join('');
    // En fase de discusión mostramos grilla visual
    if(lPhase === 'DISCUSS') document.getElementById('local-grid').innerHTML = html;
    document.getElementById('local-voting-area').classList.remove('hidden');
}

function renderVotingGrid() {
    var grid = document.getElementById('local-grid');
    grid.innerHTML = lRoles.map(p => {
        var dis = !p.alive || (p.id === lTurnOrder[lTurnIdx]); 
        
        // --- DEDITOS ---
        var voteCount = lVotes[p.id] || 0;
        var fingers = "";
        if(voteCount > 0) {
            var f = ""; for(var k=0; k<voteCount; k++) f+="☝️";
            fingers = `<span class="vote-count-badge">${f}</span>`;
        }

        return `<button ${dis?'disabled':''} onclick="localCastVote(${p.id})" class="relative p-4 bg-slate-700 hover:bg-blue-600 text-white rounded font-bold ${dis?'opacity-30':''}">
            ${p.name} ${p.alive?'':'💀'}
            ${fingers}
        </button>`;
    }).join('');
}

function localCastVote(targetId) {
    if(!lVotes[targetId]) lVotes[targetId]=0; lVotes[targetId]++;
    lTurnIdx++; processVotingTurn();
}

function handleLocalTimeoutVote(myId) {
    var liv = lRoles.filter(p => p.alive && p.id !== myId);
    var t = liv[Math.floor(Math.random()*liv.length)];
    if(t) { if(!lVotes[t.id]) lVotes[t.id]=0; lVotes[t.id]++; }
    lTurnIdx++; processVotingTurn();
}

function resolveLocalVotes() {
    clearInterval(lInt); var max=-1, tgts=[];
    for(var id in lVotes){if(lVotes[id]>max){max=lVotes[id];tgts=[parseInt(id)];}else if(lVotes[id]===max)tgts.push(parseInt(id));}
    
    if(tgts.length===0){showSystemMessage("Aviso", "Nadie votó."); startTurnPhase('DISCUSS');}
    else if(tgts.length>1){lTieTargets=tgts; showSystemMessage("Empate", "¡EMPATE!"); startTurnPhase('VOTE',true);}
    else {
        var v=lRoles[tgts[0]]; v.alive=false;
        var imp=v.role==='impostor', desc='<span class="text-white font-bold">'+v.name+'</span> era <span class="'+(imp?'text-red-500':'text-cyan-400')+' font-bold">'+(imp?'IMPOSTOR':'CIVIL')+'</span>';
        var ic=lRoles.filter(function(p){return p.role==='impostor'&&p.alive}).length, cc=lRoles.filter(function(p){return p.role==='civil'&&p.alive}).length;
        if(ic===0) showResultModal('VICTORY_CIVIL','VICTORIA CIVIL',desc,function(){showScreen('local-setup')});
        else if(ic>=cc) showResultModal('VICTORY_IMP','VICTORIA IMPOSTOR',desc,function(){showScreen('local-setup')});
        else showResultModal('ELIMINATED','ELIMINADO',desc,null,function(){startTurnPhase('DISCUSS');});
    }
}

function localReset(f){clearInterval(lInt); if(f)showScreen('local-setup');}
function initLocalShutter() {
    var d = document.getElementById('shutter-door'); if (!d) return;
    var sY = 0, drag = false, seen = false;
    var start = function(y) { drag = true; sY = y; seen = false; d.classList.remove('gravity-fall'); };
    var move = function(y) {
        if (!drag) return;
        var delta = y - sY;
        if (delta < 0 && delta > -450) { d.style.transform = 'translateY(' + delta + 'px)'; if (delta < -150) seen = true; }
    };
    var end = function() {
        if (!drag) return; drag = false; d.classList.add('gravity-fall'); d.style.transform = 'translateY(0)';
        if (seen) {
            setTimeout(function() {
                var actions = document.getElementById('local-reveal-actions');
                actions.classList.remove('opacity-0', 'pointer-events-none'); actions.classList.add('opacity-100', 'pointer-events-auto');
                if (lRevealIdx < lPlayers.length - 1) { document.getElementById('local-next-btn').classList.remove('hidden'); document.getElementById('local-next-btn').onclick = nextLocalReveal; document.getElementById('local-start-btn').classList.add('hidden'); } 
                else { document.getElementById('local-start-btn').classList.remove('hidden'); document.getElementById('local-start-btn').onclick = runLocalGame; document.getElementById('local-next-btn').classList.add('hidden'); }
            }, 300);
        }
    };
    d.onmousedown = function(e) { start(e.clientY); }; document.addEventListener('mousemove', function(e) { move(e.clientY); }); document.addEventListener('mouseup', end);
    d.addEventListener('touchstart', function(e) { start(e.touches[0].clientY); }, { passive: false });
    document.addEventListener('touchmove', function(e) { if (drag) { e.preventDefault(); move(e.touches[0].clientY); } }, { passive: false });
    document.addEventListener('touchend', end);
}
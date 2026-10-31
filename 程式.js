/* 程式.js — 畫面與互動 */
(function(){
  var T = window.TRIP, M = window.MAP;
  var app, nav, current = "prep";
  var V = null;                 // 這次繪製用的檢視模型
  var openStops = {};           // 哪些卡片是展開的（不進資料，純畫面狀態）

  /* ───────── 小工具 ───────── */
  function esc(s){ return String(s==null?"":s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
  function money(v){
    if(v === null || v === undefined || v === "" || isNaN(Number(v))) return "";
    return "NT$ " + Number(v).toLocaleString("zh-Hant-TW");
  }
  function blank(v, ph){
    return (v === null || v === undefined || v === "") ?
      '<span class="v blank">'+esc(ph||"—")+'</span>' : '<span class="v">'+esc(v)+'</span>';
  }
  function toast(msg){
    var old = document.querySelector(".toast"); if(old) old.remove();
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 2200);
  }
  function member(id){
    var m = V.members.filter(function(x){ return x.id === id; })[0];
    return m ? m.name : "（已移除）";
  }
  function findIn(list, id){ return list.filter(function(x){ return x.id === id; })[0]; }

  /* ───────── 自建對話框（不使用瀏覽器原生 alert / confirm / prompt） ───────── */
  var sheetStack = [];
  function sheet(html, onMount){
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">'+html+'</div>';
    document.body.appendChild(scrim);
    document.body.style.overflow = "hidden";
    var box = scrim.querySelector(".sheet");
    function close(){
      scrim.remove();
      sheetStack = sheetStack.filter(function(s){ return s !== scrim; });
      if(sheetStack.length === 0) document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e){ if(e.key === "Escape"){ e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey);
    scrim.addEventListener("click", function(e){ if(e.target === scrim) close(); });
    sheetStack.push(scrim);
    if(onMount) onMount(box, close);
    var first = box.querySelector("input,select,textarea");
    if(first) setTimeout(function(){ first.focus(); }, 40);
    return {box:box, close:close};
  }

  function confirmSheet(title, lead, okLabel){
    return new Promise(function(resolve){
      sheet(
        '<h3>'+esc(title)+'</h3>'+
        '<p class="lead">'+esc(lead||"")+'</p>'+
        '<div class="sheet-foot"><span class="spacer"></span>'+
        '<button class="btn" data-no>取消</button>'+
        '<button class="btn danger" data-yes>'+esc(okLabel||"確定刪除")+'</button></div>',
        function(box, close){
          box.querySelector("[data-no]").onclick = function(){ close(); resolve(false); };
          box.querySelector("[data-yes]").onclick = function(){ close(); resolve(true); };
          box.querySelector("[data-yes]").focus();
        }
      );
    });
  }
  function noteSheet(title, lead){
    return new Promise(function(resolve){
      sheet('<h3>'+esc(title)+'</h3><p class="lead">'+esc(lead||"")+'</p>'+
        '<div class="sheet-foot"><span class="spacer"></span>'+
        '<button class="btn primary" data-ok>我知道了</button></div>',
        function(box, close){
          box.querySelector("[data-ok]").onclick = function(){ close(); resolve(); };
        });
    });
  }

  /* ───────── 我是誰 ───────── */
  function askMe(force){
    var cur = T.me.get();
    if(cur && !force) return Promise.resolve();
    return new Promise(function(resolve){
    var opts = V.members.map(function(m){
      return '<option value="'+esc(m.name)+'"'+(m.name===cur?" selected":"")+'>'+
        esc(m.name)+'</option>';
    }).join("");
    sheet(
      '<h3>你是誰？</h3>'+
      '<p class="lead">只用來標記「最後由○○修改」，不是登入。'+
      '存在這台裝置上，可以隨時改。</p>'+
      '<div class="field"><label>從同行名單挑一個</label>'+
      '<select data-pick><option value="">（自己打名字）</option>'+opts+'</select></div>'+
      '<div class="field"><label>或自己打</label>'+
      '<input data-name value="'+esc(cur)+'" placeholder="例：阿豪" maxlength="12"></div>'+
      '<div class="sheet-foot"><span class="spacer"></span>'+
      '<button class="btn primary" data-ok>就是我</button></div>',
      function(box, close){
        var pick = box.querySelector("[data-pick]"), name = box.querySelector("[data-name]");
        pick.onchange = function(){ if(pick.value) name.value = pick.value; };
        box.querySelector("[data-ok]").onclick = function(){
          var v = name.value.trim();
          if(!v){ name.focus(); return; }
          T.me.set(v); close(); render(); resolve();
        };
      }
    );
    });
  }

  /* ───────── 分享連結 ───────── */
  function shareSheet(isNew){
    var link = T.shareLink();
    if(!link){
      return noteSheet("這份行程還沒接上後端",
        "現在資料只存在這台裝置裡，別人看不到。要共編的話，得先照「設定說明.md」把後端設定好。");
    }
    return new Promise(function(resolve){
    sheet(
      '<h3>'+(isNew?"行程開好了":"分享這份行程")+'</h3>'+
      '<p class="lead">把這條網址丟給同行的人。誰點開都能直接改，不用登入、不用辦帳號。'+
      '網址後面那串就是鑰匙，<b>別貼到公開的地方</b>。</p>'+
      '<div class="field"><label>行程網址</label>'+
      '<input data-link value="'+esc(link)+'" readonly spellcheck="false"></div>'+
      '<div class="sheet-foot"><span class="spacer"></span>'+
      '<button class="btn" data-close>關掉</button>'+
      '<button class="btn primary" data-copy>複製網址</button></div>',
      function(box, close){
        var inp = box.querySelector("[data-link]");
        inp.onclick = function(){ inp.select(); };
        box.querySelector("[data-close]").onclick = function(){ close(); resolve(); };
        box.querySelector("[data-copy]").onclick = function(){
          inp.select();
          var done = function(){ toast("複製好了，貼到群組吧"); close(); resolve(); };
          if(navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(inp.value).then(done, function(){
              toast("複製不了，請手動長按選取");
            });
          } else {
            try{ document.execCommand("copy"); done(); }
            catch(e){ toast("複製不了，請手動長按選取"); }
          }
        };
      }
    );
    });
  }

  /* ───────── 同步狀態列 ───────── */
  function renderStatus(){
    var el = document.getElementById("sync-pill");
    if(!el) return;
    var s = T.status, pend = T.pending;
    var txt, cls;
    if(s.state === "local"){ txt = "只存這台裝置"; cls = "warn"; }
    else if(s.state === "syncing"){ txt = "存檔中…"; cls = "busy"; }
    else if(s.state === "offline"){
      txt = pend ? ("連不上，"+pend+" 筆等著送") : "連不上";
      cls = "bad";
    }
    else { txt = pend ? ("還有 "+pend+" 筆要送") : ("已同步 "+(s.at?T.stamp(s.at.toISOString()):""));
           cls = pend ? "busy" : "ok"; }
    el.className = "ghost pill " + cls;
    el.textContent = txt;
    el.title = s.error || "";
  }

  /* ───────── 準備站 ───────── */
  function renderPrep(){
    var p = V.prep;
    var h = '<div class="station">';

    /* 待訂清單 */
    var doneN = p.todos.filter(function(t){ return t.done; }).length;
    h += sectHead("待訂清單", doneN+"/"+p.todos.length+" 已搞定");
    h += '<div class="panel">';
    h += p.todos.length ? '<ul class="rows">' + p.todos.map(function(t){
      return '<li class="'+(t.done?"done":"")+'" data-todo="'+t.id+'">'+
        tick(t.done, "todo-tick") +
        '<div class="body"><div class="t">'+esc(t.name)+
          (t.done?' <span class="stamp">已 訂</span>':'')+'</div>'+
          metaLine([ t.owner ? '<span class="who">'+esc(t.owner)+'</span> 負責' : "",
                     t.note ? esc(t.note) : "",
                     t.updatedBy ? "最後由 "+esc(t.updatedBy)+" 改於 "+T.stamp(t.updatedAt) : ""
                   ])+'</div>'+
        '<button class="x" data-edit-todo="'+t.id+'" title="編輯">✎</button>'+
        '<button class="x" data-del-todo="'+t.id+'" title="刪除">✕</button></li>';
    }).join("") + '</ul>' : '<div class="empty">清單空了。要訂的東西記在這裡。</div>';
    h += '<button class="addlink" data-add-todo>＋ 加一項要訂的</button>';
    h += '</div>';

    /* 出錢紀錄與分攤 */
    h += sectHead("出錢紀錄與分攤", p.expenses.length + " 筆支出");
    h += '<div class="panel">';
    h += '<div class="members">' + V.members.map(function(m){
      return '<span class="mtag">'+esc(m.name)+
        '<button class="x" data-del-member="'+m.id+'" title="移除">✕</button></span>';
    }).join("") + '<button class="mtag" data-add-member style="color:var(--ink-soft)">'+
      '＋ 加人</button></div>';

    h += p.expenses.length ? p.expenses.map(function(e){
      var names = (e.shares||[]).map(member);
      var allN = V.members.length;
      return '<div class="exp" data-exp="'+e.id+'">'+
        '<span class="who">'+esc(member(e.payer))+'</span>'+
        '<span class="what">'+esc(e.what||"（未註明）")+'</span>'+
        '<span class="amt num">'+esc(money(e.amount))+'</span>'+
        '<button class="x" data-edit-exp="'+e.id+'" title="編輯">✎</button>'+
        '<button class="x" data-del-exp="'+e.id+'" title="刪除">✕</button>'+
        '<span class="share">分給 '+
          (names.length===allN && allN ? "全部人" : esc(names.join("、") || "沒人"))+
          (e.updatedBy ? ' · 最後由 '+esc(e.updatedBy)+' 改於 '+T.stamp(e.updatedAt) : '')+
        '</span></div>';
    }).join("") : '<div class="empty">還沒有人出錢。誰先墊了就記一筆。</div>';
    h += '<button class="addlink" data-add-exp>＋ 記一筆支出</button>';

    var s = T.settle(V.members, p.expenses);
    if(p.expenses.length){
      h += s.moves.length ?
        '<ul class="settle">' + s.moves.map(function(m){
          return '<li>'+esc(m.from)+' <span class="arrow">要給</span> '+esc(m.to)+
            '<span class="amt num">$'+m.amount.toLocaleString("zh-Hant-TW")+'</span></li>';
        }).join("") + '</ul>'
        : '<div class="even">目前打平，誰都不用補。</div>';
      h += '<div class="balances">' + V.members.map(function(m){
        var v = Math.round(s.net[m.id] || 0);
        var cls = v > 0 ? "pos" : (v < 0 ? "neg" : "");
        return '<span class="'+cls+'">'+esc(m.name)+' <b>'+
          (v>0?"+":"")+v.toLocaleString("zh-Hant-TW")+'</b></span>';
      }).join("") + '</div>';
    }
    h += '</div>';

    /* 行前注意事項 */
    h += sectHead("行前注意事項", "別忘了");
    h += '<div class="panel warnish">';
    h += p.notices.length ? '<ul class="rows">' + p.notices.map(function(n){
      return '<li data-notice="'+n.id+'"><span class="tick" aria-hidden="true">'+
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" '+
        'stroke-width="1.4"><path d="M8 2.5 14.5 13.5h-13L8 2.5Z"/><path d="M8 6.5v3.2" '+
        'stroke-linecap="round"/><circle cx="8" cy="11.8" r=".8" fill="currentColor" '+
        'stroke="none"/></svg></span>'+
        '<div class="body"><div class="t">'+esc(n.text)+'</div>'+
        metaLine([ n.updatedBy ? "最後由 "+esc(n.updatedBy)+" 加於 "+T.stamp(n.updatedAt) : "" ])+
        '</div><button class="x" data-del-notice="'+n.id+'" title="刪除">✕</button></li>';
    }).join("") + '</ul>' : '<div class="empty">沒有注意事項。</div>';
    h += '<div class="addrow"><input data-new-notice placeholder="再提醒一件事…" maxlength="120">'+
      '<button data-add-notice>加上</button></div>';
    h += '</div>';

    /* 打包清單 */
    var pk = p.packing.filter(function(x){ return x.done; }).length;
    h += sectHead("打包清單", pk+"/"+p.packing.length+" 已放進包裡");
    h += '<div class="panel">';
    h += p.packing.length ? '<ul class="rows">' + p.packing.map(function(k){
      return '<li class="'+(k.done?"done":"")+'" data-pack="'+k.id+'">'+
        tick(k.done, "pack-tick")+
        '<div class="body"><div class="t">'+esc(k.name)+'</div>'+
        metaLine([ k.updatedBy ? "最後由 "+esc(k.updatedBy)+" 改於 "+T.stamp(k.updatedAt) : "" ])+
        '</div><button class="x" data-del-pack="'+k.id+'" title="刪除">✕</button></li>';
    }).join("") + '</ul>' : '<div class="empty">清單空了。</div>';
    h += '<div class="addrow"><input data-new-pack placeholder="還要帶什麼…" maxlength="40">'+
      '<button data-add-pack>加上</button></div>';
    h += '</div></div>';
    return h;
  }

  function sectHead(title, counter){
    return '<div class="sect"><div class="sect-head"><h2>'+esc(title)+'</h2>'+
      '<span class="rule"></span><span class="counter">'+counter+'</span></div>';
  }
  function metaLine(parts){
    var t = parts.filter(function(x){ return x; }).join(" · ");
    return t ? '<div class="m">'+t+'</div>' : '';
  }
  function tick(on, attr){
    var mark = on
      ? '<path d="M3 8.6 6.4 12 13 4.4" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/>';
    return '<button class="tick" data-'+attr+' aria-pressed="'+on+'" aria-label="'+
      (on?"取消打勾":"打勾")+'"><svg width="17" height="17" viewBox="0 0 16 16" fill="none" '+
      'stroke="currentColor" stroke-width="'+(on?2:1.3)+'">'+mark+'</svg></button>';
  }

  /* ───────── 每日站 ───────── */
  function renderDay(d){
    var n = d.stops.length;
    var unsure = d.stops.filter(function(s){ return T.UNSURE.indexOf(s.status) >= 0; }).length;
    var total = d.stops.reduce(function(a,s){
      return a + (Number(s.cost)||0) + (Number(s.leg && s.leg.fare)||0);
    }, 0);

    var h = '<div class="station">';
    h += '<div class="daysum">'+
      '<div class="cell"><div class="k">行程</div><div class="v num">'+n+' 筆</div></div>'+
      '<div class="cell'+(unsure>0?" alert":"")+'"><div class="k">未確認</div>'+
        '<div class="v num">'+unsure+' 筆</div></div>'+
      '<div class="cell"><div class="k">預估花費</div><div class="v num">'+
        (total>0 ? esc(money(total)) : "—")+'</div></div></div>';

    var map = d.onIsland ? M.island(d.stops) : M.ribbon(d.stops, d.from);
    h += '<div class="mapwrap'+(d.onIsland?" island":"")+'">'+map.html+
      '<div class="maplegend"><span class="verdict">'+esc(map.verdict)+'</span>'+
      '<span class="spacer"></span><span>'+esc(d.date.replace(/-/g,"."))+
      '（'+esc(d.weekday)+'）</span></div></div>';

    if(T.timeOrderBroken(d.id)){
      h += '<div class="fixrow"><button class="ghost" data-sorttime="'+d.id+'">'+
        '↕ 照時間重排</button><span class="fixhint">時間順序亂掉了</span></div>';
    }
    h += '<div class="timeline">';
    if(!n){
      h += '<div class="panel"><div class="empty">這天還全是空白。<br>'+
        '加一個點，地圖上就會多一個落腳處。</div></div>';
    }
    d.stops.forEach(function(s, i){
      var prev = i === 0 ? (d.from || "出發") : (d.stops[i-1].name || "上一站");
      h += renderLeg(prev, s, d.id);
      h += renderStop(s, i+1, d.id);
    });
    h += '<button class="addlink" data-add-stop="'+d.id+'">＋ 加一個點</button>';
    h += '</div></div>';
    return h;
  }

  function renderLeg(prev, s, dayId){
    var L = s.leg || {};
    var has = L.mode || L.duration || (L.fare !== null && L.fare !== undefined && L.fare !== "");
    var bits = [];
    if(L.mode) bits.push(esc(L.mode));
    if(L.duration) bits.push(esc(L.duration));
    if(L.fare !== null && L.fare !== undefined && L.fare !== "") bits.push(esc(money(L.fare)));
    return '<div class="leg'+(has?"":" noleg")+'" data-edit-stop="'+s.id+'" data-day="'+dayId+
      '" role="button" tabindex="0" title="編輯這一段">'+
      '<span class="ico">'+M.icon(L.mode||"")+'</span>'+
      '<span class="txt"><span class="route-txt">'+esc(prev)+' → '+esc(s.name||"（未命名）")+
      '</span>'+(bits.length ? '<span class="meta">'+bits.join(" · ")+'</span>'
                 : '<span class="meta">怎麼過來的還沒填</span>')+'</span></div>';
  }

  function renderStop(s, seq, dayId){
    var isOpen = !!openStops[s.id];
    var h = '<div class="stopcard'+(isOpen?" open":"")+'" data-stop="'+s.id+
      '" data-day="'+dayId+'">';
    h += '<div class="card-top">';
    h += '<span class="grip" data-grip="'+s.id+'" title="按住拖曳可調整順序" '+
         'role="button" tabindex="-1" aria-label="拖曳調整順序">'+
         '<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" '+
         'aria-hidden="true"><circle cx="4" cy="4" r="1.3"/><circle cx="8" cy="4" r="1.3"/>'+
         '<circle cx="4" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/>'+
         '<circle cx="4" cy="12" r="1.3"/><circle cx="8" cy="12" r="1.3"/></svg></span>';
    h += '<button class="card-head" data-toggle="'+s.id+'" aria-expanded="'+isOpen+'">'+
      '<span class="tbar" style="background:var(--t-'+esc(s.type)+')"></span>'+
      '<span class="seq num">'+seq+'</span>'+
      (s.time ? '<span class="time num">'+esc(s.time)+'</span>' : '<span class="time">—</span>')+
      '<span class="nm'+(s.name?"":" todo")+'">'+esc(s.name||"（未命名）")+'</span>'+
      '<span class="chip type" style="color:var(--t-'+esc(s.type)+')">'+esc(s.type)+'</span>'+
      '<span class="chip s-'+esc(s.status)+'">'+esc(s.status)+'</span>'+
      (s.notes ? '<span class="bell" title="有注意事項"></span>' : '')+
      '<span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" '+
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M4 2.5 8 6l-4 3.5"/></svg></span></button>';
    h += '</div>';

    if(isOpen){
      h += '<div class="card-body">';
      h += '<div class="facts">'+
        '<div class="fact"><span class="k">地點</span>'+blank(s.location,"沒填")+'</div>'+
        '<div class="fact"><span class="k">花費</span>'+
          ((s.cost===null||s.cost===undefined||s.cost==="")
            ? '<span class="v blank">待查</span>'
            : '<span class="v num">'+esc(money(s.cost))+'</span>')+'</div>'+
        '<div class="fact"><span class="k">負責人</span>'+blank(s.owner,"沒人")+'</div></div>';
      if(s.notes){
        h += '<div class="note"><div class="k">注意事項</div><p>'+esc(s.notes)+'</p></div>';
      }
      h += '<div class="card-foot"><span>'+
        (s.updatedBy ? '最後由 '+esc(s.updatedBy)+' 改於 '+T.stamp(s.updatedAt)
                     : '還沒有人改過')+
        '</span><span class="spacer"></span>'+
        '<button class="ghost" data-edit-stop="'+s.id+'" data-day="'+dayId+'">編輯</button>'+
        '<button class="ghost" data-del-stop="'+s.id+'" data-day="'+dayId+'">刪除</button>'+
        '</div></div>';
    }
    h += '</div>';
    return h;
  }

  /* ───────── 表單：站 ───────── */
  function stopSheet(dayId, stopId){
    var day = findIn(V.days, dayId);
    if(!day) return;
    var isNew = !stopId;
    var s = isNew ? null : findIn(day.stops, stopId);
    var v = s || {time:"", type:"景點", name:"", location:"", cost:null, status:"待查",
                  owner:"", notes:"", spot:null, leg:{mode:"", duration:"", fare:null}};

    function opts(list, cur){
      return list.map(function(x){
        return '<option'+(x===cur?" selected":"")+'>'+esc(x)+'</option>';
      }).join("");
    }
    var spotOpts = '<option value="">（不放地圖上）</option>' + M.SPOTS.map(function(sp){
      return '<option value="'+sp.id+'"'+(sp.id===v.spot?" selected":"")+'>'+
        esc(sp.name)+'</option>';
    }).join("");

    sheet(
      '<h3>'+(isNew?"加一個點":"編輯這個點")+'</h3>'+
      '<p class="lead">'+esc(day.short+" · "+day.place)+
        '。不確定的欄位就留空，別填沒查過的數字。</p>'+
      '<div class="field"><label>名稱</label>'+
        '<input data-f="name" value="'+esc(v.name)+'" placeholder="例：花瓶石" '+
        'maxlength="40"></div>'+
      '<div class="grid2">'+
        '<div class="field"><label>時間</label>'+
          '<input data-f="time" type="time" value="'+esc(v.time)+'"></div>'+
        '<div class="field"><label>類型</label><select data-f="type">'+
          opts(T.TYPES, v.type)+'</select></div>'+
        '<div class="field"><label>狀態</label><select data-f="status">'+
          opts(T.STATUSES, v.status)+'</select></div>'+
      '</div>'+
      '<div class="grid2">'+
        '<div class="field"><label>地點</label>'+
          '<input data-f="location" value="'+esc(v.location)+'" maxlength="60"></div>'+
        '<div class="field"><label>預估花費</label>'+
          '<input data-f="cost" type="number" min="0" step="10" inputmode="numeric" '+
          'value="'+(v.cost===null||v.cost===undefined?"":esc(v.cost))+'" '+
          'placeholder="留空＝待查"></div>'+
        '<div class="field"><label>負責人</label>'+
          '<input data-f="owner" value="'+esc(v.owner)+'" maxlength="12" '+
          'list="member-list"></div>'+
      '</div>'+
      (day.onIsland ?
        '<div class="field"><label>在島上的哪裡（決定地圖落點）</label>'+
        '<select data-f="spot">'+spotOpts+'</select></div>' : '')+
      '<fieldset class="fieldset"><legend>怎麼過來的</legend><div class="grid2">'+
        '<div class="field"><label>交通工具</label><select data-f="leg.mode">'+
          '<option value="">（沒填）</option>'+opts(T.MODES, v.leg.mode)+'</select></div>'+
        '<div class="field"><label>所需時間</label>'+
          '<input data-f="leg.duration" value="'+esc(v.leg.duration)+'" '+
          'placeholder="例：約 25 分" maxlength="24"></div>'+
        '<div class="field"><label>車資／船票</label>'+
          '<input data-f="leg.fare" type="number" min="0" step="10" inputmode="numeric" '+
          'value="'+(v.leg.fare===null||v.leg.fare===undefined?"":esc(v.leg.fare))+'" '+
          'placeholder="留空＝待查"></div>'+
      '</div></fieldset>'+
      '<div class="field"><label>注意事項</label>'+
        '<textarea data-f="notes" placeholder="有雷、有限制、要先約的寫這裡" '+
        'maxlength="500">'+esc(v.notes)+'</textarea></div>'+
      '<div class="sheet-foot"><span class="spacer"></span>'+
      '<button class="btn" data-cancel>取消</button>'+
      '<button class="btn primary" data-save>'+(isNew?"加進去":"存起來")+'</button></div>',
      function(box, close){
        box.querySelector("[data-cancel]").onclick = close;
        box.querySelector("[data-save]").onclick = function(){
          var g = function(k){ var e = box.querySelector('[data-f="'+k+'"]'); return e?e.value:""; };
          var num = function(k){ var x = g(k).trim(); return x === "" ? null : Number(x); };
          var nameV = g("name").trim();
          if(!nameV){ box.querySelector('[data-f="name"]').focus(); return; }

          var id = isNew ? T.uid() : stopId;
          var rec = isNew ? null : T.get("stop", id);
          var data = rec ? JSON.parse(JSON.stringify(rec.data)) : {dayId:dayId};
          data.dayId   = dayId;
          data.name    = nameV;
          data.time    = g("time");
          data.type    = g("type");
          data.status  = g("status");
          data.location= g("location").trim();
          data.cost    = num("cost");
          data.owner   = g("owner").trim();
          data.notes   = g("notes").trim();
          data.spot    = day.onIsland ? (g("spot") || null) : (data.spot || null);
          data.leg     = {mode:g("leg.mode"), duration:g("leg.duration").trim(),
                          fare:num("leg.fare")};
          T.put("stop", id, data);
          /* 有填時間就自動插到時間對的位置，不要丟到最後面 */
          var slot = T.slotForTime(dayId, data.time, id);
          if(slot !== undefined) T.placeStop(dayId, id, slot);
          toast(isNew ? "加好了" : "存起來了");
          close(); render();
        };
      }
    );
  }

  /* ───────── 表單：待訂項目 ───────── */
  function todoSheet(id){
    var isNew = !id;
    var t = isNew ? {name:"", owner:"", note:"", done:false} : findIn(V.prep.todos, id);
    if(!t) return;
    sheet(
      '<h3>'+(isNew?"加一項要訂的":"編輯這一項")+'</h3>'+
      '<div class="field"><label>要訂什麼</label>'+
        '<input data-f="name" value="'+esc(t.name)+'" maxlength="60"></div>'+
      '<div class="grid2">'+
        '<div class="field"><label>誰負責</label>'+
          '<input data-f="owner" value="'+esc(t.owner)+'" maxlength="12" '+
          'list="member-list"></div>'+
        '<div class="field"><label>備註</label>'+
          '<input data-f="note" value="'+esc(t.note)+'" maxlength="80"></div>'+
      '</div>'+
      '<div class="sheet-foot"><span class="spacer"></span>'+
      '<button class="btn" data-cancel>取消</button>'+
      '<button class="btn primary" data-save>'+(isNew?"加進去":"存起來")+'</button></div>',
      function(box, close){
        box.querySelector("[data-cancel]").onclick = close;
        box.querySelector("[data-save]").onclick = function(){
          var g = function(k){ return box.querySelector('[data-f="'+k+'"]').value.trim(); };
          if(!g("name")){ box.querySelector('[data-f="name"]').focus(); return; }
          var tid = isNew ? T.uid() : id;
          var rec = isNew ? null : T.get("todo", tid);
          var data = rec ? JSON.parse(JSON.stringify(rec.data)) : {done:false};
          data.name = g("name"); data.owner = g("owner"); data.note = g("note");
          T.put("todo", tid, data);
          toast(isNew ? "加好了" : "存起來了"); close(); render();
        };
      }
    );
  }

  /* ───────── 表單：支出 ───────── */
  function expSheet(id){
    var ms = V.members;
    if(!ms.length){ toast("先加人，才有人可以分攤"); return; }
    var isNew = !id;
    var e = isNew ? {payer:ms[0].id, what:"", amount:null,
                     shares:ms.map(function(m){ return m.id; })}
                  : findIn(V.prep.expenses, id);
    if(!e) return;
    sheet(
      '<h3>'+(isNew?"記一筆支出":"編輯這筆支出")+'</h3>'+
      '<p class="lead">金額填數字，才加得起來。</p>'+
      '<div class="grid2">'+
        '<div class="field"><label>誰付的</label><select data-f="payer">'+
          ms.map(function(m){
            return '<option value="'+m.id+'"'+(m.id===e.payer?" selected":"")+'>'+
              esc(m.name)+'</option>';
          }).join("")+'</select></div>'+
        '<div class="field"><label>金額</label>'+
          '<input data-f="amount" type="number" min="0" step="1" inputmode="numeric" '+
          'value="'+(e.amount===null||e.amount===undefined?"":esc(e.amount))+'"></div>'+
      '</div>'+
      '<div class="field"><label>付了什麼</label>'+
        '<input data-f="what" value="'+esc(e.what)+'" placeholder="例：民宿兩晚" '+
        'maxlength="60"></div>'+
      '<fieldset class="fieldset"><legend>這筆分給誰</legend><div class="checks">'+
        ms.map(function(m){
          var on = (e.shares||[]).indexOf(m.id) >= 0;
          return '<label><input type="checkbox" data-share="'+m.id+'"'+
            (on?" checked":"")+'>'+esc(m.name)+'</label>';
        }).join("")+'</div></fieldset>'+
      '<div class="sheet-foot"><span class="spacer"></span>'+
      '<button class="btn" data-cancel>取消</button>'+
      '<button class="btn primary" data-save>'+(isNew?"記下來":"存起來")+'</button></div>',
      function(box, close){
        box.querySelector("[data-cancel]").onclick = close;
        box.querySelector("[data-save]").onclick = function(){
          var amtEl = box.querySelector('[data-f="amount"]');
          var amt = Number(amtEl.value);
          if(!amtEl.value.trim() || isNaN(amt) || amt <= 0){ amtEl.focus(); return; }
          var shares = [].slice.call(box.querySelectorAll("[data-share]"))
            .filter(function(c){ return c.checked; })
            .map(function(c){ return c.getAttribute("data-share"); });
          if(!shares.length){ toast("至少要分給一個人"); return; }
          var eid = isNew ? T.uid() : id;
          var rec = isNew ? null : T.get("expense", eid);
          var data = rec ? JSON.parse(JSON.stringify(rec.data)) : {};
          data.payer  = box.querySelector('[data-f="payer"]').value;
          data.amount = amt;
          data.what   = box.querySelector('[data-f="what"]').value.trim();
          data.shares = shares;
          T.put("expense", eid, data);
          toast(isNew ? "記下來了" : "存起來了"); close(); render();
        };
      }
    );
  }

  function memberSheet(){
    sheet(
      '<h3>加一個同行的人</h3>'+
      '<p class="lead">加進來之後就能參與分攤。</p>'+
      '<div class="field"><label>名字</label><input data-f="name" maxlength="12"></div>'+
      '<div class="sheet-foot"><span class="spacer"></span>'+
      '<button class="btn" data-cancel>取消</button>'+
      '<button class="btn primary" data-save>加進來</button></div>',
      function(box, close){
        box.querySelector("[data-cancel]").onclick = close;
        box.querySelector("[data-save]").onclick = function(){
          var el = box.querySelector('[data-f="name"]'), n = el.value.trim();
          if(!n){ el.focus(); return; }
          T.put("member", T.uid(), {name:n});
          toast(n+" 加進來了"); close(); render();
        };
      }
    );
  }

  /* ───────── 畫面 ───────── */
  function render(){
    V = T.view();
    renderNav();
    renderStatus();
    var who = T.me.get();
    var wb = document.getElementById("whoami");
    if(wb) wb.textContent = who ? "我是 "+who : "你是誰？";
    syncMemberList();

    if(current === "prep"){ app.innerHTML = renderPrep(); }
    else {
      var d = findIn(V.days, current);
      app.innerHTML = d ? renderDay(d) : '<div class="empty">找不到這一站。</div>';
    }
  }

  function syncMemberList(){
    var dl = document.getElementById("member-list");
    if(!dl) return;
    dl.innerHTML = V.members.map(function(m){
      return '<option value="'+esc(m.name)+'">';
    }).join("");
  }

  function stations(){
    return [{key:"prep", top:"準備", bot:"行前"}].concat(
      V.days.map(function(d){ return {key:d.id, top:d.short, bot:d.place}; })
    );
  }
  function renderNav(){
    nav.innerHTML = '<div class="route-scroll"><div class="route-rail">' +
      stations().map(function(s){
        var on = s.key === current;
        return '<button class="stop-btn" data-go="'+s.key+'" aria-current="'+on+'">'+
          '<span class="flag">'+M.flag()+'</span>'+
          '<span class="dot"></span>'+
          '<span class="lbl"><b>'+esc(s.top)+'</b>'+esc(s.bot)+'</span></button>';
      }).join("") + '</div></div>';
    var on = nav.querySelector('[aria-current="true"]');
    if(on) on.scrollIntoView({block:"nearest", inline:"center", behavior:"smooth"});
  }

  function go(key){
    if(key === current) return;
    current = key;
    render();
    window.scrollTo({top:0, behavior:"smooth"});
  }
  function currentDay(){ return findIn(V.days, current); }

  /* ───────── 事件（委派） ───────── */
  document.addEventListener("click", function(ev){
    var t = ev.target.closest ? ev.target.closest(
      "[data-go],[data-toggle],[data-edit-stop],[data-del-stop],[data-add-stop],"+
      "[data-todo-tick],[data-pack-tick],[data-del-todo],[data-edit-todo],[data-add-todo],"+
      "[data-add-exp],[data-edit-exp],[data-del-exp],[data-add-member],[data-del-member],"+
      "[data-add-notice],[data-del-notice],[data-add-pack],[data-del-pack],"+
      "[data-theme],[data-whoami],[data-share],[data-sorttime]") : null;
    if(!t || !V) return;
    var g = function(k){ return t.getAttribute(k); };
    var p = V.prep;

    if(g("data-go") !== null){ go(g("data-go")); return; }
    if(g("data-whoami") !== null){ askMe(true); return; }
    if(g("data-share") !== null){ shareSheet(false); return; }
    if(g("data-theme") !== null){ cycleTheme(); return; }
    if(g("data-sorttime")){ T.sortDayByTime(g("data-sorttime")); toast("照時間排好了"); render(); return; }

    /* 站 */
    if(g("data-toggle")){
      var sid = g("data-toggle");
      openStops[sid] = !openStops[sid];
      render(); return;
    }
    if(g("data-edit-stop")){ stopSheet(g("data-day") || current, g("data-edit-stop")); return; }
    if(g("data-add-stop")){ stopSheet(g("data-add-stop"), null); return; }
    if(g("data-del-stop")){
      var dd = findIn(V.days, g("data-day") || current);
      var ss = dd && findIn(dd.stops, g("data-del-stop"));
      if(!ss) return;
      confirmSheet("要刪掉「"+(ss.name||"未命名")+"」嗎？",
        "這個點會從時間線和地圖上消失，同行的人那邊也會跟著消失。").then(function(ok){
        if(!ok) return;
        T.remove("stop", ss.id); delete openStops[ss.id];
        toast("刪掉了"); render();
      });
      return;
    }

    /* 待訂 */
    if(g("data-add-todo") !== null){ todoSheet(null); return; }
    if(g("data-edit-todo")){ todoSheet(g("data-edit-todo")); return; }
    if(g("data-todo-tick") !== null){
      var li = t.closest("[data-todo]"), id = li.getAttribute("data-todo");
      var rec = T.get("todo", id); if(!rec) return;
      var d2 = JSON.parse(JSON.stringify(rec.data)); d2.done = !d2.done;
      T.put("todo", id, d2); render(); return;
    }
    if(g("data-del-todo")){
      var td = findIn(p.todos, g("data-del-todo")); if(!td) return;
      confirmSheet("要刪掉「"+td.name+"」嗎？", "從待訂清單移除。").then(function(ok){
        if(!ok) return;
        T.remove("todo", td.id); toast("刪掉了"); render();
      });
      return;
    }

    /* 支出 / 成員 */
    if(g("data-add-exp") !== null){ expSheet(null); return; }
    if(g("data-edit-exp")){ expSheet(g("data-edit-exp")); return; }
    if(g("data-del-exp")){
      var ex = findIn(p.expenses, g("data-del-exp")); if(!ex) return;
      confirmSheet("要刪掉這筆支出嗎？",
        member(ex.payer)+" 付的 "+money(ex.amount)+"（"+(ex.what||"未註明")+"）。結算會跟著變。")
        .then(function(ok){
          if(!ok) return;
          T.remove("expense", ex.id); toast("刪掉了"); render();
        });
      return;
    }
    if(g("data-add-member") !== null){ memberSheet(); return; }
    if(g("data-del-member")){
      var mid = g("data-del-member"), mm = findIn(V.members, mid); if(!mm) return;
      var paid = p.expenses.filter(function(e){ return e.payer === mid; });
      if(paid.length){
        noteSheet("先處理 "+mm.name+" 付過的錢",
          mm.name+" 還有 "+paid.length+" 筆支出掛在名下。先把那幾筆刪掉或改成別人付，"+
          "才能移除這個人，不然結算會對不起來。");
        return;
      }
      confirmSheet("要把 "+mm.name+" 移除嗎？", "也會從所有支出的分攤名單裡退出。")
        .then(function(ok){
          if(!ok) return;
          T.remove("member", mid);
          p.expenses.forEach(function(e){
            if((e.shares||[]).indexOf(mid) < 0) return;
            var rec = T.get("expense", e.id); if(!rec) return;
            var d3 = JSON.parse(JSON.stringify(rec.data));
            d3.shares = (d3.shares||[]).filter(function(x){ return x !== mid; });
            T.put("expense", e.id, d3);
          });
          toast("移除了"); render();
        });
      return;
    }

    /* 注意事項 */
    if(g("data-add-notice") !== null){
      var ni = document.querySelector("[data-new-notice]"), tx = ni.value.trim();
      if(!tx){ ni.focus(); return; }
      T.put("notice", T.uid(), {text:tx});
      toast("加上了"); render(); return;
    }
    if(g("data-del-notice")){
      var nn = findIn(p.notices, g("data-del-notice")); if(!nn) return;
      confirmSheet("要刪掉這則提醒嗎？", nn.text).then(function(ok){
        if(!ok) return;
        T.remove("notice", nn.id); toast("刪掉了"); render();
      });
      return;
    }

    /* 打包 */
    if(g("data-add-pack") !== null){
      var pi = document.querySelector("[data-new-pack]"), pv = pi.value.trim();
      if(!pv){ pi.focus(); return; }
      T.put("pack", T.uid(), {name:pv, done:false});
      toast("加上了"); render(); return;
    }
    if(g("data-pack-tick") !== null){
      var pl = t.closest("[data-pack]"), pid = pl.getAttribute("data-pack");
      var prec = T.get("pack", pid); if(!prec) return;
      var d4 = JSON.parse(JSON.stringify(prec.data)); d4.done = !d4.done;
      T.put("pack", pid, d4); render(); return;
    }
    if(g("data-del-pack")){
      var dk = findIn(p.packing, g("data-del-pack")); if(!dk) return;
      confirmSheet("要刪掉「"+dk.name+"」嗎？", "從打包清單移除。").then(function(ok){
        if(!ok) return;
        T.remove("pack", dk.id); toast("刪掉了"); render();
      });
      return;
    }
  });

  document.addEventListener("keydown", function(ev){
    if(ev.key !== "Enter") return;
    var el = ev.target;
    if(el.hasAttribute && el.hasAttribute("data-new-notice")){
      ev.preventDefault(); document.querySelector("[data-add-notice]").click();
    }
    if(el.hasAttribute && el.hasAttribute("data-new-pack")){
      ev.preventDefault(); document.querySelector("[data-add-pack]").click();
    }
    if(el.classList && el.classList.contains("leg")){ ev.preventDefault(); el.click(); }
  });

  /* ───────── 拖曳調整順序 ─────────
     不用 HTML5 drag：那個在觸控裝置上根本不會觸發。
     只在握把上抓（握把 touch-action:none），其他地方照常捲動。 */
  var drag = null;

  function cardsInTimeline(){
    return [].slice.call(document.querySelectorAll(".timeline .stopcard"));
  }

  document.addEventListener("pointerdown", function(e){
    var grip = e.target.closest && e.target.closest("[data-grip]");
    if(!grip) return;
    var card = grip.closest(".stopcard");
    if(!card) return;
    var cards = cardsInTimeline();
    if(cards.length < 2) return;             // 只有一張不用拖

    e.preventDefault();
    grip.setPointerCapture(e.pointerId);

    var line = document.createElement("div");
    line.className = "drop-line";
    drag = {id:card.getAttribute("data-stop"), dayId:card.getAttribute("data-day"),
            card:card, grip:grip, line:line, beforeId:null, moved:false,
            y:e.clientY, raf:0};
    card.classList.add("dragging");
    document.body.classList.add("dragging-now");
    autoScroll();
  });

  /* 拖到畫面邊緣就自動捲動。握把是 touch-action:none，
     手機上拖的時候沒辦法自己捲，沒有這個就拖不過一個螢幕。 */
  function autoScroll(){
    if(!drag) return;
    var EDGE = 90, MAX = 18;
    var y = drag.y, h = window.innerHeight, dy = 0;
    if(y < EDGE)            dy = -MAX * (1 - y / EDGE);
    else if(y > h - EDGE)   dy =  MAX * (1 - (h - y) / EDGE);
    if(dy) window.scrollBy(0, dy);
    drag.raf = requestAnimationFrame(autoScroll);
  }

  document.addEventListener("pointermove", function(e){
    if(!drag) return;
    drag.moved = true;
    drag.y = e.clientY;
    var cards = cardsInTimeline(), before = null, target = null;
    for(var i=0;i<cards.length;i++){
      if(cards[i] === drag.card) continue;
      var r = cards[i].getBoundingClientRect();
      if(e.clientY < r.top + r.height/2){
        before = cards[i].getAttribute("data-stop");
        target = cards[i];
        break;
      }
    }
    drag.beforeId = before;
    if(target) target.parentNode.insertBefore(drag.line, target);
    else {
      var last = cards[cards.length-1];
      if(last === drag.card) last = cards[cards.length-2];
      if(last) last.parentNode.insertBefore(drag.line, last.nextSibling);
    }
  });

  function endDrag(){
    if(!drag) return;
    var d = drag; drag = null;
    if(d.raf) cancelAnimationFrame(d.raf);
    d.card.classList.remove("dragging");
    document.body.classList.remove("dragging-now");
    if(d.line.parentNode) d.line.parentNode.removeChild(d.line);
    if(!d.moved) return;
    T.placeStop(d.dayId, d.id, d.beforeId);
    render();
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  /* ───────── 主題 ───────── */
  var TKEY = "小琉球行程-主題";
  function applyTheme(v){
    var r = document.documentElement;
    if(v === "light" || v === "dark") r.setAttribute("data-theme", v);
    else r.removeAttribute("data-theme");
    var b = document.getElementById("theme-btn");
    if(b) b.textContent = v === "light" ? "☀ 淺色" : (v === "dark" ? "☾ 深色" : "◐ 跟著系統");
  }
  function cycleTheme(){
    var cur = "";
    try{ cur = localStorage.getItem(TKEY) || ""; }catch(e){}
    var next = cur === "" ? "light" : (cur === "light" ? "dark" : "");
    try{ localStorage.setItem(TKEY, next); }catch(e){}
    applyTheme(next);
  }

  /* ───────── 啟動 ───────── */
  document.addEventListener("DOMContentLoaded", function(){
    app = document.getElementById("app");
    nav = document.getElementById("route");
    var saved = "";
    try{ saved = localStorage.getItem(TKEY) || ""; }catch(e){}
    applyTheme(saved);

    app.innerHTML = '<div class="empty">載入中…</div>';

    T.onChange(function(){
      if(!V) return;
      renderStatus();
    });

    T.boot().then(function(r){
      render();
      T.startPolling(12000);

      /* 同行的人改了東西，拉回來之後重畫 */
      T.onRemoteChange(function(){
        render();
        toast("有人更新了行程");
      });

      /* 對話框一次只開一個：先認人，再給連結 */
      if(r.mode === "empty"){
        noteSheet("這條連結上沒有資料",
          "可能是網址被截斷了，或這份行程還沒建立。跟給你連結的人確認一次完整網址。");
      } else {
        askMe(false).then(function(){
          if(r.mode === "new") shareSheet(true);
        });
      }
    }, function(err){
      app.innerHTML = '<div class="panel"><div class="empty">載入失敗：'+
        esc(err && err.message || "不明原因")+'</div></div>';
    });
  });
})();

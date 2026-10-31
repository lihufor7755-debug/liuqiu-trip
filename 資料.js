/* 資料.js — 資料模型、預設內容、同步
   每一筆資料獨立成一列（kind + id），各自記 updatedBy / updatedAt。
   兩個人同時改「不同筆」不會互相蓋掉；同時改「同一筆」才是後寫的勝出。
   刪除留墓碑，否則別人那邊同步不到「這筆被刪了」。 */

window.TRIP = (function(){

  var CACHE_KEY = "小琉球行程-快取-v2";
  var ME_KEY    = "小琉球行程-我是誰";

  var TYPES    = ["景點","吃飯","移動","住宿","活動","雜事"];
  var STATUSES = ["待查","待訂","已訂","免預約"];
  var MODES    = ["機車","步行","汽車","客運","接駁車","計程車","交通船","高鐵","腳踏車","飛機"];
  var UNSURE   = ["待查","待訂"];

  var seqCounter = 0;
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function nextSeq(){ return Date.now() * 1000 + (seqCounter++ % 1000); }

  /* ───────── 狀態 ───────── */
  var recs   = {};      // "kind/id" -> {kind, item_id, data, deleted, updated_by, updated_at}
  var dirty  = {};      // 還沒送出去的 key
  var cursor = null;    // 上次同步到的伺服器時間
  var tripId = "";
  var status = {state:"local", at:null, error:""};
  var listeners = [];       // 狀態列
  var remoteHooks = [];     // 遠端資料真的變了

  function key(kind, id){ return kind + "/" + id; }

  /* 時間戳一律換成毫秒再比。資料庫回的是 ...+00:00，瀏覽器產的是 ...Z，
     兩種字串直接比大小會比錯。 */
  function tms(iso){ var n = Date.parse(iso); return isNaN(n) ? 0 : n; }
  function newer(a, b){ return tms(a) > tms(b); }
  function emit(){ listeners.forEach(function(f){ try{ f(); }catch(e){} }); }
  function onChange(f){ listeners.push(f); }
  function onRemoteChange(f){ remoteHooks.push(f); }
  function emitRemote(){ remoteHooks.forEach(function(f){ try{ f(); }catch(e){} }); }

  /* ───────── 身分（只用於顯示「最後由○○修改」） ───────── */
  var ME = {
    get:function(){ try{ return localStorage.getItem(ME_KEY) || ""; }catch(e){ return ""; } },
    set:function(n){ try{ localStorage.setItem(ME_KEY, n); }catch(e){} }
  };

  /* ───────── 讀寫單筆 ───────── */
  function get(kind, id){
    var r = recs[key(kind,id)];
    return (r && !r.deleted) ? r : null;
  }
  function all(kind){
    var out = [];
    for(var k in recs){
      var r = recs[k];
      if(r.kind === kind && !r.deleted) out.push(r);
    }
    out.sort(function(a,b){ return (a.data.seq||0) - (b.data.seq||0); });
    return out;
  }
  function put(kind, id, data){
    var k = key(kind, id), old = recs[k];
    if(!data.seq) data.seq = (old && old.data.seq) || nextSeq();
    recs[k] = {
      kind:kind, item_id:id, data:data, deleted:false,
      updated_by: ME.get() || "某人",
      updated_at: new Date().toISOString()
    };
    dirty[k] = true;
    saveCache(); schedulePush();
    return recs[k];
  }
  function remove(kind, id){
    var k = key(kind, id), old = recs[k];
    if(!old) return;
    recs[k] = {
      kind:kind, item_id:id, data:old.data, deleted:true,
      updated_by: ME.get() || "某人",
      updated_at: new Date().toISOString()
    };
    dirty[k] = true;
    saveCache(); schedulePush();
  }

  /* ───────── 檢視模型（畫面用的巢狀形狀） ───────── */
  function view(){
    var days = all("day").map(function(r){
      var d = JSON.parse(JSON.stringify(r.data));
      d.id = r.item_id;
      d.stops = [];
      return d;
    });
    var byDay = {};
    days.forEach(function(d){ byDay[d.id] = d; });

    all("stop").forEach(function(r){
      var s = JSON.parse(JSON.stringify(r.data));
      s.id = r.item_id;
      s.updatedBy = r.updated_by; s.updatedAt = r.updated_at;
      if(!s.leg) s.leg = {mode:"", duration:"", fare:null};
      var d = byDay[s.dayId];
      if(d) d.stops.push(s);
    });

    function list(kind){
      return all(kind).map(function(r){
        var o = JSON.parse(JSON.stringify(r.data));
        o.id = r.item_id;
        o.updatedBy = r.updated_by; o.updatedAt = r.updated_at;
        return o;
      });
    }

    return {
      members: list("member"),
      prep: {
        todos:    list("todo"),
        expenses: list("expense"),
        notices:  list("notice"),
        packing:  list("pack")
      },
      days: days
    };
  }

  /* ───────── 預設內容 ───────── */
  function seed(){
    var base = Date.now() * 1000, n = 0;
    function s(){ return base + (n++); }

    ["魏翌涵","馮千豪","蔡舜仰","卓羽婕","陳姝亨"].forEach(function(name){
      raw("member", uid(), {seq:s(), name:name});
    });

    [ "高鐵票（台北 → 左營）", "高雄住一晚", "東港 ↔ 小琉球來回船票",
      "小琉球民宿兩晚", "島上機車（需帶駕照）",
      "浮潛或潮間帶導覽（須配合潮汐時間）", "回程高鐵票（左營 → 台北）"
    ].forEach(function(name){
      raw("todo", uid(), {seq:s(), name:name, owner:"", note:"", done:false});
    });

    [ "機車駕照一定要帶正本，島上租車會查。",
      "會暈船的話，上船前半小時吃暈船藥。",
      "潮間帶導覽時間綁潮汐，不是想去就能去，要先查當天退潮時間再排。",
      "島上部分店家只收現金，上島前先領錢。"
    ].forEach(function(text){
      raw("notice", uid(), {seq:s(), text:text});
    });

    [ "駕照正本","泳衣防磨衣","防曬（海洋友善）","乾濕分離袋",
      "暈船藥","現金","行動電源"
    ].forEach(function(name){
      raw("pack", uid(), {seq:s(), name:name, done:false});
    });

    var days = [
      {id:"d1126", short:"11/26", date:"2026-11-26", weekday:"四",
       place:"高雄",   from:"台北", onIsland:false},
      {id:"d1127", short:"11/27", date:"2026-11-27", weekday:"五",
       place:"小琉球", from:"高雄", onIsland:true},
      {id:"d1128", short:"11/28", date:"2026-11-28", weekday:"六",
       place:"小琉球", from:"民宿", onIsland:true},
      {id:"d1129", short:"11/29", date:"2026-11-29", weekday:"日",
       place:"回台北", from:"民宿", onIsland:false}
    ];
    days.forEach(function(d){
      var id = d.id; delete d.id; d.seq = s();
      raw("day", id, d);
    });

    function stop(dayId, o){
      raw("stop", uid(), {
        seq:s(), dayId:dayId,
        time:o.time||"", type:o.type||"雜事", name:o.name||"",
        location:o.location||"", cost:(o.cost===0||o.cost)?o.cost:null,
        status:o.status||"待查", owner:o.owner||"", notes:o.notes||"",
        spot:o.spot||null,
        leg:{mode:(o.leg&&o.leg.mode)||"",
             duration:(o.leg&&o.leg.duration)||"",
             fare:(o.leg&&o.leg.fare!==undefined)?o.leg.fare:null}
      });
    }

    /* 已確定的骨架。票價與班次一律留空：沒查證過的數字不填。 */
    stop("d1126", {name:"左營（抵達高雄）", type:"移動", status:"待訂",
                   leg:{mode:"高鐵", duration:"約 1 小時 40 分"}});
    stop("d1126", {name:"高雄住一晚", type:"住宿", status:"待訂"});

    stop("d1127", {name:"東港碼頭", type:"移動", status:"待查",
                   leg:{mode:"客運", duration:"約 1 小時"},
                   notes:"客運或接駁的班次還沒查，先別當定案。"});
    stop("d1127", {name:"白沙尾港（上島）", type:"移動", status:"待訂",
                   spot:"baishawei", leg:{mode:"交通船", duration:"約 25 分"}});
    stop("d1127", {name:"民宿 check-in ＋ 牽機車", type:"住宿", status:"待訂",
                   spot:"minsu", notes:"牽機車要帶駕照正本。"});

    /* 11/28 全天留白，等使用者安排 */

    stop("d1129", {name:"上午（待安排）", type:"雜事", status:"待查"});
    stop("d1129", {name:"東港", type:"移動", status:"待查",
                   leg:{mode:"交通船"},
                   notes:"務必先確認末班船時間，回程高鐵要配合這個往後排。"});
    stop("d1129", {name:"台北", type:"移動", status:"待訂",
                   leg:{mode:"高鐵", duration:"約 1 小時 40 分"}});
  }

  /* 建立預設資料時不蓋「最後由○○修改」，那是給實際編輯用的 */
  function raw(kind, id, data){
    var k = key(kind, id);
    recs[k] = {kind:kind, item_id:id, data:data, deleted:false,
               updated_by:"", updated_at:new Date().toISOString()};
    dirty[k] = true;
  }

  /* ───────── 本機快取 ───────── */
  function saveCache(){
    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        tripId:tripId, cursor:cursor, recs:recs, dirty:dirty
      }));
      return true;
    }catch(e){ return false; }
  }
  function loadCache(wantTrip){
    try{
      var raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return false;
      var c = JSON.parse(raw);
      if(!c || !c.recs) return false;
      if(wantTrip && c.tripId !== wantTrip) return false;  // 換了一份行程，別混用
      recs = c.recs; cursor = c.cursor || null;
      dirty = c.dirty || {}; tripId = c.tripId || "";
      return Object.keys(recs).length > 0;
    }catch(e){ return false; }
  }

  /* ───────── 合併（後寫的勝出） ───────── */
  function merge(rows){
    var changed = false;
    rows.forEach(function(row){
      var k = key(row.kind, row.item_id);
      if(dirty[k]) return;                     // 自己還沒送出去的改動，先不要被蓋掉
      var mine = recs[k];
      if(mine && !newer(row.updated_at, mine.updated_at)) return;
      recs[k] = {
        kind:row.kind, item_id:row.item_id, data:row.data || {},
        deleted:!!row.deleted, updated_by:row.updated_by || "",
        updated_at:row.updated_at
      };
      changed = true;
      if(!cursor || newer(row.updated_at, cursor)) cursor = row.updated_at;
    });
    if(changed) saveCache();
    return changed;
  }

  /* ───────── 推送 ───────── */
  var pushTimer = null, pushing = false;
  function schedulePush(){
    if(!window.SYNC || !SYNC.enabled || !tripId) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, 600);        // 連續操作合併成一次送出
  }

  function flush(){
    if(!window.SYNC || !SYNC.enabled || !tripId) return Promise.resolve();
    if(pushing) { schedulePush(); return Promise.resolve(); }
    var keys = Object.keys(dirty);
    if(!keys.length) return Promise.resolve();

    var batch = keys.slice(0, 400);
    var rows = batch.map(function(k){
      var r = recs[k];
      return {kind:r.kind, item_id:r.item_id, data:r.data,
              deleted:r.deleted, updated_by:r.updated_by};
    });

    pushing = true;
    setStatus("syncing");
    return SYNC.push(tripId, rows).then(function(ts){
      batch.forEach(function(k){
        delete dirty[k];
        if(recs[k] && ts) recs[k].updated_at = ts;
      });
      /* 注意：推送回來的時間戳「不可以」拿去推進拉取游標。
         別人稍早寫的那筆時間比它早，游標一跳過去就再也拉不回來了。
         游標只由真的拉回來的資料推進。 */
      pushing = false; saveCache(); setStatus("ok");
      if(Object.keys(dirty).length) schedulePush();
    }, function(err){
      pushing = false;
      setStatus("offline", err && err.message);
      setTimeout(schedulePush, 8000);          // 等一下再試，改動還留著
    });
  }

  /* ───────── 拉取 ───────── */
  var polling = false;
  function poll(){
    if(!window.SYNC || !SYNC.enabled || !tripId || polling) return Promise.resolve(false);
    polling = true;
    return SYNC.pull(tripId, cursor).then(function(rows){
      polling = false;
      var changed = merge(rows || []);
      setStatus("ok");
      if(changed) emitRemote();
      return changed;
    }, function(err){
      polling = false;
      setStatus("offline", err && err.message);
      return false;
    });
  }

  function setStatus(state, error){
    status = {state:state, at:(state==="ok"? new Date() : status.at), error:error||""};
    emit();
  }

  /* ───────── 啟動 ───────── */
  function readHash(){
    var m = (location.hash || "").match(/[#&]t=([A-Za-z0-9]{16,})/);
    return m ? m[1] : "";
  }

  function boot(){
    var want = readHash();

    /* 沒設定後端：只用本機，維持單機可用 */
    if(!window.SYNC || !SYNC.enabled){
      if(!loadCache("")) { recs = {}; dirty = {}; seed(); saveCache(); }
      status = {state:"local", at:null, error:""};
      return Promise.resolve({mode:"local", seeded:true});
    }

    if(!want){
      /* 第一次開：開一份新行程，產生夠長夠亂的代碼 */
      tripId = SYNC.newTripId();
      recs = {}; dirty = {}; cursor = null;
      seed(); saveCache();
      history.replaceState(null, "", "#t=" + tripId);
      return flush().then(function(){ return {mode:"new", tripId:tripId}; });
    }

    tripId = want;
    var hadCache = loadCache(want);          // 有快取就先畫出來，離線也看得到
    return poll().then(function(){
      var empty = Object.keys(recs).length === 0;
      return {mode: empty ? "empty" : "joined", tripId:tripId, cached:hadCache};
    });
  }

  /* 固定回拉，外加切回分頁時立刻拉一次 */
  function startPolling(ms){
    setInterval(function(){
      if(document.visibilityState === "visible") poll();
    }, ms || 12000);
    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState === "visible"){ poll(); flush(); }
    });
    window.addEventListener("online", function(){ poll(); flush(); });
  }

  function shareLink(){
    if(!tripId) return "";
    return location.origin + location.pathname + "#t=" + tripId;
  }

  function stamp(iso){
    if(!iso) return "";
    var d = new Date(iso);
    if(isNaN(d)) return "";
    var p = function(n){ return (n<10?"0":"")+n; };
    return (d.getMonth()+1)+"/"+d.getDate()+" "+p(d.getHours())+":"+p(d.getMinutes());
  }

  /* ───────── 分攤結算 ───────── */
  /* 每人淨額 = 付出 − 應分攤；再以貪婪法配對債權債務，使轉帳筆數最少 */
  function settle(members, expenses){
    var net = {};
    members.forEach(function(m){ net[m.id] = 0; });

    expenses.forEach(function(e){
      var amt = Number(e.amount) || 0;
      if(amt <= 0) return;
      var shares = (e.shares || []).filter(function(id){ return net[id] !== undefined; });
      if(shares.length === 0) return;
      if(net[e.payer] !== undefined) net[e.payer] += amt;
      var each = amt / shares.length;
      shares.forEach(function(id){ net[id] -= each; });
    });

    var EPS = 0.5, creditors = [], debtors = [];
    members.forEach(function(m){
      var v = Math.round(net[m.id] * 100) / 100;
      if(v > EPS)       creditors.push({id:m.id, name:m.name, v:v});
      else if(v < -EPS) debtors.push({id:m.id, name:m.name, v:-v});
    });
    creditors.sort(function(a,b){ return b.v - a.v; });
    debtors.sort(function(a,b){ return b.v - a.v; });

    var moves = [], i = 0, j = 0;
    while(i < debtors.length && j < creditors.length){
      var pay = Math.min(debtors[i].v, creditors[j].v);
      if(pay > EPS) moves.push({from:debtors[i].name, to:creditors[j].name,
                                amount:Math.round(pay)});
      debtors[i].v -= pay; creditors[j].v -= pay;
      if(debtors[i].v <= EPS) i++;
      if(creditors[j].v <= EPS) j++;
    }
    return {moves:moves, net:net};
  }

  return {
    boot:boot, startPolling:startPolling, poll:poll, flush:flush,
    view:view, get:get, all:all, put:put, remove:remove,
    onChange:onChange, onRemoteChange:onRemoteChange, shareLink:shareLink,
    get tripId(){ return tripId; },
    get status(){ return status; },
    get pending(){ return Object.keys(dirty).length; },
    me:ME, uid:uid, nextSeq:nextSeq, stamp:stamp, settle:settle,
    TYPES:TYPES, STATUSES:STATUSES, MODES:MODES, UNSURE:UNSURE
  };
})();

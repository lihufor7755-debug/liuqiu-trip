/* 同步.js — 與後端之間的收送
   資料以「一筆一列」存放，衝突時後寫的勝出，刪除留墓碑。
   連不上後端時整包退回只用本機，不會壞掉，之後恢復連線會自動補送。 */

window.SYNC = (function(){

  var CFG = window.SUPABASE || {url:"", anonKey:""};
  var ON  = !!(CFG.url && CFG.anonKey);

  function endpoint(fn){
    return CFG.url.replace(/\/+$/,"") + "/rest/v1/rpc/" + fn;
  }

  function call(fn, body){
    if(!ON) return Promise.reject(new Error("offline"));
    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, 12000);
    return fetch(endpoint(fn), {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":CFG.anonKey,
        "Authorization":"Bearer " + CFG.anonKey
      },
      body:JSON.stringify(body),
      signal:ctrl.signal
    }).then(function(r){
      clearTimeout(timer);
      if(!r.ok) return r.text().then(function(t){
        throw new Error("HTTP " + r.status + " " + t.slice(0,200));
      });
      return r.json();
    }, function(e){
      clearTimeout(timer);
      throw e;
    });
  }

  /* 拉：取回這份行程在 since 之後變動過的列 */
  function pull(tripId, since){
    return call("trip_pull", {p_trip:tripId, p_since:since || "-infinity"});
  }

  /* 推：送出一批變動，回傳資料庫蓋的時間戳 */
  function push(tripId, rows){
    if(!rows.length) return Promise.resolve(null);
    return call("trip_push", {p_trip:tripId, p_rows:rows});
  }

  /* 行程代碼：夠長夠亂，猜不到。24 字、約 124 bits。 */
  function newTripId(){
    var abc = "abcdefghijkmnpqrstuvwxyz23456789";   // 去掉 l/o/0/1，免得抄錯
    var out = "", a = new Uint8Array(24);
    (window.crypto || window.msCrypto).getRandomValues(a);
    for(var i=0;i<24;i++) out += abc[a[i] % abc.length];
    return out;
  }

  return {enabled:ON, pull:pull, push:push, newTripId:newTripId, config:CFG};
})();

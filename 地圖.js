/* 地圖.js — 小琉球島圖與當日動線
   座標系統：viewBox 0 0 220 340，北在上。島形為示意描繪，用於看出「今天繞了島的哪半邊」，
   不是導航用精確地圖。地標的相對方位依實際地理（北端白沙尾、西岸美人洞一線、
   南端落日亭、東南厚石、東岸大福）安排。 */

window.MAP = (function(){

  /* 島的輪廓控制點（順時針，自北端起）。小琉球南北長、西南—東北走向，
     北端尖、東南厚石一帶外突、西岸蛤板灣一帶內凹。此為示意描繪，非精確海圖。 */
  /* 島的輪廓控制點（順時針，自東北角白沙尾起）。
     小琉球長軸為東北—西南走向：東北端寬（白沙尾一帶），西南端收成尖角
     （落日亭、海子口），東岸較平直。此為示意描繪，非精確海圖。 */
  var OUTLINE = [
    [277,67],[253,61],[221,65],[190,71],[166,81],[142,87],[122,97],
    [111,121],[102,154],[99,174],[91,202],[81,226],[63,250],[47,275],
    [32,295],[24,313],[38,320],[63,312],[91,306],[115,295],[134,275],
    [154,254],[178,234],[205,210],[229,190],[249,170],[273,145],[288,125],
    [296,105],[294,87],[285,73]
  ];

  /* 閉合平滑曲線（Catmull-Rom → cubic），讓海岸線像手繪而不是多邊形 */
  function closed(pts, t){
    t = t === undefined ? 0.34 : t;
    var n = pts.length, at = function(i){ return pts[(i%n+n)%n]; };
    var d = "M"+at(0)[0]+","+at(0)[1];
    for(var i=0;i<n;i++){
      var p0=at(i-1), p1=at(i), p2=at(i+1), p3=at(i+2);
      var c1x=p1[0]+(p2[0]-p0[0])/6*t, c1y=p1[1]+(p2[1]-p0[1])/6*t;
      var c2x=p2[0]-(p3[0]-p1[0])/6*t, c2y=p2[1]-(p3[1]-p1[1])/6*t;
      d += " C"+c1x.toFixed(1)+","+c1y.toFixed(1)+" "+c2x.toFixed(1)+","+
           c2y.toFixed(1)+" "+p2[0]+","+p2[1];
    }
    return d + " Z";
  }

  /* 環島公路：輪廓往島心內縮，形狀自動跟著海岸線走 */
  function shrink(pts, k){
    var cx=0, cy=0;
    pts.forEach(function(p){ cx+=p[0]; cy+=p[1]; });
    cx/=pts.length; cy/=pts.length;
    return pts.map(function(p){
      return [+(cx+(p[0]-cx)*k).toFixed(1), +(cy+(p[1]-cy)*k).toFixed(1)];
    });
  }

  var COAST = closed(OUTLINE);
  var ROAD  = closed(shrink(OUTLINE, 0.86));

  /* 地標：id、名稱、座標、標籤偏移（lx/ly）、文字對齊 */
  /* 地標：位置依實際地理相對方位，貼在海岸線上。lx/ly 為標籤偏移，a 為對齊 */
  var SPOTS = [
    {id:"baishawei", name:"白沙尾漁港",   x:272, y:72,  lx:10, ly:3,  a:"start"},
    {id:"zhongao",   name:"中澳沙灘",     x:289, y:96,  lx:8,  ly:3,  a:"start"},
    {id:"huaping",   name:"花瓶石",       x:248, y:66,  lx:0,  ly:-9, a:"middle"},
    {id:"benfu",     name:"本福村",       x:238, y:95,  lx:-9, ly:3,  a:"end"},
    {id:"minsu",     name:"民宿",         x:225, y:120, lx:-9, ly:3,  a:"end"},
    {id:"yufu",      name:"漁福漁港",     x:293, y:112, lx:8,  ly:3,  a:"start"},
    {id:"longxia",   name:"龍蝦洞",       x:286, y:132, lx:8,  ly:3,  a:"start"},
    {id:"xuri",      name:"旭日亭",       x:258, y:166, lx:8,  ly:3,  a:"start"},
    {id:"dafu",      name:"大福漁港",     x:200, y:216, lx:8,  ly:3,  a:"start"},
    {id:"baideng",   name:"白燈塔",       x:126, y:268, lx:8,  ly:3,  a:"start"},
    {id:"houshi",    name:"厚石裙礁",     x:112, y:297, lx:8,  ly:10, a:"start"},
    {id:"haizikou",  name:"海子口",       x:58,  y:312, lx:8,  ly:-6, a:"start"},
    {id:"luori",     name:"落日亭",       x:28,  y:306, lx:0,  ly:15, a:"middle"},
    {id:"wugui",     name:"烏鬼洞",       x:55,  y:262, lx:-9, ly:3,  a:"end"},
    {id:"gaban",     name:"蛤板灣",       x:86,  y:215, lx:-9, ly:3,  a:"end"},
    {id:"shanzhu",   name:"山豬溝",       x:97,  y:190, lx:-9, ly:3,  a:"end"},
    {id:"shanfu",    name:"杉福漁港",     x:102, y:166, lx:-9, ly:3,  a:"end"},
    {id:"duzaiping", name:"肚仔坪潮間帶", x:118, y:104, lx:-9, ly:3,  a:"end"},
    {id:"meiren",    name:"美人洞",       x:176, y:78,  lx:0,  ly:-9, a:"middle"},
    {id:"island",    name:"島上（未指定）", x:180, y:170, lx:9, ly:3, a:"start"}
  ];
  var BY_ID = {};
  SPOTS.forEach(function(s){ BY_ID[s.id] = s; });

  /* 交通工具圖示（16x16 線稿，currentColor） */
  var ICONS = {
    "船":'<path d="M2 10h12l-1.5 4H3.5L2 10Z"/><path d="M8 10V3l4 3-4 1"/>',
    "交通船":'<path d="M2 10h12l-1.5 4H3.5L2 10Z"/><path d="M8 10V3l4 3-4 1"/>',
    "高鐵":'<rect x="4" y="2" width="8" height="10" rx="3"/><path d="M4 9h8M5.5 14l1-2M10.5 14l-1-2"/>',
    "火車":'<rect x="4" y="2" width="8" height="10" rx="3"/><path d="M4 9h8M5.5 14l1-2M10.5 14l-1-2"/>',
    "機車":'<circle cx="3.5" cy="11.5" r="2.5"/><circle cx="12.5" cy="11.5" r="2.5"/><path d="M6 11.5h4l1-4h2M9 7.5H7"/>',
    "步行":'<circle cx="8.5" cy="2.8" r="1.6"/><path d="M8.5 5v4l2 2 .5 3M8.5 9l-2 2-.5 3M8.5 6.5 11 8"/>',
    "汽車":'<path d="M2 11V8l2-4h8l2 4v3"/><path d="M2 11h12"/><circle cx="4.5" cy="12.5" r="1.4"/><circle cx="11.5" cy="12.5" r="1.4"/>',
    "客運":'<rect x="2.5" y="2.5" width="11" height="9" rx="1.5"/><path d="M2.5 7h11M5 11.5v1.5M11 11.5v1.5"/>',
    "接駁車":'<rect x="2.5" y="2.5" width="11" height="9" rx="1.5"/><path d="M2.5 7h11M5 11.5v1.5M11 11.5v1.5"/>',
    "計程車":'<path d="M2 11V8l2-4h8l2 4v3"/><path d="M2 11h12M6 4V2.5h4V4"/><circle cx="4.5" cy="12.5" r="1.4"/><circle cx="11.5" cy="12.5" r="1.4"/>',
    "腳踏車":'<circle cx="3.8" cy="11" r="2.8"/><circle cx="12.2" cy="11" r="2.8"/><path d="M6 11l2.5-5h2M8.5 6l3.7 5M7 6h3"/>',
    "飛機":'<path d="M8 1.5 9.2 7l4.8 2.4-.4 1.4L9 9.6l-.4 3.3 1.6 1.4-.3.9L8 14.2l-1.9 1-.3-.9 1.6-1.4L7 9.6l-4.6 1.2-.4-1.4L6.8 7 8 1.5Z"/>'
  };
  function icon(mode, cls){
    var d = ICONS[mode] || '<circle cx="8" cy="8" r="5.2"/><path d="M8 5.5v5"/>';
    return '<svg class="'+(cls||'')+'" width="16" height="16" viewBox="0 0 16 16" '+
      'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" '+
      'stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
  }

  /* 小旗（航線選單的目前位置標記） */
  function flag(){
    return '<svg width="16" height="22" viewBox="0 0 16 22" fill="none" aria-hidden="true">'+
      '<path d="M3.2 21V1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'+
      '<path d="M3.2 2.2h9.6l-2.6 3.3 2.6 3.3H3.2z" fill="currentColor"/></svg>';
  }

  /* 判斷「今天走了島的哪半邊」。島的長軸是東北—西南向，所以 x 與 y 會連動，
     先看走的幅度夠不夠長，再看偏向哪一側。 */
  function verdict(pts){
    if(pts.length === 0) return "今天還沒有落點";
    if(pts.length === 1) return "今天只停一個點";
    var xs = pts.map(function(p){return p.x;}), ys = pts.map(function(p){return p.y;});
    var minx = Math.min.apply(null,xs), maxx = Math.max.apply(null,xs);
    var miny = Math.min.apply(null,ys), maxy = Math.max.apply(null,ys);
    var spanx = (maxx-minx)/272, spany = (maxy-miny)/259;
    var mx = xs.reduce(function(a,b){return a+b;},0)/xs.length;
    var my = ys.reduce(function(a,b){return a+b;},0)/ys.length;
    var ndx = (mx-165)/136, ndy = (my-190)/130;   // −1 … +1，相對島心
    var FAR = 0.45, OFF = 0.25;

    if(spanx > FAR && spany > FAR){
      // 真的繞一圈要有足夠的點；只有頭尾兩點是斜斜穿過去，不是繞島
      return pts.length >= 5 ? "今天繞了全島" : "今天斜越了整座島";
    }
    if(spany > FAR){
      if(Math.abs(ndx) < OFF) return "今天縱貫了整座島";
      return ndx < 0 ? "今天走了島的西岸一線" : "今天走了島的東岸一線";
    }
    if(spanx > FAR){
      if(Math.abs(ndy) < OFF) return "今天橫越了整座島";
      return ndy < 0 ? "今天走了島的北半邊" : "今天走了島的南半邊";
    }
    var ns = ndy < -OFF ? "北" : (ndy > OFF ? "南" : "");
    var ew = ndx < -OFF ? "西" : (ndx > OFF ? "東" : "");
    if(ns && ew) return "今天都在島的" + ew + ns + "角";
    if(ns) return "今天都在島的" + ns + "邊";
    if(ew) return "今天都在島的" + ew + "邊";
    return "今天都在島中間";
  }

  /* 平滑折線（Catmull-Rom 轉 cubic），讓動線像手畫的而不是折尺 */
  function curve(pts){
    if(pts.length < 2) return "";
    if(pts.length === 2) return "M"+pts[0].x+","+pts[0].y+" L"+pts[1].x+","+pts[1].y;
    var d = "M"+pts[0].x+","+pts[0].y, t = 0.5;
    for(var i=0;i<pts.length-1;i++){
      var p0 = pts[i-1]||pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2]||p2;
      var c1x = p1.x + (p2.x-p0.x)/6*t, c1y = p1.y + (p2.y-p0.y)/6*t;
      var c2x = p2.x - (p3.x-p1.x)/6*t, c2y = p2.y - (p3.y-p1.y)/6*t;
      d += " C"+c1x.toFixed(1)+","+c1y.toFixed(1)+" "+c2x.toFixed(1)+","+c2y.toFixed(1)+
           " "+p2.x+","+p2.y;
    }
    return d;
  }

  /* 島圖：stops 為當日的站（取有 spot 的），依序連成動線 */
  function island(stops){
    var pts = [], seen = {};
    stops.forEach(function(s){
      var sp = BY_ID[s.spot];
      if(!sp) return;
      var key = sp.id;
      var p = {x:sp.x, y:sp.y, id:sp.id, name:s.name || sp.name, n:pts.length+1};
      if(seen[key] && pts.length && pts[pts.length-1].id === key) return; // 連續同點不重複
      seen[key] = true;
      pts.push(p);
    });

    var onIds = {}; pts.forEach(function(p){ onIds[p.id] = true; });

    var svg = '<svg viewBox="-6 40 362 300" role="img" '+
      'aria-label="小琉球當日動線圖，'+verdict(pts)+'">';

    /* 海的細紋 */
    svg += '<defs><pattern id="swell" width="22" height="14" patternUnits="userSpaceOnUse">'+
      '<path d="M0 10 q5.5 -5 11 0 t11 0" fill="none" stroke="var(--sea-deep)" '+
      'stroke-width=".7" opacity=".55"/></pattern>'+
      '<filter id="soft"><feGaussianBlur stdDeviation="1.6"/></filter></defs>';
    svg += '<rect x="-6" y="40" width="362" height="300" fill="var(--sea)"/>';
    svg += '<rect x="-6" y="40" width="362" height="300" fill="url(#swell)"/>';

    /* 指北針 + 比例感 */
    svg += '<g opacity=".75"><path d="M30 56 l4.2 11 -4.2 -3 -4.2 3 Z" fill="var(--ink-soft)"/>'+
      '<text x="30" y="79" text-anchor="middle" class="map-label">N</text></g>';

    /* 島 */
    svg += '<path d="'+COAST+'" fill="var(--sea-deep)" opacity=".5" '+
      'transform="translate(2.5,3)" filter="url(#soft)"/>';
    svg += '<path d="'+COAST+'" fill="var(--land)" stroke="var(--coast)" stroke-width="1.5"/>';
    svg += '<path d="'+ROAD+'" fill="none" stroke="var(--road)" stroke-width="1.4" '+
      'stroke-dasharray="1 3.2" stroke-linecap="round"/>';
    svg += '<text x="165" y="196" text-anchor="middle" class="map-label" '+
      'style="letter-spacing:.42em;font-size:11px;opacity:.5">小琉球</text>';

    /* 參考地標（未排入今天的） */
    SPOTS.forEach(function(s){
      if(s.id === "island" || onIds[s.id]) return;
      svg += '<circle cx="'+s.x+'" cy="'+s.y+'" r="1.9" fill="var(--ink-faint)" opacity=".55"/>';
      svg += '<text x="'+(s.x+s.lx)+'" y="'+(s.y+s.ly+3)+'" text-anchor="'+s.a+
        '" class="map-label" opacity=".7">'+esc(s.name)+'</text>';
    });

    /* 動線 */
    if(pts.length >= 2){
      var d = curve(pts);
      svg += '<path d="'+d+'" fill="none" stroke="var(--accent)" stroke-width="3.4" '+
        'opacity=".2" stroke-linecap="round"/>';
      svg += '<path d="'+d+'" fill="none" stroke="var(--accent)" stroke-width="1.9" '+
        'stroke-linecap="round" stroke-linejoin="round" class="track"/>';
    }

    /* 今天的點 */
    pts.forEach(function(p){
      var sp = BY_ID[p.id];
      svg += '<circle cx="'+p.x+'" cy="'+p.y+'" r="7.2" fill="var(--accent)"/>';
      svg += '<text x="'+p.x+'" y="'+(p.y+2.9)+'" text-anchor="middle" class="map-seq">'+
        p.n+'</text>';
      svg += '<text x="'+(p.x+sp.lx)+'" y="'+(p.y+sp.ly+3)+'" text-anchor="'+sp.a+
        '" class="map-label on">'+esc(p.name)+'</text>';
    });

    svg += '</svg>';
    return {html:svg, verdict:verdict(pts), count:pts.length};
  }

  /* 航段帶：不在島上的日子（高雄、回程）。
     用一般 HTML 畫，不用 SVG——SVG 會跟著版面等比放大，字就變成巨無霸。 */
  function ribbon(stops, from){
    var pts = [{name:(from || "出發"), start:true, mode:null}];
    stops.forEach(function(s){
      pts.push({name:(s.name || "（未命名）"),
                mode:(s.leg && s.leg.mode) || null});
    });

    var h = '<div class="ribbon"><div class="ribbon-rail">';
    pts.forEach(function(p, i){
      if(i > 0){
        h += '<span class="ribbon-seg" title="'+esc(p.mode || "還沒填")+'">'+
             '<span class="ribbon-ico">'+icon(p.mode || "")+'</span></span>';
      }
      h += '<span class="ribbon-stop'+(p.start ? " start" : "")+'">'+
           '<span class="ribbon-dot">'+(p.start ? "" : i)+'</span>'+
           '<span class="ribbon-name">'+esc(p.name)+'</span></span>';
    });
    h += '</div></div>';

    var v = pts.length <= 1 ? "今天還沒有落點"
          : (pts[0].name + " → " + pts[pts.length-1].name);
    return {html:h, verdict:v, count:pts.length-1};
  }

  function clip(s,n){ s = String(s); return s.length>n ? s.slice(0,n)+"…" : s; }
  function esc(s){ return String(s==null?"":s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;"); }

  return {SPOTS:SPOTS, byId:function(id){return BY_ID[id];},
          island:island, ribbon:ribbon, icon:icon, flag:flag, MODES:Object.keys(ICONS)};
})();

/* 設定.js — 後端連線設定
   這兩串值從 Supabase 抄來（Connect → Framework → .env.local）。
   publishable key 是設計成要公開放在網頁裡的，不是秘密；
   真正擋住外人的是網址後面那串 24 碼的行程代碼。
   寫著 service_role / sb_secret_ 的那把千萬不要放進來。 */

window.SUPABASE = {
  url:     "https://czlsayzknwevjiyuhhhj.supabase.co",
  anonKey: "sb_publishable_oNr4zxw-l-I3_RxN1XxOOg_DN_7JvO7"
};

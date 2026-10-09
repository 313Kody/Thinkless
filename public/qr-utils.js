// Génération de QR codes 100 % côté client : aucune donnée n'est envoyée à un service tiers
// (le lien « capitaine » contient un code secret, il ne doit jamais quitter le navigateur).
(function () {
  const LIB_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
  let libPromise = null;

  function chargerLib() {
    if (window.qrcode) return Promise.resolve();
    if (!libPromise) {
      libPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = LIB_URL;
        s.onload = resolve;
        s.onerror = () => {
          libPromise = null;
          reject(new Error("Bibliothèque QR indisponible"));
        };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  async function makeQrDataUrl(texte, cell = 8) {
    await chargerLib();
    const qr = window.qrcode(0, "M");
    qr.addData(texte);
    qr.make();
    return qr.createDataURL(cell, 4);
  }

  const echapper = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Affiche une fenêtre avec le QR code, le lien, un bouton copier et imprimer
  async function showQr({ titre, url, sousTitre, extra }) {
    let image;
    try {
      image = await makeQrDataUrl(url);
    } catch (e) {
      alert(e.message);
      return;
    }
    document.getElementById("qr-overlay")?.remove();
    const localhost = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
    const style = document.createElement("style");
    style.id = "qr-print-style";
    style.textContent = "@media print{body>*:not(#qr-overlay){display:none!important}#qr-overlay{position:static!important;background:#fff!important}#qr-overlay .no-print{display:none!important}#qr-box{border:0!important;color:#000!important}}";
    document.getElementById("qr-print-style")?.remove();
    document.head.appendChild(style);
    const overlay = document.createElement("div");
    overlay.id = "qr-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif";
    overlay.innerHTML = `
      <div id="qr-box" style="background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:16px;padding:20px;max-width:360px;width:100%;text-align:center">
        <h2 style="font-size:20px;font-weight:700;color:#fbbf24;margin:0 0 4px">${echapper(titre)}</h2>
        ${sousTitre ? `<p style="margin:0 0 10px;font-size:14px;color:#9ca3af">${echapper(sousTitre)}</p>` : ""}
        <img src="${image}" alt="QR code" style="width:260px;height:260px;image-rendering:pixelated;background:#fff;border-radius:8px;margin:0 auto" />
        ${extra ? `<p style="margin:10px 0 0;font-size:14px">${extra}</p>` : ""}
        <p style="margin:10px 0 0;font-size:11px;word-break:break-all;color:#9ca3af">${echapper(url)}</p>
        ${localhost ? '<p class="no-print" style="margin:8px 0 0;font-size:11px;color:#fbbf24">⚠️ Adresse locale : ouvrez le site via son adresse réseau ou son domaine pour que le QR soit scannable depuis un téléphone.</p>' : ""}
        <div class="no-print" style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap">
          <button data-a="copy" style="padding:8px 12px;border-radius:8px;border:1px solid #4b5563;background:transparent;color:#e5e7eb;cursor:pointer">Copier le lien</button>
          <button data-a="print" style="padding:8px 12px;border-radius:8px;border:1px solid #4b5563;background:transparent;color:#e5e7eb;cursor:pointer">Imprimer</button>
          <button data-a="close" style="padding:8px 12px;border-radius:8px;border:0;background:#f59e0b;color:#111827;font-weight:600;cursor:pointer">Fermer</button>
        </div>
      </div>`;
    const fermer = () => {
      overlay.remove();
      style.remove();
    };
    overlay.addEventListener("click", async (ev) => {
      const action = ev.target.dataset?.a;
      if (ev.target === overlay || action === "close") return fermer();
      if (action === "print") return window.print();
      if (action === "copy") {
        try {
          await navigator.clipboard.writeText(url);
          ev.target.textContent = "Copié ✓";
        } catch {
          prompt("Copiez le lien :", url);
        }
      }
    });
    document.body.appendChild(overlay);
  }

  window.makeQrDataUrl = makeQrDataUrl;
  window.showQr = showQr;
})();

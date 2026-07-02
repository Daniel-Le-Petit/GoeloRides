/**
 * GoëloRides — résolution URL GPX + téléchargement (parcours, sorties).
 */
(function (global) {
  "use strict";

  var GPX_BUCKET = "rides-gpx";

  function _cfg() {
    return global.GOELO_CONFIG || {};
  }

  function _sb() {
    return global.goeloGetSb ? global.goeloGetSb() : null;
  }

  function basename(ref) {
    var s = String(ref || "").trim();
    if (!s) return "";
    var parts = s.split("/");
    return parts[parts.length - 1] || s;
  }

  function isHttpUrl(ref) {
    return /^https?:\/\//i.test(String(ref || "").trim());
  }

  function isStoragePath(ref) {
    var s = String(ref || "").trim();
    if (!s || isHttpUrl(s)) return false;
    return s.indexOf("/") >= 0 && !/^gpx\//i.test(s);
  }

  /**
   * Résout une référence GPX (URL, storage rides-gpx, ou fichier statique gpx/).
   */
  function resolveGpxUrl(fileRef, sb) {
    var ref = String(fileRef || "").trim();
    if (!ref) return null;

    if (isHttpUrl(ref)) return ref;

    sb = sb || _sb();

    if (isStoragePath(ref) && sb) {
      var pub = sb.storage.from(GPX_BUCKET).getPublicUrl(ref);
      if (pub && pub.data && pub.data.publicUrl) return pub.data.publicUrl;
    }

    var name = basename(ref);
    if (!/\.gpx$/i.test(name)) return null;
    return "gpx/" + encodeURI(name);
  }

  function downloadFilename(fileRef, fallbackTitle) {
    var name = basename(fileRef);
    if (name && /\.gpx$/i.test(name)) return name;
    var slug = String(fallbackTitle || "parcours")
      .trim()
      .replace(/[^\w\u00C0-\u024f.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return (slug || "parcours") + ".gpx";
  }

  function triggerBlobDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /**
   * Télécharge le GPX ou retourne { ok: false, message }.
   */
  async function downloadGpx(opts) {
    opts = opts || {};
    var fileRef = opts.fileRef || opts.gpxFile || opts.file || "";
    var url = resolveGpxUrl(fileRef, opts.sb || _sb());

    if (!url) {
      return {
        ok: false,
        message: opts.emptyMsg || "Aucune trace GPX disponible pour cette sortie."
      };
    }

    var filename = downloadFilename(fileRef, opts.title);

    try {
      var res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) {
        return {
          ok: false,
          message: "Impossible de récupérer le fichier GPX (HTTP " + res.status + ")."
        };
      }
      var blob = await res.blob();
      if (!blob || !blob.size) {
        return { ok: false, message: "Le fichier GPX est vide ou inaccessible." };
      }
      triggerBlobDownload(blob, filename);
      return { ok: true, url: url, filename: filename };
    } catch (err) {
      if (isHttpUrl(url)) {
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return { ok: true, url: url, filename: filename, fallback: "direct_link" };
      }
      return {
        ok: false,
        message: "Téléchargement impossible : " + (err.message || "erreur réseau")
      };
    }
  }

  function bindDownloadButton(btnId, getOpts) {
    var btn = document.getElementById(btnId);
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", async function (e) {
      e.preventDefault();
      var opts = typeof getOpts === "function" ? getOpts() : (getOpts || {});
      var msgEl = opts.messageEl ? document.getElementById(opts.messageEl) : null;
      var prevText = btn.textContent;

      btn.setAttribute("aria-busy", "true");
      if (msgEl) msgEl.textContent = "";

      var result = await downloadGpx(opts);

      btn.removeAttribute("aria-busy");

      if (result.ok) {
        if (msgEl) {
          msgEl.textContent = opts.successMsg || (
            "Même trace que sur la carte. À ouvrir dans ton appli vélo ou ton GPS " +
            "pour rouler avec le bon itinéraire."
          );
        }
        return;
      }

      if (msgEl) {
        msgEl.textContent = result.message;
      } else {
        btn.textContent = prevText;
        global.alert(result.message);
      }
    });
  }

  global.GoeloGpx = {
    GPX_BUCKET: GPX_BUCKET,
    resolveGpxUrl: resolveGpxUrl,
    downloadFilename: downloadFilename,
    downloadGpx: downloadGpx,
    bindDownloadButton: bindDownloadButton
  };
})(typeof window !== "undefined" ? window : globalThis);

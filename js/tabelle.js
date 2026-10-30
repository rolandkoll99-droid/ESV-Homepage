/* =====================================================================
   ESV GREIN – Daten laden
   Liest Termine, Ergebnisse usw. aus der Google-Tabelle des Vereins.
   Ist keine Tabelle eingerichtet oder nicht erreichbar, werden die
   Daten aus js/daten.js verwendet.
   Hier muss normalerweise nichts geändert werden.
   ===================================================================== */
(function () {
  "use strict";

  var BLAETTER = ["Termine", "Ergebnisse", "Veranstaltungen", "Regeltraining", "Trainingsfrei", "Vorstand", "Verein", "Fotos"];
  // Spalte, die ein Blatt haben MUSS – sonst falsches/fehlendes Blatt
  var PFLICHTSPALTE = { Termine: "datum", Ergebnisse: "datum", Veranstaltungen: "datum", Regeltraining: "wochentag",
    Trainingsfrei: "datum", Vorstand: "funktion", Verein: "feld", Fotos: "bildlink" };
  var ARTEN = { training: "training", meisterschaft: "meisterschaft", turnier: "turnier", vereinsfest: "fest", fest: "fest" };
  var WOCHENTAGE = { montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 7,
    mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7 };
  var VEREINSFELDER = { adresse: "adresse", plzort: "plzOrt", telefon: "telefon", email: "email",
    mitgliedsbeitrag: "mitgliedsbeitrag", trainingszeitentext: "trainingszeiten", trainingszeiten: "trainingszeiten",
    titelbildlink: "titelbild", titelbild: "titelbild" };

  /* ---------- Hilfen ---------- */
  function schluessel(s) {
    return String(s || "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u")
      .replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
  }

  function zweistellig(n) { return ("0" + n).slice(-2); }

  // Akzeptiert: 30.10.2026 · 30.10.26 · 2026-10-30 · Excel-Seriennummer
  function datumISO(wert) {
    var s = String(wert || "").trim(), m;
    if (!s) return "";
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + "-" + zweistellig(m[2]) + "-" + zweistellig(m[3]);
    if ((m = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/))) {
      var j = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      return j + "-" + zweistellig(m[2]) + "-" + zweistellig(m[1]);
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
      return d.getUTCFullYear() + "-" + zweistellig(d.getUTCMonth() + 1) + "-" + zweistellig(d.getUTCDate());
    }
    return null; // ungültig
  }

  function gueltigesDatum(iso) {
    if (!iso) return false;
    var p = iso.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.getFullYear() === +p[0] && d.getMonth() === +p[1] - 1 && d.getDate() === +p[2];
  }

  // Akzeptiert: 18:00 · 18.00 · 18:00:00 · 18 · Excel-Bruchteil (0,75)
  function zeit(wert) {
    var s = String(wert || "").trim(), m;
    if (!s) return "";
    if ((m = s.match(/^(\d{1,2})[:.](\d{2})/))) return zweistellig(m[1]) + ":" + m[2];
    if (/^\d{1,2}$/.test(s) && +s < 24) return zweistellig(s) + ":00";
    var f = parseFloat(s.replace(",", "."));
    if (f > 0 && f < 1) { var min = Math.round(f * 1440); return zweistellig(Math.floor(min / 60)) + ":" + zweistellig(min % 60); }
    return s;
  }

  function zahl(wert) {
    var n = parseInt(String(wert || "").replace(/[^\d]/g, ""), 10);
    return isNaN(n) ? null : n;
  }

  // Nur normale Links oder Dateien der Webseite erlauben
  function link(wert) {
    var s = String(wert || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[\w\-.\/%]+\.\w{2,5}$/.test(s)) return s; // Datei der Webseite, z. B. dokumente/liste.pdf
    return "";
  }

  // Bild-Link: Google-Drive-Freigabelinks werden in direkte Bildadressen umgewandelt
  function driveId(s) {
    if (!/(drive|docs)\.google\.com/i.test(s)) return "";
    var m = s.match(/\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/);
    return m ? m[1] : "";
  }
  function bild(wert, breite) {
    var s = String(wert || "").trim();
    var id = driveId(s);
    if (id) return "https://drive.google.com/thumbnail?id=" + id + "&sz=w" + (breite || 1600);
    return link(s);
  }
  window.ESVBild = bild;

  // Zellwert aus Google ("Date(2026,10,2)", [18,0,0], Zahl, Text) -> Text
  function zelle(c) {
    if (!c || c.v === null || c.v === undefined) return "";
    var v = c.v, m;
    if (Object.prototype.toString.call(v) === "[object Array]") return zweistellig(v[0]) + ":" + zweistellig(v[1] || 0);
    if (typeof v === "string" && (m = v.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+))?/))) {
      if (+m[1] < 1900) return zweistellig(m[4] || 0) + ":" + zweistellig(m[5] || 0); // reine Uhrzeit
      return m[1] + "-" + zweistellig(+m[2] + 1) + "-" + zweistellig(m[3]);
    }
    if (typeof v === "number") return String(v);
    return String(v);
  }

  // Google-Tabelle (JSON) -> Liste von Objekten mit vereinfachten Spaltennamen
  function zuObjekten(tabelle) {
    var kopf = (tabelle.cols || []).map(function (c) { return schluessel(c.label); });
    return (tabelle.rows || []).map(function (r, i) {
      var o = { _zeile: i + 2 };
      kopf.forEach(function (k, j) { if (k) o[k] = zelle((r.c || [])[j]).trim(); });
      return o;
    }).filter(function (o) {
      return Object.keys(o).some(function (k) { return k !== "_zeile" && o[k]; });
    });
  }

  // Laden per <script> (JSONP): funktioniert online UND bei lokal geöffneter Datei
  var zaehler = 0;
  function blattLaden(id, blatt) {
    return new Promise(function (ok, fehler) {
      var name = "__esvBlatt" + (++zaehler) + "_" + Date.now();
      var s = document.createElement("script");
      var uhr = setTimeout(function () { aufraeumen(); fehler(new Error("keine Antwort – ist die Tabelle für „Jeder mit dem Link“ freigegeben?")); }, 10000);
      function aufraeumen() { clearTimeout(uhr); try { delete window[name]; } catch (e) { window[name] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
      window[name] = function (antwort) {
        aufraeumen();
        if (!antwort || antwort.status === "error") {
          var e = (antwort && antwort.errors && antwort.errors[0]) || {};
          fehler(new Error(e.detailed_message || e.message || "Fehler beim Lesen"));
        } else ok(antwort.table || {});
      };
      s.onerror = function () { aufraeumen(); fehler(new Error("keine Verbindung")); };
      s.src = "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(id) +
        "/gviz/tq?headers=1&tqx=out:json;responseHandler:" + name +
        "&sheet=" + encodeURIComponent(blatt) + "&_=" + Date.now();
      document.head.appendChild(s);
    });
  }

  /* ---------- Umwandeln der einzelnen Blätter ---------- */
  function mitDatum(blatt, zeilen, bericht, pflicht) {
    return zeilen.filter(function (r) {
      var iso = datumISO(r.datum);
      if (!iso || !gueltigesDatum(iso)) {
        if (pflicht !== false) {
          bericht.warnungen.push(blatt + ", Zeile " + r._zeile + ": Datum fehlt oder ist ungültig („" + (r.datum || "") +
            "“). Bitte im Format TT.MM.JJJJ eingeben. Die Zeile wird nicht angezeigt.");
        }
        return false;
      }
      r._iso = iso;
      return true;
    });
  }

  var UMWANDLER = {
    Termine: function (z, b) {
      return mitDatum("Termine", z, b).map(function (r) {
        var art = ARTEN[schluessel(r.art)];
        if (r.art && !art) b.warnungen.push("Termine, Zeile " + r._zeile + ": Art „" + r.art + "“ unbekannt – als Training angezeigt.");
        return { datum: r._iso, zeit: zeit(r.uhrzeit), titel: r.bezeichnung || "Termin", ort: r.ort || "", art: art || "training" };
      });
    },
    Ergebnisse: function (z, b) {
      return mitDatum("Ergebnisse", z, b).map(function (r) {
        var platz = zahl(r.platz);
        if (platz === null) b.warnungen.push("Ergebnisse, Zeile " + r._zeile + ": Platz fehlt oder ist keine Zahl.");
        return { datum: r._iso, bewerb: r.bewerb || "", ort: r.ort || "", mannschaft: r.mannschaft || "",
          platz: platz === null ? "–" : platz, teilnehmer: zahl(r.teilnehmer), punkte: r.punkte || "",
          saison: r.saison || "", pdf: link(r.linkergebnisliste || r.link) };
      });
    },
    Veranstaltungen: function (z, b) {
      return mitDatum("Veranstaltungen", z, b).map(function (r) {
        return { datum: r._iso, titel: r.bezeichnung || "", text: r.beschreibung || "",
          bild: bild(r.bildlink || r.bild, 1000), ausschreibung: link(r.ausschreibunglink || r.ausschreibung) };
      });
    },
    Regeltraining: function (z, b) {
      return z.map(function (r) {
        var wt = WOCHENTAGE[schluessel(r.wochentag)] || zahl(r.wochentag);
        if (!wt || wt < 1 || wt > 7) {
          b.warnungen.push("Regeltraining, Zeile " + r._zeile + ": Wochentag „" + (r.wochentag || "") + "“ unbekannt.");
          return null;
        }
        return { wochentag: wt, zeit: zeit(r.uhrzeit), titel: r.bezeichnung || "Training", ort: r.ort || "" };
      }).filter(Boolean);
    },
    Trainingsfrei: function (z, b) {
      return mitDatum("Trainingsfrei", z, b).map(function (r) { return r._iso; });
    },
    Vorstand: function (z) {
      return z.map(function (r) { return { funktion: r.funktion || "", name: r.name || "", foto: bild(r.fotolink || r.foto, 400) }; });
    },
    Verein: function (z) {
      var v = {};
      z.forEach(function (r) {
        var k = VEREINSFELDER[schluessel(r.feld)];
        if (k && r.wert) v[k] = k === "titelbild" ? bild(r.wert, 2000) : r.wert;
      });
      return v;
    }
  };

  UMWANDLER.Fotos = function (z, b) {
    return z.map(function (r) {
      var roh = r.bildlink || "";
      if (!roh) return null;
      if (/drive\.google\.com\/drive\/(u\/\d+\/)?folders/i.test(roh)) {
        b.warnungen.push("Fotos, Zeile " + r._zeile + ": Das ist ein Ordner-Link. Bitte den Link zu einem einzelnen Bild eintragen.");
        return null;
      }
      var gross = bild(roh, 1800);
      if (!gross) { b.warnungen.push("Fotos, Zeile " + r._zeile + ": Bild-Link wird nicht erkannt."); return null; }
      var iso = datumISO(r.datum);
      if (r.datum && (!iso || !gueltigesDatum(iso))) {
        b.warnungen.push("Fotos, Zeile " + r._zeile + ": Datum „" + r.datum + "“ ungültig – Foto wird ohne Datum angezeigt.");
        iso = "";
      }
      return { datum: iso || "", album: r.album || "Allgemein", gross: gross, klein: bild(roh, 600),
        text: r.beschreibung || "", albumLink: link(r.albumlink), _zeile: r._zeile };
    }).filter(Boolean);
  };

  var ZIEL = { Termine: "termine", Ergebnisse: "ergebnisse", Veranstaltungen: "veranstaltungen",
    Regeltraining: "regelTraining", Trainingsfrei: "trainingsfrei", Vorstand: "vorstand", Fotos: "fotos" };

  /* ---------- Laden ---------- */
  // PC-Version: läuft die Seite über den Vereins-Server (server.py), kommen die
  // Daten aus der Verwaltung dort – Google-Tabelle und daten.js werden dann ignoriert.
  window.ESVLaden = function () {
    if (!/^https?:$/.test(location.protocol) || !window.fetch) return ladenOnline();
    return fetch("api/daten", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        if (!j || !j.esvLokal) return ladenOnline();
        var D = window.ESV || {};
        var verein = D.verein || {};
        Object.keys(j.verein || {}).forEach(function (k) { if (j.verein[k] !== "" && j.verein[k] != null) verein[k] = j.verein[k]; });
        ["neuigkeiten", "termine", "ergebnisse", "veranstaltungen", "regelTraining", "trainingsfrei", "vorstand", "fotos"].forEach(function (k) {
          if (j[k]) D[k] = j[k];
        });
        D.verein = verein;
        D.lokaleAdressen = j.lokaleAdressen || [];
        return { daten: D, bericht: { quelle: "lokal", geladen: {}, fehler: [], warnungen: [], tabelleId: "" } };
      });
  };

  function ladenOnline() {
    var D = window.ESV || {};
    D.verein = D.verein || {};
    var id = (D.verein.googleTabelleId || "").trim();
    var bericht = { quelle: "datei", geladen: {}, fehler: [], warnungen: [], tabelleId: id };

    if (!id) return Promise.resolve({ daten: D, bericht: bericht });

    bericht.quelle = "tabelle";
    return Promise.all(BLAETTER.map(function (blatt) {
      return blattLaden(id, blatt)
        .then(function (tabelle) {
          var spalten = (tabelle.cols || []).map(function (c) { return schluessel(c.label); });
          if (spalten.indexOf(PFLICHTSPALTE[blatt]) < 0) {
            throw new Error("Blatt fehlt oder Spaltenüberschriften stimmen nicht");
          }
          var liste = UMWANDLER[blatt](zuObjekten(tabelle), bericht);
          if (blatt === "Verein") {
            Object.keys(liste).forEach(function (k) { D.verein[k] = liste[k]; });
            bericht.geladen[blatt] = Object.keys(liste).length;
          } else {
            D[ZIEL[blatt]] = liste;
            bericht.geladen[blatt] = liste.length;
          }
        })
        .catch(function (e) {
          bericht.fehler.push("Blatt „" + blatt + "“ konnte nicht gelesen werden (" + e.message +
            "). Es werden die gespeicherten Daten verwendet.");
        });
    })).then(function () {
      if (bericht.fehler.length === BLAETTER.length) bericht.quelle = "datei";
      return { daten: D, bericht: bericht };
    });
  }

  /* ---------- Termine inkl. Regeltraining berechnen ---------- */
  function datum(s) { var p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function heute() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function iso(d) { return d.getFullYear() + "-" + zweistellig(d.getMonth() + 1) + "-" + zweistellig(d.getDate()); }

  // Vorbei = Tag vorbei, oder heute und Beginn mehr als 2 Stunden her
  function istVorbei(t) {
    var d = datum(t.datum);
    if (d < heute()) return true;
    if (d > heute() || !t.zeit) return false;
    var hm = String(t.zeit).split(":");
    var beginn = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hm[0] || 0, +hm[1] || 0);
    return Date.now() > beginn.getTime() + 2 * 3600 * 1000;
  }

  window.ESVTermine = function (D, anzahl) {
    var belegt = {}, frei = {};
    (D.termine || []).concat(D.veranstaltungen || []).forEach(function (t) { if (t.datum) belegt[t.datum] = true; });
    (D.trainingsfrei || []).forEach(function (s) { frei[s] = true; });
    var auto = [], start = heute();
    for (var i = 0; i < (D.regelWochen || 4) * 7; i++) {
      var tag = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var wt = tag.getDay() || 7, key = iso(tag);
      if (belegt[key] || frei[key]) continue;
      (D.regelTraining || []).forEach(function (r) {
        if (+r.wochentag === wt) auto.push({ datum: key, zeit: r.zeit || "", titel: r.titel || "Training", ort: r.ort || "", art: "training", auto: true });
      });
    }
    return (D.termine || []).concat(auto)
      .filter(function (t) { return !istVorbei(t); })
      .sort(function (a, b) { return (datum(a.datum) - datum(b.datum)) || String(a.zeit || "").localeCompare(String(b.zeit || "")); })
      .slice(0, anzahl || 12);
  };

  window.ESVTrainingszeiten = function (D) {
    var namen = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    return (D.regelTraining || []).slice()
      .sort(function (a, b) { return a.wochentag - b.wochentag; })
      .map(function (r) { return namen[r.wochentag] + (r.zeit ? " ab " + r.zeit + " Uhr" : "") + ": " + r.titel; })
      .join(" · ");
  };
})();
